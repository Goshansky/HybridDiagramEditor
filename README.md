# HybridDiagramEditor

Базовый каркас проекта для гибридного редактора диаграмм.

## Что уже есть:

- `backend` на FastAPI с endpoint `GET /health`
- `frontend` на React + Vite (существующий прототип)
- `postgres` в Docker Compose

## Быстрый запуск

```bash
docker compose up --build
```

После запуска:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- Healthcheck backend: `http://localhost:8000/health`
