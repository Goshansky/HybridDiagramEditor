import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { DiagramModel } from '../../parser';
import {
  ARROW_TIP_GAP,
  computeEdgeEndpointsBetweenNodes,
  trimPolylineEndForArrow,
  type PositionedNodeLike,
} from './diagramCanvasGeometry';

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
}

type NodeShape = 'rect' | 'circle' | 'diamond' | 'oval' | 'parallelogram' | 'cloud';

interface PositionedNode {
  id: string;
  label: string;
  shape: NodeShape;
  styles: Record<string, string>;
  x: number;
  y: number;
  width: number;
  height: number;
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
}

const NODE_WIDTH = 110;
const NODE_HEIGHT = 46;
const NODE_LINE_HEIGHT_PX = 16;

function nodeHeightForLabel(label: string, explicitHeight?: number): number {
  if (typeof explicitHeight === 'number' && explicitHeight > 0) {
    return explicitHeight;
  }
  const lines = label.split('\n');
  if (lines.length <= 1) return NODE_HEIGHT;
  return Math.max(NODE_HEIGHT, 28 + (lines.length - 1) * NODE_LINE_HEIGHT_PX);
}

function setSvgTextMultiline(
  textSel: d3.Selection<SVGTextElement, unknown, null, undefined>,
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
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rootGroupRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const zoomInitializedRef = useRef(false);
  /** Не даём zoom перехватывать жесты во время drag узла (без снятия/повторного svg.call(zoom) — иначе сбрасывается transform). */
  const isNodeDraggingRef = useRef(false);
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
        if (event.type === 'wheel') return true;
        if (event.type === 'mousedown') {
          const mouseEvent = event as MouseEvent;
          if (mouseEvent.button !== 0) return false;
          const t = event.target as Element | null;
          if (t?.closest?.('g.node')) return false;
          if (t?.closest?.('g.edge')) return false;
          if (t?.closest?.('g.lifelines')) return false;
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

    let gridRect = rootG.select<SVGRectElement>('rect.canvas-grid');
    if (gridRect.empty()) {
      gridRect = rootG
        .insert('rect', ':first-child')
        .attr('class', 'canvas-grid')
        .attr('fill', 'url(#canvas-grid)')
        .attr('pointer-events', 'none');
    }
    gridRect
      .attr('x', -2000)
      .attr('y', -2000)
      .attr('width', 4000)
      .attr('height', 4000);

    let panHitRect = rootG.select<SVGRectElement>('rect.canvas-pan-hit');
    if (panHitRect.empty()) {
      panHitRect = rootG
        .insert('rect', 'g.edges')
        .attr('class', 'canvas-pan-hit')
        .attr('fill', 'transparent')
        .attr('pointer-events', 'all');
    }
    panHitRect.attr('x', -2000).attr('y', -2000).attr('width', 4000).attr('height', 4000);

    const fallbackLayout = computeLayout(model, width, height);

    const positionedNodes: PositionedNode[] = model.nodes.map((n) => {
      const hasXY =
        typeof n.x === 'number' &&
        typeof n.y === 'number' &&
        Number.isFinite(n.x) &&
        Number.isFinite(n.y);
      const fb = fallbackLayout[n.id];
      return {
        id: n.id,
        label: n.label ?? n.id,
        shape: n.shape ?? 'rect',
        styles: n.styles ?? {},
        x: hasXY ? n.x! : (fb?.x ?? 0),
        y: hasXY ? n.y! : (fb?.y ?? 0),
        width: typeof n.width === 'number' && n.width > 0 ? n.width : NODE_WIDTH,
        height: nodeHeightForLabel(n.label ?? n.id, n.height),
      };
    });

    const nodeById = new Map<string, PositionedNode>(
      positionedNodes.map((n) => [n.id, n]),
    );

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

    const positionedEdges: PositionedEdge[] = model.edges.map((e, edgeIndex) => {
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
        d.type === 'arrow' ? 'url(#edge-arrowhead)' : null,
      )
      .attr('stroke', (d) =>
        selectedEdgeIndex === d.edgeIndex
          ? '#4f46e5'
          : (d.styles.stroke ?? '#4b5563'),
      )
      .attr('stroke-width', (d) => (selectedEdgeIndex === d.edgeIndex ? 3 : 2))
      .attr('stroke-dasharray', (d) => d.styles['stroke-dasharray'] ?? null);

    edgeMerge.select<SVGTextElement>('text.edge-label').text((d) => d.label ?? '');

    refreshAllEdgeGraphics();

    edgeSelection.exit().remove();

    // Sequence diagram rendering (MVP): lifelines + vertical stacking of messages.
    if (model.metadata.diagramType === 'sequence') {
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
      .data<PositionedNode>(positionedNodes, (d) => d.id);

    const nodeEnter = nodeSelection
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer');

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
        SVGRectElement | SVGPolygonElement | SVGCircleElement | SVGEllipseElement | SVGPathElement,
        PositionedNode
      >('rect,polygon,circle,ellipse,path')
        .remove();

      const w = d.width;
      const h = d.height;

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

      setSvgTextMultiline(g.select<SVGTextElement>('text'), d.label);
    });

    nodeMerge.attr('transform', (d) => `translate(${d.x},${d.y})`);

    nodeMerge
      .select<
        SVGRectElement | SVGPolygonElement | SVGCircleElement | SVGEllipseElement | SVGPathElement
      >('rect,polygon,circle,ellipse,path')
      .attr('fill', (d) => d.styles.fill ?? '#ffffff')
      .attr('stroke', (d) =>
        d.id === selectedNodeId ? '#4f46e5' : d.styles.stroke ?? '#4f46e5',
      )
      .attr('stroke-width', (d) => nodeStrokeWidthPx(d, selectedNodeId));

    nodeSelection.exit().remove();

    // drag behavior (this = <g class="node">; не использовать event.source — в D3DragEvent его нет)
    const dragBehavior = d3
      .drag<SVGGElement, PositionedNode>()
      .on('start', function (event) {
        event.sourceEvent?.stopPropagation();
        isNodeDraggingRef.current = true;
        edgeDragDrawRef.current = 'straight';
        d3.select<SVGGElement, PositionedNode>(this)
          .select<
            SVGRectElement | SVGPolygonElement | SVGCircleElement | SVGEllipseElement | SVGPathElement
          >('rect,polygon,circle,ellipse,path')
          .attr('opacity', 0.7)
          .attr('stroke-width', 3);
      })
      .on('drag', function (event, d) {
        const k = d3.zoomTransform(svg).k || 1;
        d.x += event.dx / k;
        d.y += event.dy / k;
        d3.select<SVGGElement, PositionedNode>(this).attr(
          'transform',
          `translate(${d.x},${d.y})`,
        );
        refreshAllEdgeGraphics();
      })
      .on('end', function (event, d) {
        isNodeDraggingRef.current = false;
        edgeDragDrawRef.current = 'orthogonal';
        d3.select<SVGGElement, PositionedNode>(this)
          .select<
            SVGRectElement | SVGPolygonElement | SVGCircleElement | SVGEllipseElement | SVGPathElement
          >('rect,polygon,circle,ellipse,path')
          .attr('opacity', 1)
          .attr('stroke-width', (n) => nodeStrokeWidthPx(n, selectedNodeId));
        refreshAllEdgeGraphics();
        onNodePositionChange?.(d.id, d.x, d.y, { width: d.width, height: d.height });
      });

    nodeMerge
      .on('click', (event, d) => {
        event.stopPropagation();
        onSelectNode?.(d.id);
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        onNodeDoubleClick?.(d.id);
      });
    if (!disableNodeDrag) {
      nodeMerge.call(dragBehavior as any);
    }

    // клик по фону снимает выделение
    svgSelection.on('click', () => {
      onSelectNode?.(null);
      onSelectEdge?.(null);
    });
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
    onNodeDoubleClick,
    onEdgeDoubleClick,
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
