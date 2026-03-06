import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { DiagramModel } from '../../parser';

interface DiagramCanvasProps {
  model: DiagramModel | null;
  width?: number;
  height?: number;
  selectedNodeId?: string;
  onSelectNode?: (id: string | null) => void;
  onNodePositionChange?: (id: string, x: number, y: number) => void;
}

type NodeShape = 'rect' | 'round' | 'diamond';

interface PositionedNode {
  id: string;
  label: string;
  shape: NodeShape;
  styles: Record<string, string>;
  x: number;
  y: number;
}

interface PositionedEdge {
  from: string;
  to: string;
  label?: string;
  type: 'arrow' | 'line';
  styles: Record<string, string>;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
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
  selectedNodeId,
  onSelectNode,
  onNodePositionChange,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
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

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => {
        rootG.attr('transform', event.transform.toString());
      });

    svgSelection.call(zoomBehavior as any);
    zoomInitializedRef.current = true;
  }, []);

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

    let edgesG = rootG.select<SVGGElement>('g.edges');
    if (edgesG.empty()) {
      edgesG = rootG.append('g').attr('class', 'edges');
    }

    let nodesG = rootG.select<SVGGElement>('g.nodes');
    if (nodesG.empty()) {
      nodesG = rootG.append('g').attr('class', 'nodes');
    }

    const layout = computeLayout(model, width, height);

    const positionedNodes: PositionedNode[] = model.nodes.map((n) => ({
      id: n.id,
      label: n.label ?? n.id,
      shape: n.shape ?? 'rect',
      styles: n.styles ?? {},
      x: layout[n.id]?.x ?? 0,
      y: layout[n.id]?.y ?? 0,
    }));

    const nodeById = new Map<string, PositionedNode>(
      positionedNodes.map((n) => [n.id, n]),
    );

    const positionedEdges: PositionedEdge[] = model.edges.map((e) => {
      const from = nodeById.get(e.from);
      const to = nodeById.get(e.to);
      const fromX = from?.x ?? 0;
      const fromY = from?.y ?? 0;
      const toX = to?.x ?? 0;
      const toY = to?.y ?? 0;
      return {
        from: e.from,
        to: e.to,
        label: e.label,
        type: e.type,
        styles: e.styles ?? {},
        fromX,
        fromY,
        toX,
        toY,
      };
    });

    // --- edges data join ---
    const edgeSelection = edgesG
      .selectAll<SVGGElement, PositionedEdge>('g.edge')
      .data(
        positionedEdges,
        (d: PositionedEdge | d3.DefaultArcObject | undefined) =>
          (d as PositionedEdge | undefined)?.from +
          '-' +
          (d as PositionedEdge | undefined)?.to +
          '-' +
          ((d as PositionedEdge | undefined)?.label ?? ''),
      );

    const edgeEnter = edgeSelection
      .enter()
      .append('g')
      .attr('class', 'edge');

    edgeEnter
      .append('line')
      .attr('class', 'edge-line')
      .attr('stroke', '#9ca3af')
      .attr('stroke-width', 1.5);

    edgeEnter
      .append('text')
      .attr('class', 'edge-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .style('font-size', '11px')
      .style('fill', '#e5e7eb');

    const edgeMerge = edgeEnter.merge(edgeSelection as any);

    edgeMerge.select<SVGLineElement>('line.edge-line').attr('x1', (d) => {
      const { x1 } = computeEdgeEndpoints(d);
      return x1;
    })
      .attr('y1', (d) => {
        const { y1 } = computeEdgeEndpoints(d);
        return y1;
      })
      .attr('x2', (d) => {
        const { x2 } = computeEdgeEndpoints(d);
        return x2;
      })
      .attr('y2', (d) => {
        const { y2 } = computeEdgeEndpoints(d);
        return y2;
      });

    edgeMerge
      .select<SVGTextElement>('text.edge-label')
      .text((d) => d.label ?? '')
      .attr('x', (d) => (d.fromX + d.toX) / 2)
      .attr('y', (d) => (d.fromY + d.toY) / 2 - 6);

    edgeSelection.exit().remove();

    // --- nodes data join ---
    const nodeSelection = nodesG
      .selectAll<SVGGElement, PositionedNode>('g.node')
      .data(positionedNodes, (d: PositionedNode | undefined) => d?.id ?? '');

    const nodeEnter = nodeSelection
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer');

    nodeEnter.each(function (d) {
      const g = d3.select<SVGGElement, PositionedNode>(this);

      const baseStroke = '#1f2937';
      const baseFill = '#0f172a';

      if (d.shape === 'diamond') {
        const w = NODE_WIDTH;
        const h = NODE_HEIGHT;
        g.append('polygon')
          .attr(
            'points',
            `0,${-h / 2} ${w / 2},0 0,${h / 2} ${-w / 2},0`,
          )
          .attr('fill', baseFill)
          .attr('stroke', baseStroke)
          .attr('stroke-width', 1.5);
      } else {
        const rx = d.shape === 'round' ? 18 : 6;
        g.append('rect')
          .attr('x', -NODE_WIDTH / 2)
          .attr('y', -NODE_HEIGHT / 2)
          .attr('width', NODE_WIDTH)
          .attr('height', NODE_HEIGHT)
          .attr('rx', rx)
          .attr('ry', rx)
          .attr('fill', baseFill)
          .attr('stroke', baseStroke)
          .attr('stroke-width', 1.5);
      }

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .style('font-size', '12px')
        .style('fill', '#e5e7eb')
        .text(d.label);
    });

    const nodeMerge = nodeEnter.merge(nodeSelection as any);

    nodeMerge.attr('transform', (d) => `translate(${d.x},${d.y})`);

    nodeMerge
      .select<SVGRectElement | SVGPolygonElement>('rect,polygon')
      .attr('fill', (d) => d.styles.fill ?? '#0f172a')
      .attr('stroke', (d) =>
        d.id === selectedNodeId ? '#f97316' : d.styles.stroke ?? '#1f2937',
      )
      .attr('stroke-width', (d) => (d.id === selectedNodeId ? 2.5 : 1.5));

    nodeSelection.exit().remove();

    // drag behavior
    const dragBehavior = d3
      .drag<SVGGElement, PositionedNode>()
      .on('start', (event) => {
        event.sourceEvent?.stopPropagation();
      })
      .on('drag', (event, d) => {
        d.x += event.dx;
        d.y += event.dy;
        d3.select<SVGGElement, PositionedNode>(event.source).attr(
          'transform',
          `translate(${d.x},${d.y})`,
        );
      })
      .on('end', (event, d) => {
        onNodePositionChange?.(d.id, d.x, d.y);
      });

    nodeMerge
      .on('click', (event, d) => {
        event.stopPropagation();
        onSelectNode?.(d.id);
      })
      .call(dragBehavior as any);

    // клик по фону снимает выделение
    svgSelection.on('click', () => {
      onSelectNode?.(null);
    });
  }, [model, width, height, onNodePositionChange, onSelectNode, selectedNodeId]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{
        width: '100%',
        height: '100%',
        background: '#020617',
        borderRadius: '8px',
        border: '1px solid #1f2937',
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

  // небольшой отступ от центра узла к границе
  const padStart = NODE_WIDTH * 0.25;
  const padEnd = NODE_WIDTH * 0.25;

  const nx = dx / length;
  const ny = dy / length;

  const x1 = fromX + nx * padStart;
  const y1 = fromY + ny * padStart;
  const x2 = toX - nx * padEnd;
  const y2 = toY - ny * padEnd;

  return { x1, y1, x2, y2 };
}

