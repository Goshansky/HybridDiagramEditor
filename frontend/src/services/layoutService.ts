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

  if (!useAutoLayout) {
    for (const e of model.edges) {
      delete e.points;
    }
    return model;
  }

  if (model.nodes.length === 0) {
    return model;
  }

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
