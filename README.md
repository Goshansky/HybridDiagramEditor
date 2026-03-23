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
  - экран редактора (2 колонки: source + canvas)
  - парсер Mermaid для подмножества flowchart
  - визуализация на D3 с zoom/pan и drag узлов
  - toolbar: открыть файл, сохранить код, экспорт SVG/PNG, локальное сохранение/восстановление версии
- `postgres` в Docker Compose

## Быстрый запуск

```bash
docker compose up --build
```

После запуска:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- Healthcheck backend: `http://localhost:8000/health`

## Что уже умеет редактор

- Поддерживаемый синтаксис:
  - `graph TD|LR|BT|RL`
  - узлы: `A[Текст]`, `B{Текст}`, `C((Текст))`
  - связи: `-->`, `---`, метки `|Да|`
  - стили узлов: `style A fill:#...,stroke:#...`
  - layout-хинт: `%% { "layout": { ... } }`
- Поддерживается как однострочный, так и многострочный JSON layout-хинта в `%%`.
- Обновление рендера стабилизировано:
  - корректное обновление формы и текста узлов при правке source;
  - для `-->` рендерится arrowhead, для `---` обычная линия.
- Холст поддерживает:
  - zoom колесом мыши;
  - zoom-кнопки `+ / - / Сброс`;
  - pan правой кнопкой мыши;
  - сетку на фоне SVG.
- Доступные действия в toolbar:
  - `Открыть файл` (`.mmd`, `.txt`, `.md`);
  - `Сохранить код` (`diagram.mmd`);
  - `Сохранить SVG`;
  - `Сохранить PNG`;
  - `Сохранить версию` (локально в `localStorage`);
  - `Вернуться к последней версии` (из `localStorage`).

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

### Текущие ограничения

- Вместо `CodeMirror` пока используется `textarea`.
- Выбор типа диаграммы в toolbar (`flowchart/class/sequence`) пока влияет только на визуальный режим интерфейса, без отдельного парсинга class/sequence.
- Кнопка `Сохранить версию` пока сохраняет локально, а не через backend API (серверное сохранение будет следующим этапом).
- Обратная синхронизация `drag -> обновление layout-хинта в тексте` еще не включена (план этапа 5).

### Сценарий авторизации

1. Пользователь регистрируется на `/register`.
2. После регистрации выполняется логин и сохраняется JWT в `localStorage`.
3. При запросах к backend токен автоматически добавляется в `Authorization` через axios interceptor.
4. При `401` выполняется `logout`, пользователь теряет доступ к защищенному маршруту.
5. Главный экран редактора (`/`) доступен только авторизованному пользователю.

## Важные замечания

- Для совместимости `passlib` зафиксирован `bcrypt==4.0.1`.
- Пароль ограничен до `72` байт UTF-8 (ограничение bcrypt), поэтому валидация есть и на backend, и на frontend.
