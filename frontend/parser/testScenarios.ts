import { parseMermaidFlowchart } from './index';
import { upsertLayoutHint } from './layoutHintSync';

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
  assert(model.metadata.direction === 'TD', 'Expected graph direction TD');

  const nodeA = model.nodes.find((n) => n.id === 'A');
  const nodeB = model.nodes.find((n) => n.id === 'B');

  assert(nodeA?.x === 100 && nodeA?.y === 50, 'Layout for A not applied');
  assert(nodeB?.x === 250 && nodeB?.y === 150, 'Layout for B not applied');
  assert(model.layout.A?.x === 100 && model.layout.A?.y === 50, 'Layout map for A not applied');

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

  // направление RL + круглый узел ((...))
  const rlCircleInput = `
graph RL
  A((Start)) --> B{Check}
`.trim();
  const rlModel = parseMermaidFlowchart(rlCircleInput);
  assert(rlModel.metadata.direction === 'RL', 'Expected graph direction RL');
  const circleNode = rlModel.nodes.find((n) => n.id === 'A');
  assert(circleNode?.shape === 'circle', 'Expected circle shape for ((...))');

  // пустой ввод / только комментарии
  const onlyComments = `
%% это комментарий
%% еще один
`.trim();

  const emptyModel = parseMermaidFlowchart(onlyComments);
  assert(emptyModel.nodes.length === 0, 'Expected 0 nodes for comments only');
  assert(emptyModel.edges.length === 0, 'Expected 0 edges for comments only');

  const sourceWithoutHint = `
graph TD
A --> B
`.trim();
  const withNewHint = upsertLayoutHint(sourceWithoutHint, 'A', 101.6, 49.1);
  assert(
    withNewHint.includes('%% {"layout":{"A":{"x":102,"y":49}}}'),
    'Expected new layout hint line',
  );

  const sourceWithHint = `
graph TD
A --> B
%% {"layout":{"A":{"x":1,"y":2}}}
`.trim();
  const updatedHint = upsertLayoutHint(sourceWithHint, 'B', 20, 30);
  assert(
    updatedHint.includes('%% {"layout":{"A":{"x":1,"y":2},"B":{"x":20,"y":30}}}'),
    'Expected existing layout hint to be updated',
  );

  // flowchart TD (алиас graph) + subgraph … end + пунктир
  const subgraphFlow = `
flowchart TD
  subgraph F [Frontend]
    A["Строка 1\\nСтрока 2"]
  end
  A --> B[B]
  A -.->|x| B
  style F fill:#eee
  style A fill:#f9f
`.trim();
  const sgModel = parseMermaidFlowchart(subgraphFlow);
  assert(sgModel.nodes.every((n) => n.id !== 'F'), 'subgraph id F не должен стать узлом');
  const sgF = sgModel.subgraphs?.find((s) => s.id === 'F');
  assert(!!sgF && sgF.title === 'Frontend' && sgF.nodeIds.includes('A'), 'модель subgraph F');
  assert(sgF?.styles.fill === '#eee', 'style fill на subgraph F');
  assert(sgModel.nodes.some((n) => n.id === 'A'), 'узел A из subgraph');
  assert(sgModel.nodes.some((n) => n.id === 'B'), 'узел B');
  assert(sgModel.edges.length === 2, 'два ребра A-->B и A-.->B');
  const dashEdge = sgModel.edges.find((e) => e.label === 'x');
  assert(dashEdge?.styles['stroke-dasharray'] === '6 4', 'пунктирное ребро');
  const nodeASg = sgModel.nodes.find((n) => n.id === 'A');
  assert(nodeASg?.styles.fill === '#f9f', 'style на узел A применён');

  const advanced = `
flowchart TD
  classDef se fill:#e0f7fa,stroke:#006064,color:#004d40
  subgraph G1 [Группа]
    direction LR
    X[/slash/] --> Y[\\back\\]
    Z((Z)) --> W>flag]
  end
  X:::se
  linkStyle 0 stroke:#f00,stroke-width:2px
  linkStyle default stroke-dasharray:4 3
`.trim();
  const adv = parseMermaidFlowchart(advanced);
  assert(adv.subgraphs?.some((s) => s.id === 'G1'), 'subgraph G1');
  assert(adv.subgraphs?.find((s) => s.id === 'G1')?.direction === 'LR', 'direction LR в subgraph');
  const xNode = adv.nodes.find((n) => n.id === 'X');
  assert(xNode?.shape === 'trapezoid_slash', 'форма [/…/]');
  assert(xNode?.styles.fill === '#e0f7fa', 'classDef через :::');
  assert(adv.edges[0]?.styles.stroke === '#f00', 'linkStyle 0');
  assert(adv.edges.every((e) => e.styles['stroke-dasharray'] === '4 3'), 'linkStyle default');

  const dirTb = `
flowchart TD
  subgraph S1 [x]
    direction Tb
    A --> B
  end
`.trim();
  const mTb = parseMermaidFlowchart(dirTb);
  assert(mTb.subgraphs?.find((s) => s.id === 'S1')?.direction === 'TD', 'direction TB → TD');
}

