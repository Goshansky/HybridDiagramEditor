# HybridDiagramEditor

## Реализовано

- `backend` на FastAPI:
  - JWT-аутентификация (`/auth/register`, `/auth/login`)
  - CRUD диаграмм пользователя (`/diagrams*`)
  - версионирование диаграмм (`/diagrams/{id}/versions`)
  - Alembic миграции (`users`, `diagrams`, `versions`)
- `frontend` на React + Vite + TypeScript:
  - маршрутизация (`/login`, `/register`, `/`)
  - защищенный роут (`ProtectedRoute`)
  - auth-state на Redux Toolkit
  - axios interceptor с автоподстановкой `Bearer` токена
  - базовый экран редактора (прототип парсинга/визуализации)
- `postgres` в Docker Compose

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

## Frontend

### Технологии, добавленные на этапе 2

- `@reduxjs/toolkit`
- `react-redux`
- `react-router-dom`
- `axios`

### Сценарий авторизации

1. Пользователь регистрируется на `/register`.
2. После регистрации выполняется логин и сохраняется JWT в `localStorage`.
3. При запросах к backend токен автоматически добавляется в `Authorization` через axios interceptor.
4. При `401` выполняется `logout`, пользователь теряет доступ к защищенному маршруту.
5. Главный экран редактора (`/`) доступен только авторизованному пользователю.

## Важные замечания

- Для совместимости `passlib` зафиксирован `bcrypt==4.0.1`.
- Пароль ограничен до `72` байт UTF-8 (ограничение bcrypt), поэтому валидация есть и на backend, и на frontend.
