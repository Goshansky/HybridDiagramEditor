import { parseMermaidFlowchart } from './index';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Test failed: ${message}`);
  }
}

export function runBasicParserTests(): void {
  const validInput = `
graph TD
  A[Начало] --> B{Условие}
  B -->|Да| C[Действие 1]
  B -->|Нет| D[Действие 2]
  %% { "layout": { "A": { "x": 100, "y": 50 }, "B": { "x": 250, "y": 150 } } }
`.trim();

  const model = parseMermaidFlowchart(validInput);

  assert(model.nodes.length === 4, 'Expected 4 nodes');
  assert(model.edges.length === 3, 'Expected 3 edges');

  const nodeA = model.nodes.find((n) => n.id === 'A');
  const nodeB = model.nodes.find((n) => n.id === 'B');

  assert(nodeA?.x === 100 && nodeA?.y === 50, 'Layout for A not applied');
  assert(nodeB?.x === 250 && nodeB?.y === 150, 'Layout for B not applied');

  // синтаксическая ошибка: отсутствие узла после стрелки
  const invalidInput = `
graph TD
  A -->
`.trim();

  try {
    parseMermaidFlowchart(invalidInput);
    throw new Error('Expected parse error for invalid input');
  } catch (e) {
    // ok, базовая обработка ошибок
  }

  // некорректный layout-хинт
  const badLayout = `
graph LR
  A-->B
  %% { "layout": { "A": { "x": "oops", "y": 20 } } }
`.trim();

  const modelBad = parseMermaidFlowchart(badLayout);
  const nodeABad = modelBad.nodes.find((n) => n.id === 'A');
  assert(
    typeof nodeABad?.x === 'undefined' && typeof nodeABad?.y === 'undefined',
    'Bad layout hint should be ignored',
  );

  // пустой ввод / только комментарии
  const onlyComments = `
%% это комментарий
%% еще один
`.trim();

  const emptyModel = parseMermaidFlowchart(onlyComments);
  assert(emptyModel.nodes.length === 0, 'Expected 0 nodes for comments only');
  assert(emptyModel.edges.length === 0, 'Expected 0 edges for comments only');
}

