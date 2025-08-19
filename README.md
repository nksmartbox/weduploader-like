# WeDuploader-like App (Ready to Use)

A simple, production-ready file sharing web app similar to **weduploader.com**. Users can drag-and-drop a file, upload it, and get a shareable link that expires automatically.

## Features
- Drag & drop or click-to-select uploads
- Progress bar with time estimate
- Shareable link + "Copy" button
- Auto-expiring links with periodic cleanup
- Single-file download page
- Server serves the built frontend (no separate hosting needed)
- Environment-configurable size limits & TTL
- Docker and Docker Compose for one-command deploy
- SQLite metadata store, disk file storage
- Basic rate limiting, CORS, Helmet security headers

## Quick Start (Local)

1) **Install Node 18+** and **PNPM** (or NPM/Yarn).  
2) Copy env and adjust as needed:
```bash
cp .env.example .env
```
3) Install dependencies and build the client:
```bash
pnpm -w install
pnpm -w --filter client build
```
4) Start the server:
```bash
pnpm -w --filter server dev
```
Visit **http://localhost:8080**

## Production build
```bash
pnpm -w install
pnpm -w --filter client build
pnpm -w --filter server build
pnpm -w --filter server start
```

## Docker
```bash
docker compose up --build -d
```
This exposes port 8080 and persists data in a `storage` volume and SQLite DB at `data/app.db`.

## Env Variables
See **.env.example** for all knobs: `PORT`, `BASE_URL`, `STORAGE_DIR`, `MAX_FILE_SIZE_MB`, `LINK_TTL_HOURS`, `CLEANUP_INTERVAL_MINUTES`, `ALLOWED_ORIGINS`.

## Notes
- For large uploads in high-traffic situations, consider object storage (S3) + presigned URLs. This template keeps it all on the server for simplicity.
- Add a malware scanning hook if required for your environment.
- HTTPS: put this behind a reverse proxy (e.g., Caddy, Nginx, Traefik) with TLS.
