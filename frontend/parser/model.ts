import type {
  DiagramAst,
  EdgeStatementAst,
  LayoutHintAst,
  LayoutHintData,
  NodeShape,
  NodeStatementAst,
  StyleStatementAst,
} from './ast';

export interface DiagramNodeModel {
  id: string;
  label: string;
  shape: NodeShape;
  styles: Record<string, string>;
  x?: number;
  y?: number;
}

export type EdgeType = 'arrow' | 'line';

export interface DiagramEdgeModel {
  from: string;
  to: string;
  label?: string;
  type: EdgeType;
  styles: Record<string, string>;
}

export interface DiagramMetadata {
  direction: 'TD' | 'LR' | 'BT' | 'RL';
  scale?: number;
  diagramType?: 'flowchart' | 'class' | 'sequence' | 'er';
}

export interface DiagramModel {
  nodes: DiagramNodeModel[];
  edges: DiagramEdgeModel[];
  layout: Record<string, { x: number; y: number }>;
  metadata: DiagramMetadata;
}

export function buildDiagramModel(ast: DiagramAst): DiagramModel {
  const nodes = new Map<string, DiagramNodeModel>();
  const edges: DiagramEdgeModel[] = [];

  const direction: 'TD' | 'LR' | 'BT' | 'RL' = ast.graph?.direction ?? 'TD';
  const layout: Record<string, { x: number; y: number }> = {};

  const ensureNode = (
    id: string,
    label?: string,
    shape?: NodeShape,
  ): DiagramNodeModel => {
    let node = nodes.get(id);
    if (!node) {
      node = {
        id,
        label: label ?? id,
        shape: shape ?? 'rect',
        styles: {},
      };
      nodes.set(id, node);
    } else {
      if (label && !node.label) {
        node.label = label;
      }
      if (shape && !node.shape) {
        node.shape = shape;
      }
    }
    return node;
  };

  const applyStyle = (stmt: StyleStatementAst): void => {
    const node = ensureNode(stmt.nodeId);
    const styleProps = parseStyleString(stmt.rawStyle);
    Object.assign(node.styles, styleProps);
  };

  const applyLayout = (hint: LayoutHintAst): void => {
    if (!hint.layout) return;
    for (const [nodeId, data] of Object.entries(hint.layout as Record<string, LayoutHintData>)) {
      const { x, y } = data;
      if (typeof x === 'number' && typeof y === 'number') {
        const node = ensureNode(nodeId);
        node.x = x;
        node.y = y;
        layout[nodeId] = { x, y };
      } else {
        // некорректные координаты – игнорируем
        // eslint-disable-next-line no-console
        console.warn(
          `Layout hint for node "${nodeId}" пропущен: отсутствуют корректные x/y`,
        );
      }
    }
  };

  for (const stmt of ast.statements) {
    if (stmt.type === 'NodeStatement') {
      ensureNode(stmt.node.id, stmt.node.label, stmt.node.shape);
    } else if (stmt.type === 'EdgeStatement') {
      const e = stmt as EdgeStatementAst;
      const fromNode = ensureNode(e.from.id, e.from.label, e.from.shape);
      const toNode = ensureNode(e.to.id, e.to.label, e.to.shape);

      const edge: DiagramEdgeModel = {
        from: fromNode.id,
        to: toNode.id,
        label: e.label,
        type: e.operator,
        styles: {},
      };
      edges.push(edge);
    } else if (stmt.type === 'StyleStatement') {
      applyStyle(stmt as StyleStatementAst);
    } else if (stmt.type === 'LayoutHint') {
      applyLayout(stmt as LayoutHintAst);
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    layout,
    metadata: {
      direction,
    },
  };
}

function parseStyleString(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const trimmed = raw.trim().replace(/;+$/, '');
  if (!trimmed) return result;

  for (const part of trimmed.split(',')) {
    const [key, value] = part.split(':');
    if (!key || !value) continue;
    const k = key.trim();
    const v = value.trim();
    if (!k) continue;
    result[k] = v;
  }

  return result;
}

