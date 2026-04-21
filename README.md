# Hybrid Diagram Editor

Полноценный веб-редактор диаграмм с двусторонней синхронизацией:

- код Mermaid-подобного формата -> рендер на холсте;
- изменения на холсте -> обновление исходного кода;
- версионирование диаграмм в backend;
- экспорт в SVG/PNG.

Поддерживаются 4 типа диаграмм:

- `flowchart`
- `classDiagram`
- `sequenceDiagram`
- `erDiagram`

---

## Содержание

- [1. Стек](#1-стек)
- [2. Архитектура проекта](#2-архитектура-проекта)
- [3. Ключевые возможности](#3-ключевые-возможности)
- [4. Layout-хинты (`%%`)](#4-layout-хинты-)
- [5. Поддержка диаграмм](#5-поддержка-диаграмм)
- [6. Backend API](#6-backend-api)
- [7. Запуск через Docker (рекомендуется)](#7-запуск-через-docker-рекомендуется)
- [8. Локальный запуск без Docker (dev)](#8-локальный-запуск-без-docker-dev)
- [9. Переменные окружения](#9-переменные-окружения)
- [10. Скрипты](#10-скрипты)
- [11. Известные ограничения](#11-известные-ограничения)
- [12. Безопасность и auth-поток](#12-безопасность-и-auth-поток)
- [13. Релевантные файлы](#13-релевантные-файлы)
- [14. Лицензия](#14-лицензия)

---

## 1. Стек

### Frontend

- React 18 + TypeScript + Vite
- Redux Toolkit + React Redux
- React Router
- D3 (рендер и интерактив на SVG)
- CodeMirror 6 (`codemirror-lang-mermaid` для подсветки Mermaid)
- Lucide Icons

### Backend

- FastAPI
- SQLAlchemy 2
- Alembic
- PostgreSQL
- JWT (`python-jose`)

---

## 2. Архитектура проекта

```text
HybridDiagramEditor/
  backend/
    app/
      routers/         # auth, diagrams, projects, users
      models.py        # SQLAlchemy модели
      schemas.py       # Pydantic схемы
      crud.py          # DB операции
      main.py          # FastAPI app
    alembic/           # миграции
  frontend/
    src/
      pages/           # Editor, Dashboard, Documentation
      components/      # Canvas, panels, dialogs, editor
      services/        # API-клиенты
      store/           # Redux slices
    parser/            # tokenizer/parsers/generators/layout-hints
```

---

## 3. Ключевые возможности

### Редактор

- CodeMirror с Mermaid-подсветкой и синхронизацией с глобальной темой (`light/dark`)
- Zoom/Pan на холсте
- Перетаскивание узлов/сущностей
- Выделение элементов и редактирование через панель свойств
- Удаление выбранных узлов/связей по `Delete` (flowchart/class/er)
- Добавление узлов и связей кнопками:
  - `flowchart`
  - `classDiagram`
  - `erDiagram`

### Автоопределение типа диаграммы

Тип определяется автоматически по первой значимой строке исходника:

- `flowchart`/`graph`
- `classDiagram`
- `sequenceDiagram`
- `erDiagram`

### Версионирование

- Создание версий диаграммы
- Просмотр списка версий
- Восстановление версии
- `diagram_type` хранится на уровне версии

### Экспорт

- `SVG`
- `PNG`
- сохранение исходного кода (`.mmd`)

---

## 4. Layout-хинты (`%%`)

Редактор сохраняет ручную геометрию и часть стилей в JSON-хинтах Mermaid-комментариев.

Пример:

```text
%% {
%%   "layout": {
%%     "A": {"x": 240, "y": 140, "width": 110, "height": 46},
%%     "B": {"x": 420, "y": 140, "width": 110, "height": 46}
%%   },
%%   "edgeStyles": {
%%     "0": {"stroke": "#4b5563", "stroke-width": "2px"}
%%   }
%% }
```

Что важно:

- поддерживаются многострочные блоки `%%` JSON;
- парсер корректно читает такие блоки;
- при ручных изменениях блок обновляется, а не ломается.

---

## 5. Поддержка диаграмм

### Flowchart

- узлы, связи, метки, стили
- drag + сохранение координат
- редактирование узла/связи через панель свойств
- удаление узлов/связей

### Class Diagram

- классы, поля, методы, стереотипы
- UML-связи (inheritance/implementation/association/aggregation/composition/dependency)
- кратности и стиль связи
- удаление классов/связей

### Sequence Diagram

- участники, сообщения, заметки
- reorder участников (порядок в hint)
- drag узлов как в flowchart/class не применяется

### ER Diagram

- сущности и атрибуты
- связи с кардинальностями (`||`, `o{`, и т.д.)
- crow's-foot визуализация кардинальностей
- редактирование сущности/связи в панели свойств
- удаление сущностей/связей

---

## 6. Backend API

Основные endpoints:

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

Auth:

- для всех endpoint кроме `/auth/*` нужен заголовок  
  `Authorization: Bearer <token>`

Healthcheck:

- `GET /health`

---

## 7. Запуск через Docker (рекомендуется)

Из корня проекта:

```bash
docker compose up --build
```

После запуска:

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:8000](http://localhost:8000)
- Health: [http://localhost:8000/health](http://localhost:8000/health)

В `docker-compose` backend стартует с миграциями:

- `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000`

---

## 8. Локальный запуск без Docker (dev)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Убедись, что `VITE_API_URL` указывает на backend.

---

## 9. Переменные окружения

### Backend

- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `CORS_ORIGINS`

### Frontend

- `VITE_API_URL`

---

## 10. Скрипты

### Frontend

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run preview` — preview build
- `npm run test:parser` — parser сценарии

### Backend

- `alembic upgrade head` — миграции
- `uvicorn app.main:app --reload` — запуск API

---

## 11. Известные ограничения

- Mermaid-подсветка в CodeMirror зависит от покрытия grammar пакета `codemirror-lang-mermaid` (некоторые диалекты могут подсвечиваться частично).
- Поддерживается рабочее подмножество Mermaid для 4 типов диаграмм, а не полный upstream-grammar Mermaid.
- Для `sequenceDiagram` интерактив редактирования на холсте ограничен (по сравнению с flowchart/class/er).

---

## 12. Безопасность и auth-поток

1. Регистрация/логин.
2. JWT сохраняется на клиенте.
3. Axios interceptor подставляет `Bearer` в каждый защищенный запрос.
4. При `401` клиент сбрасывает auth-сессию.

---

## 13. Релевантные файлы

- `frontend/src/pages/EditorPage.tsx` — основной экран редактора
- `frontend/src/components/DiagramCanvas.tsx` — рендер SVG + интерактив
- `frontend/src/components/CodeEditor.tsx` — CodeMirror
- `frontend/parser/index.ts` — фабрика парсеров
- `frontend/parser/layoutHintSync.ts` — чтение/обновление `%%`-hint JSON
- `frontend/parser/classDiagram.ts` / `erDiagram.ts` / `sequenceParserCore.ts`
- `frontend/src/services/diagramApi.ts` — контракты diagram/version API
- `backend/app/main.py` — сборка FastAPI приложения

---

## 14. Лицензия

Проект распространяется под лицензией MIT.  
См. файл [LICENSE](./LICENSE).
