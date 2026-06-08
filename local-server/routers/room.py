from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from models.room import CreateRoomRequest, DeviceInfo, ImportRoomRequest, JoinRoomRequest, RoomStatusResponse
from services.room_manager import room_manager

router = APIRouter(prefix='/room', tags=['room'])


@router.post('/create')
async def create_room(payload: CreateRoomRequest, request: Request) -> dict:
    port = getattr(request.app.state, 'port', 8765)
    return await room_manager.create(payload.device_name, payload.device_type, payload.transfer_mode, port)


@router.post('/import')
async def import_room(payload: ImportRoomRequest) -> dict:
    return await room_manager.import_room(payload)


@router.post('/join')
async def join_room(payload: JoinRoomRequest) -> dict:
    device = DeviceInfo(
        device_name=payload.device_name,
        device_type=payload.device_type,
        ip=payload.joiner_ip,
        port=payload.joiner_port,
        os=payload.os,
    )
    try:
        room = await room_manager.join(payload.room_id, device)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return {
        'joined': True,
        'host_device': room.host_device.model_dump(),
        'encryption_key': room.encryption_key,
        'transfer_endpoints': {
            'upload_url': '/transfer/chunk',
            'download_url': '/transfer/download',
            'ws_url': f'/ws/room/{room.room_id}',
        },
    }


@router.get('/{room_id}/status', response_model=RoomStatusResponse)
async def room_status(room_id: str) -> RoomStatusResponse:
    room = await room_manager.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail='Room not found')
    return RoomStatusResponse(
        room_id=room.room_id,
        room_code=room.room_code,
        status=room.status,
        created_at=room.created_at,
        expires_at=room.expires_at,
        transfer_count=len(room.transfer_ids),
        host_device=room.host_device,
        peer_device=room.peer_device,
    )
