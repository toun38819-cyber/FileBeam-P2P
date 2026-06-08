# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

qrcode_datas, qrcode_bins, qrcode_hidden = collect_all('qrcode')
pil_datas, pil_bins, pil_hidden = collect_all('PIL')

hiddenimports = [
    'uvicorn.logging',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets.auto',
    'aiofiles',
    'multipart',
    'qrcode',
    'PIL',
    'cryptography',
    'netifaces',
    'netifaces2',
    'zstandard',
] + qrcode_hidden + pil_hidden


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=qrcode_bins + pil_bins,
    datas=qrcode_datas + pil_datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='filebeam-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
)
