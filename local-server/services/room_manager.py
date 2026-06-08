from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import WebSocket

from core.config import settings
from core.network import get_local_ip
from core.security import generate_encryption_key, generate_qr, generate_room_code, generate_room_id
from models.room import DeviceInfo, ImportRoomRequest, RoomState
from services.state_store import state_store


class RoomManager:
    def __init__(self) -> None:
        self.rooms: dict[str, RoomState] = {}
        self._lock = asyncio.Lock()

    async def load_persisted(self) -> None:
        async with self._lock:
            self.rooms = {room.room_id: room for room in state_store.load_rooms()}

    async def create(self, device_name: str, device_type: str, mode: str, port: int) -> dict[str, Any]:
        async with self._lock:
            room_id = generate_room_id()
            ip = get_local_ip()
            now = datetime.now(timezone.utc)
            expires_at = now + timedelta(minutes=settings.room_ttl_minutes)
            room = RoomState(
                room_id=room_id,
                room_code=generate_room_code(room_id),
                encryption_key=generate_encryption_key(),
                mode=mode,
                host_device=DeviceInfo(device_name=device_name, device_type=device_type, ip=ip, port=port, os=device_type),
                peer_device=None,
                status='waiting',
                created_at=now,
                expires_at=expires_at,
            )
            self.rooms[room_id] = room
            state_store.save_room(room)
            return self._serialize_room(room, include_qr=True)

    async def import_room(self, payload: ImportRoomRequest) -> dict[str, Any]:
        async with self._lock:
            now = datetime.now(timezone.utc)
            expires_at = now + timedelta(minutes=settings.room_ttl_minutes)
            room = RoomState(
                room_id=payload.room_id,
                room_code=generate_room_code(payload.room_id),
                encryption_key=payload.encryption_key,
                mode=payload.transfer_mode,
                host_device=payload.host_device,
                peer_device=payload.local_device,
                status='connected',
                created_at=now,
                expires_at=expires_at,
            )
            self.rooms[payload.room_id] = room
            state_store.save_room(room)
            return self._serialize_room(room, include_qr=True)

    def _serialize_room(self, room: RoomState, include_qr: bool) -> dict[str, Any]:
        qr_payload = {
            'v': 1,
            'mode': room.mode,
            'rid': room.room_id,
            'ip': room.host_device.ip,
            'port': room.host_device.port,
            'sig': settings.signaling_url,
            'key': room.encryption_key,
            'dn': room.host_device.device_name,
            'dt': room.host_device.device_type,
            'exp': int(room.expires_at.timestamp()),
        }
        return {
            'room_id': room.room_id,
            'room_code': room.room_code,
            'device_ip': room.host_device.ip,
            'device_port': room.host_device.port,
            'encryption_key': room.encryption_key,
            'webrtc_offer': None,
            'qr_data': qr_payload,
            'qr_image_base64': generate_qr(qr_payload) if include_qr else '',
            'expires_at': room.expires_at.isoformat(),
        }

    async def get(self, room_id: str) -> RoomState | None:
        return self.rooms.get(room_id)

    async def join(self, room_id: str, device_info: DeviceInfo) -> RoomState:
        room = self.rooms.get(room_id)
        if not room:
            raise KeyError('Room not found')
        room.peer_device = device_info
        room.status = 'connected'
        state_store.save_room(room)
        await self.broadcast(room_id, {'type': 'peer_joined', **device_info.model_dump()})
        return room

    async def attach_ws(self, room_id: str, ws: WebSocket) -> None:
        room = self.rooms.get(room_id)
        if room and ws not in room.websockets:
            room.websockets.append(ws)

    async def detach_ws(self, room_id: str, ws: WebSocket) -> None:
        room = self.rooms.get(room_id)
        if room and ws in room.websockets:
            room.websockets.remove(ws)

    async def broadcast(self, room_id: str, message: dict[str, Any], exclude: WebSocket | None = None) -> None:
        room = self.rooms.get(room_id)
        if not room:
            return
        stale: list[WebSocket] = []
        for ws in room.websockets:
            if ws is exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                stale.append(ws)
        for ws in stale:
            if ws in room.websockets:
                room.websockets.remove(ws)

    async def register_transfer(self, room_id: str, transfer_id: str) -> None:
        room = self.rooms.get(room_id)
        if room and transfer_id not in room.transfer_ids:
            room.transfer_ids.append(transfer_id)
            room.status = 'transferring'
            state_store.save_room(room)

    async def finish_transfer(self, room_id: str) -> None:
        room = self.rooms.get(room_id)
        if room:
            room.status = 'done'
            state_store.save_room(room)

    async def cleanup_expired(self) -> None:
        now = datetime.now(timezone.utc)
        expired = [rid for rid, room in self.rooms.items() if room.expires_at <= now]
        for rid in expired:
            self.rooms.pop(rid, None)
            state_store.delete_room(rid)


room_manager = RoomManager()
