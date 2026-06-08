from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from models.room import DeviceInfo


class InitiateTransferRequest(BaseModel):
    room_id: str
    transfer_id: str
    filename: str
    filesize: int
    filetype: str = 'application/octet-stream'
    total_chunks: int
    checksum_full: str
    is_folder: bool = False
    folder_tree: dict | None = None
    compression: Literal['zstd', 'none', 'auto'] = 'auto'
    sender: DeviceInfo | None = None


class TransferProgressResponse(BaseModel):
    transfer_id: str
    filename: str
    bytes_received: int
    filesize: int
    total_chunks: int
    received_chunks: int
    complete: bool
    status: str
    missing_chunks: list[int] = Field(default_factory=list)
    can_resume: bool = True
    duplicate_chunks: int = 0
    last_activity_at: datetime
    error_code: str | None = None
    error_message: str | None = None


@dataclass
class TransferState:
    transfer_id: str
    room_id: str
    filename: str
    filesize: int
    filetype: str
    total_chunks: int
    checksum_full: str
    created_at: datetime
    is_folder: bool = False
    folder_tree: dict | None = None
    compression: str = 'auto'
    sender: DeviceInfo | None = None
    chunk_checksums: dict[int, str] = field(default_factory=dict)
    chunk_sizes: dict[int, int] = field(default_factory=dict)
    chunk_attempts: dict[int, int] = field(default_factory=dict)
    received_chunks: set[int] = field(default_factory=set)
    complete: bool = False
    status: str = 'pending'
    assembled_path: Path | None = None
    last_activity_at: datetime | None = None
    finalized_at: datetime | None = None
    error_code: str | None = None
    error_message: str | None = None
    duplicate_chunks: int = 0

    def bytes_received(self) -> int:
        return sum(self.chunk_sizes.values())

    def missing_chunks(self) -> list[int]:
        return [index for index in range(self.total_chunks) if index not in self.received_chunks]

    def can_resume(self) -> bool:
        return self.status not in {'complete', 'cancelled'}
