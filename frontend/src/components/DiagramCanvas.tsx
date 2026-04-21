import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type {
  ClassBoxModel,
  ClassRelationKind,
  DiagramModel,
  ERDiagramEntity,
} from '../../parser';
import {
  ARROW_TIP_GAP,
  computeEdgeEndpointsBetweenNodes,
  trimPolylineEndForArrow,
  type PositionedNodeLike,
} from './diagramCanvasGeometry';
import { renderSequenceDiagram } from './diagramCanvasSequence';

interface DiagramCanvasProps {
  model: DiagramModel | null;
  width?: number;
  height?: number;
  canvasId?: string;
  zoomCommand?: {
    type: 'in' | 'out' | 'reset';
    nonce: number;
  };
  selectedNodeId?: string;
  selectedEdgeIndex?: number | null;
  onSelectNode?: (id: string | null) => void;
  onSelectEdge?: (edgeIndex: number | null) => void;
  onNodePositionChange?: (
    id: string,
    x: number,
    y: number,
    size?: { width: number; height: number },
  ) => void;
  disableNodeDrag?: boolean;
  onNodeDoubleClick?: (id: string) => void;
  onEdgeDoubleClick?: (edge: { from: string; to: string; label?: string; type: 'arrow' | 'line' }) => void;
  onCreateEdge?: (from: string, to: string) => void;
  /** Перетащить конец связи на другой узел (flowchart). */
  onReconnectEdge?: (edgeIndex: number, newTo: string) => void;
  gridSnap?: boolean;
  /** sequenceDiagram: сохранить порядок колонок участников (в `%%`-хинте). */
  onSequenceParticipantReorder?: (orderedIds: string[]) => void;
}

type NodeShape =
  | 'rect'
  | 'circle'
  | 'diamond'
  | 'oval'
  | 'parallelogram'
  | 'cloud'
  | 'trapezoid_slash'
  | 'trapezoid_backslash'
  | 'flag'
  | 'class_box'
  | 'er_box';

interface PositionedNode {
  id: string;
  label: string;
  shape: NodeShape;
  styles: Record<string, string>;
  x: number;
  y: number;
  width: number;
  height: number;
  classBox?: ClassBoxModel;
  erEntity?: ERDiagramEntity;
}

interface PositionedEdge {
  edgeIndex: number;
  from: string;
  to: string;
  label?: string;
  type: 'arrow' | 'line';
  styles: Record<string, string>;
  fromShape: NodeShape;
  toShape: NodeShape;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fromW: number;
  fromH: number;
  toW: number;
  toH: number;
  /** Маршрут dagre; при live-drag не используется — только прямые границы. */
  routePoints?: { x: number; y: number }[];
  classRelation?: ClassRelationKind;
  fromMultiplicity?: string;
  toMultiplicity?: string;
  erLeftCard?: string;
  erRightCard?: string;
}

const NODE_WIDTH = 110;
const NODE_HEIGHT = 46;
const NODE_LINE_HEIGHT_PX = 16;
const NODE_MIN_WIDTH = 44;
const NODE_MIN_HEIGHT = 32;
const CLASS_MEMBER_LINE = 13;

/** Фигура узла (не порт связи). `d3.select('…circle…')` брал бы `circle.connect-port` первым. */
function selectNodeShapeElements<G extends SVGGElement>(
  nodeG: d3.Selection<G, PositionedNode, any, any>,
): d3.Selection<
  SVGRectElement | SVGPolygonElement | SVGCircleElement | SVGEllipseElement | SVGPathElement,
  PositionedNode,
  G,
  PositionedNode
> {
  return nodeG
    .selectAll<
      SVGRectElement | SVGPolygonElement | SVGCircleElement | SVGEllipseElement | SVGPathElement,
      PositionedNode
    >('rect,polygon,circle,ellipse,path')
    .filter(function (this: SVGElement, d: PositionedNode) {
      return (
      d.shape !== 'class_box' &&
      d.shape !== 'er_box' &&
      !this.classList.contains('connect-port')
    );
    });
}

function umlClassEdgePresentation(d: PositionedEdge): {
  dash: string | null;
  markerStart: string | null;
  markerEnd: string | null;
} {
  const k = d.classRelation;
  const styleDash = d.styles['stroke-dasharray'] ?? null;
  if (!k) {
    return {
      dash: styleDash,
      markerStart: null,
      markerEnd: d.type === 'arrow' ? 'url(#edge-arrowhead)' : null,
    };
  }
  switch (k) {
    case 'inheritance':
      return { dash: styleDash, markerStart: null, markerEnd: 'url(#uml-inherit)' };
    case 'implementation':
      return { dash: styleDash ?? '6 4', markerStart: null, markerEnd: 'url(#uml-inherit)' };
    case 'composition':
      return { dash: styleDash, markerStart: 'url(#uml-compose)', markerEnd: null };
    case 'aggregation':
      return { dash: styleDash, markerStart: 'url(#uml-aggregate)', markerEnd: null };
    case 'association':
      return { dash: styleDash, markerStart: null, markerEnd: 'url(#edge-arrowhead)' };
    case 'dependency':
      return { dash: styleDash ?? '6 4', markerStart: null, markerEnd: 'url(#edge-arrowhead)' };
    case 'bidirectional':
      return { dash: styleDash, markerStart: null, markerEnd: null };
    default:
      return { dash: styleDash, markerStart: null, markerEnd: 'url(#edge-arrowhead)' };
  }
}

function paintClassBoxNode(
  g: d3.Selection<SVGGElement, PositionedNode, null, undefined>,
  d: PositionedNode,
): void {
  const cb = d.classBox;
  if (!cb || d.shape !== 'class_box') return;
  g.selectAll<SVGTextElement, PositionedNode>('text').remove();
  g.selectAll<
    SVGRectElement | SVGPolygonElement | SVGEllipseElement | SVGPathElement | SVGLineElement,
    PositionedNode
  >('rect,polygon,ellipse,path,line')
    .remove();
  g.selectAll<SVGCircleElement, PositionedNode>('circle').each(function () {
    const el = this;
    if (!el.classList.contains('connect-port')) {
      d3.select(el).remove();
    }
  });
  const w = d.width;
  const h = d.height;
  const fill = d.styles.fill ?? '#f8fafc';
  const stroke = d.styles.stroke ?? '#334155';
  const swRaw = d.styles['stroke-width'];
  const sw = swRaw ? Number.parseFloat(String(swRaw).replace(/px/gi, '')) || 1.5 : 1.5;
  g.insert('rect', 'circle.connect-port')
    .attr('x', -w / 2)
    .attr('y', -h / 2)
    .attr('width', w)
    .attr('height', h)
    .attr('fill', fill)
    .attr('stroke', stroke)
    .attr('stroke-width', sw);
  const headerH = 24;
  g.insert('rect', 'circle.connect-port')
    .attr('x', -w / 2)
    .attr('y', -h / 2)
    .attr('width', w)
    .attr('height', headerH)
    .attr('fill', '#e2e8f0')
    .attr('stroke', stroke)
    .attr('stroke-width', sw);
  g.insert('line', 'circle.connect-port')
    .attr('x1', -w / 2)
    .attr('x2', w / 2)
    .attr('y1', -h / 2 + headerH)
    .attr('y2', -h / 2 + headerH)
    .attr('stroke', stroke)
    .attr('stroke-width', 1);
  let ty = -h / 2 + 16;
  const italic = d.styles['font-style'] === 'italic';
  if (cb.stereotype) {
    g.insert('text', 'circle.connect-port')
      .attr('text-anchor', 'middle')
      .attr('y', ty)
      .style('font-size', '10px')
      .style('fill', '#64748b')
      .style('font-style', italic ? 'italic' : 'normal')
      .text(`«${cb.stereotype}»`);
    ty += CLASS_MEMBER_LINE;
  }
  g.insert('text', 'circle.connect-port')
    .attr('text-anchor', 'middle')
    .attr('y', ty)
    .style('font-size', '13px')
    .style('font-weight', '600')
    .style('fill', d.styles.color ?? '#0f172a')
    .style('font-style', italic ? 'italic' : 'normal')
    .text(cb.name);
  ty = -h / 2 + headerH + 12;
  for (const f of cb.fields) {
    g.insert('text', 'circle.connect-port')
      .attr('x', -w / 2 + 6)
      .attr('y', ty)
      .style('font-size', '11px')
      .style('font-family', 'ui-monospace, Consolas, monospace')
      .style('fill', '#1e293b')
      .text(`${f.visibility}${f.name}: ${f.type}`);
    ty += CLASS_MEMBER_LINE;
  }
  if (cb.fields.length && cb.methods.length) {
    ty += 2;
    g.insert('line', 'circle.connect-port')
      .attr('x1', -w / 2)
      .attr('x2', w / 2)
      .attr('y1', ty - 12)
      .attr('y2', ty - 12)
      .attr('stroke', '#cbd5e1');
  }
  for (const m of cb.methods) {
    const ps = m.params.map((p) => `${p.name}: ${p.type}`).join(', ');
    const st = m.isStatic ? '$' : '';
    const abs = m.isAbstract ? '*' : '';
    g.insert('text', 'circle.connect-port')
      .attr('x', -w / 2 + 6)
      .attr('y', ty)
      .style('font-size', '11px')
      .style('font-family', 'ui-monospace, Consolas, monospace')
      .style('fill', '#1e293b')
      .text(`${m.visibility}${st}${m.name}(${ps}) ${m.returnType}${abs}`);
    ty += CLASS_MEMBER_LINE;
  }
}

