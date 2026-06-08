# FileBeam P2P

Direct transfer. No servers. Full speed.

FileBeam is a monorepo for a serverless peer-to-peer file transfer system with:

- `signaling-server/` — tiny FastAPI WebSocket relay for WebRTC SDP/ICE only
- `local-server/` — built-in FastAPI server that runs on each device for LAN/offline transfers
- `desktop-app/` — Electron + React + TypeScript desktop shell for Windows
- `mobile-app/` — React Native mobile scaffold for Android/iOS

## Current repository state

This workspace contains a full project scaffold plus working core implementations for:

- signaling server
- local FastAPI room/transfer/discovery services
- Electron main process + preload + UI shell
- React desktop screens/components/stores/services
- React Native mobile screens/components/services scaffold
- Windows packaging/build docs

## Quick start

### 1) Signaling server

```bash
cd signaling-server
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 7000
```

### 2) Local server

```bash
cd local-server
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### 3) Desktop app

```bash
cd desktop-app
npm install
npm run dev
```

### 4) Mobile app

Use the files in `mobile-app/` as a React Native app scaffold, then add your normal RN platform bootstrap files and install native dependencies.

## Key flows implemented

- Room create / join / status
- QR payload generation
- LAN UDP announce + scan
- Chunked upload endpoint
- Chunk download endpoint
- Simple file assembly on receiver
- WebRTC signaling client/service scaffold
- Desktop UI for host/join/send/receive/history/settings

## Important notes

- LAN mode is the most complete path in this repo.
- Internet P2P is scaffolded end-to-end, but production NAT/TURN hardening, resume behavior, and mobile native server integration still need full platform testing.
- The mobile app files are intentionally lightweight and meant to be completed inside a full RN workspace.

## Suggested next steps

1. Install dependencies and run the signaling + local server.
2. Wire the desktop send screen to the real `P2PManager` instead of the mock progress loop.
3. Add persistent history storage.
4. Add transfer resume / retry state.
5. Complete mobile native HTTP/background service support.
