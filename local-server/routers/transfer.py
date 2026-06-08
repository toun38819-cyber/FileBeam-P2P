from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse

from core.config import settings
from models.transfer import InitiateTransferRequest, TransferProgressResponse, TransferState
from services.file_service import InsufficientSpaceError, MissingChunksError, file_service
from services.room_manager import room_manager
from services.state_store import state_store

router = APIRouter(prefix='/transfer', tags=['transfer'])
transfers: dict[str, TransferState] = {}
_finalize_tasks: dict[str, asyncio.Task[None]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _duration_ms(started_at: datetime, ended_at: datetime) -> int:
    return max(0, int((ended_at - started_at).total_seconds() * 1000))


def _avg_speed_mbps(transfer: TransferState, duration_ms: int) -> float:
    seconds = max(duration_ms / 1000, 0.001)
    return round((transfer.filesize / 1024 / 1024) / seconds, 2)


def _persist_transfer(transfer: TransferState) -> None:
    state_store.save_transfer(transfer)


def _serialize_progress(transfer: TransferState) -> TransferProgressResponse:
    return TransferProgressResponse(
        transfer_id=transfer.transfer_id,
        filename=transfer.filename,
        bytes_received=transfer.bytes_received(),
        filesize=transfer.filesize,
        total_chunks=transfer.total_chunks,
        received_chunks=len(transfer.received_chunks),
        complete=transfer.complete,
        status=transfer.status,
        missing_chunks=transfer.missing_chunks(),
        can_resume=transfer.can_resume(),
        duplicate_chunks=transfer.duplicate_chunks,
        last_activity_at=transfer.last_activity_at or transfer.created_at,
        error_code=transfer.error_code,
        error_message=transfer.error_message,
    )


def _serialize_active_transfer(transfer: TransferState) -> dict[str, Any]:
    progress = _serialize_progress(transfer).model_dump(mode='json')
    progress['room_id'] = transfer.room_id
    progress['sender'] = transfer.sender.model_dump() if transfer.sender else None
    progress['created_at'] = transfer.created_at.isoformat()
    return progress


async def _broadcast_transfer_error(transfer: TransferState, error_code: str, message: str) -> None:
    await room_manager.broadcast(transfer.room_id, {
        'type': 'transfer_error',
        'transfer_id': transfer.transfer_id,
        'error_code': error_code,
        'message': message,
    })


def _touch_transfer(transfer: TransferState) -> None:
    transfer.last_activity_at = _now()


def _set_transfer_state(transfer: TransferState, *, status_value: str, error_code: str | None = None, error_message: str | None = None) -> None:
    transfer.status = status_value
    transfer.error_code = error_code
    transfer.error_message = error_message
    _touch_transfer(transfer)
    _persist_transfer(transfer)


async def _store_chunk(transfer: TransferState, chunk_index: int, checksum: str, data: bytes) -> dict[str, Any]:
    transfer.chunk_attempts[chunk_index] = transfer.chunk_attempts.get(chunk_index, 0) + 1

    if chunk_index in transfer.received_chunks and transfer.chunk_checksums.get(chunk_index) == checksum and file_service.has_chunk(transfer, chunk_index):
        transfer.duplicate_chunks += 1
        _touch_transfer(transfer)
        _persist_transfer(transfer)
        return {'duplicate': True}

    await file_service.store_chunk(transfer, chunk_index, data)
    transfer.chunk_checksums[chunk_index] = checksum
    transfer.chunk_sizes[chunk_index] = len(data)
    transfer.received_chunks.add(chunk_index)
    _set_transfer_state(transfer, status_value='receiving')
    await room_manager.broadcast(transfer.room_id, {
        'type': 'chunk_received',
        'transfer_id': transfer.transfer_id,
        'chunk_index': chunk_index,
        'progress_pct': round((len(transfer.received_chunks) / transfer.total_chunks) * 100, 2),
    })
    return {'duplicate': False}


async def _finalize_transfer(transfer: TransferState) -> None:
    while True:
        if transfer.status in {'cancelled', 'error', 'complete'}:
            return

        missing = transfer.missing_chunks()
        if not missing:
            try:
                path = await file_service.assemble_file(transfer)
            except InsufficientSpaceError as exc:
                _set_transfer_state(transfer, status_value='paused', error_code='disk_full', error_message='Disk full while assembling received file')
                await _broadcast_transfer_error(transfer, 'disk_full', f'Not enough disk space to assemble file at {exc.target}')
                return
            except MissingChunksError:
                _set_transfer_state(transfer, status_value='paused', error_code='resume_required', error_message='Waiting for missing chunks before assembly')
                return

            ended_at = _now()
            transfer.finalized_at = ended_at
            transfer.complete = True
            transfer.status = 'complete'
            transfer.error_code = None
            transfer.error_message = None
            _persist_transfer(transfer)
            duration_ms = _duration_ms(transfer.created_at, ended_at)
            await room_manager.finish_transfer(transfer.room_id)
            await room_manager.broadcast(transfer.room_id, {
                'type': 'transfer_complete',
                'transfer_id': transfer.transfer_id,
                'filename': transfer.filename,
                'save_path': str(path),
                'duration_ms': duration_ms,
                'avg_speed_mbps': _avg_speed_mbps(transfer, duration_ms),
            })
            return

        last_activity = transfer.last_activity_at or transfer.created_at
        stalled_for = (_now() - last_activity).total_seconds()
        if stalled_for >= settings.transfer_stall_timeout_seconds:
            _set_transfer_state(transfer, status_value='paused', error_code='resume_required', error_message='Transfer stalled. Resume by retrying missing chunks.')
            await _broadcast_transfer_error(transfer, 'resume_required', 'Transfer paused. Resume by retrying missing chunks.')
            return

        await asyncio.sleep(settings.finalize_poll_interval_seconds)


def _schedule_finalize(transfer: TransferState) -> None:
    existing = _finalize_tasks.get(transfer.transfer_id)
    if existing and not existing.done():
        return
    _finalize_tasks[transfer.transfer_id] = asyncio.create_task(_finalize_transfer(transfer))


def _validate_transfer_payload(existing: TransferState, payload: InitiateTransferRequest) -> None:
    same_shape = (
        existing.room_id == payload.room_id
        and existing.filename == payload.filename
        and existing.filesize == payload.filesize
        and existing.total_chunks == payload.total_chunks
        and existing.checksum_full == payload.checksum_full
    )
    if not same_shape:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Transfer ID already exists with different metadata')


async def load_persisted_transfers() -> None:
    transfers.clear()
    for transfer in state_store.load_transfers():
        file_service.reconcile_transfer_chunks(transfer)
        if transfer.complete and transfer.assembled_path and not transfer.assembled_path.exists():
            transfer.complete = False
            transfer.status = 'paused'
            transfer.error_code = 'rehydrate_required'
            transfer.error_message = 'Transfer metadata was restored but the assembled file is missing.'
        elif transfer.complete:
            transfer.status = 'complete'
        elif transfer.missing_chunks():
            transfer.status = 'paused'
            transfer.error_code = transfer.error_code or 'resume_required'
            transfer.error_message = transfer.error_message or 'Recovered transfer is waiting for sender to resume missing chunks.'
        else:
            transfer.status = 'paused'
            transfer.error_code = None
            transfer.error_message = None
            _schedule_finalize(transfer)
        transfers[transfer.transfer_id] = transfer
        _persist_transfer(transfer)


@router.post('/send/initiate')
async def initiate_transfer(payload: InitiateTransferRequest) -> dict:
    room = await room_manager.get(payload.room_id)
    if not room:
        raise HTTPException(status_code=404, detail='Room not found')

    existing = transfers.get(payload.transfer_id)
    if existing:
        _validate_transfer_payload(existing, payload)
        _set_transfer_state(existing, status_value='receiving', error_code=None, error_message=None)
        _schedule_finalize(existing)
        return {
            'ready': True,
            'transfer_id': existing.transfer_id,
            'resume': True,
            'missing_chunks': existing.missing_chunks(),
            'received_count': len(existing.received_chunks),
        }

    transfer = TransferState(
        transfer_id=payload.transfer_id,
        room_id=payload.room_id,
        filename=payload.filename,
        filesize=payload.filesize,
        filetype=payload.filetype,
        total_chunks=payload.total_chunks,
        checksum_full=payload.checksum_full,
        created_at=_now(),
        is_folder=payload.is_folder,
        folder_tree=payload.folder_tree,
        compression=payload.compression,
        sender=payload.sender,
        last_activity_at=_now(),
        status='pending',
    )
    try:
        file_service.ensure_transfer_capacity(transfer)
    except InsufficientSpaceError as exc:
        raise HTTPException(
            status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
            detail=f'Not enough disk space for transfer. Free up space on {exc.target}.',
        ) from exc

    transfers[payload.transfer_id] = transfer
    _persist_transfer(transfer)
    await room_manager.register_transfer(payload.room_id, payload.transfer_id)
    await room_manager.broadcast(payload.room_id, {
        'type': 'transfer_incoming',
        'transfer_id': payload.transfer_id,
        'filename': payload.filename,
        'filesize': payload.filesize,
        'filetype': payload.filetype,
        'total_chunks': payload.total_chunks,
        'sender': (payload.sender or room.host_device).model_dump(),
    })
    return {'ready': True, 'transfer_id': payload.transfer_id, 'resume': False, 'missing_chunks': list(range(payload.total_chunks))}


@router.post('/chunk')
async def receive_chunk(
    room_id: str = Form(...),
    transfer_id: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    checksum: str = Form(...),
    is_last: bool = Form(False),
    chunk_data: UploadFile = File(...),
) -> dict:
    transfer = transfers.get(transfer_id)
    if not transfer:
        raise HTTPException(status_code=404, detail='Transfer not found')
    if transfer.room_id != room_id or transfer.total_chunks != total_chunks:
        raise HTTPException(status_code=400, detail='Transfer metadata mismatch')
    if chunk_index < 0 or chunk_index >= transfer.total_chunks:
        raise HTTPException(status_code=400, detail='Invalid chunk index')
    if transfer.status in {'cancelled', 'complete'}:
        raise HTTPException(status_code=409, detail=f'Transfer is {transfer.status}')

    data = await chunk_data.read()
    if not data:
        raise HTTPException(status_code=400, detail='Empty chunk payload')
    max_payload = settings.max_chunk_size_mb * 1024 * 1024 + 64 * 1024
    if len(data) > max_payload:
        raise HTTPException(status_code=413, detail='Chunk exceeds maximum allowed size')

    try:
        result = await _store_chunk(transfer, chunk_index, checksum, data)
    except InsufficientSpaceError as exc:
        _set_transfer_state(transfer, status_value='paused', error_code='disk_full', error_message='Disk full while writing chunk')
        await _broadcast_transfer_error(transfer, 'disk_full', f'Not enough free disk space on {exc.target}')
        raise HTTPException(
            status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
            detail=f'Not enough free disk space on {exc.target}',
        ) from exc
    except OSError as exc:
        _set_transfer_state(transfer, status_value='paused', error_code='write_failed', error_message=str(exc))
        await _broadcast_transfer_error(transfer, 'write_failed', 'Failed to write received chunk to storage')
        raise HTTPException(status_code=500, detail='Failed to persist chunk') from exc

    if is_last or len(transfer.received_chunks) == transfer.total_chunks:
        _schedule_finalize(transfer)

    return {
        'ok': True,
        'chunk_index': chunk_index,
        'received_count': len(transfer.received_chunks),
        'duplicate': result['duplicate'],
        'missing_chunks': transfer.missing_chunks(),
    }


@router.get('/chunk/{transfer_id}/{chunk_index}')
async def get_chunk(transfer_id: str, chunk_index: int) -> StreamingResponse:
    transfer = transfers.get(transfer_id)
    if not transfer:
        raise HTTPException(status_code=404, detail='Transfer not found')
    try:
        data = await file_service.get_chunk(transfer_id, chunk_index)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='Chunk not found') from exc
    return StreamingResponse(iter([data]), media_type='application/octet-stream', headers={'Content-Length': str(len(data))})