const ER_ATTR_LINE = 14;

function paintErBoxNode(
  g: d3.Selection<SVGGElement, PositionedNode, null, undefined>,
  d: PositionedNode,
): void {
  const ent = d.erEntity;
  if (!ent || d.shape !== 'er_box') return;
  g.selectAll<SVGTextElement, PositionedNode>('text').remove();
  g.selectAll<
    SVGRectElement | SVGPolygonElement | SVGEllipseElement | SVGPathElement | SVGLineElement,
    PositionedNode
  >('rect,polygon,ellipse,path,line')
    .remove();
  g.selectAll<SVGCircleElement, PositionedNode>('circle').each(function () {
    const el = this;
    if (!el.classList.contains('connect-port')) {
      d3.select(el).remove();
    }
  });
  const w = d.width;
  const h = d.height;
  const fill = d.styles.fill ?? '#f8fafc';
  const stroke = d.styles.stroke ?? '#334155';
  const swRaw = d.styles['stroke-width'];
  const sw = swRaw ? Number.parseFloat(String(swRaw).replace(/px/gi, '')) || 1.5 : 1.5;
  g.insert('rect', 'circle.connect-port')
    .attr('x', -w / 2)
    .attr('y', -h / 2)
    .attr('width', w)
    .attr('height', h)
    .attr('rx', 4)
    .attr('ry', 4)
    .attr('fill', fill)
    .attr('stroke', stroke)
    .attr('stroke-width', sw);
  const headerH = 22;
  g.insert('rect', 'circle.connect-port')
    .attr('x', -w / 2)
    .attr('y', -h / 2)
    .attr('width', w)
    .attr('height', headerH)
    .attr('fill', '#e2e8f0')
    .attr('stroke', stroke)
    .attr('stroke-width', sw);
  g.insert('line', 'circle.connect-port')
    .attr('x1', -w / 2)
    .attr('x2', w / 2)
    .attr('y1', -h / 2 + headerH)
    .attr('y2', -h / 2 + headerH)
    .attr('stroke', stroke)
    .attr('stroke-width', 1);
  g.insert('text', 'circle.connect-port')
    .attr('text-anchor', 'middle')
    .attr('y', -h / 2 + 15)
    .style('font-size', '12px')
    .style('font-weight', '700')
    .style('fill', d.styles.color ?? '#0f172a')
    .text(ent.id.length > 28 ? `${ent.id.slice(0, 28)}…` : ent.id);
  let ty = -h / 2 + headerH + 12;
  for (const a of ent.attributes) {
    const line = `${a.type} ${a.name}${a.keyType ? ` ${a.keyType}` : ''}`;
    const display = line.length > 52 ? `${line.slice(0, 52)}…` : line;
    g.insert('text', 'circle.connect-port')
      .attr('x', -w / 2 + 8)
      .attr('y', ty)
      .attr('text-anchor', 'start')
      .style('font-size', '11px')
      .style('font-family', 'ui-monospace, Consolas, monospace')
      .style('fill', '#334155')
      .text(display);
    ty += ER_ATTR_LINE;
  }
}

function nodeHeightForLabel(label: string, explicitHeight?: number): number {
  if (typeof explicitHeight === 'number' && explicitHeight > 0) {
    return explicitHeight;
  }
  const lines = label.split('\n');
  if (lines.length <= 1) return NODE_HEIGHT;
  return Math.max(NODE_HEIGHT, 28 + (lines.length - 1) * NODE_LINE_HEIGHT_PX);
}

function setSvgTextMultiline(
  textSel: d3.Selection<SVGTextElement, PositionedNode, null, undefined>,
  label: string,
): void {
  const lines = label.split('\n');
  textSel.selectAll('tspan').remove();
  if (lines.length <= 1) {
    textSel.text(label);
    return;
  }
  textSel.text(null);
  const lh = NODE_LINE_HEIGHT_PX;
  const startY = -((lines.length - 1) * lh) / 2;
  lines.forEach((line, i) => {
    textSel
      .append('tspan')
      .attr('x', 0)
      .attr('y', startY + i * lh)
      .text(line);
  });
}

function computeLayout(
  model: DiagramModel,
  width: number,
  height: number,
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};

  // 1. фиксированные координаты из layout-хинтов
  for (const node of model.nodes) {
    if (typeof node.x === 'number' && typeof node.y === 'number') {
      positions[node.id] = { x: node.x, y: node.y };
    }
  }

  // 2. простая эвристика "отталкивания" от родителя по рёбрам
  const offsetX = 160;
  const offsetY = 120;
  const outgoingCount = new Map<string, number>();

  for (const edge of model.edges) {
    const fromPos = positions[edge.from];
    if (!fromPos) continue;
    if (positions[edge.to]) continue;

    const idx = outgoingCount.get(edge.from) ?? 0;
    const x = fromPos.x + offsetX;
    const y = fromPos.y + idx * offsetY;
    positions[edge.to] = { x, y };
    outgoingCount.set(edge.from, idx + 1);
  }

  // 3. оставшиеся узлы по сетке
  const remaining = model.nodes.filter((n) => !positions[n.id]);
  if (remaining.length > 0) {
    const cols = Math.max(1, Math.floor(width / offsetX));
    const marginX = 80;
    const marginY = 80;

    remaining.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = marginX + col * offsetX;
      const y = marginY + row * offsetY;
      positions[node.id] = { x, y };
    });
  }

  return positions;
}

/** Убрать дубликаты подряд (dagre иногда даёт совпадающие точки). */
function dedupePolylinePoints(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.5) {
      out.push(p);
    }
  }
  return out.length > 0 ? out : pts;
}

/**
 * Позиция текста кардинальности у конца сегмента: смещение по нормали к ребру,
 * на сторону «наружу» от центра узла (чтобы не висело в середине длинного сегмента).
 */
function erCardinalityLabelPos(
  nodeCenter: { x: number; y: number },
  anchor: { x: number; y: number },
  segDx: number,
  segDy: number,
  offset: number,
): { x: number; y: number } {
  const len = Math.hypot(segDx, segDy);
  if (len < 1e-6) return { x: anchor.x, y: anchor.y };
  let nx = -segDy / len;
  let ny = segDx / len;
  const ox = anchor.x - nodeCenter.x;
  const oy = anchor.y - nodeCenter.y;
  if (nx * ox + ny * oy < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: anchor.x + nx * offset, y: anchor.y + ny * offset };
}

