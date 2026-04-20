import { graphlib } from 'dagre-d3-es';
// eslint-disable-next-line import/no-internal-modules -- dagre не реэкспортируется из корня пакета
import { layout as dagreLayout } from 'dagre-d3-es/src/dagre/layout.js';
import type { DiagramModel } from '../../parser/model';

const DEFAULT_NODE_W = 110;
const DEFAULT_NODE_H = 46;

function rankdirFromDirection(
  dir: DiagramModel['metadata']['direction'],
): 'TB' | 'BT' | 'LR' | 'RL' {
  switch (dir) {
    case 'LR':
      return 'LR';
    case 'RL':
      return 'RL';
    case 'BT':
      return 'BT';
    default:
      return 'TB';
  }
}

function clusterNodeId(subgraphId: string): string {
  return `__cluster__${subgraphId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

/**
 * Иерархическая раскладка dagre для flowchart.
 * `useAutoLayout === false` — позиции и рёбра берутся из распарсенной модели (хинты в коде), без dagre.
 */
export function applyDagreLayout(
  model: DiagramModel,
  useAutoLayout = true,
): DiagramModel {
  if (model.metadata.diagramType !== 'flowchart') {
    return model;
  }

  /** Ручной режим: не трогаем позиции узлов, `points` и стили рёбер (остаются от последнего dagre). */
  if (!useAutoLayout) {
    return model;
  }

  if (model.nodes.length === 0) {
    return model;
  }

  const canCompound =
    Array.isArray(model.subgraphs) &&
    model.subgraphs.length > 0 &&
    model.nodeSubgraphById &&
    Object.keys(model.nodeSubgraphById).length > 0 &&
    model.subgraphParentById;

  if (canCompound) {
    try {
      return applyCompoundDagreLayout(model);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('dagre compound layout не удался, используется плоская раскладка', e);
    }
  }

  return applyFlatDagreLayout(model);
}

function applyFlatDagreLayout(model: DiagramModel): DiagramModel {
  /** Координаты из %% layout (до dagre) — накладываются поверх рассчёта dagre. */
  const hintOverlay: Record<string, { x: number; y: number }> = {};
  for (const [id, pt] of Object.entries(model.layout)) {
    if (typeof pt.x === 'number' && typeof pt.y === 'number') {
      hintOverlay[id] = { x: pt.x, y: pt.y };
    }
  }

  const g = new graphlib.Graph({ directed: true, multigraph: true });

  g.setGraph({
    rankdir: rankdirFromDirection(model.metadata.direction),
    ranksep: 55,
    nodesep: 45,
    edgesep: 12,
    marginx: 40,
    marginy: 40,
  });

  for (const n of model.nodes) {
    const w =
      typeof n.width === 'number' && n.width > 0 ? n.width : DEFAULT_NODE_W;
    const h =
      typeof n.height === 'number' && n.height > 0 ? n.height : DEFAULT_NODE_H;
    g.setNode(n.id, { width: w, height: h, label: n.label });
  }

  model.edges.forEach((e, i) => {
    g.setEdge(e.from, e.to, { edgeIndex: i }, `e${i}`);
  });

  dagreLayout(g);

  const nextLayout: Record<string, { x: number; y: number }> = {};

  for (const n of model.nodes) {
    const gn = g.node(n.id) as { x?: number; y?: number } | undefined;
    if (
      gn &&
      typeof gn.x === 'number' &&
      typeof gn.y === 'number' &&
      Number.isFinite(gn.x) &&
      Number.isFinite(gn.y)
    ) {
      n.x = gn.x;
      n.y = gn.y;
      nextLayout[n.id] = { x: gn.x, y: gn.y };
    }
  }
  model.layout = nextLayout;

  const hasHintOverlay = Object.keys(hintOverlay).length > 0;
  if (hasHintOverlay) {
    for (const [nodeId, pt] of Object.entries(hintOverlay)) {
      const node = model.nodes.find((nn) => nn.id === nodeId);
      if (node) {
        node.x = pt.x;
        node.y = pt.y;
      }
      model.layout[nodeId] = { x: pt.x, y: pt.y };
    }
  }

  if (hasHintOverlay) {
    for (const e of model.edges) {
      delete e.points;
    }
  } else {
    model.edges.forEach((e, i) => {
      const eg = g.edge({ v: e.from, w: e.to, name: `e${i}` }) as
        | { points?: { x: number; y: number }[] }
        | undefined;
      if (eg?.points && eg.points.length > 0) {
        e.points = eg.points.map((p) => ({ x: p.x, y: p.y }));
      } else {
        delete e.points;
      }
    });
  }

  return model;
}

/**
 * Dagre для erDiagram: узлы разного размера (атрибуты сущностей).
 */
export function applyErDiagramLayout(
  model: DiagramModel,
  useAutoLayout = true,
): DiagramModel {
  if (model.metadata.diagramType !== 'er') {
    return model;
  }
  if (!useAutoLayout) {
    return model;
  }
  if (model.nodes.length === 0) {
    return model;
  }

  const hintOverlay: Record<string, { x: number; y: number }> = {};
  for (const [id, pt] of Object.entries(model.layout)) {
    if (typeof pt.x === 'number' && typeof pt.y === 'number') {
      hintOverlay[id] = { x: pt.x, y: pt.y };
    }
  }

  const g = new graphlib.Graph({ directed: true, multigraph: true });
  g.setGraph({
    rankdir: rankdirFromDirection(model.metadata.direction ?? 'LR'),
    ranksep: 80,
    nodesep: 56,
    edgesep: 16,
    marginx: 48,
    marginy: 48,
  });

  for (const n of model.nodes) {
    const w =
      typeof n.width === 'number' && n.width > 0 ? n.width : DEFAULT_NODE_W;
    const h =
      typeof n.height === 'number' && n.height > 0 ? n.height : DEFAULT_NODE_H;
    g.setNode(n.id, { width: w, height: h, label: n.label });
  }

  model.edges.forEach((e, i) => {
    g.setEdge(e.from, e.to, {}, `e${i}`);
  });

  dagreLayout(g);

  const nextLayout: Record<string, { x: number; y: number }> = {};
  for (const n of model.nodes) {
    const gn = g.node(n.id) as { x?: number; y?: number } | undefined;
    if (
      gn &&
      typeof gn.x === 'number' &&
      typeof gn.y === 'number' &&
      Number.isFinite(gn.x) &&
      Number.isFinite(gn.y)
    ) {
      n.x = gn.x;
      n.y = gn.y;
      nextLayout[n.id] = { x: gn.x, y: gn.y };
    }
  }
  model.layout = nextLayout;

  const hasHintOverlay = Object.keys(hintOverlay).length > 0;
  if (hasHintOverlay) {
    for (const [nodeId, pt] of Object.entries(hintOverlay)) {
      const node = model.nodes.find((nn) => nn.id === nodeId);
      if (node) {
        node.x = pt.x;
        node.y = pt.y;
      }
      model.layout[nodeId] = { x: pt.x, y: pt.y };
    }
  }

  if (hasHintOverlay) {
    for (const e of model.edges) {
      delete e.points;
    }
  } else {
    model.edges.forEach((e, i) => {
      const eg = g.edge({ v: e.from, w: e.to, name: `e${i}` }) as
        | { points?: { x: number; y: number }[] }
        | undefined;
      if (eg?.points && eg.points.length > 0) {
        e.points = eg.points.map((p) => ({ x: p.x, y: p.y }));
      } else {
        delete e.points;
      }
    });
  }

  return model;
}

function applyCompoundDagreLayout(model: DiagramModel): DiagramModel {
  const hintOverlay: Record<string, { x: number; y: number }> = {};
  for (const [id, pt] of Object.entries(model.layout)) {
    if (typeof pt.x === 'number' && typeof pt.y === 'number') {
      hintOverlay[id] = { x: pt.x, y: pt.y };
    }
  }

  const subs = model.subgraphs!;
  const parentMap = model.subgraphParentById!;
  const nodeSg = model.nodeSubgraphById!;

  const g = new graphlib.Graph({
    directed: true,
    multigraph: true,
    compound: true,
  });

  g.setGraph({
    rankdir: rankdirFromDirection(model.metadata.direction),
    ranksep: 55,
    nodesep: 45,
    edgesep: 12,
    marginx: 40,
    marginy: 40,
  });

  for (const sg of subs) {
    g.setNode(clusterNodeId(sg.id), {
      clusterLabelPos: 'top',
      label: sg.title ?? sg.id,
    });
  }

  for (const sg of subs) {
    const p = parentMap[sg.id];
    if (p) {
      g.setParent(clusterNodeId(sg.id), clusterNodeId(p));
    }
  }

  for (const n of model.nodes) {
    const w =
      typeof n.width === 'number' && n.width > 0 ? n.width : DEFAULT_NODE_W;
    const h =
      typeof n.height === 'number' && n.height > 0 ? n.height : DEFAULT_NODE_H;
    g.setNode(n.id, { width: w, height: h, label: n.label });
    const sgId = nodeSg[n.id];
    if (sgId) {
      g.setParent(n.id, clusterNodeId(sgId));
    }
  }

  model.edges.forEach((e, i) => {
    g.setEdge(e.from, e.to, { edgeIndex: i }, `e${i}`);
  });

  dagreLayout(g);

  const nextLayout: Record<string, { x: number; y: number }> = {};

  for (const n of model.nodes) {
    const gn = g.node(n.id) as { x?: number; y?: number } | undefined;
    if (
      gn &&
      typeof gn.x === 'number' &&
      typeof gn.y === 'number' &&
      Number.isFinite(gn.x) &&
      Number.isFinite(gn.y)
    ) {
      n.x = gn.x;
      n.y = gn.y;
      nextLayout[n.id] = { x: gn.x, y: gn.y };
    }
  }
  model.layout = nextLayout;

  const hasHintOverlay = Object.keys(hintOverlay).length > 0;
  if (hasHintOverlay) {
    for (const [nodeId, pt] of Object.entries(hintOverlay)) {
      const node = model.nodes.find((nn) => nn.id === nodeId);
      if (node) {
        node.x = pt.x;
        node.y = pt.y;
      }
      model.layout[nodeId] = { x: pt.x, y: pt.y };
    }
  }

  if (hasHintOverlay) {
    for (const e of model.edges) {
      delete e.points;
    }
  } else {
    model.edges.forEach((e, i) => {
      const eg = g.edge({ v: e.from, w: e.to, name: `e${i}` }) as
        | { points?: { x: number; y: number }[] }
        | undefined;
      if (eg?.points && eg.points.length > 0) {
        e.points = eg.points.map((p) => ({ x: p.x, y: p.y }));
      } else {
        delete e.points;
      }
    });
  }

  return model;
}

/**
 * Dagre для classDiagram: узлы с разной шириной/высотой (поля/методы).
 */
export function applyClassDiagramLayout(
  model: DiagramModel,
  useAutoLayout = true,
): DiagramModel {
  if (model.metadata.diagramType !== 'class') {
    return model;
  }
  if (!useAutoLayout) {
    return model;
  }
  if (model.nodes.length === 0) {
    return model;
  }

  const hintOverlay: Record<string, { x: number; y: number }> = {};
  for (const [id, pt] of Object.entries(model.layout)) {
    if (typeof pt.x === 'number' && typeof pt.y === 'number') {
      hintOverlay[id] = { x: pt.x, y: pt.y };
    }
  }

  const g = new graphlib.Graph({ directed: true, multigraph: true });
  g.setGraph({
    rankdir: rankdirFromDirection(model.metadata.direction ?? 'TD'),
    ranksep: 70,
    nodesep: 50,
    edgesep: 20,
    marginx: 48,
    marginy: 48,
  });

  for (const n of model.nodes) {
    const w =
      typeof n.width === 'number' && n.width > 0 ? n.width : DEFAULT_NODE_W;
    const h =
      typeof n.height === 'number' && n.height > 0 ? n.height : DEFAULT_NODE_H;
    g.setNode(n.id, { width: w, height: h, label: n.label });
  }

  model.edges.forEach((e, i) => {
    g.setEdge(e.from, e.to, {}, `e${i}`);
  });

  dagreLayout(g);

  const nextLayout: Record<string, { x: number; y: number }> = {};
  for (const n of model.nodes) {
    const gn = g.node(n.id) as { x?: number; y?: number } | undefined;
    if (
      gn &&
      typeof gn.x === 'number' &&
      typeof gn.y === 'number' &&
      Number.isFinite(gn.x) &&
      Number.isFinite(gn.y)
    ) {
      n.x = gn.x;
      n.y = gn.y;
      nextLayout[n.id] = { x: gn.x, y: gn.y };
    }
  }
  model.layout = nextLayout;

  const hasHintOverlay = Object.keys(hintOverlay).length > 0;
  if (hasHintOverlay) {
    for (const [nodeId, pt] of Object.entries(hintOverlay)) {
      const node = model.nodes.find((nn) => nn.id === nodeId);
      if (node) {
        node.x = pt.x;
        node.y = pt.y;
      }
      model.layout[nodeId] = { x: pt.x, y: pt.y };
    }
  }

  if (hasHintOverlay) {
    for (const e of model.edges) {
      delete e.points;
    }
  } else {
    model.edges.forEach((e, i) => {
      const eg = g.edge({ v: e.from, w: e.to, name: `e${i}` }) as
        | { points?: { x: number; y: number }[] }
        | undefined;
      if (eg?.points && eg.points.length > 0) {
        e.points = eg.points.map((p) => ({ x: p.x, y: p.y }));
      } else {
        delete e.points;
      }
    });
  }

  return model;
}
