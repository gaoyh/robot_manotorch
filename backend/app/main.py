from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .core.mano_service import ManoBackendService, ManoServiceError
from .schemas import (
    HandComposeRequest,
    HandComposeResponse,
    HandLoadRequest,
    HandSolveRequest,
    HandSolveResponse,
    ModelMeta,
    StreamErrorResponse,
    StreamPingMessage,
    StreamPongResponse,
    StreamPoseResponse,
    StreamReadyResponse,
    StreamResultResponse,
)


def create_app() -> FastAPI:
    app = FastAPI(title="Hand Editor Backend", version="0.1.0")
    cors_origins = os.environ.get("CORS_ALLOW_ORIGINS")
    if cors_origins:
        allow_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]
    else:
        allow_origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    service = ManoBackendService()

    @app.get("/healthz")
    def healthz(side: str = "right", flat_hand_mean: bool = False):
        return {
            "ok": True,
            "ready": service.is_ready(side, flat_hand_mean),
            "side": side,
            "flat_hand_mean": flat_hand_mean,
            "assets_root": service.assets_root,
        }

    @app.post("/api/load", response_model=HandSolveResponse)
    def load(req: HandLoadRequest):
        return _solve_response(service, req)

    @app.post("/api/solve", response_model=HandSolveResponse)
    def solve(req: HandSolveRequest):
        return _solve_response(service, req)

    @app.post("/api/compose", response_model=HandComposeResponse)
    def compose(req: HandComposeRequest):
        try:
            pose = service.compose(req.side, req.ee_angles, req.flat_hand_mean)
        except ManoServiceError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return HandComposeResponse(side=req.side, pose=pose)

    @app.websocket("/ws/stream")
    async def stream(ws: WebSocket):
        await ws.accept()
        state = service.default_state()
        await ws.send_json(
            StreamReadyResponse(
                meta=ModelMeta(
                    side=state.side,
                    flat_hand_mean=state.flat_hand_mean,
                    pose_dim=48,
                    betas_dim=10,
                    assets_root=service.assets_root,
                    ready=service.is_ready(state.side, state.flat_hand_mean),
                )
            ).model_dump()
        )
        while True:
            try:
                raw = await ws.receive_json()
            except WebSocketDisconnect:
                return
            try:
                payload = raw.get("payload", raw) if isinstance(raw, dict) else raw
                msg_type = raw.get("type") if isinstance(raw, dict) else None
                msg_type = msg_type or (payload.get("type") if isinstance(payload, dict) else None)

                if msg_type == "hello":
                    state = service.update_state(
                        state,
                        side=payload.get("side", state.side),
                        flat_hand_mean=payload.get("flat_hand_mean"),
                        pose=payload.get("pose"),
                        betas=payload.get("betas"),
                        scene_translation=payload.get("scene_translation"),
                        scene_scale=payload.get("scene_scale"),
                    )
                    result = service.solve_state(state)
                    await ws.send_json(
                        StreamResultResponse(
                            meta=ModelMeta(
                                side=state.side,
                                flat_hand_mean=state.flat_hand_mean,
                                pose_dim=48,
                                betas_dim=10,
                                assets_root=service.assets_root,
                                ready=service.is_ready(state.side, state.flat_hand_mean),
                            ),
                            **result,
                        ).model_dump()
                    )
                    continue

                if msg_type == "solve":
                    state = service.update_state(
                        state,
                        side=payload.get("side"),
                        flat_hand_mean=payload.get("flat_hand_mean"),
                        pose=payload.get("pose"),
                        betas=payload.get("betas"),
                        scene_translation=payload.get("scene_translation"),
                        scene_scale=payload.get("scene_scale"),
                    )
                    result = service.solve_state(state)
                    await ws.send_json(
                        StreamResultResponse(
                            meta=ModelMeta(
                                side=state.side,
                                flat_hand_mean=state.flat_hand_mean,
                                pose_dim=48,
                                betas_dim=10,
                                assets_root=service.assets_root,
                                ready=service.is_ready(state.side, state.flat_hand_mean),
                            ),
                            **result,
                        ).model_dump()
                    )
                    continue

                if msg_type == "compose":
                    pose = service.compose(state.side, payload["ee_angles"], payload.get("flat_hand_mean", state.flat_hand_mean))
                    state = service.update_state(state, flat_hand_mean=payload.get("flat_hand_mean"), pose=pose)
                    await ws.send_json(StreamPoseResponse(side=state.side, pose=pose).model_dump())
                    continue

                if msg_type == "ping":
                    await ws.send_json(
                        StreamPongResponse(
                            nonce=(payload if isinstance(payload, dict) else {}).get("nonce")
                        ).model_dump()
                    )
                    continue

                await ws.send_json(
                    StreamErrorResponse(
                        message="Unsupported stream message type",
                        detail=f"got={msg_type!r}",
                    ).model_dump()
                )
            except ManoServiceError as exc:
                await ws.send_json(StreamErrorResponse(message=str(exc)).model_dump())
            except Exception as exc:
                await ws.send_json(StreamErrorResponse(message="Stream handler failed", detail=str(exc)).model_dump())

    return app


def _solve_response(service: ManoBackendService, req: HandSolveRequest) -> HandSolveResponse:
    try:
        result = service.solve(
            side=req.side,
            flat_hand_mean=req.flat_hand_mean,
            pose=req.pose,
            betas=req.betas,
            scene_translation=req.scene_translation,
            scene_scale=req.scene_scale,
        )
    except ManoServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return HandSolveResponse(
        meta=ModelMeta(
            side=req.side,
            flat_hand_mean=req.flat_hand_mean,
            pose_dim=48,
            betas_dim=10,
            assets_root=service.assets_root,
            ready=service.is_ready(req.side, req.flat_hand_mean),
        ),
        verts=result["verts"],
        joints=result["joints"],
        transforms_abs=result["transforms_abs"],
        axes=result["axes"],
        ee_angles=result["ee_angles"],
        faces=result["faces"],
    )


app = create_app()
