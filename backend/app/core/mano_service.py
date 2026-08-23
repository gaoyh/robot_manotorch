from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
import torch

from manotorch.axislayer import AxisLayerFK
from manotorch.manolayer import ManoLayer


class ManoServiceError(RuntimeError):
    pass


@dataclass(frozen=True)
class HandContext:
    mano: ManoLayer
    axis_fk: AxisLayerFK
    faces: torch.Tensor


@dataclass
class HandSessionState:
    side: str = "right"
    flat_hand_mean: bool = False
    pose: list[float] = None
    betas: list[float] = None
    scene_translation: Optional[list[float]] = None
    scene_scale: float = 1.0

    def __post_init__(self):
        if self.pose is None:
            self.pose = [0.0] * 48
        if self.betas is None:
            self.betas = [0.0] * 10


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def default_assets_root() -> str:
    return os.environ.get("MANO_ASSETS_ROOT", str(_repo_root() / "assets" / "mano"))


def _as_row_tensor(values: list[float], expected_dim: int, name: str) -> torch.Tensor:
    if len(values) != expected_dim:
        raise ManoServiceError(f"{name} must have length {expected_dim}, got {len(values)}")
    return torch.tensor([values], dtype=torch.float32)


def _to_list(value):
    if isinstance(value, torch.Tensor):
        return value.detach().cpu().tolist()
    if isinstance(value, np.ndarray):
        return value.tolist()
    return value


def _apply_scene_transform(
    tensor: torch.Tensor,
    translation: Optional[list[float]] = None,
    scale: float = 1.0,
) -> torch.Tensor:
    output = tensor * scale
    if translation is not None:
        t = torch.tensor(translation, dtype=output.dtype, device=output.device).view(1, 1, 3)
        output = output + t
    return output


def _apply_scene_transform_to_matrices(
    transforms_abs: torch.Tensor,
    translation: Optional[list[float]] = None,
    scale: float = 1.0,
) -> torch.Tensor:
    output = transforms_abs.clone()
    output[:, :, :3, 3] = output[:, :, :3, 3] * scale
    if translation is not None:
        t = torch.tensor(translation, dtype=output.dtype, device=output.device).view(1, 1, 3, 1)
        output[:, :, :3, 3:4] = output[:, :, :3, 3:4] + t
    return output


class ManoBackendService:
    def __init__(self, assets_root: Optional[str] = None):
        self.assets_root = assets_root or default_assets_root()

    @lru_cache(maxsize=4)
    def _context(self, side: str, flat_hand_mean: bool) -> HandContext:
        assets_root = Path(self.assets_root)
        mano_pkl = assets_root / "models" / f"MANO_{side.upper()}.pkl"
        if not mano_pkl.is_file():
            raise ManoServiceError(
                f"Missing MANO assets: {mano_pkl}. "
                "Mount the official MANO package under assets/mano or set MANO_ASSETS_ROOT."
            )

        try:
            mano = ManoLayer(
                rot_mode="axisang",
                use_pca=False,
                side=side,
                center_idx=None,
                mano_assets_root=self.assets_root,
                flat_hand_mean=flat_hand_mean,
            )
            axis_fk = AxisLayerFK(side=side, mano_assets_root=self.assets_root, flat_hand_mean=flat_hand_mean)
        except Exception as exc:  # pragma: no cover - wrapped for clearer operator errors
            raise ManoServiceError(f"Failed to initialize MANO service for side={side}: {exc}") from exc

        return HandContext(mano=mano, axis_fk=axis_fk, faces=mano.th_faces)

    def is_ready(self, side: str = "right", flat_hand_mean: bool = False) -> bool:
        try:
            self._context(side, flat_hand_mean)
            return True
        except Exception:
            return False

    @staticmethod
    def default_state(side: str = "right", flat_hand_mean: bool = False) -> HandSessionState:
        return HandSessionState(side=side, flat_hand_mean=flat_hand_mean)

    def solve(
        self,
        side: str,
        pose: list[float],
        betas: list[float],
        scene_translation: Optional[list[float]] = None,
        scene_scale: float = 1.0,
        flat_hand_mean: bool = False,
    ) -> dict:
        context = self._context(side, flat_hand_mean)
        pose_tensor = _as_row_tensor(pose, 48, "pose")
        betas_tensor = _as_row_tensor(betas, 10, "betas")

        output = context.mano(pose_tensor, betas_tensor)
        verts = _apply_scene_transform(output.verts, scene_translation, scene_scale)
        joints = _apply_scene_transform(output.joints, scene_translation, scene_scale)
        transforms_abs = _apply_scene_transform_to_matrices(output.transforms_abs, scene_translation, scene_scale)

        t_g_a, _, ee_angles = context.axis_fk(output.transforms_abs)
        axes = self._extract_axes(t_g_a)

        return {
            "verts": _to_list(verts[0]),
            "joints": _to_list(joints[0]),
            "transforms_abs": _to_list(transforms_abs[0]),
            "axes": {key: _to_list(value[0]) for key, value in axes.items()},
            "ee_angles": _to_list(ee_angles[0]),
            "faces": _to_list(context.faces),
        }

    def solve_state(self, state: HandSessionState) -> dict:
        return self.solve(
            side=state.side,
            flat_hand_mean=state.flat_hand_mean,
            pose=state.pose,
            betas=state.betas,
            scene_translation=state.scene_translation,
            scene_scale=state.scene_scale,
        )

    def update_state(
        self,
        state: HandSessionState,
        pose: Optional[list[float]] = None,
        betas: Optional[list[float]] = None,
        scene_translation: Optional[list[float]] = None,
        scene_scale: Optional[float] = None,
        side: Optional[str] = None,
        flat_hand_mean: Optional[bool] = None,
    ) -> HandSessionState:
        return HandSessionState(
            side=side or state.side,
            flat_hand_mean=flat_hand_mean if flat_hand_mean is not None else state.flat_hand_mean,
            pose=pose if pose is not None else state.pose,
            betas=betas if betas is not None else state.betas,
            scene_translation=scene_translation if scene_translation is not None else state.scene_translation,
            scene_scale=scene_scale if scene_scale is not None else state.scene_scale,
        )

    def compose(self, side: str, ee_angles: list[float], flat_hand_mean: bool = False) -> list[float]:
        context = self._context(side, flat_hand_mean)
        angles = _as_row_tensor(ee_angles, 48, "ee_angles").view(1, 16, 3)
        pose = context.axis_fk.compose(angles)
        return _to_list(pose.reshape(1, -1)[0])

    @staticmethod
    def _extract_axes(t_g_a: torch.Tensor) -> dict[str, torch.Tensor]:
        basis = torch.eye(3, device=t_g_a.device, dtype=t_g_a.dtype).view(1, 1, 3, 3)
        basis = basis.repeat(t_g_a.shape[0], t_g_a.shape[1], 1, 1)
        axes = torch.matmul(t_g_a[:, :, :3, :3], basis)
        return {
            "back": axes[:, :, :, 0],
            "up": axes[:, :, :, 1],
            "left": axes[:, :, :, 2],
        }
