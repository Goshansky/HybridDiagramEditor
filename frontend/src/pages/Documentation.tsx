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
- \`class\` — диаграммы классов и связей;
- \`sequence\` — сценарии взаимодействий между участниками;
- \`er\` — ER-диаграммы для сущностей и отношений БД.
`,
  },
  {
    title: 'Синтаксис Mermaid',
    markdown: `
### Базовый пример
\`\`\`mermaid
graph TD
  A[Начало] --> B{Условие}
  B -->|Да| C[Действие 1]
  B -->|Нет| D[Действие 2]
\`\`\`

### Стили и subgraph
\`\`\`mermaid
flowchart TD
  subgraph Frontend [Frontend]
    UI[UI модуль]
    Parser[Parser]
  end

  UI -.->|Событие| Parser
  style Frontend fill:#eef6ff,stroke:#3b82f6,stroke-dasharray: 5 5
\`\`\`
`,
  },
  {
    title: 'Layout-хинты',
    markdown: `
Layout-хинты нужны, чтобы **зафиксировать ручную компоновку** узлов.

Они хранятся в комментарии формата:

\`\`\`text
%% { "layout": { "A": { "x": 100, "y": 50 }, "B": { "x": 250, "y": 150 } } }
\`\`\`

Когда двигаешь узлы вручную, редактор обновляет эту структуру автоматически.
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
2. Выбери тип диаграммы (\`flowchart/class/sequence/er\`).
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
