from __future__ import annotations

import asyncio
import shutil
from pathlib import Path
from typing import AsyncGenerator

import aiofiles

from core.config import settings
from models.transfer import TransferState


class InsufficientSpaceError(RuntimeError):
    def __init__(self, required_bytes: int, free_bytes: int, target: Path) -> None:
        self.required_bytes = required_bytes
        self.free_bytes = free_bytes
        self.target = target
        super().__init__(f'Not enough free space on {target}. Required={required_bytes} Free={free_bytes}')


class MissingChunksError(RuntimeError):
    def __init__(self, missing_chunks: list[int]) -> None:
        self.missing_chunks = missing_chunks
        super().__init__(f'Missing chunks: {missing_chunks[:10]}')


class FileService:
    def __init__(self) -> None:
        self._ram_chunks: dict[str, dict[int, bytes]] = {}
        self._transfer_dirs: dict[str, Path] = {}
        self._lock = asyncio.Lock()

    def _transfer_dir(self, transfer_id: str) -> Path:
        path = settings.temp_dir / transfer_id
        path.mkdir(parents=True, exist_ok=True)
        self._transfer_dirs[transfer_id] = path
        return path

    def _chunk_path(self, transfer_id: str, chunk_index: int) -> Path:
        return self._transfer_dir(transfer_id) / f'chunk_{chunk_index:08d}.bin'

    def should_use_ram(self, transfer: TransferState) -> bool:
        return transfer.filesize <= settings.small_transfer_ram_limit_mb * 1024 * 1024

    def _disk_usage_target(self, path: Path) -> Path:
        candidate = path if path.is_dir() else path.parent
        while not candidate.exists() and candidate != candidate.parent:
            candidate = candidate.parent
        return candidate

    def get_free_space_bytes(self, path: Path) -> int:
        target = self._disk_usage_target(path)
        return shutil.disk_usage(str(target)).free

    def ensure_free_space(self, path: Path, required_bytes: int) -> None:
        reserve_bytes = settings.minimum_free_disk_mb * 1024 * 1024
        free_bytes = self.get_free_space_bytes(path)
        if free_bytes - required_bytes < reserve_bytes:
            raise InsufficientSpaceError(required_bytes=required_bytes + reserve_bytes, free_bytes=free_bytes, target=path)

    def ensure_transfer_capacity(self, transfer: TransferState) -> None:
        self.ensure_free_space(settings.downloads_dir, transfer.filesize)
        self.ensure_free_space(settings.temp_dir, transfer.filesize)

    def has_chunk(self, transfer: TransferState, chunk_index: int) -> bool:
        ram_bucket = self._ram_chunks.get(transfer.transfer_id)
        if ram_bucket and chunk_index in ram_bucket:
            return True
        return self._chunk_path(transfer.transfer_id, chunk_index).exists()

    def list_chunk_files(self, transfer_id: str) -> list[Path]:
        transfer_dir = self._transfer_dir(transfer_id)
        return sorted(transfer_dir.glob('chunk_*.bin'))

    def reconcile_transfer_chunks(self, transfer: TransferState) -> TransferState:
        chunk_files = self.list_chunk_files(transfer.transfer_id)
        received_chunks: set[int] = set()
        chunk_sizes: dict[int, int] = {}
        for chunk_file in chunk_files:
            try:
                index = int(chunk_file.stem.split('_')[-1])
            except ValueError:
                continue
            received_chunks.add(index)
            chunk_sizes[index] = chunk_file.stat().st_size
        transfer.received_chunks = received_chunks
        transfer.chunk_sizes = {index: chunk_sizes[index] for index in received_chunks}
        return transfer

    async def store_chunk(self, transfer: TransferState, chunk_index: int, data: bytes) -> None:
        self.ensure_free_space(settings.temp_dir, len(data))
        chunk_path = self._chunk_path(transfer.transfer_id, chunk_index)
        async with aiofiles.open(chunk_path, 'wb') as fh:
            await fh.write(data)

        if self.should_use_ram(transfer):
            async with self._lock:
                bucket = self._ram_chunks.setdefault(transfer.transfer_id, {})
                bucket[chunk_index] = data

    async def get_chunk(self, transfer_id: str, chunk_index: int) -> bytes:
        ram_bucket = self._ram_chunks.get(transfer_id)
        if ram_bucket and chunk_index in ram_bucket:
            return ram_bucket[chunk_index]
        chunk_path = self._chunk_path(transfer_id, chunk_index)
        if not chunk_path.exists():
            raise FileNotFoundError(f'Chunk {chunk_index} not found for {transfer_id}')
        async with aiofiles.open(chunk_path, 'rb') as fh:
            return await fh.read()

    def get_unique_windows_path(self, path: Path) -> Path:
        if len(str(path)) > 240:
            stem = path.stem[: max(1, 240 - len(path.suffix) - len(str(path.parent)) - 2)]
            path = path.with_name(f'{stem}{path.suffix}')
        if not path.exists():
            return path
        idx = 1
        while True:
            candidate = path.with_name(f'{path.stem}({idx}){path.suffix}')
            if not candidate.exists():
                return candidate
            idx += 1

    async def assemble_file(self, transfer: TransferState, dest_dir: Path | None = None) -> Path:
        missing = transfer.missing_chunks()
        if missing:
            raise MissingChunksError(missing)

        dest_dir = dest_dir or settings.downloads_dir
        dest_dir.mkdir(parents=True, exist_ok=True)
        self.ensure_free_space(dest_dir, transfer.filesize)
        destination = self.get_unique_windows_path(dest_dir / transfer.filename)
        partial = destination.with_name(f'{destination.name}.part')

        async with aiofiles.open(partial, 'wb') as out:
            for idx in range(transfer.total_chunks):
                data = await self.get_chunk(transfer.transfer_id, idx)
                await out.write(data)

        partial.replace(destination)
        transfer.assembled_path = destination
        transfer.complete = True
        return destination

    async def stream_file(self, filepath: Path, chunk_size: int = 1024 * 1024) -> AsyncGenerator[bytes, None]:
        async with aiofiles.open(filepath, 'rb') as fh:
            while True:
                data = await fh.read(chunk_size)
                if not data:
                    break
                yield data

    async def cleanup_transfer(self, transfer_id: str) -> None:
        self._ram_chunks.pop(transfer_id, None)
        folder = self._transfer_dirs.pop(transfer_id, None)
        if not folder or not folder.exists():
            return
        for child in sorted(folder.rglob('*'), key=lambda item: len(item.parts), reverse=True):
            try:
                if child.is_file():
                    child.unlink()
                elif child.is_dir():
                    child.rmdir()
            except OSError:
                pass
        try:
            folder.rmdir()
        except OSError:
            pass


file_service = FileService()
