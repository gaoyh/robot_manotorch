from __future__ import annotations

import argparse
import inspect
import json
import sys
from pathlib import Path

import numpy as np


if not hasattr(inspect, "getargspec"):
    inspect.getargspec = inspect.getfullargspec  # type: ignore[attr-defined]

for _name, _value in {
    "bool": bool,
    "int": int,
    "float": float,
    "complex": complex,
    "object": object,
    "unicode": str,
    "str": str,
    "nan": np.nan,
    "inf": np.inf,
}.items():
    if not hasattr(np, _name):
        setattr(np, _name, _value)


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.core.mano_service import ManoBackendService  # noqa: E402


DISPLAY_TO_BACKEND = [0, 13, 14, 15, 1, 2, 3, 4, 5, 6, 10, 11, 12, 7, 8, 9]
DISPLAY_JOINT_NAMES = [
    "Wrist",
    "Thumb / base",
    "Thumb / middle",
    "Thumb / tip",
    "Index / base",
    "Index / middle",
    "Index / tip",
    "Middle / base",
    "Middle / middle",
    "Middle / tip",
    "Ring / base",
    "Ring / middle",
    "Ring / tip",
    "Pinky / base",
    "Pinky / middle",
    "Pinky / tip",
]


def make_display_pose(fill: float = 0.0) -> list[list[float]]:
    return [[fill, fill, fill] for _ in range(16)]


def clone_pose(pose: list[list[float]]) -> list[list[float]]:
    return [triple[:] for triple in pose]


def set_chain(pose: list[list[float]], chain: list[int], bend: float, spread: float = 0.0, twist: float = 0.0) -> None:
    for offset, idx in enumerate(chain):
        pose[idx] = [twist, spread, max(0.0, bend - offset * 0.10)]


def build_open_pose() -> list[list[float]]:
    pose = make_display_pose(0.0)
    pose[1] = [0.00, 0.18, 0.04]
    pose[2] = [0.00, 0.08, 0.03]
    pose[3] = [0.00, 0.02, 0.02]
    set_chain(pose, [4, 5, 6], 0.05, 0.02, 0.00)
    set_chain(pose, [7, 8, 9], 0.05, 0.00, 0.00)
    set_chain(pose, [10, 11, 12], 0.05, -0.01, 0.00)
    set_chain(pose, [13, 14, 15], 0.05, -0.02, 0.00)
    return pose


def build_fist_pose() -> list[list[float]]:
    pose = make_display_pose(0.0)
    pose[1] = [0.00, -0.24, 0.60]
    pose[2] = [0.00, -0.30, 0.75]
    pose[3] = [0.00, -0.26, 0.92]
    set_chain(pose, [4, 5, 6], 1.10, -0.08, 0.00)
    set_chain(pose, [7, 8, 9], 1.18, -0.05, 0.00)
    set_chain(pose, [10, 11, 12], 1.22, -0.04, 0.00)
    set_chain(pose, [13, 14, 15], 1.26, -0.03, 0.00)
    return pose


def display_pose_to_backend_flat(display_pose: list[list[float]]) -> list[float]:
    backend_pose = [[0.0, 0.0, 0.0] for _ in range(16)]
    for display_idx, backend_idx in enumerate(DISPLAY_TO_BACKEND):
        backend_pose[backend_idx] = display_pose[display_idx]
    return [value for triple in backend_pose for value in triple]


def round_nested(values, ndigits: int = 6):
    if isinstance(values, list):
        return [round_nested(v, ndigits) for v in values]
    if isinstance(values, float):
        return round(values, ndigits)
    return values


def build_instances(service: ManoBackendService, basis: bool) -> tuple[list[dict], list[dict]]:
    open_pose = build_open_pose()
    fist_pose = build_fist_pose()
    joint_instances: list[dict] = []
    vert_instances: list[dict] = []

    for step_deg in range(0, 91, 5):
        alpha = step_deg / 90.0
        display_pose = []
        for i in range(16):
            display_pose.append([
                open_pose[i][axis] * (1.0 - alpha) + fist_pose[i][axis] * alpha
                for axis in range(3)
            ])
        ee_angles = display_pose_to_backend_flat(display_pose)
        label = f"curl_{step_deg:02d}"
        for side in ("right", "left"):
            pose = service.compose(side, ee_angles, flat_hand_mean=basis)
            solved = service.solve(
                side=side,
                pose=pose,
                betas=[0.0] * 10,
                scene_translation=[0.0, 0.0, 0.0],
                scene_scale=1.0,
                flat_hand_mean=basis,
            )
            instance_id = f"{side}_{label}"
            joint_instances.append(
                {
                    "id": instance_id,
                    "side": side,
                    "basis": "flat" if basis else "default",
                    "gesture": label,
                    "curl_deg": step_deg,
                    "joint_names": DISPLAY_JOINT_NAMES,
                    "joints": round_nested(solved["joints"]),
                }
            )
            vert_instances.append(
                {
                    "id": instance_id,
                    "side": side,
                    "basis": "flat" if basis else "default",
                    "gesture": label,
                    "curl_deg": step_deg,
                    "verts": round_nested(solved["verts"]),
                }
            )
    return joint_instances, vert_instances


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate MANO hand template JSON files")
    parser.add_argument("--basis", choices=["default", "flat"], default="flat")
    parser.add_argument("--output-dir", default=str(REPO_ROOT / "dev_doc" / "ref"))
    args = parser.parse_args()

    basis = args.basis == "flat"
    service = ManoBackendService()
    joint_instances, vert_instances = build_instances(service, basis=basis)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        "basis": "flat_hand_mean=True" if basis else "flat_hand_mean=False",
        "step_degrees": 5,
        "open_source": "HaGRID palm/no_gesture + FreiHAND/HaMeR resting hand references",
        "fist_source": "HaGRID fist/grabbing/grip references",
        "joint_order": DISPLAY_JOINT_NAMES,
        "vertex_count": 778,
        "joint_count": 21,
        "hands": ["left", "right"],
        "template_count": len(joint_instances),
    }

    joint_path = output_dir / "kd-mano-joint.json"
    verts_path = output_dir / "kd-mano-verts.json"
    joint_path.write_text(json.dumps({"meta": meta, "instances": joint_instances}, ensure_ascii=False, separators=(",", ":")))
    verts_path.write_text(json.dumps({"meta": meta, "instances": vert_instances}, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote {joint_path}")
    print(f"Wrote {verts_path}")


if __name__ == "__main__":
    main()
