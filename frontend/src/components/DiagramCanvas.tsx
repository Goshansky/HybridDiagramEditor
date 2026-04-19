import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { DiagramModel } from '../../parser';

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
}

const NODE_WIDTH = 110;
const NODE_HEIGHT = 46;

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

  // базовая инициализация zoom/pan
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
        if (event.type === 'wheel') return true;
        if (event.type === 'mousedown') {
          const mouseEvent = event as MouseEvent;
          return mouseEvent.button === 2;
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
  }, [zoomCommand]);

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

    const layout = computeLayout(model, width, height);

    const positionedNodes: PositionedNode[] = model.nodes.map((n) => ({
      id: n.id,
      label: n.label ?? n.id,
      shape: n.shape ?? 'rect',
      styles: n.styles ?? {},
      x: layout[n.id]?.x ?? 0,
      y: layout[n.id]?.y ?? 0,
      width: typeof n.width === 'number' && n.width > 0 ? n.width : NODE_WIDTH,
      height: typeof n.height === 'number' && n.height > 0 ? n.height : NODE_HEIGHT,
    }));

    const nodeById = new Map<string, PositionedNode>(
      positionedNodes.map((n) => [n.id, n]),
    );

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
      .append('line')
      .attr('class', 'edge-line')
      .attr('stroke', '#4b5563')
      .attr('stroke-width', 2)
      .style('pointer-events', 'none');

    edgeEnter
      .append('line')
      .attr('class', 'edge-hit')
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
    edgeMerge.each(function ensureEdgeHit(this: SVGGElement) {
      const g = d3.select(this);
      if (!g.select('line.edge-hit').empty()) return;
      g.insert('line', 'text')
        .attr('class', 'edge-hit')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 22)
        .attr('stroke-linecap', 'round')
        .style('pointer-events', 'stroke')
        .style('cursor', 'pointer');
      g.select('line.edge-line').style('pointer-events', 'none');
    });
    edgeMerge.on('click', (event, d) => {
      event.stopPropagation();
      onSelectEdge?.(d.edgeIndex);
    });
    edgeMerge.on('dblclick', (event, d) => {
      event.stopPropagation();
      onEdgeDoubleClick?.({ from: d.from, to: d.to, label: d.label, type: d.type });
    });

    const applyEdgeLineCoords = (
      sel: d3.Selection<SVGLineElement, PositionedEdge, SVGGElement, unknown>,
    ): void => {
      sel.each(function (d: PositionedEdge) {
        const { x1, y1, x2, y2 } = computeEdgeEndpoints(d);
        d3.select(this).attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
      });
    };

    applyEdgeLineCoords(edgeMerge.select<SVGLineElement>('line.edge-line'));
    edgeMerge
      .select<SVGLineElement>('line.edge-line')
      .attr('marker-end', (d) =>
        d.type === 'arrow' ? 'url(#edge-arrowhead)' : null,
      )
      .attr('stroke', (d) =>
        selectedEdgeIndex === d.edgeIndex ? '#4f46e5' : '#4b5563',
      )
      .attr('stroke-width', (d) => (selectedEdgeIndex === d.edgeIndex ? 3 : 2));

    applyEdgeLineCoords(edgeMerge.select<SVGLineElement>('line.edge-hit'));

    edgeMerge
      .select<SVGTextElement>('text.edge-label')
      .text((d) => d.label ?? '')
      .attr('x', (d) => (d.fromX + d.toX) / 2)
      .attr('y', (d) => (d.fromY + d.toY) / 2 - 6);

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

      const seqY = (_d: PositionedEdge, i: number) => 130 + i * 48;
      edgeMerge
        .select<SVGLineElement>('line.edge-line')
        .attr('y1', seqY)
        .attr('y2', seqY);
      edgeMerge
        .select<SVGLineElement>('line.edge-hit')
        .attr('y1', seqY)
        .attr('y2', seqY);
      edgeMerge
        .select<SVGTextElement>('text.edge-label')
        .attr('y', (_d, i) => 130 + i * 48 - 10);
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

      g.select<SVGTextElement>('text').text(d.label);
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

    // drag behavior
    const dragBehavior = d3
      .drag<SVGGElement, PositionedNode>()
      .on('start', (event) => {
        event.sourceEvent?.stopPropagation();
        // Визуальное выделение узла при начале перетаскивания
        d3.select<SVGGElement, PositionedNode>(event.source)
          .select<
            SVGRectElement | SVGPolygonElement | SVGCircleElement | SVGEllipseElement | SVGPathElement
          >('rect,polygon,circle,ellipse,path')
          .attr('opacity', 0.7)
          .attr('stroke-width', 3);
      })
      .on('drag', (event, d) => {
        d.x += event.dx;
        d.y += event.dy;
        // Обновление позиции в реальном времени для предпросмотра
        d3.select<SVGGElement, PositionedNode>(event.source).attr(
          'transform',
          `translate(${d.x},${d.y})`,
        );
      })
      .on('end', (event, d) => {
        // Восстановление визуального стиля
        d3.select<SVGGElement, PositionedNode>(event.source)
          .select<
            SVGRectElement | SVGPolygonElement | SVGCircleElement | SVGEllipseElement | SVGPathElement
          >('rect,polygon,circle,ellipse,path')
          .attr('opacity', 1)
          .attr('stroke-width', (n) => nodeStrokeWidthPx(n, selectedNodeId));
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

function computeEdgeEndpoints(edge: PositionedEdge): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  const { fromX, fromY, toX, toY } = edge;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;

  const padStart = getNodeRadiusAlongEdge(edge.fromShape, edge.fromW, edge.fromH);
  const padEnd = getNodeRadiusAlongEdge(edge.toShape, edge.toW, edge.toH);

  const nx = dx / length;
  const ny = dy / length;

  const x1 = fromX + nx * padStart;
  const y1 = fromY + ny * padStart;
  const x2 = toX - nx * padEnd;
  const y2 = toY - ny * padEnd;

  return { x1, y1, x2, y2 };
}

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

function getNodeRadiusAlongEdge(shape: NodeShape, w: number, h: number): number {
  if (shape === 'circle') {
    return Math.min(w, h) / 2;
  }
  if (shape === 'diamond') {
    return Math.min(w, h) * 0.45;
  }
  if (shape === 'oval') {
    return Math.max(w / 2, h / 2) * 0.9;
  }
  return Math.max(w, h) / 2;
}