@router.get('/download/{transfer_id}')
async def download_transfer(transfer_id: str):
    transfer = transfers.get(transfer_id)
    if not transfer:
        raise HTTPException(status_code=404, detail='Transfer not found')
    if not transfer.assembled_path:
        try:
            transfer.assembled_path = await file_service.assemble_file(transfer)
            _persist_transfer(transfer)
        except MissingChunksError as exc:
            _set_transfer_state(transfer, status_value='paused', error_code='resume_required', error_message='Missing chunks prevent download')
            raise HTTPException(status_code=409, detail={'missing_chunks': exc.missing_chunks}) from exc
        except InsufficientSpaceError as exc:
            _set_transfer_state(transfer, status_value='paused', error_code='disk_full', error_message='Disk full while assembling download')
            raise HTTPException(status_code=status.HTTP_507_INSUFFICIENT_STORAGE, detail=f'Not enough free disk space on {exc.target}') from exc
    return FileResponse(path=transfer.assembled_path, filename=transfer.filename, media_type=transfer.filetype)


@router.get('/resume/{transfer_id}')
async def resume_transfer(transfer_id: str) -> dict[str, Any]:
    transfer = transfers.get(transfer_id)
    if not transfer:
        raise HTTPException(status_code=404, detail='Transfer not found')
    return {
        'transfer_id': transfer.transfer_id,
        'status': transfer.status,
        'received_count': len(transfer.received_chunks),
        'bytes_received': transfer.bytes_received(),
        'missing_chunks': transfer.missing_chunks(),
        'can_resume': transfer.can_resume(),
        'duplicate_chunks': transfer.duplicate_chunks,
        'chunk_attempts': transfer.chunk_attempts,
        'error_code': transfer.error_code,
        'error_message': transfer.error_message,
        'last_activity_at': (transfer.last_activity_at or transfer.created_at).isoformat(),
    }


