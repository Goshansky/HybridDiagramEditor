import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Box, Code2, Download, FolderKanban, GitBranch, LayoutGrid, Rocket } from 'lucide-react';

import styles from './Documentation.module.css';

const sections: Array<{ title: string; markdown: string }> = [
  {
    title: 'Введение',
    markdown: `
Hybrid Diagram Editor — гибридный редактор диаграмм с **двусторонней синхронизацией**:

- пишешь Mermaid-подобный код и сразу видишь результат на холсте;
- двигаешь узлы на холсте — layout-хинты сохраняются обратно в код;
- сохраняешь версии и откатываешься к нужной ревизии.
`,
  },
  {
    title: 'Поддерживаемые типы диаграмм',
    markdown: `
- \`flowchart\` — блок-схемы с узлами/ветвлениями;
- \`classDiagram\` — диаграммы классов, полей/методов и UML-связей;
- \`sequenceDiagram\` — сценарии взаимодействий между участниками;
- \`erDiagram\` — ER-диаграммы для сущностей и связей с кардинальностями.

Тип диаграммы определяется автоматически по первой значимой строке кода
(\`flowchart/graph\`, \`classDiagram\`, \`sequenceDiagram\`, \`erDiagram\`).
`,
  },
  {
    title: 'Примеры диаграмм',
    markdown: `
### Flowchart
\`\`\`mermaid
graph TD
  A[Начало] --> B{Условие}
  B -->|Да| C[Действие 1]
  B -->|Нет| D[Действие 2]
\`\`\`

### Class Diagram
\`\`\`mermaid
classDiagram
  class User {
    +int id
    +string email
    +login(): void
  }
  class Admin {
    +string role
  }
  User <|-- Admin
  User "1" --> "0..*" Project : owns
\`\`\`

### Sequence Diagram
\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant API as Backend
  U->>API: GET /projects
  API-->>U: 200 OK
\`\`\`

### ER Diagram
\`\`\`mermaid
erDiagram
  CUSTOMER {
    int id PK
    string name
    string email UK
  }
  ORDER {
    int id PK
    date created_at
    decimal total
  }
  CUSTOMER ||--o{ ORDER : places
\`\`\`
`,
  },
  {
    title: 'Редактирование на холсте',
    markdown: `
- перетаскивание узлов/сущностей обновляет layout-хинты в коде;
- для \`flowchart\`, \`classDiagram\`, \`erDiagram\` доступны кнопки **Добавить узел** и **Добавить связь**;
- для \`flowchart\`, \`classDiagram\`, \`erDiagram\` работает удаление выделенного узла/связи клавишей **Delete**;
- для \`sequenceDiagram\` перетаскивается порядок участников (колонок).

Для \`flowchart\` также доступно создание связи перетаскиванием из порта узла.
`,
  },
  {
    title: 'Layout-хинты',
    markdown: `
Layout-хинты фиксируют ручную компоновку и стили рёбер. Они сохраняются в комментариях \`%%\` рядом с кодом диаграммы.

Формат многострочный:

\`\`\`text
%% {
%%   "layout": {
%%     "A": {"x": 240, "y": 140, "width": 110, "height": 46},
%%     "B": {"x": 420, "y": 140, "width": 110, "height": 46}
%%   },
%%   "edgeStyles": {
%%     "0": {"stroke": "#4b5563", "stroke-width": "2px"}
%%   }
%% }
\`\`\`

Парсер поддерживает многострочные JSON-хинты.
`,
  },
  {
    title: 'Версионирование',
    markdown: `
- сохраняй новую версию из редактора;
- просматривай список версий проекта;
- переключай превью на конкретную версию;
- восстанавливай нужную ревизию, если пошел не туда.
`,
  },
  {
    title: 'Экспорт',
    markdown: `
Доступны действия:

- экспорт диаграммы в **SVG**;
- экспорт диаграммы в **PNG**;
- сохранение исходного кода диаграммы в файл.
`,
  },
  {
    title: 'Управление проектами',
    markdown: `
В разделе **Мои проекты** можно:

- создать новую диаграмму;
- переименовать проект;
- удалить проект;
- открыть проект в редактор;
- просматривать версии и их превью прямо в карточке.
`,
  },
  {
    title: 'Быстрый старт',
    markdown: `
1. Создай новый проект в личном кабинете или в редакторе.
2. Введи код диаграммы, начиная с ключевого слова типа (\`flowchart\`, \`classDiagram\`, \`sequenceDiagram\`, \`erDiagram\`).
3. Введи Mermaid-код в левой панели.
4. При необходимости подправь расположение узлов мышкой.
5. Сохрани версию и экспортируй результат в SVG/PNG.

Официальная документация Mermaid: [https://mermaid.js.org](https://mermaid.js.org)
`,
  },
];

const iconByTitle: Record<string, React.ReactNode> = {
  'Введение': <BookOpen size={18} />,
  'Поддерживаемые типы диаграмм': <Box size={18} />,
  'Синтаксис Mermaid': <Code2 size={18} />,
  'Layout-хинты': <LayoutGrid size={18} />,
  'Версионирование': <GitBranch size={18} />,
  'Экспорт': <Download size={18} />,
  'Управление проектами': <FolderKanban size={18} />,
  'Быстрый старт': <Rocket size={18} />,
};

export const Documentation: React.FC = () => {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Документация</h1>
      <p className={styles.lead}>
        Краткое и практичное руководство по работе с Hybrid Diagram Editor.
      </p>

      <div className={styles.scrollArea}>
        {sections.map((section) => (
          <section key={section.title} className={styles.sectionCard}>
            <h2 className={styles.h2}>
              {iconByTitle[section.title] ?? null}
              {section.title}
            </h2>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h3: ({ children }) => <h3 className={styles.h3}>{children}</h3>,
                p: ({ children }) => <p className={styles.p}>{children}</p>,
                ul: ({ children }) => <ul className={styles.ul}>{children}</ul>,
                li: ({ children }) => <li className={styles.li}>{children}</li>,
                code: ({ children, className }) =>
                  className ? (
                    <code className={styles.codeBlock}>{children}</code>
                  ) : (
                    <code className={styles.codeInline}>{children}</code>
                  ),
                pre: ({ children }) => <pre className={styles.pre}>{children}</pre>,
                a: ({ href, children }) => (
                  <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {section.markdown}
            </ReactMarkdown>
          </section>
        ))}
      </div>
    </div>
  );
};
