from __future__ import annotations

import json
from collections import defaultdict
from typing import DefaultDict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI(title="FileBeam Signaling", version="1.0.0")
rooms: DefaultDict[str, list[WebSocket]] = defaultdict(list)


async def broadcast(room_id: str, sender: WebSocket, message: dict) -> None:
    stale: list[WebSocket] = []
    for peer in rooms.get(room_id, []):
        if peer is sender:
            continue
        try:
            await peer.send_text(json.dumps(message))
        except Exception:
            stale.append(peer)

    for peer in stale:
        if peer in rooms.get(room_id, []):
            rooms[room_id].remove(peer)

    if room_id in rooms and not rooms[room_id]:
        del rooms[room_id]


@app.websocket('/signal/{room_id}')
async def signaling(ws: WebSocket, room_id: str) -> None:
    await ws.accept()
    rooms[room_id].append(ws)

    try:
        await broadcast(room_id, ws, {'type': 'peer_joined', 'count': len(rooms[room_id])})
        while True:
            raw = await ws.receive_text()
            message = json.loads(raw)
            if message.get('type') == 'ping':
                await ws.send_text(json.dumps({'type': 'pong'}))
                continue
            await broadcast(room_id, ws, message)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in rooms.get(room_id, []):
            rooms[room_id].remove(ws)
        if room_id in rooms and not rooms[room_id]:
            del rooms[room_id]
        elif room_id in rooms:
            await broadcast(room_id, ws, {'type': 'peer_left', 'count': len(rooms[room_id])})


@app.get('/health')
def health() -> dict[str, int | str]:
    return {'status': 'ok', 'active_rooms': len(rooms), 'active_peers': sum(len(peers) for peers in rooms.values())}
