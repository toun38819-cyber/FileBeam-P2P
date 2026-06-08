from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from core.config import settings
from models.room import DeviceInfo, RoomState
from models.transfer import TransferState


class StateStore:
    def __init__(self) -> None:
        self.base_dir = settings.state_dir
        self.rooms_dir = self.base_dir / 'rooms'
        self.transfers_dir = self.base_dir / 'transfers'
        self.rooms_dir.mkdir(parents=True, exist_ok=True)
        self.transfers_dir.mkdir(parents=True, exist_ok=True)

    def _write_json(self, path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_suffix('.tmp')
        temp_path.write_text(json.dumps(payload, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
        temp_path.replace(path)

    def _read_json(self, path: Path) -> dict[str, Any] | None:
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except Exception:
            return None

    def room_path(self, room_id: str) -> Path:
        return self.rooms_dir / f'{room_id}.json'

    def transfer_path(self, transfer_id: str) -> Path:
        return self.transfers_dir / f'{transfer_id}.json'

    def save_room(self, room: RoomState) -> None:
        payload = {
            'room_id': room.room_id,
            'room_code': room.room_code,
            'encryption_key': room.encryption_key,
            'mode': room.mode,
            'host_device': room.host_device.model_dump(),
            'peer_device': room.peer_device.model_dump() if room.peer_device else None,
            'status': room.status,
            'created_at': room.created_at.isoformat(),
            'expires_at': room.expires_at.isoformat(),
            'transfer_ids': room.transfer_ids,
        }
        self._write_json(self.room_path(room.room_id), payload)

    def delete_room(self, room_id: str) -> None:
        try:
            self.room_path(room_id).unlink()
        except OSError:
            pass

    def load_rooms(self) -> list[RoomState]:
        rooms: list[RoomState] = []
        for path in self.rooms_dir.glob('*.json'):
            payload = self._read_json(path)
            if not payload:
                continue
            try:
                rooms.append(RoomState(
                    room_id=payload['room_id'],
                    room_code=payload['room_code'],
                    encryption_key=payload['encryption_key'],
                    mode=payload['mode'],
                    host_device=DeviceInfo(**payload['host_device']),
                    peer_device=DeviceInfo(**payload['peer_device']) if payload.get('peer_device') else None,
                    status=payload['status'],
                    created_at=datetime.fromisoformat(payload['created_at']),
                    expires_at=datetime.fromisoformat(payload['expires_at']),
                    transfer_ids=list(payload.get('transfer_ids', [])),
                ))
            except Exception:
                continue
        return rooms

    def save_transfer(self, transfer: TransferState) -> None:
        payload = {
            'transfer_id': transfer.transfer_id,
            'room_id': transfer.room_id,
            'filename': transfer.filename,
            'filesize': transfer.filesize,
            'filetype': transfer.filetype,
            'total_chunks': transfer.total_chunks,
            'checksum_full': transfer.checksum_full,
            'created_at': transfer.created_at.isoformat(),
            'is_folder': transfer.is_folder,
            'folder_tree': transfer.folder_tree,
            'compression': transfer.compression,
            'sender': transfer.sender.model_dump() if transfer.sender else None,
            'chunk_checksums': transfer.chunk_checksums,
            'chunk_sizes': transfer.chunk_sizes,
            'chunk_attempts': transfer.chunk_attempts,
            'received_chunks': sorted(transfer.received_chunks),
            'complete': transfer.complete,
            'status': transfer.status,
            'assembled_path': str(transfer.assembled_path) if transfer.assembled_path else None,
            'last_activity_at': transfer.last_activity_at.isoformat() if transfer.last_activity_at else None,
            'finalized_at': transfer.finalized_at.isoformat() if transfer.finalized_at else None,
            'error_code': transfer.error_code,
            'error_message': transfer.error_message,
            'duplicate_chunks': transfer.duplicate_chunks,
        }
        self._write_json(self.transfer_path(transfer.transfer_id), payload)

    def delete_transfer(self, transfer_id: str) -> None:
        try:
            self.transfer_path(transfer_id).unlink()
        except OSError:
            pass

    def load_transfers(self) -> list[TransferState]:
        transfers: list[TransferState] = []
        for path in self.transfers_dir.glob('*.json'):
            payload = self._read_json(path)
            if not payload:
                continue
            try:
                transfer = TransferState(
                    transfer_id=payload['transfer_id'],
                    room_id=payload['room_id'],
                    filename=payload['filename'],
                    filesize=payload['filesize'],
                    filetype=payload['filetype'],
                    total_chunks=payload['total_chunks'],
                    checksum_full=payload['checksum_full'],
                    created_at=datetime.fromisoformat(payload['created_at']),
                    is_folder=payload.get('is_folder', False),
                    folder_tree=payload.get('folder_tree'),
                    compression=payload.get('compression', 'auto'),
                    sender=DeviceInfo(**payload['sender']) if payload.get('sender') else None,
                    chunk_checksums={int(k): v for k, v in payload.get('chunk_checksums', {}).items()},
                    chunk_sizes={int(k): int(v) for k, v in payload.get('chunk_sizes', {}).items()},
                    chunk_attempts={int(k): int(v) for k, v in payload.get('chunk_attempts', {}).items()},
                    received_chunks=set(int(v) for v in payload.get('received_chunks', [])),
                    complete=bool(payload.get('complete', False)),
                    status=payload.get('status', 'pending'),
                    assembled_path=Path(payload['assembled_path']) if payload.get('assembled_path') else None,
                    last_activity_at=datetime.fromisoformat(payload['last_activity_at']) if payload.get('last_activity_at') else None,
                    finalized_at=datetime.fromisoformat(payload['finalized_at']) if payload.get('finalized_at') else None,
                    error_code=payload.get('error_code'),
                    error_message=payload.get('error_message'),
                    duplicate_chunks=int(payload.get('duplicate_chunks', 0)),
                )
                transfers.append(transfer)
            except Exception:
                continue
        return transfers


state_store = StateStore()
