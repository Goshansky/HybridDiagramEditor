import type {
  DiagramAst,
  EdgeStatementAst,
  LayoutHintAst,
  LayoutHintData,
  NodeShape,
  NodeStatementAst,
  StatementAst,
  StyleStatementAst,
  SubgraphBlockAst,
} from './ast';

export interface DiagramNodeModel {
  id: string;
  label: string;
  shape: NodeShape;
  styles: Record<string, string>;
  x?: number;
  y?: number;
  /** Override размера узла на холсте (из layout-хинта или UI). */
  width?: number;
  height?: number;
}

export type EdgeType = 'arrow' | 'line';

export interface DiagramEdgePoint {
  x: number;
  y: number;
}

export interface DiagramEdgeModel {
  from: string;
  to: string;
  label?: string;
  type: EdgeType;
  styles: Record<string, string>;
  /** Ортогональный маршрут из dagre (если есть); при ручном layout из подсказки не задаётся. */
  points?: DiagramEdgePoint[];
}

/** Подграф для рамки на холсте (узлы — транзитивно из тела и вложенных subgraph). */
export interface DiagramSubgraphModel {
  id: string;
  title?: string;
  nodeIds: string[];
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
  subgraphs?: DiagramSubgraphModel[];
}

function collectNodeIdsFromBody(body: StatementAst[]): string[] {
  const ids = new Set<string>();
  const walk = (stmts: StatementAst[]): void => {
    for (const s of stmts) {
      if (s.type === 'NodeStatement') {
        ids.add(s.node.id);
      } else if (s.type === 'EdgeStatement') {
        ids.add(s.from.id);
        ids.add(s.to.id);
      } else if (s.type === 'SubgraphBlock') {
        walk(s.body);
      }
    }
  };
  walk(body);
  return [...ids];
}

export function buildDiagramModel(ast: DiagramAst): DiagramModel {
  const nodes = new Map<string, DiagramNodeModel>();
  const edges: DiagramEdgeModel[] = [];
  const subgraphById = new Map<string, DiagramSubgraphModel>();

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

  const subgraphIds = new Set(ast.subgraphGroupIds ?? []);

  const ensureSubgraphModel = (id: string): DiagramSubgraphModel => {
    let sg = subgraphById.get(id);
    if (!sg) {
      sg = { id, nodeIds: [], styles: {} };
      subgraphById.set(id, sg);
    }
    return sg;
  };

  const applyStyle = (stmt: StyleStatementAst): void => {
    if (subgraphIds.has(stmt.nodeId)) {
      const sg = ensureSubgraphModel(stmt.nodeId);
      const styleProps = parseStyleString(stmt.rawStyle);
      Object.assign(sg.styles, styleProps);
      return;
    }
    const node = ensureNode(stmt.nodeId);
    const styleProps = parseStyleString(stmt.rawStyle);
    Object.assign(node.styles, styleProps);
  };

  const applyLayout = (hint: LayoutHintAst): void => {
    if (!hint.layout) return;
    for (const [nodeId, data] of Object.entries(hint.layout as Record<string, LayoutHintData>)) {
      const node = ensureNode(nodeId);
      if (typeof data.width === 'number') node.width = data.width;
      if (typeof data.height === 'number') node.height = data.height;
      const { x, y } = data;
      if (typeof x === 'number' && typeof y === 'number') {
        node.x = x;
        node.y = y;
        layout[nodeId] = { x, y };
      } else if (typeof data.width !== 'number' && typeof data.height !== 'number') {
        // eslint-disable-next-line no-console
        console.warn(
          `Layout hint for node "${nodeId}" пропущен: нет координат x/y и нет width/height`,
        );
      }
    }
  };

  const pendingEdgeStyles = new Map<number, Record<string, string>>();

  const normalizeEdgeStyleHint = (obj: Record<string, unknown>): Record<string, string> => {
    const out: Record<string, string> = {};
    if (typeof obj.stroke === 'string') out.stroke = obj.stroke;
    if (typeof obj['stroke-width'] === 'string') out['stroke-width'] = obj['stroke-width'];
    if (typeof obj['stroke-width'] === 'number') out['stroke-width'] = `${obj['stroke-width']}px`;
    if (typeof obj['stroke-dasharray'] === 'string') out['stroke-dasharray'] = obj['stroke-dasharray'];
    return out;
  };

  const mergeEdgeStylesAtIndex = (idx: number, merged: Record<string, string>): void => {
    if (Object.keys(merged).length === 0) return;
    if (edges[idx]) {
      Object.assign(edges[idx].styles, merged);
      return;
    }
    const prev = pendingEdgeStyles.get(idx) ?? {};
    pendingEdgeStyles.set(idx, { ...prev, ...merged });
  };

  const applyEdgeStylesFromHint = (hint: LayoutHintAst): void => {
    if (!hint.edgeStyles) return;
    for (const [k, v] of Object.entries(hint.edgeStyles)) {
      const idx = Number(k);
      if (!Number.isFinite(idx) || idx < 0) continue;
      const merged = normalizeEdgeStyleHint(v as Record<string, unknown>);
      mergeEdgeStylesAtIndex(idx, merged);
    }
  };

  const registerSubgraphBlock = (block: SubgraphBlockAst): void => {
    if (block.id) {
      const nodeIds = collectNodeIdsFromBody(block.body);
      const sg = ensureSubgraphModel(block.id);
      sg.nodeIds = nodeIds;
      if (block.title) sg.title = block.title;
    }
    processStatements(block.body);
  };

  function processStatements(stmts: StatementAst[]): void {
    for (const stmt of stmts) {
      if (stmt.type === 'NodeStatement') {
        ensureNode(stmt.node.id, stmt.node.label, stmt.node.shape);
      } else if (stmt.type === 'EdgeStatement') {
        const e = stmt as EdgeStatementAst;
        const fromNode = ensureNode(e.from.id, e.from.label, e.from.shape);
        const toNode = ensureNode(e.to.id, e.to.label, e.to.shape);

        const edgeStyles: Record<string, string> = {};
        if (e.dotted) {
          edgeStyles['stroke-dasharray'] = '6 4';
        }
        edges.push({
          from: fromNode.id,
          to: toNode.id,
          label: e.label,
          type: e.operator,
          styles: edgeStyles,
        });
      } else if (stmt.type === 'StyleStatement') {
        applyStyle(stmt as StyleStatementAst);
      } else if (stmt.type === 'LayoutHint') {
        const h = stmt as LayoutHintAst;
        applyLayout(h);
        applyEdgeStylesFromHint(h);
      } else if (stmt.type === 'SubgraphBlock') {
        registerSubgraphBlock(stmt);
      }
    }
  }

  processStatements(ast.statements);

  for (const [idx, styles] of pendingEdgeStyles.entries()) {
    if (edges[idx]) {
      Object.assign(edges[idx].styles, styles);
    }
  }

  const subgraphs =
    subgraphById.size > 0 ? Array.from(subgraphById.values()) : undefined;

  return {
    nodes: Array.from(nodes.values()),
    edges,
    layout,
    metadata: {
      direction,
    },
    subgraphs,
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
