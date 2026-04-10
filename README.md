# Personal Energy Monitoring

Local-first personal energy monitoring for family use.

## What this includes

- Python backend API for ingestion, polling, calculations, and historical queries.
- Adapter-based integration model for smart meters and solar inverters.
- React dashboard with Now, Today, and History sections.
- InfluxDB time-series storage.
- Docker Compose for local deployment with production-style containers.

## Why this stack

- **FastAPI (Python)**: async API with lightweight deployment and simple adapter integration.
- **React + Vite**: simple front-end iteration and clear component structure.
- **InfluxDB**: optimized for timestamped energy metrics and aggregation windows.
- **Docker Compose**: easy local operation and service isolation without cloud.

## Repository structure

- `plugin/`: existing Home Assistant integrations (source reference for SMA/Enphase fields).
- `backend/`: API, ingestion polling, adapters, insight calculations.
- `frontend/`: dashboard UI.
- `docs/architecture.md`: architecture and data flow.
- `docker-compose.yml`: local deployment.

## Quick start

1. Create a `.env` file using `.env.example`.
2. Start stack:

   ```bash
   docker compose up -d --build
   ```

3. Open:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8080

## Local development without Docker for the backend

1. Start InfluxDB:

   ```bash
   docker compose up -d influxdb
   ```

2. Start the backend:

   ```bash
   cd backend/python_api
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 5180
   ```

3. Start the frontend:

   ```bash
   cd frontend
   npm run dev
   ```

The Vite dev proxy is preconfigured to forward `/api` to `http://localhost:5180`.

## Production notes

- Frontend container is built as static assets and served by `nginx`.
- Frontend-to-backend API traffic is reverse-proxied through `nginx` under `/api`.
- Runtime adapter settings are persisted by the backend and managed from the Web UI (`/api/settings`), not from environment variables.
- Backend CORS origins are configurable in `appsettings.json` under `Cors:AllowedOrigins`.

## Notes on your existing plugins

Your Home Assistant plugin code in `plugin/enphase_envoy` and `plugin/sma` was used to define adapter output fields for inverter production and grid metrics. The backend adapters are intentionally separate from Home Assistant runtime dependencies, but mirror the same metric concepts.