@router.get('/active')
async def active_transfers() -> list[dict[str, Any]]:
    active = [transfer for transfer in transfers.values() if transfer.status not in {'cancelled'}]
    active.sort(key=lambda transfer: transfer.last_activity_at or transfer.created_at, reverse=True)
    return [_serialize_active_transfer(transfer) for transfer in active]


@router.post('/cancel/{transfer_id}')
async def cancel_transfer(transfer_id: str) -> dict:
    transfer = transfers.get(transfer_id)
    if not transfer:
        raise HTTPException(status_code=404, detail='Transfer not found')

    transfer.status = 'cancelled'
    transfer.error_code = None
    transfer.error_message = None
    transfer.finalized_at = _now()
    task = _finalize_tasks.pop(transfer_id, None)
    if task and not task.done():
        task.cancel()
    await file_service.cleanup_transfer(transfer_id)
    state_store.delete_transfer(transfer_id)
    await room_manager.broadcast(transfer.room_id, {'type': 'transfer_cancelled', 'transfer_id': transfer_id})
    transfers.pop(transfer_id, None)
    return {'cancelled': True}


@router.get('/progress/{transfer_id}', response_model=TransferProgressResponse)
async def transfer_progress(transfer_id: str) -> TransferProgressResponse:
    transfer = transfers.get(transfer_id)
    if not transfer:
        raise HTTPException(status_code=404, detail='Transfer not found')
    return _serialize_progress(transfer)


async def cleanup_stale_transfers() -> None:
    cutoff = _now() - timedelta(seconds=settings.transfer_retention_seconds)
    expired_transfer_ids: list[str] = []
    for transfer_id, transfer in transfers.items():
        reference_time = transfer.finalized_at or transfer.last_activity_at or transfer.created_at
        if reference_time <= cutoff:
            expired_transfer_ids.append(transfer_id)

    for transfer_id in expired_transfer_ids:
        task = _finalize_tasks.pop(transfer_id, None)
        if task and not task.done():
            task.cancel()
        await file_service.cleanup_transfer(transfer_id)
        state_store.delete_transfer(transfer_id)
        transfers.pop(transfer_id, None)