export const DiagramCanvas: React.FC<DiagramCanvasProps> = ({
  model,
  width = 800,
  height = 600,
  canvasId = 'diagram-canvas',
  zoomCommand,
  selectedNodeId,
  selectedEdgeIndex = null,
  onSelectNode,
  onSelectEdge,
  onNodePositionChange,
  disableNodeDrag = false,
  onNodeDoubleClick,
  onEdgeDoubleClick,
  onCreateEdge,
  onReconnectEdge,
  gridSnap = true,
  onSequenceParticipantReorder,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rootGroupRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const zoomInitializedRef = useRef(false);
  /** Не даём zoom перехватывать жесты во время drag узла (без снятия/повторного svg.call(zoom) — иначе сбрасывается transform). */
  const isNodeDraggingRef = useRef(false);
  const isSequenceParticipantDraggingRef = useRef(false);
  const isNodeResizingRef = useRef(false);
  const isConnectionDraggingRef = useRef(false);
  const isEdgeReconnectingRef = useRef(false);
  const reconnectSuppressClickRef = useRef(false);
  /** Во время drag — прямые рёбра; после end — снова по `routePoints` из модели. */
  const edgeDragDrawRef = useRef<'orthogonal' | 'straight'>('orthogonal');

  // базовая инициализация zoom/pan (один раз; не пересоздавать при смене model)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || zoomInitializedRef.current) return;

    const svgSelection = d3.select<SVGSVGElement, unknown>(svg);

    let rootG = svgSelection.select<SVGGElement>('g.diagram-root');
    if (rootG.empty()) {
      rootG = svgSelection.append('g').attr('class', 'diagram-root');
    }
    rootGroupRef.current = rootG;

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .filter((event) => {
        if (isNodeDraggingRef.current) return false;
        if (isSequenceParticipantDraggingRef.current) return false;
        if (isEdgeReconnectingRef.current) return false;
        if (event.type === 'wheel') return true;
        if (event.type === 'mousedown') {
          const mouseEvent = event as MouseEvent;
          if (mouseEvent.button !== 0) return false;
          const t = event.target as Element | null;
          if (t?.closest?.('g.node')) return false;
          if (t?.closest?.('g.edge')) return false;
          if (t?.closest?.('g.lifelines')) return false;
          if (t?.closest?.('g.sequence-participant')) return false;
          return true;
        }
        return event.type !== 'dblclick';
      })
      .on('zoom', (event) => {
        rootG.attr('transform', event.transform.toString());
      });

    svgSelection.call(zoomBehavior as any);
    zoomBehaviorRef.current = zoomBehavior;

    zoomInitializedRef.current = true;
  }, []);

  useEffect(() => {
    if (!zoomCommand || !svgRef.current || !zoomBehaviorRef.current) {
      return;
    }
    const svgSelection = d3.select<SVGSVGElement, unknown>(svgRef.current);
    if (zoomCommand.type === 'in') {
      svgSelection.transition().duration(150).call(zoomBehaviorRef.current.scaleBy as any, 1.2);
      return;
    }
    if (zoomCommand.type === 'out') {
      svgSelection.transition().duration(150).call(zoomBehaviorRef.current.scaleBy as any, 1 / 1.2);
      return;
    }
    svgSelection
      .transition()
      .duration(150)
      .call(zoomBehaviorRef.current.transform as any, d3.zoomIdentity);
    // Только type+nonce: иначе каждый рендер родителя даёт новый объект zoomCommand и снова сбрасывает вид в identity.
  }, [zoomCommand?.type, zoomCommand?.nonce]);

  // основная отрисовка / обновление
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !model) return;

    let reconnectMoveHandler: ((event: MouseEvent) => void) | null = null;
    let reconnectUpHandler: ((event: Event) => void) | null = null;
    const reconnectDragCapture = true;

    const svgSelection = d3.select<SVGSVGElement, unknown>(svg);
    svgSelection.attr('width', width).attr('height', height);

    let rootG = svgSelection.select<SVGGElement>('g.diagram-root');
    if (rootG.empty()) {
      rootG = svgSelection.append('g').attr('class', 'diagram-root');
    }

    // defs/marker создаем один раз и переиспользуем при последующих рендерах
    let defs = svgSelection.select<SVGDefsElement>('defs.diagram-defs');
    if (defs.empty()) {
      defs = svgSelection.append('defs').attr('class', 'diagram-defs');
      defs
        .append('pattern')
        .attr('id', 'canvas-grid')
        .attr('width', 24)
        .attr('height', 24)
        .attr('patternUnits', 'userSpaceOnUse')
        .append('path')
        .attr('d', 'M 24 0 L 0 0 0 24')
        .attr('fill', 'none')
        .attr('stroke', 'rgba(0,0,0,0.08)')
        .attr('stroke-width', 0.8);

      defs
        .append('marker')
        .attr('id', 'edge-arrowhead')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 10)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#4b5563');

      const umlInherit = defs
        .append('marker')
        .attr('id', 'uml-inherit')
        .attr('viewBox', '0 -6 12 12')
        .attr('refX', 0)
        .attr('refY', 0)
        .attr('markerWidth', 10)
        .attr('markerHeight', 10)
        .attr('orient', 'auto');
      umlInherit.append('path').attr('d', 'M12,-6 L0,0 L12,6 Z').attr('fill', 'none').attr('stroke', '#4b5563');

      const umlComp = defs.append('marker').attr('id', 'uml-compose').attr('viewBox', '0 -5 10 10').attr('refX', 10).attr('refY', 0).attr('markerWidth', 9).attr('markerHeight', 9).attr('orient', 'auto');
      umlComp.append('path').attr('d', 'M0,-4 L8,0 L0,4 L-8,0 Z').attr('fill', '#4b5563').attr('stroke', '#4b5563');

      const umlAgg = defs.append('marker').attr('id', 'uml-aggregate').attr('viewBox', '0 -5 10 10').attr('refX', 10).attr('refY', 0).attr('markerWidth', 9).attr('markerHeight', 9).attr('orient', 'auto');
      umlAgg.append('path').attr('d', 'M0,-4 L8,0 L0,4 L-8,0 Z').attr('fill', '#fff').attr('stroke', '#4b5563');
    }

    let edgesG = rootG.select<SVGGElement>('g.edges');
    if (edgesG.empty()) {
      edgesG = rootG.append('g').attr('class', 'edges');
    }

    let subgraphsG = rootG.select<SVGGElement>('g.subgraphs');
    if (subgraphsG.empty()) {
      subgraphsG = rootG.insert('g', 'g.edges').attr('class', 'subgraphs');
    }

    let nodesG = rootG.select<SVGGElement>('g.nodes');
    if (nodesG.empty()) {
      nodesG = rootG.append('g').attr('class', 'nodes');
    }
    let overlaysG = rootG.select<SVGGElement>('g.overlays');
    if (overlaysG.empty()) {
      overlaysG = rootG.append('g').attr('class', 'overlays');
    }

    let gridRect = rootG.select<SVGRectElement>('rect.canvas-grid');
    if (gridRect.empty()) {
      gridRect = rootG
        .insert('rect', ':first-child')
        .attr('class', 'canvas-grid')
        .attr('fill', 'url(#canvas-grid)')
        .attr('pointer-events', 'none');
    }
    gridRect.attr('x', -2000).attr('y', -2000).attr('width', 4000).attr('height', 4000);
    if (gridSnap) gridRect.style('display', null);
    else gridRect.style('display', 'none');

    let panHitRect = rootG.select<SVGRectElement>('rect.canvas-pan-hit');
    if (panHitRect.empty()) {
      panHitRect = rootG
        .insert('rect', 'g.edges')
        .attr('class', 'canvas-pan-hit')
        .attr('fill', 'transparent')
        .attr('pointer-events', 'all');
    }
    panHitRect.attr('x', -2000).attr('y', -2000).attr('width', 4000).attr('height', 4000);

    const isSequenceFull =
      model.metadata.diagramType === 'sequence' && Boolean(model.sequenceData);

    // Всегда снимаем слой sequence: при смене типа диаграммы иначе он остаётся под flowchart/class.
    rootG.select('g.sequence-layer').remove();
    if (isSequenceFull) {
      const seqG = rootG.insert('g', 'g.edges').attr('class', 'sequence-layer');
      const seqH = renderSequenceDiagram(seqG, model.sequenceData!, {
        width,
        baseHeight: height,
        autonumber: model.sequenceData!.autonumber,
        onParticipantReorder: onSequenceParticipantReorder,
        onParticipantDragActive: (active) => {
          isSequenceParticipantDraggingRef.current = active;
        },
      });
      svgSelection.attr('height', Math.max(height, seqH));
    }

    const fallbackLayout = computeLayout(model, width, height);

    /** Позиция узла в начале drag — чтобы не слать onNodePositionChange при клике без перемещения. */
    const nodeDragStartById = new Map<string, { x: number; y: number }>();

    const positionedNodes: PositionedNode[] = isSequenceFull
      ? []
      : model.nodes.map((n) => {
      const hasXY =
        typeof n.x === 'number' &&
        typeof n.y === 'number' &&
        Number.isFinite(n.x) &&
        Number.isFinite(n.y);
      const fb = fallbackLayout[n.id];
      const isClass = n.shape === 'class_box' && n.classBox;
      const isErNode = n.shape === 'er_box' && n.erEntity;
      const w =
        (isClass || isErNode) && typeof n.width === 'number' && n.width > 0
          ? n.width
          : typeof n.width === 'number' && n.width > 0
            ? n.width
            : NODE_WIDTH;
      const h =
        (isClass || isErNode) && typeof n.height === 'number' && n.height > 0
          ? n.height
          : nodeHeightForLabel(n.label ?? n.id, n.height);
      return {
        id: n.id,
        label: n.label ?? n.id,
        shape: (n.shape ?? 'rect') as NodeShape,
        styles: n.styles ?? {},
        x: hasXY ? n.x! : (fb?.x ?? 0),
        y: hasXY ? n.y! : (fb?.y ?? 0),
        width: w,
        height: h,
        classBox: n.classBox,
        erEntity: n.erEntity,
      };
        });

    const nodeById = new Map<string, PositionedNode>(
      positionedNodes.map((n) => [n.id, n]),
    );

    const getCanvasPointFromClient = (clientX: number, clientY: number): { x: number; y: number } => {
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const inSvg = pt.matrixTransform(ctm.inverse());
      const zt = d3.zoomTransform(svg);
      const [x, y] = zt.invert([inSvg.x, inSvg.y]);
      return { x, y };
    };

    const resolveTargetNodeId = (event: MouseEvent, sourceId: string): string | null => {
      const stack = document.elementsFromPoint(event.clientX, event.clientY);
      for (const el of stack) {
        const nodeEl = el.closest?.('g.node') as SVGGElement | null;
        const nid = nodeEl?.getAttribute('data-node-id');
        if (nid && nid !== sourceId) return nid;
      }
      const p = getCanvasPointFromClient(event.clientX, event.clientY);
      const hit = positionedNodes.find((n) => {
        if (n.id === sourceId) return false;
        return (
          p.x >= n.x - n.width / 2 &&
          p.x <= n.x + n.width / 2 &&
          p.y >= n.y - n.height / 2 &&
          p.y <= n.y + n.height / 2
        );
      });
      return hit?.id ?? null;
    };

    interface SubgraphLayoutBox {
      id: string;
      title?: string;
      x: number;
      y: number;
      width: number;
      height: number;
      titleX: number;
      titleY: number;
      styles: Record<string, string>;
    }

    const subgraphPad = 20;
    const subgraphTitleBand = 18;
    const subgraphLayouts: SubgraphLayoutBox[] = [];
    for (const sg of model.subgraphs ?? []) {
      if (!sg.id) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const nid of sg.nodeIds) {
        const n = nodeById.get(nid);
        if (!n) continue;
        const L = n.x - n.width / 2;
        const R = n.x + n.width / 2;
        const T = n.y - n.height / 2;
        const B = n.y + n.height / 2;
        minX = Math.min(minX, L);
        maxX = Math.max(maxX, R);
        minY = Math.min(minY, T);
        maxY = Math.max(maxY, B);
      }
      if (!Number.isFinite(minX)) continue;
      const titleH = sg.title ? subgraphTitleBand : 0;
      subgraphLayouts.push({
        id: sg.id,
        title: sg.title,
        x: minX - subgraphPad,
        y: minY - subgraphPad - titleH,
        width: maxX - minX + 2 * subgraphPad,
        height: maxY - minY + 2 * subgraphPad + titleH,
        titleX: minX - subgraphPad + 8,
        titleY: minY - subgraphPad - titleH + 14,
        styles: sg.styles ?? {},
      });
    }

    const subgraphSelection = subgraphsG
      .selectAll<SVGGElement, SubgraphLayoutBox>('g.subgraph')
      .data(subgraphLayouts, (d) => d.id);

    subgraphSelection.exit().remove();

    const subgraphEnter = subgraphSelection
      .enter()
      .append('g')
      .attr('class', 'subgraph')
      .style('pointer-events', 'none');

    subgraphEnter
      .append('rect')
      .attr('class', 'subgraph-bg')
      .attr('rx', 8)
      .attr('ry', 8);

    subgraphEnter
      .append('text')
      .attr('class', 'subgraph-title')
      .style('font-size', '13px')
      .style('font-weight', '600')
      .style('fill', '#334155');

    const subgraphMerge = subgraphEnter.merge(subgraphSelection);
    subgraphMerge
      .select<SVGRectElement>('rect.subgraph-bg')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y)
      .attr('width', (d) => d.width)
      .attr('height', (d) => d.height)
      .attr('fill', (d) => d.styles.fill ?? 'rgba(248, 250, 252, 0.92)')
      .attr('stroke', (d) => d.styles.stroke ?? '#64748b')
      .attr('stroke-width', (d) => {
        const w = d.styles['stroke-width'] ?? d.styles.strokeWidth;
        if (w === undefined) return 1.2;
        const n = Number.parseFloat(String(w).replace(/px/gi, '').trim());
        return Number.isFinite(n) ? n : 1.2;
      })
      .attr('stroke-dasharray', (d) => d.styles['stroke-dasharray'] ?? null);

    subgraphMerge
      .select<SVGTextElement>('text.subgraph-title')
      .attr('x', (d) => d.titleX)
      .attr('y', (d) => d.titleY)
      .text((d) => d.title ?? d.id);

    let classNotesG = rootG.select<SVGGElement>('g.class-notes');
    if (model.metadata.diagramType === 'class' && model.classNotes?.length) {
      if (classNotesG.empty()) {
        classNotesG = rootG.append('g').attr('class', 'class-notes');
      }
      const noteData = model.classNotes.map((n, i) => ({ ...n, i }));
      const noteSel = classNotesG
        .selectAll<
          SVGGElement,
          { text: string; targetClassId?: string; placement?: string; i: number }
        >('g.class-note')
        .data(noteData, (d) => String(d.i));
      noteSel.exit().remove();
      const ne = noteSel.enter().append('g').attr('class', 'class-note');
      ne.append('rect');
      ne.append('text').attr('y', 14);
      const nm = ne.merge(noteSel);
      nm.attr('transform', (d) => {
        const node = d.targetClassId ? nodeById.get(d.targetClassId) : undefined;
        if (node) {
          return `translate(${node.x + node.width / 2 + 12},${node.y - node.height / 2})`;
        }
        return `translate(20,${40 + d.i * 48})`;
      });
      nm.select<SVGRectElement>('rect')
        .attr('width', 220)
        .attr('height', 36)
        .attr('fill', '#fef9c3')
        .attr('stroke', '#ca8a04')
        .attr('rx', 4);
      nm.select<SVGTextElement>('text')
        .attr('x', 0)
        .style('font-size', '11px')
        .text((d) => (d.text.length > 90 ? `${d.text.slice(0, 90)}…` : d.text));
    } else {
      rootG.select('g.class-notes').remove();
    }

    /** При полном sequence рёбра рисует diagramCanvasSequence; иначе model.edges + пустые узлы дают (0,0) и кучу текста в углу. */
    const positionedEdges: PositionedEdge[] = isSequenceFull
      ? []
      : model.edges.map((e, edgeIndex) => {
      const from = nodeById.get(e.from);
      const to = nodeById.get(e.to);
      const fromX = from?.x ?? 0;
      const fromY = from?.y ?? 0;
      const toX = to?.x ?? 0;
      const toY = to?.y ?? 0;
      const fromW = from?.width ?? NODE_WIDTH;
      const fromH = from?.height ?? NODE_HEIGHT;
      const toW = to?.width ?? NODE_WIDTH;
      const toH = to?.height ?? NODE_HEIGHT;
      return {
        edgeIndex,
        from: e.from,
        to: e.to,
        label: e.label,
        type: e.type,
        styles: e.styles ?? {},
        fromShape: from?.shape ?? 'rect',
        toShape: to?.shape ?? 'rect',
        fromX,
        fromY,
        toX,
        toY,
        fromW,
        fromH,
        toW,
        toH,
        routePoints: e.points,
        classRelation: e.classRelation,
        fromMultiplicity: e.fromMultiplicity,
        toMultiplicity: e.toMultiplicity,
        erLeftCard: e.erLeftCard,
        erRightCard: e.erRightCard,
      };
        });

    // --- edges data join ---
    const edgeSelection = edgesG
      .selectAll<SVGGElement, PositionedEdge>('g.edge')
      .data(positionedEdges, (d) => String(d.edgeIndex));

    const edgeEnter = edgeSelection
      .enter()
      .append('g')
      .attr('class', 'edge');

    edgeEnter
      .append('path')
      .attr('class', 'edge-line')
      .attr('fill', 'none')
      .attr('stroke', '#4b5563')
      .attr('stroke-width', 2)
      .style('pointer-events', 'none');

    edgeEnter
      .append('path')
      .attr('class', 'edge-hit')
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 22)
      .attr('stroke-linecap', 'round')
      .style('pointer-events', 'stroke')
      .style('cursor', 'pointer');

    edgeEnter
      .append('text')
      .attr('class', 'edge-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .style('font-size', '12px')
      .style('fill', '#374151');

    edgeEnter
      .append('text')
      .attr('class', 'er-edge-l')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('opacity', 0)
      .style('font-size', '11px')
      .style('font-weight', '600')
      .style('fill', '#475569')
      .style('pointer-events', 'none');
    edgeEnter
      .append('text')
      .attr('class', 'er-edge-r')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('opacity', 0)
      .style('font-size', '11px')
      .style('font-weight', '600')
      .style('fill', '#475569')
      .style('pointer-events', 'none');

    const edgeMerge = edgeEnter.merge(edgeSelection);
    edgeMerge.each(function ensureEdgePaths(this: SVGGElement) {
      const g = d3.select(this);
      if (!g.select('path.edge-line').empty()) return;
      g.selectAll('line.edge-line, line.edge-hit').remove();
      g.insert('path', 'text')
        .attr('class', 'edge-line')
        .attr('fill', 'none')
        .attr('stroke', '#4b5563')
        .attr('stroke-width', 2)
        .style('pointer-events', 'none');
      g.insert('path', 'text')
        .attr('class', 'edge-hit')
        .attr('fill', 'none')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 22)
        .attr('stroke-linecap', 'round')
        .style('pointer-events', 'stroke')
        .style('cursor', 'pointer');
    });
    edgeMerge.on('click', (event, d) => {
      event.stopPropagation();
      if (reconnectSuppressClickRef.current) {
        reconnectSuppressClickRef.current = false;
        return;
      }
      onSelectEdge?.(d.edgeIndex);
    });
    edgeMerge.on('dblclick', (event, d) => {
      event.stopPropagation();
      onEdgeDoubleClick?.({ from: d.from, to: d.to, label: d.label, type: d.type });
    });

    const toGeom = (n: PositionedNode): PositionedNodeLike => ({
      id: n.id,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      shape: n.shape,
    });

    const routeLine = d3
      .line<{ x: number; y: number }>()
      .x((p) => p.x)
      .y((p) => p.y)
      .curve(d3.curveLinear);

    const refreshAllEdgeGraphics = (): void => {
      const seq = model.metadata.diagramType === 'sequence';
      const er = model.metadata.diagramType === 'er';
      edgeMerge.each(function (this: SVGGElement, d: PositionedEdge, i: number) {
        const from = nodeById.get(d.from);
        const to = nodeById.get(d.to);
        if (!from || !to) return;
        const g = d3.select(this);
        const setD = (pts: { x: number; y: number }[]): void => {
          const pathD = routeLine(pts);
          g.select<SVGPathElement>('path.edge-line').attr('d', pathD ?? '');
          g.select<SVGPathElement>('path.edge-hit').attr('d', pathD ?? '');
        };

        if (!er) {
          g.select<SVGTextElement>('text.er-edge-l').attr('opacity', 0);
          g.select<SVGTextElement>('text.er-edge-r').attr('opacity', 0);
        }

        if (seq) {
          const { x1, y1, x2, y2 } = computeEdgeEndpointsBetweenNodes(
            toGeom(from),
            toGeom(to),
            d.type,
          );
          const yy = 130 + i * 48;
          const raw = [
            { x: x1, y: yy },
            { x: x2, y: yy },
          ];
          const pts =
            d.type === 'arrow' ? trimPolylineEndForArrow(raw, ARROW_TIP_GAP) : raw;
          setD(pts);
          g.select<SVGTextElement>('text.edge-label')
            .attr('x', (x1 + x2) / 2)
            .attr('y', 130 + i * 48 - 10);
          return;
        }

        if (er) {
          const useSavedRoute =
            edgeDragDrawRef.current === 'orthogonal' &&
            d.routePoints &&
            d.routePoints.length >= 2;
          let pts: { x: number; y: number }[];
          if (useSavedRoute) {
            pts = dedupePolylinePoints(
              d.routePoints!.map((p) => ({ x: p.x, y: p.y })),
            );
          } else {
            const { x1, y1, x2, y2 } = computeEdgeEndpointsBetweenNodes(
              toGeom(from),
              toGeom(to),
              d.type,
            );
            pts = [
              { x: x1, y: y1 },
              { x: x2, y: y2 },
            ];
          }
          setD(pts);

          const CARD_OFF = 13;
          const mid = pts[Math.floor(pts.length / 2)] ?? pts[0]!;
          let labelX = mid.x;
          let labelY = mid.y - 8;
          if (pts.length >= 2) {
            const si = Math.max(0, Math.floor((pts.length - 2) / 2));
            const pa = pts[si]!;
            const pb = pts[si + 1]!;
            labelX = (pa.x + pb.x) / 2;
            labelY = (pa.y + pb.y) / 2;
            const sdx = pb.x - pa.x;
            const sdy = pb.y - pa.y;
            const slen = Math.hypot(sdx, sdy) || 1;
            labelX += (-sdy / slen) * 12;
            labelY += (sdx / slen) * 12;
          }
          g.select<SVGTextElement>('text.edge-label')
            .attr('x', labelX)
            .attr('y', labelY)
            .text(d.label ?? '');

          g.select<SVGTextElement>('text.er-edge-l').attr('opacity', 0);
          g.select<SVGTextElement>('text.er-edge-r').attr('opacity', 0);
          if (pts.length >= 2) {
            const p0 = pts[0]!;
            const p1 = pts[1]!;
            if (d.erLeftCard) {
              const pos = erCardinalityLabelPos(
                { x: from.x, y: from.y },
                p0,
                p1.x - p0.x,
                p1.y - p0.y,
                CARD_OFF,
              );
              g.select<SVGTextElement>('text.er-edge-l')
                .attr('opacity', 1)
                .attr('x', pos.x)
                .attr('y', pos.y)
                .style('font-family', 'ui-monospace, Consolas, monospace')
                .text(d.erLeftCard);
            }
            const pn = pts[pts.length - 1]!;
            const pm = pts[pts.length - 2]!;
            if (d.erRightCard) {
              const pos = erCardinalityLabelPos(
                { x: to.x, y: to.y },
                pn,
                pn.x - pm.x,
                pn.y - pm.y,
                CARD_OFF,
              );
              g.select<SVGTextElement>('text.er-edge-r')
                .attr('opacity', 1)
                .attr('x', pos.x)
                .attr('y', pos.y)
                .style('font-family', 'ui-monospace, Consolas, monospace')
                .text(d.erRightCard);
            }
          }
          return;
        }

        const useSavedRoute =
          edgeDragDrawRef.current === 'orthogonal' &&
          d.routePoints &&
          d.routePoints.length >= 2;

        if (useSavedRoute) {
          let pts = d.routePoints!.map((p) => ({ x: p.x, y: p.y }));
          if (d.type === 'arrow') {
            pts = trimPolylineEndForArrow(pts, ARROW_TIP_GAP);
          }
          setD(pts);
          const mid = pts[Math.floor(pts.length / 2)] ?? pts[0];
          g.select<SVGTextElement>('text.edge-label')
            .attr('x', mid.x)
            .attr('y', mid.y - 6);
          return;
        }

        const { x1, y1, x2, y2 } = computeEdgeEndpointsBetweenNodes(
          toGeom(from),
          toGeom(to),
          d.type,
        );
        setD([
          { x: x1, y: y1 },
          { x: x2, y: y2 },
        ]);
        g.select<SVGTextElement>('text.edge-label')
          .attr('x', (x1 + x2) / 2)
          .attr('y', (y1 + y2) / 2 - 6);
      });
    };

    edgeMerge
      .select<SVGPathElement>('path.edge-line')
      .attr('marker-end', (d) =>
        model.metadata.diagramType === 'er' ? null : umlClassEdgePresentation(d).markerEnd,
      )
      .attr('marker-start', (d) =>
        model.metadata.diagramType === 'er' ? null : umlClassEdgePresentation(d).markerStart,
      )
      .attr('stroke', (d) =>
        selectedEdgeIndex === d.edgeIndex
          ? '#4f46e5'
          : (d.styles.stroke ?? '#4b5563'),
      )
      .attr('stroke-width', (d) =>
        edgeLineStrokeWidthPx(d.styles, selectedEdgeIndex === d.edgeIndex),
      )
      .attr('stroke-dasharray', (d) => {
        const u = umlClassEdgePresentation(d);
        return u.dash ?? d.styles['stroke-dasharray'] ?? null;
      });

    edgeMerge.select<SVGTextElement>('text.edge-label').text((d) => d.label ?? '');

    refreshAllEdgeGraphics();

    edgeSelection.exit().remove();

    // Sequence (старый режим без sequenceData): lifelines + рёбра как горизонтальные линии.
    if (model.metadata.diagramType === 'sequence' && !model.sequenceData) {
      let lifelinesG = rootG.select<SVGGElement>('g.lifelines');
      if (lifelinesG.empty()) {
        lifelinesG = rootG.insert('g', 'g.edges').attr('class', 'lifelines');
      }
      const lifeSelection = lifelinesG
        .selectAll<SVGLineElement, PositionedNode>('line.lifeline')
        .data(positionedNodes, (d) => d.id);

      lifeSelection
        .enter()
        .append('line')
        .attr('class', 'lifeline')
        .merge(lifeSelection)
        .attr('x1', (d) => d.x)
        .attr('x2', (d) => d.x)
        .attr('y1', (d) => d.y + 24)
        .attr('y2', height - 30)
        .attr('stroke', '#475569')
        .attr('stroke-width', 1.2)
        .attr('stroke-dasharray', '6,4');

      lifeSelection.exit().remove();

    } else {
      rootG.select<SVGGElement>('g.lifelines').remove();
    }

    // --- nodes data join ---
    const nodeSelection = nodesG
      .selectAll<SVGGElement, PositionedNode>('g.node')
      .data(positionedNodes, (d) => d.id);

    const nodeEnter = nodeSelection
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('data-node-id', (d) => d.id)
      .style('cursor', 'pointer');

    nodeEnter
      .append('circle')
      .attr('class', 'connect-port')
      .attr('r', 7)
      .attr('fill', '#4f46e5')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2)
      .style('opacity', 0)
      .style('pointer-events', 'none')
      .style('cursor', 'crosshair');

    nodeEnter
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .style('font-size', '13px')
      .style('font-weight', '500')
      .style('fill', '#1f2937');

    const nodeMerge = nodeEnter.merge(nodeSelection);

    // Узел должен обновляться при каждом рендере, иначе форма/текст "залипают".
    nodeMerge.each(function (d) {
      const g = d3.select<SVGGElement, PositionedNode>(this);
      g.selectAll<
        SVGRectElement | SVGPolygonElement | SVGEllipseElement | SVGPathElement | SVGLineElement,
        PositionedNode
      >('rect,polygon,ellipse,path,line')
        .remove();
      g.selectAll<SVGCircleElement, PositionedNode>('circle').each(function () {
        const el = this;
        if (!el.classList.contains('connect-port')) {
          d3.select(el).remove();
        }
      });

      const w = d.width;
      const h = d.height;

      if (d.shape === 'class_box' && d.classBox) {
        paintClassBoxNode(g, d);
        return;
      }

      if (d.shape === 'er_box' && d.erEntity) {
        paintErBoxNode(g, d);
        return;
      }

      if (d.shape === 'diamond') {
        g.insert('polygon', 'text')
          .attr(
            'points',
            `0,${-h / 2} ${w / 2},0 0,${h / 2} ${-w / 2},0`,
          );
      } else if (d.shape === 'circle') {
        g.insert('circle', 'text').attr('r', Math.min(w, h) / 2);
      } else if (d.shape === 'oval') {
        g.insert('ellipse', 'text').attr('rx', w / 2).attr('ry', h / 2);
      } else if (d.shape === 'parallelogram') {
        const skew = Math.min(16, w * 0.12);
        g.insert('polygon', 'text').attr(
          'points',
          `${-w / 2 + skew},${-h / 2} ${w / 2},${-h / 2} ${w / 2 - skew},${h / 2} ${-w / 2},${h / 2}`,
        );
      } else if (d.shape === 'trapezoid_slash') {
        const skew = Math.min(16, w * 0.12);
        g.insert('polygon', 'text').attr(
          'points',
          `${-w / 2 + skew},${-h / 2} ${w / 2},${-h / 2} ${w / 2 - skew},${h / 2} ${-w / 2},${h / 2}`,
        );
      } else if (d.shape === 'trapezoid_backslash') {
        const skew = Math.min(16, w * 0.12);
        g.insert('polygon', 'text').attr(
          'points',
          `${-w / 2},${-h / 2} ${w / 2 - skew},${-h / 2} ${w / 2},${h / 2} ${-w / 2 + skew},${h / 2}`,
        );
      } else if (d.shape === 'flag') {
        const hw = w / 2;
        const hh = h / 2;
        const notch = Math.min(10, w * 0.1);
        g.insert('polygon', 'text').attr(
          'points',
          `${-hw},${-hh} ${hw - notch},${-hh} ${hw + notch * 0.6},0 ${hw - notch},${hh} ${-hw},${hh}`,
        );
      } else if (d.shape === 'cloud') {
        const sx = w / 90;
        const sy = h / 46;
        g.insert('path', 'text')
          .attr(
            'd',
            'M -45 -14 C -50 -28,-20 -32,-10 -20 C 0 -34,25 -32,28 -16 C 42 -22,52 -4,40 8 C 52 24,30 34,14 26 C 6 36,-18 36,-24 24 C -40 30,-56 14,-44 0 C -56 -6,-56 -20,-45 -14 Z',
          )
          .attr('transform', `scale(${sx} ${sy})`);
      } else {
        g.insert('rect', 'text')
          .attr('x', -w / 2)
          .attr('y', -h / 2)
          .attr('width', w)
          .attr('height', h)
          .attr('rx', 6)
          .attr('ry', 6);
      }

      if (d.shape !== 'class_box' && d.shape !== 'er_box') {
        setSvgTextMultiline(g.select<SVGTextElement>('text'), d.label);
      }
    });

    nodeMerge
      .select<SVGTextElement>('text')
      .style('fill', (d) => d.styles.color ?? '#1f2937');

    nodeMerge.attr('transform', (d) => `translate(${d.x},${d.y})`);
    nodeMerge.attr('data-node-id', (d) => d.id);

    selectNodeShapeElements(nodeMerge)
      .attr('fill', (d) => d.styles.fill?.trim() || '#ffffff')
      .attr('stroke', (d) =>
        d.id === selectedNodeId ? '#4f46e5' : d.styles.stroke ?? '#4f46e5',
      )
      .attr('stroke-width', (d) => nodeStrokeWidthPx(d, selectedNodeId));

    nodeMerge
      .select<SVGCircleElement>('circle.connect-port')
      .attr('cx', (d) => d.width / 2 + 2)
      .attr('cy', 0)
      .style('opacity', (d) => (d.id === selectedNodeId ? 1 : 0))
      .style('pointer-events', (d) => (d.id === selectedNodeId ? 'all' : 'none'));

    nodeSelection.exit().remove();

    const updateConnectPortVisibility = (): void => {
      nodeMerge
        .select<SVGCircleElement>('circle.connect-port')
        .style('opacity', (d) => (d.id === selectedNodeId ? 1 : 0))
        .style('pointer-events', (d) => (d.id === selectedNodeId ? 'all' : 'none'));
    };

    let connectionMoveHandler: ((event: MouseEvent) => void) | null = null;
    let connectionUpHandler: ((event: Event) => void) | null = null;
    const connectionDragCapture = true;

    const removeConnectionDraftElements = (): void => {
      overlaysG.selectAll('.edge-draft-line, .edge-reconnect-draft').remove();
    };

    const startConnectionDrag = (sourceNode: PositionedNode, event: MouseEvent): void => {
      event.stopPropagation();
      event.preventDefault();
      isConnectionDraggingRef.current = true;
      removeConnectionDraftElements();
      const start = { x: sourceNode.x + sourceNode.width / 2, y: sourceNode.y };
      const p = getCanvasPointFromClient(event.clientX, event.clientY);
      const draft = overlaysG
        .append('line')
        .attr('class', 'edge-draft-line')
        .attr('x1', start.x)
        .attr('y1', start.y)
        .attr('x2', p.x)
        .attr('y2', p.y)
        .attr('stroke', '#6366f1')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6 4')
        .attr('pointer-events', 'none');

      connectionMoveHandler = (moveEvent: MouseEvent) => {
        const next = getCanvasPointFromClient(moveEvent.clientX, moveEvent.clientY);
        draft.attr('x2', next.x).attr('y2', next.y);
      };
      let connectionDragFinished = false;
      const finishConnectionDrag = (upEvent: Event): void => {
        if (connectionDragFinished) return;
        connectionDragFinished = true;
        const me = upEvent as MouseEvent;
        const targetId = resolveTargetNodeId(me, sourceNode.id);
        if (targetId) {
          onCreateEdge?.(sourceNode.id, targetId);
        }
        draft.remove();
        if (connectionMoveHandler) {
          window.removeEventListener('mousemove', connectionMoveHandler);
        }
        window.removeEventListener('mouseup', finishConnectionDrag, connectionDragCapture);
        window.removeEventListener('pointerup', finishConnectionDrag, connectionDragCapture);
        window.removeEventListener('pointercancel', finishConnectionDrag, connectionDragCapture);
        connectionMoveHandler = null;
        connectionUpHandler = null;
        isConnectionDraggingRef.current = false;
      };
      connectionUpHandler = finishConnectionDrag;

      window.addEventListener('mousemove', connectionMoveHandler);
      window.addEventListener('mouseup', finishConnectionDrag, connectionDragCapture);
      window.addEventListener('pointerup', finishConnectionDrag, connectionDragCapture);
      window.addEventListener('pointercancel', finishConnectionDrag, connectionDragCapture);
    };

    // drag behavior (this = <g class="node">; не использовать event.source — в D3DragEvent его нет)
    const dragBehavior = d3
      .drag<SVGGElement, PositionedNode>()
      .filter((event) => {
        if (isNodeResizingRef.current || isConnectionDraggingRef.current) return false;
        const t = event.target as Element | null;
        if (!t) return true;
        return !t.closest('.resize-handle') && !t.closest('.connect-port');
      })
      .on('start', function (event, d) {
        event.sourceEvent?.stopPropagation();
        nodeDragStartById.set(d.id, { x: d.x, y: d.y });
        isNodeDraggingRef.current = true;
        edgeDragDrawRef.current = 'straight';
        d3.select(svg).style('cursor', 'grabbing');
        selectNodeShapeElements(d3.select<SVGGElement, PositionedNode>(this))
          .attr('opacity', 0.7)
          .attr('stroke-width', 3);
      })
      .on('drag', function (event, d) {
        const k = d3.zoomTransform(svg).k || 1;
        const sourceEvt = event.sourceEvent as MouseEvent | PointerEvent | undefined;
        const stepX =
          Number.isFinite(event.dx) && event.dx !== 0
            ? event.dx
            : (sourceEvt?.movementX ?? 0);
        const stepY =
          Number.isFinite(event.dy) && event.dy !== 0
            ? event.dy
            : (sourceEvt?.movementY ?? 0);

        d.x += stepX / k;
        d.y += stepY / k;

        // Во время drag двигаемся плавно; snap к сетке применяем только на dragend.
        d3.select<SVGGElement, PositionedNode>(this).attr(
          'transform',
          `translate(${d.x},${d.y})`,
        );
        refreshAllEdgeGraphics();
      })
      .on('end', function (event, d) {
        isNodeDraggingRef.current = false;
        edgeDragDrawRef.current = 'orthogonal';
        d3.select(svg).style('cursor', null);
        if (gridSnap) {
          d.x = Math.round(d.x / 20) * 20;
          d.y = Math.round(d.y / 20) * 20;
          d3.select<SVGGElement, PositionedNode>(this).attr(
            'transform',
            `translate(${d.x},${d.y})`,
          );
        }
        selectNodeShapeElements(d3.select<SVGGElement, PositionedNode>(this))
          .attr('opacity', 1)
          .attr('stroke-width', (n) => nodeStrokeWidthPx(n, selectedNodeId));
        refreshAllEdgeGraphics();
        const start = nodeDragStartById.get(d.id);
        nodeDragStartById.delete(d.id);
        const moved =
          !start ||
          Math.abs(d.x - start.x) > 1e-6 ||
          Math.abs(d.y - start.y) > 1e-6;
        if (moved) {
          onNodePositionChange?.(d.id, d.x, d.y, { width: d.width, height: d.height });
        }
      });

    type ResizeHandle = {
      key: string;
      hx: -1 | 0 | 1;
      hy: -1 | 0 | 1;
      cursor: string;
    };
    const resizeHandles: ResizeHandle[] = [
      { key: 'nw', hx: -1, hy: -1, cursor: 'nwse-resize' },
      { key: 'n', hx: 0, hy: -1, cursor: 'ns-resize' },
      { key: 'ne', hx: 1, hy: -1, cursor: 'nesw-resize' },
      { key: 'e', hx: 1, hy: 0, cursor: 'ew-resize' },
      { key: 'se', hx: 1, hy: 1, cursor: 'nwse-resize' },
      { key: 's', hx: 0, hy: 1, cursor: 'ns-resize' },
      { key: 'sw', hx: -1, hy: 1, cursor: 'nesw-resize' },
      { key: 'w', hx: -1, hy: 0, cursor: 'ew-resize' },
    ];

    const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
    const selectedForHandles = selectedNode && !disableNodeDrag ? selectedNode : null;

    let resizeG = overlaysG.select<SVGGElement>('g.resize-handles');
    if (resizeG.empty()) {
      resizeG = overlaysG.append('g').attr('class', 'resize-handles');
    }

    const toHandleOffset = (
      handle: ResizeHandle,
      node: PositionedNode,
    ): { x: number; y: number } => ({
      x: (node.width / 2) * handle.hx,
      y: (node.height / 2) * handle.hy,
    });

    const updateHandlePositions = (node: PositionedNode): void => {
      resizeG.attr('transform', `translate(${node.x},${node.y})`);
      resizeG.selectAll<SVGRectElement, ResizeHandle>('rect.resize-handle').each(function (h) {
        const p = toHandleOffset(h, node);
        d3.select(this).attr('x', p.x - 4).attr('y', p.y - 4);
      });
    };

    const handleSelection = resizeG
      .selectAll<SVGRectElement, ResizeHandle>('rect.resize-handle')
      .data(selectedForHandles ? resizeHandles : [], (d) => d.key);
    handleSelection.exit().remove();
    const handleEnter = handleSelection
      .enter()
      .append('rect')
      .attr('class', 'resize-handle')
      .attr('width', 8)
      .attr('height', 8)
      .attr('rx', 2)
      .attr('ry', 2)
      .attr('fill', '#ffffff')
      .attr('stroke', '#4f46e5')
      .attr('stroke-width', 1.5)
      .style('cursor', (d) => d.cursor);
    const handleMerge = handleEnter.merge(handleSelection);

    const resizeBehavior = d3
      .drag<SVGRectElement, ResizeHandle>()
      .on('start', (event) => {
        event.sourceEvent?.stopPropagation();
        event.sourceEvent?.preventDefault();
        isNodeResizingRef.current = true;
        isNodeDraggingRef.current = false;
        edgeDragDrawRef.current = 'straight';
      })
      .on('drag', function (event, h) {
        const node = selectedForHandles;
        if (!node) return;
        const k = d3.zoomTransform(svg).k || 1;
        const sourceEvt = event.sourceEvent as MouseEvent | PointerEvent | undefined;
        const stepX =
          Number.isFinite(event.dx) && event.dx !== 0
            ? event.dx
            : (sourceEvt?.movementX ?? 0);
        const stepY =
          Number.isFinite(event.dy) && event.dy !== 0
            ? event.dy
            : (sourceEvt?.movementY ?? 0);
        const dx = stepX / k;
        const dy = stepY / k;
        const oldW = node.width;
        const oldH = node.height;

        if (h.hx === 1) {
          node.width = Math.max(NODE_MIN_WIDTH, oldW + dx);
          node.x += (node.width - oldW) / 2;
        } else if (h.hx === -1) {
          node.width = Math.max(NODE_MIN_WIDTH, oldW - dx);
          node.x += (oldW - node.width) / 2;
        }

        if (h.hy === 1) {
          node.height = Math.max(NODE_MIN_HEIGHT, oldH + dy);
          node.y += (node.height - oldH) / 2;
        } else if (h.hy === -1) {
          node.height = Math.max(NODE_MIN_HEIGHT, oldH - dy);
          node.y += (oldH - node.height) / 2;
        }

        const nodeG = nodeMerge.filter((n) => n.id === node.id);
        nodeG.attr('transform', `translate(${node.x},${node.y})`);
        nodeG.each(function (n) {
          const g = d3.select<SVGGElement, PositionedNode>(this);
          g.selectAll<
            SVGRectElement | SVGPolygonElement | SVGEllipseElement | SVGPathElement | SVGLineElement,
            PositionedNode
          >('rect,polygon,ellipse,path,line')
            .remove();
          g.selectAll<SVGCircleElement, PositionedNode>('circle').each(function () {
            const el = this;
            if (!el.classList.contains('connect-port')) {
              d3.select(el).remove();
            }
          });
          const w = n.width;
          const hh = n.height;
          if (n.shape === 'class_box' && n.classBox) {
            paintClassBoxNode(g, n);
            return;
          }
          if (n.shape === 'er_box' && n.erEntity) {
            paintErBoxNode(g, n);
            return;
          }
          if (n.shape === 'diamond') {
            g.insert('polygon', 'text').attr('points', `0,${-hh / 2} ${w / 2},0 0,${hh / 2} ${-w / 2},0`);
          } else if (n.shape === 'circle') {
            g.insert('circle', 'text').attr('r', Math.min(w, hh) / 2);
          } else if (n.shape === 'oval') {
            g.insert('ellipse', 'text').attr('rx', w / 2).attr('ry', hh / 2);
          } else if (n.shape === 'parallelogram') {
            const skew = Math.min(16, w * 0.12);
            g.insert('polygon', 'text').attr(
              'points',
              `${-w / 2 + skew},${-hh / 2} ${w / 2},${-hh / 2} ${w / 2 - skew},${hh / 2} ${-w / 2},${hh / 2}`,
            );
          } else if (n.shape === 'trapezoid_slash') {
            const skew = Math.min(16, w * 0.12);
            g.insert('polygon', 'text').attr(
              'points',
              `${-w / 2 + skew},${-hh / 2} ${w / 2},${-hh / 2} ${w / 2 - skew},${hh / 2} ${-w / 2},${hh / 2}`,
            );
          } else if (n.shape === 'trapezoid_backslash') {
            const skew = Math.min(16, w * 0.12);
            g.insert('polygon', 'text').attr(
              'points',
              `${-w / 2},${-hh / 2} ${w / 2 - skew},${-hh / 2} ${w / 2},${hh / 2} ${-w / 2 + skew},${hh / 2}`,
            );
          } else if (n.shape === 'flag') {
            const hw = w / 2;
            const hhh = hh / 2;
            const notch = Math.min(10, w * 0.1);
            g.insert('polygon', 'text').attr(
              'points',
              `${-hw},${-hhh} ${hw - notch},${-hhh} ${hw + notch * 0.6},0 ${hw - notch},${hhh} ${-hw},${hhh}`,
            );
          } else if (n.shape === 'cloud') {
            const sx = w / 90;
            const sy = hh / 46;
            g.insert('path', 'text')
              .attr(
                'd',
                'M -45 -14 C -50 -28,-20 -32,-10 -20 C 0 -34,25 -32,28 -16 C 42 -22,52 -4,40 8 C 52 24,30 34,14 26 C 6 36,-18 36,-24 24 C -40 30,-56 14,-44 0 C -56 -6,-56 -20,-45 -14 Z',
              )
              .attr('transform', `scale(${sx} ${sy})`);
          } else {
            g.insert('rect', 'text')
              .attr('x', -w / 2)
              .attr('y', -hh / 2)
              .attr('width', w)
              .attr('height', hh)
              .attr('rx', 6)
              .attr('ry', 6);
          }
        });
        selectNodeShapeElements(nodeG)
          .attr('fill', (n) => n.styles.fill?.trim() || '#ffffff')
          .attr('stroke', (n) => (n.id === selectedNodeId ? '#4f46e5' : n.styles.stroke ?? '#4f46e5'))
          .attr('stroke-width', (n) => nodeStrokeWidthPx(n, selectedNodeId));
        nodeG
          .select<SVGCircleElement>('circle.connect-port')
          .attr('cx', (n) => n.width / 2 + 2)
          .attr('cy', 0);
        updateHandlePositions(node);
        refreshAllEdgeGraphics();
      })
      .on('end', () => {
        const node = selectedForHandles;
        if (!node) return;
        isNodeResizingRef.current = false;
        edgeDragDrawRef.current = 'orthogonal';
        if (gridSnap) {
          node.x = Math.round(node.x / 20) * 20;
          node.y = Math.round(node.y / 20) * 20;
          node.width = Math.round(node.width);
          node.height = Math.round(node.height);
          const nodeG = nodeMerge.filter((n) => n.id === node.id);
          nodeG.attr('transform', `translate(${node.x},${node.y})`);
          nodeG
            .select<SVGCircleElement>('circle.connect-port')
            .attr('cx', node.width / 2 + 2)
            .attr('cy', 0);
        }
        updateHandlePositions(node);
        refreshAllEdgeGraphics();
        onNodePositionChange?.(node.id, node.x, node.y, {
          width: node.width,
          height: node.height,
        });
      });
    handleMerge.call(resizeBehavior as any);
    if (selectedForHandles) {
      updateHandlePositions(selectedForHandles);
    }

    nodeMerge
      .on('click', (event, d) => {
        event.stopPropagation();
        onSelectNode?.(d.id);
        updateConnectPortVisibility();
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        onNodeDoubleClick?.(d.id);
      })
      .on('mouseenter', function (event, d) {
        if (isConnectionDraggingRef.current) return;
        d3.select(this)
          .select<SVGCircleElement>('circle.connect-port')
          .style('opacity', 1)
          .style('pointer-events', 'all');
      })
      .on('mouseleave', function (event, d) {
        if (d.id === selectedNodeId) return;
        d3.select(this)
          .select<SVGCircleElement>('circle.connect-port')
          .style('opacity', 0)
          .style('pointer-events', 'none');
      });

    nodeMerge.select<SVGCircleElement>('circle.connect-port').on('mousedown', function (event, d) {
      startConnectionDrag(d, event as unknown as MouseEvent);
    });

    updateConnectPortVisibility();

    const RECONNECT_THRESH = 7;
    edgeMerge
      .select<SVGPathElement>('path.edge-hit')
      .on('mousedown.reconnect', function (event: MouseEvent, d: PositionedEdge) {
        if (model.metadata.diagramType === 'sequence' || !onReconnectEdge) return;
        event.stopPropagation();
        event.preventDefault();
        removeConnectionDraftElements();
        const fromN = nodeById.get(d.from);
        if (!fromN) return;

        const startClientX = event.clientX;
        const startClientY = event.clientY;
        let dragged = false;
        let draftLine: d3.Selection<SVGLineElement, unknown, null, undefined> | null = null;
        let lineStartX = 0;
        let lineStartY = 0;
        let lineStartReady = false;

        isEdgeReconnectingRef.current = true;
        edgeDragDrawRef.current = 'straight';

        const move = (ev: MouseEvent): void => {
          if (!dragged) {
            if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) < RECONNECT_THRESH) {
              return;
            }
            dragged = true;
            draftLine = overlaysG
              .append('line')
              .attr('class', 'edge-reconnect-draft')
              .attr('stroke', '#6366f1')
              .attr('stroke-width', 2)
              .attr('stroke-dasharray', '6 4')
              .attr('pointer-events', 'none');
          }
          if (!draftLine) return;
          if (!lineStartReady) {
            const p = getCanvasPointFromClient(ev.clientX, ev.clientY);
            const fakeTo: PositionedNodeLike = {
              id: '_',
              x: p.x,
              y: p.y,
              width: 2,
              height: 2,
              shape: 'rect',
            };
            const { x1, y1 } = computeEdgeEndpointsBetweenNodes(toGeom(fromN), fakeTo, d.type);
            lineStartX = x1;
            lineStartY = y1;
            lineStartReady = true;
          }
          const p2 = getCanvasPointFromClient(ev.clientX, ev.clientY);
          draftLine.attr('x1', lineStartX).attr('y1', lineStartY).attr('x2', p2.x).attr('y2', p2.y);
          const tid = resolveTargetNodeId(ev, d.from);
          const highlight = tid && tid !== d.from ? tid : null;
          nodeMerge.classed('node-highlight', (n) => n.id === highlight);
        };

        let reconnectFinished = false;
        const finishReconnect = (ev: Event): void => {
          if (reconnectFinished) return;
          reconnectFinished = true;
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', finishReconnect, reconnectDragCapture);
          window.removeEventListener('pointerup', finishReconnect, reconnectDragCapture);
          window.removeEventListener('pointercancel', finishReconnect, reconnectDragCapture);
          reconnectMoveHandler = null;
          reconnectUpHandler = null;
          draftLine?.remove();
          nodeMerge.classed('node-highlight', false);
          isEdgeReconnectingRef.current = false;
          edgeDragDrawRef.current = 'orthogonal';
          refreshAllEdgeGraphics();
          const me = ev as MouseEvent;
          if (dragged) {
            const tid = resolveTargetNodeId(me, d.from);
            if (tid && tid !== d.from && tid !== d.to) {
              onReconnectEdge(d.edgeIndex, tid);
              reconnectSuppressClickRef.current = true;
            }
          }
        };

        reconnectMoveHandler = move;
        reconnectUpHandler = finishReconnect;
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', finishReconnect, reconnectDragCapture);
        window.addEventListener('pointerup', finishReconnect, reconnectDragCapture);
        window.addEventListener('pointercancel', finishReconnect, reconnectDragCapture);
      });

    if (!disableNodeDrag) {
      nodeMerge.call(dragBehavior as any);
    }

    // клик по фону снимает выделение
    svgSelection.on('click', () => {
      onSelectNode?.(null);
      onSelectEdge?.(null);
    });

    return () => {
      if (connectionMoveHandler) window.removeEventListener('mousemove', connectionMoveHandler);
      if (connectionUpHandler) {
        window.removeEventListener('mouseup', connectionUpHandler, connectionDragCapture);
        window.removeEventListener('pointerup', connectionUpHandler, connectionDragCapture);
        window.removeEventListener('pointercancel', connectionUpHandler, connectionDragCapture);
      }
      if (reconnectMoveHandler) window.removeEventListener('mousemove', reconnectMoveHandler);
      if (reconnectUpHandler) {
        window.removeEventListener('mouseup', reconnectUpHandler, reconnectDragCapture);
        window.removeEventListener('pointerup', reconnectUpHandler, reconnectDragCapture);
        window.removeEventListener('pointercancel', reconnectUpHandler, reconnectDragCapture);
      }
      d3.select(svg).select('g.overlays').selectAll('.edge-draft-line, .edge-reconnect-draft').remove();
      isConnectionDraggingRef.current = false;
      isEdgeReconnectingRef.current = false;
    };
  }, [
    model,
    width,
    height,
    onNodePositionChange,
    onSelectNode,
    onSelectEdge,
    selectedNodeId,
    selectedEdgeIndex,
    disableNodeDrag,
    gridSnap,
    onNodeDoubleClick,
    onEdgeDoubleClick,
    onCreateEdge,
    onReconnectEdge,
    onSequenceParticipantReorder,
  ]);

  return (
    <svg
      id={canvasId}
      ref={svgRef}
      width={width}
      height={height}
      style={{
        width: '100%',
        height: '100%',
        background: '#f3f4f6',
        borderRadius: '0',
        border: 'none',
      }}
    />
  );
};

function parseStyleStrokeWidthPx(styles: Record<string, string>): number | null {
  const raw = styles['stroke-width'] ?? styles.strokeWidth;
  if (raw === undefined || raw === '') return null;
  const n = Number.parseFloat(String(raw).replace(/px/gi, '').trim());
  return Number.isFinite(n) ? n : null;
}

function edgeLineStrokeWidthPx(styles: Record<string, string>, selected: boolean): number {
  const n = parseStyleStrokeWidthPx(styles);
  const base = n ?? 2;
  return selected ? Math.max(base, 3) : base;
}

function nodeStrokeWidthPx(
  d: PositionedNode,
  selectedId: string | undefined,
): number {
  const fromStyle = parseStyleStrokeWidthPx(d.styles);
  const base = fromStyle ?? 1.5;
  if (d.id === selectedId) {
    return Math.max(base, 2.5);
  }
  return base;
}
