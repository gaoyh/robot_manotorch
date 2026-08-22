from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


def _zeros(length: int) -> list[float]:
    return [0.0] * length


class HandSolveRequest(BaseModel):
    side: Literal["left", "right"] = "right"
    pose: list[float]
    betas: list[float] = Field(default_factory=lambda: _zeros(10))
    scene_translation: list[float] = Field(default_factory=lambda: _zeros(3))
    scene_scale: float = 1.0


class HandComposeRequest(BaseModel):
    side: Literal["left", "right"] = "right"
    ee_angles: list[float]


class HandLoadRequest(HandSolveRequest):
    pose: list[float] = Field(default_factory=lambda: _zeros(48))


class ModelMeta(BaseModel):
    side: Literal["left", "right"]
    pose_dim: int
    betas_dim: int
    assets_root: str
    ready: bool


class HandSolveResponse(BaseModel):
    meta: ModelMeta
    verts: list[list[float]]
    joints: list[list[float]]
    transforms_abs: list[list[list[float]]]
    axes: Optional[dict[str, list[list[float]]]] = None
    ee_angles: Optional[list[list[float]]] = None
    faces: Optional[list[list[int]]] = None


class HandComposeResponse(BaseModel):
    side: Literal["left", "right"]
    pose: list[float]


class StreamInitMessage(BaseModel):
    type: Literal["hello"] = "hello"
    side: Literal["left", "right"] = "right"
    pose: list[float] = Field(default_factory=lambda: _zeros(48))
    betas: list[float] = Field(default_factory=lambda: _zeros(10))
    scene_translation: list[float] = Field(default_factory=lambda: _zeros(3))
    scene_scale: float = 1.0


class StreamSolveMessage(BaseModel):
    type: Literal["solve"] = "solve"
    pose: Optional[list[float]] = None
    betas: Optional[list[float]] = None
    scene_translation: Optional[list[float]] = None
    scene_scale: Optional[float] = None


class StreamComposeMessage(BaseModel):
    type: Literal["compose"] = "compose"
    ee_angles: list[float]


class StreamPingMessage(BaseModel):
    type: Literal["ping"] = "ping"
    nonce: Optional[str] = None


class StreamEnvelope(BaseModel):
    type: Literal["hello", "solve", "compose", "ping"]
    payload: Optional[dict[str, Any]] = None


class StreamReadyResponse(BaseModel):
    type: Literal["ready"] = "ready"
    meta: ModelMeta


class StreamResultResponse(BaseModel):
    type: Literal["result"] = "result"
    meta: ModelMeta
    verts: list[list[float]]
    joints: list[list[float]]
    transforms_abs: list[list[list[float]]]
    axes: Optional[dict[str, list[list[float]]]] = None
    ee_angles: Optional[list[list[float]]] = None
    faces: Optional[list[list[int]]] = None


class StreamPoseResponse(BaseModel):
    type: Literal["pose"] = "pose"
    side: Literal["left", "right"]
    pose: list[float]


class StreamPongResponse(BaseModel):
    type: Literal["pong"] = "pong"
    nonce: Optional[str] = None


class StreamErrorResponse(BaseModel):
    type: Literal["error"] = "error"
    message: str
    detail: Optional[str] = None
