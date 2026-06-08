from __future__ import annotations

import json
import socket
import threading
import time
from contextlib import closing

from fastapi import APIRouter, Request

from core.config import settings
from core.network import get_local_ip, is_port_open

router = APIRouter(prefix='/discovery', tags=['discovery'])


@router.get('/announce')
async def announce(request: Request) -> dict:
    payload = {
        'device_name': settings.device_name,
        'device_type': settings.device_type,
        'ip': get_local_ip(),
        'port': getattr(request.app.state, 'port', settings.default_port),
        'room_id': request.query_params.get('room_id'),
    }
    raw = json.dumps(payload).encode()
    with closing(socket.socket(socket.AF_INET, socket.SOCK_DGRAM)) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.sendto(raw, ('255.255.255.255', settings.discovery_port))
    return payload


@router.get('/scan')
async def scan(request: Request) -> list[dict]:
    seen: list[dict] = []
    stop = time.time() + 2

    def listener() -> None:
        with closing(socket.socket(socket.AF_INET, socket.SOCK_DGRAM)) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(('', settings.discovery_port))
            sock.settimeout(0.2)
            while time.time() < stop:
                try:
                    data, _ = sock.recvfrom(4096)
                    seen.append(json.loads(data.decode()))
                except Exception:
                    continue

    thread = threading.Thread(target=listener, daemon=True)
    thread.start()
    await announce(request)
    thread.join(timeout=2.2)

    unique = []
    keys = set()
    for item in seen:
        key = (item.get('ip'), item.get('port'))
        if key not in keys:
            keys.add(key)
            unique.append(item)
    return unique
