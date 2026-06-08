from __future__ import annotations

import asyncio
import multiprocessing
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from core.config import settings
from core.network import find_available_port, get_local_ip
from routers.discovery import router as discovery_router
from routers.room import router as room_router
from routers.transfer import cleanup_stale_transfers, load_persisted_transfers, router as transfer_router, transfers
from routers.websocket import router as websocket_router
from services.room_manager import room_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await room_manager.load_persisted()
    await load_persisted_transfers()
    await room_manager.cleanup_expired()
    await cleanup_stale_transfers()

    async def cleanup_loop() -> None:
        while True:
            await room_manager.cleanup_expired()
            await cleanup_stale_transfers()
            await asyncio.sleep(settings.cleanup_interval_seconds)

    task = asyncio.create_task(cleanup_loop())
    yield
    task.cancel()


app = FastAPI(title=settings.app_name, version=settings.version, lifespan=lifespan)
app.include_router(room_router)
app.include_router(transfer_router)
app.include_router(websocket_router)
app.include_router(discovery_router)


@app.get('/health')
async def health() -> dict[str, object]:
    paused_transfers = sum(1 for transfer in transfers.values() if transfer.status == 'paused')
    return {
        'status': 'ok',
        'version': settings.version,
        'device_name': settings.device_name,
        'local_ip': get_local_ip(),
        'port': getattr(app.state, 'port', settings.default_port),
        'active_rooms': len(room_manager.rooms),
        'room_ids': list(room_manager.rooms.keys()),
        'active_transfers': len(transfers),
        'paused_transfers': paused_transfers,
        'mode': 'hosting' if room_manager.rooms else 'idle',
        'platform': settings.device_type,
    }


if __name__ == '__main__':
    multiprocessing.freeze_support()
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    port = find_available_port(settings.default_port, settings.max_port)
    app.state.port = port
    uvicorn.run(
        app,
        host=settings.host,
        port=port,
        loop='asyncio',
        http='httptools',
        log_level='warning',
        access_log=False,
        workers=1,
    )
