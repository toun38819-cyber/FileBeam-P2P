from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from fastapi import WebSocket
from pydantic import BaseModel


class DeviceInfo(BaseModel):
    device_name: str
    device_type: str
    ip: str
    port: int
    os: str = 'unknown'


class CreateRoomRequest(BaseModel):
    device_name: str
    device_type: str
    transfer_mode: Literal['local', 'webrtc'] = 'local'


class ImportRoomRequest(BaseModel):
    room_id: str
    encryption_key: str
    transfer_mode: Literal['local', 'webrtc'] = 'local'
    host_device: DeviceInfo
    local_device: DeviceInfo


class JoinRoomRequest(BaseModel):
    room_id: str
    device_name: str
    device_type: str
    joiner_ip: str
    joiner_port: int = 0
    os: str = 'unknown'


class RoomStatusResponse(BaseModel):
    room_id: str
    room_code: str
    status: str
    created_at: datetime
    expires_at: datetime
    transfer_count: int
    host_device: DeviceInfo
    peer_device: DeviceInfo | None = None


@dataclass
class RoomState:
    room_id: str
    room_code: str
    encryption_key: str
    mode: str
    host_device: DeviceInfo
    peer_device: DeviceInfo | None
    status: str
    created_at: datetime
    expires_at: datetime
    transfer_ids: list[str] = field(default_factory=list)
    websockets: list[WebSocket] = field(default_factory=list)
