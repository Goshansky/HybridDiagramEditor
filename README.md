# HybridDiagramEditor

## Реализовано

- `backend` на FastAPI:
  - JWT-аутентификация (`/auth/register`, `/auth/login`)
  - CRUD диаграмм пользователя (`/diagrams*`)
  - список проектов (`/projects`)
  - смена пароля пользователя (`/users/password`)
  - версионирование диаграмм (`/diagrams/{id}/versions`)
  - типы диаграмм в БД: `flowchart | class | sequence | er` (`diagram_type`)
  - Alembic миграции (`users`, `diagrams`, `versions`, `diagram_type`)
- `frontend` на React + Vite + TypeScript:
  - маршрутизация (`/login`, `/register`, `/`, `/projects`, `/profile`)
  - защищенный роут (`ProtectedRoute`)
  - auth-state на Redux Toolkit
  - axios interceptor с автоподстановкой `Bearer` токена
  - экран редактора (2 колонки: source + canvas)
  - парсер Mermaid для подмножества flowchart
  - визуализация на D3 с zoom/pan и drag узлов
  - toolbar: открыть файл, сохранить код, экспорт SVG/PNG, сохранить версию и восстановить через backend
  - обратная синхронизация: `drag node -> update %% {"layout": ...}` в source
  - server-side интеграция диаграмм: список, создание, обновление, загрузка выбранной диаграммы
  - расширен data layer под этап проектов/версий:
    - `diagramApi`: `diagram_type`, `rename`, `delete`, `listVersions`
    - `projectApi`: `GET /projects`
    - `userApi`: `PUT /users/password`
  - расширен Redux-срез диаграмм:
    - `currentDiagramType`
    - `projects`
    - `versions`
  - страница `Projects`:
    - список проектов пользователя из `/projects`
    - действия: открыть в редакторе, переименовать, удалить
  - страница `Profile`:
    - просмотр `email` и даты регистрации
    - смена пароля через `/users/password`
- `postgres` в Docker Compose

## Быстрый запуск

```bash
docker compose up --build
```

Чеклист проверок и регрессионного прогона: `TESTING.md`.

`backend` в `docker-compose` стартует с авто-применением миграций:

- `alembic upgrade head && uvicorn ...`

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
- Обратная синхронизация:
  - при `dragend` координаты узла округляются и сохраняются в `layout`-хинт;
  - если `layout`-хинта нет, он автоматически добавляется в конец текста;
  - если `layout` уже есть, обновляется существующий JSON без изменения остального Mermaid-кода.
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
  - `Сохранить версию` (в backend: create/update);
  - `Вернуться к последней версии` (загрузка с backend по выбранной диаграмме).
- Список диаграмм:
  - в toolbar есть dropdown с диаграммами пользователя;
  - при выборе диаграммы её content загружается в редактор;
  - режим `Новая диаграмма` позволяет создать новый объект при следующем сохранении.

## Backend API

- `POST /auth/register`
- `POST /auth/login`
- `GET /users/me`
- `PUT /users/password`
- `GET /projects`
- `GET /diagrams`
- `POST /diagrams`
- `GET /diagrams/{id}`
- `PUT /diagrams/{id}`
- `PUT /diagrams/{id}/rename`
- `DELETE /diagrams/{id}`
- `GET /diagrams/{id}/versions`

Для всех endpoint, кроме `/auth/*`, нужен заголовок:

`Authorization: Bearer <token>`

### Контракты диаграмм (актуально)

- `POST /diagrams`:
  - `name: string`
  - `type: "flowchart" | "class" | "sequence" | "er"`
  - `content: string` (может быть пустым, backend создаст первую версию)
- `GET /diagrams*` и `PUT /diagrams*` возвращают поле `diagram_type`.
- `GET /projects` возвращает метаданные:
  - `id`, `name`, `diagram_type`, `updated_at`, `versions_count`.

## Миграции

Из директории `backend`:

```bash
alembic upgrade head
```

В этом состоянии должны применяться ревизии:

- `20260323_0001` — initial schema
- `20260324_0002` — `diagram_type` + расширение проекта

## Frontend

### Технологии

- `@reduxjs/toolkit`
- `react-redux`
- `react-router-dom`
- `axios`
- `d3`

### Data layer (актуально после этапа 2)

- `src/services/diagramApi.ts`:
  - `DiagramType = "flowchart" | "class" | "sequence" | "er"`
  - `createDiagram({ name, type, content? })`
  - `updateDiagram(..., { name?, content?, diagram_type? })`
  - `renameDiagram`, `deleteDiagram`, `listVersions`
- `src/services/projectApi.ts`:
  - `listProjects()`
- `src/services/userApi.ts`:
  - `getCurrentUser()`
  - `changePassword({ old_password, new_password })`
- `src/store/diagramSlice.ts`:
  - сохранены `items`, `selectedDiagramId` (обратная совместимость текущего UI)
  - добавлены `currentDiagramType`, `projects`, `versions`
  - добавлены экшены `setProjects`, `upsertProject`, `removeProject`, `setVersions`, `clearVersions`, `setCurrentDiagramType`

### Текущие ограничения

- Вместо `CodeMirror` пока используется `textarea`.
- Выбор типа диаграммы в toolbar (`flowchart/class/sequence`) пока влияет только на визуальный режим интерфейса, без отдельного парсинга class/sequence.
- В UI пока нет отдельной страницы/панели версий (`/diagrams/{id}/versions`), используется только актуальная версия диаграммы.
- В toolbar редактора пока нет расширенного управления проектами/версиями (селектор версии с восстановлением конкретной версии, создание проекта с выбором типа в модалке) — это следующий этап.

### Сценарий авторизации

1. Пользователь регистрируется на `/register`.
2. После регистрации выполняется логин и сохраняется JWT в `localStorage`.
3. При запросах к backend токен автоматически добавляется в `Authorization` через axios interceptor.
4. При `401` выполняется `logout`, пользователь теряет доступ к защищенному маршруту.
5. Главный экран редактора (`/`) доступен только авторизованному пользователю.

## Важные замечания

- Для совместимости `passlib` зафиксирован `bcrypt==4.0.1`.
- Пароль ограничен до `72` байт UTF-8 (ограничение bcrypt), поэтому валидация есть и на backend, и на frontend.
