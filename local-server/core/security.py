from __future__ import annotations

import base64
import hashlib
import json
import secrets
import string
from io import BytesIO
from typing import Any

import qrcode
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


ALPHANUM = string.ascii_uppercase + string.digits


def generate_room_id() -> str:
    part1 = ''.join(secrets.choice(ALPHANUM) for _ in range(4))
    part2 = ''.join(secrets.choice(ALPHANUM) for _ in range(4))
    return f'BEAM-{part1}-{part2}'


def generate_room_code(room_id: str | None = None) -> str:
    value = room_id or generate_room_id()
    return value.replace('BEAM-', '').replace('-', '')


def generate_encryption_key() -> str:
    return secrets.token_hex(32)


def _nonce_for_chunk(key_hex: str, chunk_index: int) -> bytes:
    digest = hashlib.sha256(f'{key_hex}:{chunk_index}'.encode()).digest()
    return digest[:12]


def encrypt_chunk(data: bytes, key: str, chunk_index: int) -> bytes:
    aes = AESGCM(bytes.fromhex(key))
    nonce = _nonce_for_chunk(key, chunk_index)
    encrypted = aes.encrypt(nonce, data, None)
    return nonce + encrypted


def decrypt_chunk(data: bytes, key: str, chunk_index: int) -> bytes:
    nonce = data[:12]
    expected = _nonce_for_chunk(key, chunk_index)
    if nonce != expected:
        raise ValueError('Invalid chunk nonce')
    aes = AESGCM(bytes.fromhex(key))
    return aes.decrypt(nonce, data[12:], None)


def verify_checksum(data: bytes, expected: str) -> bool:
    return hashlib.sha256(data).hexdigest() == expected


def generate_qr(payload: dict[str, Any], size: int = 300) -> str:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=max(2, size // 33),
        border=2,
    )
    qr.add_data(json.dumps(payload, separators=(',', ':')))
    qr.make(fit=True)
    img = qr.make_image(fill_color='#6C63FF', back_color='white')
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode()
