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
  - парсеры Mermaid по типам диаграмм (factory):
    - `flowchart` (основной)
    - `classDiagram` (MVP)
    - `sequenceDiagram` (MVP)
    - `erDiagram` (MVP)
  - визуализация на D3 с zoom/pan и drag узлов (для `sequence` drag отключен)
  - toolbar:
    - открыть файл, сохранить код, экспорт SVG/PNG
    - выбрать проект, создать новую диаграмму (`name + type`)
    - выбрать тип диаграммы с опцией подстановки шаблона
    - сохранить версию, просмотреть список версий, восстановить выбранную версию
    - добавить узел / добавить связь
  - контекстное меню холста:
    - правый клик по пустой области: `Добавить узел`, `Добавить связь`
  - редактирование элементов на холсте:
    - добавление узла через диалог (текст + форма), с автоматическим `layout`-хинтом
    - добавление связи в два клика (источник -> цель) с опциональной меткой
    - двойной клик по узлу: редактирование текста и формы
    - двойной клик по связи: редактирование метки
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
  - узлы:
    - `A[Текст]` — прямоугольник
    - `B{Текст}` — ромб
    - `C((Текст))` — круг
    - `D([Текст])` — овал
    - `E[[Текст]]` — параллелограмм
    - `F[(Текст)]` или `>Текст]` — облако (MVP)
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
  - `Сохранить версию` (create/update в backend);
  - `Создать новую диаграмму` (ввод названия и типа);
  - `Тип диаграммы` (flowchart/class/sequence/er) с опциональной подстановкой шаблона;
  - `Версии` (загрузка списка `/diagrams/{id}/versions` при открытии селектора);
  - `Восстановить эту версию` (создает новую текущую версию из выбранной).
  - `Добавить узел` / `Добавить связь`.
- Для типов диаграмм:
  - `flowchart` — полноценный существующий режим с drag + layout-hints;
  - `class` — MVP парсинг классов и связей, рендер как узлы/связи;
  - `sequence` — MVP рендер участников/сообщений, без drag;
  - `er` — MVP парсинг сущностей/связей, рендер как узлы/линии.
- Визуальный режим выбирается автоматически по `diagram_type` текущей диаграммы (ручного селектора режима больше нет).
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
- `codemirror` (`@codemirror/state`, `@codemirror/view`, `@codemirror/lang-markdown`)
- `lucide-react`

### Data layer

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

### Архитектура парсера

- `parser/index.ts`:
  - `parseMermaidByType(source, diagramType)` — фабрика парсинга
- `parser/flowchart.ts`:
  - flowchart parser через текущий AST/model пайплайн
- `parser/classDiagram.ts`:
  - MVP parser для классов и базовых отношений
- `parser/sequence.ts`:
  - MVP parser для `participant` и сообщений
- `parser/erDiagram.ts`:
  - MVP parser для сущностей и связей ER
- `parser/layoutHints.ts`:
  - извлечение layout-хинтов из комментариев `%% { "layout": ... }`

### Текущие ограничения

- Вместо `CodeMirror` пока используется `textarea`.
- В кодовой базе есть прототипные компоненты `CodeEditor` и `SidePanel`, но они пока не подключены к основному экрану редактора.
- Парсинг/рендер `class`, `sequence`, `er` пока MVP-уровня (не полный Mermaid grammar).
- Для создания диаграммы и выбора типа по-прежнему используются `prompt/confirm`; кастомные модальные окна еще не внедрены.
- В dropdown версий пока нет явной визуальной метки "текущая версия".
- Обратная синхронизация layout-хинтов полностью отлажена для flowchart; для `class/er` есть базовая поддержка чтения координат (запись/round-trip будет дорабатываться), `sequence` работает без drag.
- Интерактивное добавление/редактирование узлов и связей на холсте сейчас реализовано для flowchart.

### Сценарий авторизации

1. Пользователь регистрируется на `/register`.
2. После регистрации выполняется логин и сохраняется JWT в `localStorage`.
3. При запросах к backend токен автоматически добавляется в `Authorization` через axios interceptor.
4. При `401` выполняется `logout`, пользователь теряет доступ к защищенному маршруту.
5. Главный экран редактора (`/`) доступен только авторизованному пользователю.

## Важные замечания

- Для совместимости `passlib` зафиксирован `bcrypt==4.0.1`.
- Пароль ограничен до `72` байт UTF-8 (ограничение bcrypt), поэтому валидация есть и на backend, и на frontend.
