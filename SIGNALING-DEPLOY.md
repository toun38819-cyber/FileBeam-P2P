# Signaling Server Deploy

The signaling server only relays WebRTC handshake messages. It does not transfer file data.

## Railway / Render / Fly.io

### Option A: Docker deploy

Point your platform at `signaling-server/Dockerfile`.

### Option B: direct Python deploy

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 7000
```

## Health check

`GET /health`

Expected response:

```json
{
  "status": "ok",
  "active_rooms": 0,
  "active_peers": 0
}
```

## Environment

No database is required.
No Redis is required.
No file storage is required.

## Security guidance

- Use TLS (`wss://`) in production.
- Add basic rate limiting at the platform edge.
- Restrict very large room fan-out if you want strictly 2-peer rooms.
- Monitor connection counts and message sizes.
