# 🧬 Organella Core API

Backend Core Shell & Generic Health Engine for the Organella Platform.

## Features
- **FastAPI** based high-performance RESTful API
- **SQLAlchemy 2.0 (Async)** + PostgreSQL 16
- **Redis 7** for Caching & Event Bus Pub/Sub
- **HL7 FHIR R4** Interoperability Resources via `fhir.resources`
- **Module Lifecycle Manager** for dynamic plugin registration

## Getting Started
```bash
uv venv
.venv\Scripts\activate
uv pip install -e ".[dev]"
uv run uvicorn organella_core.main:app --reload --port 8000
```
