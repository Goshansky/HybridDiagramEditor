# HybridDiagramEditor

Базовый каркас проекта для гибридного редактора диаграмм.

## Что уже есть

- `backend` на FastAPI с JWT-аутентификацией и CRUD диаграмм
- `frontend` на React + Vite (существующий прототип)
- `postgres` в Docker Compose
- Alembic миграции (`users`, `diagrams`, `versions`)

## Быстрый запуск

```bash
docker compose up --build
```

После запуска:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- Healthcheck backend: `http://localhost:8000/health`

## Backend API

- `POST /auth/register`
- `POST /auth/login`
- `GET /diagrams`
- `POST /diagrams`
- `GET /diagrams/{id}`
- `PUT /diagrams/{id}`
- `GET /diagrams/{id}/versions`

Для всех `diagrams` endpoint нужен заголовок:

`Authorization: Bearer <token>`

## Миграции

Из директории `backend`:

```bash
alembic upgrade head
```
