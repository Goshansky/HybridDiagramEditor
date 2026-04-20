import type {
  ClassDefStatementAst,
  ClassStatementAst,
  DiagramAst,
  EdgeStatementAst,
  LayoutHintAst,
  LayoutHintData,
  LinkStyleStatementAst,
  NodeShape,
  NodeStatementAst,
  StatementAst,
  StyleStatementAst,
  SubgraphBlockAst,
} from './ast';

/** Узел блок-схемы или «коробка класса» для classDiagram. */
export type DiagramNodeShape = NodeShape | 'class_box';

export type ClassVisibility = '+' | '-' | '#' | '~';

export interface ClassFieldModel {
  name: string;
  type: string;
  visibility: ClassVisibility;
  isStatic?: boolean;
}

export interface ClassMethodModel {
  name: string;
  params: { name: string; type: string }[];
  returnType: string;
  visibility: ClassVisibility;
  isAbstract?: boolean;
  isStatic?: boolean;
}

/** Данные UML-блока (поля/методы) для classDiagram. */
export interface ClassBoxModel {
  id: string;
  name: string;
  stereotype?: string;
  fields: ClassFieldModel[];
  methods: ClassMethodModel[];
}

export type ClassRelationKind =
  | 'inheritance'
  | 'implementation'
  | 'composition'
  | 'aggregation'
  | 'association'
  | 'bidirectional'
  | 'dependency';

export interface ClassNoteModel {
  text: string;
  targetClassId?: string;
  placement?: 'left' | 'right' | 'float';
}

export interface DiagramNodeModel {
  id: string;
  label: string;
  shape: DiagramNodeShape;
  styles: Record<string, string>;
  x?: number;
  y?: number;
  /** Override размера узла на холсте (из layout-хинта или UI). */
  width?: number;
  height?: number;
  /** Для `shape === 'class_box'`: содержимое класса. */
  classBox?: ClassBoxModel;
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
  /** classDiagram: тип связи UML. */
  classRelation?: ClassRelationKind;
  fromMultiplicity?: string;
  toMultiplicity?: string;
}

/** Подграф для рамки на холсте (узлы — транзитивно из тела и вложенных subgraph). */
export interface DiagramSubgraphModel {
  id: string;
  title?: string;
  nodeIds: string[];
  styles: Record<string, string>;
  /** Родительский подграф (вложенность). */
  parentId?: string;
  /** `direction …` внутри блока (для будущего rankdir по кластерам). */
  direction?: 'TD' | 'LR' | 'BT' | 'RL';
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
  /** Первый подграф, в котором встретился узел (для dagre compound). */
  nodeSubgraphById?: Record<string, string>;
  /** Родитель подграфа: id → id родителя или null. */
  subgraphParentById?: Record<string, string | null>;
  /** Заметки classDiagram. */
  classNotes?: ClassNoteModel[];
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
  const nodeFirstSubgraph = new Map<string, string | null>();
  const subgraphParentById = new Map<string, string | null>();
  const classDefsByName = new Map<string, Record<string, string>>();

  let direction: 'TD' | 'LR' | 'BT' | 'RL' = ast.graph?.direction ?? 'TD';
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

  const assignNodeSubgraphOnce = (nodeId: string, sgId: string | null): void => {
    if (!nodeFirstSubgraph.has(nodeId)) {
      nodeFirstSubgraph.set(nodeId, sgId);
    }
  };

  const applyClassDefNameToNode = (nodeId: string, className: string): void => {
    const styles = classDefsByName.get(className);
    if (!styles) return;
    const node = ensureNode(nodeId);
    Object.assign(node.styles, styles);
  };

  /** `:::class` применяется после полного прохода, чтобы classDef мог быть ниже по тексту. */
  const pendingClassByNode = new Map<string, string>();

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

