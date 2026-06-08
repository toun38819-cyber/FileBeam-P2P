from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.room_manager import room_manager

router = APIRouter(tags=['websocket'])
local_clients: list[WebSocket] = []


@router.websocket('/ws/room/{room_id}')
async def room_ws(ws: WebSocket, room_id: str) -> None:
    await ws.accept()
    await room_manager.attach_ws(room_id, ws)
    try:
        while True:
            message = await ws.receive_json()
            await room_manager.broadcast(room_id, message, exclude=ws)
    except WebSocketDisconnect:
        await room_manager.detach_ws(room_id, ws)


@router.websocket('/ws/local')
async def local_ws(ws: WebSocket) -> None:
    await ws.accept()
    local_clients.append(ws)
    try:
        while True:
            payload = await ws.receive_json()
            for client in list(local_clients):
                if client is ws:
                    continue
                await client.send_json(payload)
    except WebSocketDisconnect:
        if ws in local_clients:
            local_clients.remove(ws)