  const registerSubgraphBlock = (block: SubgraphBlockAst, parentSubgraphId: string | null): void => {
    if (block.id) {
      subgraphParentById.set(block.id, parentSubgraphId);
      const nodeIds = collectNodeIdsFromBody(block.body);
      const sg = ensureSubgraphModel(block.id);
      sg.nodeIds = nodeIds;
      if (block.title) sg.title = block.title;
      if (block.direction) sg.direction = block.direction;
      processStatements(block.body, block.id);
    } else {
      processStatements(block.body, parentSubgraphId);
    }
  };

  function processStatements(stmts: StatementAst[], currentSubgraphId: string | null): void {
    for (const stmt of stmts) {
      if (stmt.type === 'NodeStatement') {
        const n = stmt as NodeStatementAst;
        assignNodeSubgraphOnce(n.node.id, currentSubgraphId);
        ensureNode(n.node.id, n.node.label, n.node.shape);
        if (n.node.className) {
          pendingClassByNode.set(n.node.id, n.node.className);
        }
      } else if (stmt.type === 'EdgeStatement') {
        const e = stmt as EdgeStatementAst;
        assignNodeSubgraphOnce(e.from.id, currentSubgraphId);
        assignNodeSubgraphOnce(e.to.id, currentSubgraphId);
        const fromNode = ensureNode(e.from.id, e.from.label, e.from.shape);
        const toNode = ensureNode(e.to.id, e.to.label, e.to.shape);
        if (e.from.className) pendingClassByNode.set(e.from.id, e.from.className);
        if (e.to.className) pendingClassByNode.set(e.to.id, e.to.className);

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
        registerSubgraphBlock(stmt, currentSubgraphId);
      } else if (stmt.type === 'ClassDefStatement') {
        const h = stmt as ClassDefStatementAst;
        classDefsByName.set(h.name, parseStyleString(h.rawStyle));
      } else if (stmt.type === 'ClassStatement') {
        const h = stmt as ClassStatementAst;
        const styles = classDefsByName.get(h.className);
        if (styles) {
          for (const nid of h.nodeIds) {
            Object.assign(ensureNode(nid).styles, styles);
          }
        }
      } else if (stmt.type === 'LinkStyleStatement') {
        const h = stmt as LinkStyleStatementAst;
        const merged = parseStyleString(h.rawStyle);
        if (Object.keys(merged).length === 0) continue;
        if (h.target === 'default') {
          for (let i = 0; i < edges.length; i += 1) {
            Object.assign(edges[i].styles, merged);
          }
        } else {
          mergeEdgeStylesAtIndex(h.target, merged);
        }
      } else if (stmt.type === 'DirectionStatement') {
        direction = stmt.direction;
      }
    }
  }

  processStatements(ast.statements, null);

  for (const [nid, cn] of pendingClassByNode.entries()) {
    applyClassDefNameToNode(nid, cn);
  }

  for (const [idx, styles] of pendingEdgeStyles.entries()) {
    if (edges[idx]) {
      Object.assign(edges[idx].styles, styles);
    }
  }

  for (const sg of subgraphById.values()) {
    const p = subgraphParentById.get(sg.id);
    if (p !== undefined) sg.parentId = p ?? undefined;
  }

  const subgraphs =
    subgraphById.size > 0 ? Array.from(subgraphById.values()) : undefined;

  const nodeSubgraphById: Record<string, string> = {};
  for (const [nid, sg] of nodeFirstSubgraph.entries()) {
    if (sg) nodeSubgraphById[nid] = sg;
  }

  const subgraphParentRecord: Record<string, string | null> = {};
  for (const [id, p] of subgraphParentById.entries()) {
    subgraphParentRecord[id] = p;
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    layout,
    metadata: {
      direction,
    },
    subgraphs,
    nodeSubgraphById:
      Object.keys(nodeSubgraphById).length > 0 ? nodeSubgraphById : undefined,
    subgraphParentById:
      Object.keys(subgraphParentRecord).length > 0 ? subgraphParentRecord : undefined,
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
