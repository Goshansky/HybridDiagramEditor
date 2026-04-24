/**
 * Рендер sequenceDiagram в SVG (g.sequence-layer).
 */
import * as d3 from 'd3';
import {
  getOrderedParticipantIds,
  type SequenceDiagramData,
  type SequenceMessage,
  type SequenceNote,
  type SequenceStatement,
} from '../../parser/sequenceModel';

const COL_W = 200;
const HEADER_H = 44;
const ROW_H = 44;
const MSG_LABEL_GAP = 14;
const TOP_MARGIN = 24;
const LEFT_MARGIN = 48;
const NOTE_MIN_H = 52;
const BLOCK_LABEL_H = 22;
const FRAGMENT_PAD = 10;

type FlatItem =
  | { kind: 'msg'; depth: number; msg: SequenceMessage }
  | { kind: 'note'; depth: number; note: SequenceNote }
  | { kind: 'act'; depth: number; who: string; on: boolean }
  | { kind: 'hdr'; depth: number; block: string; label?: string }
  | { kind: 'else'; depth: number; label?: string }
  | { kind: 'and'; depth: number; label?: string }
  | { kind: 'option'; depth: number; label?: string }
  | { kind: 'ftr'; depth: number };

function flattenStatements(stmts: SequenceStatement[], depth: number, acc: FlatItem[]): void {
  for (const s of stmts) {
    switch (s.kind) {
      case 'message':
        acc.push({ kind: 'msg', depth, msg: s.message });
        break;
      case 'activate':
        acc.push({ kind: 'act', depth, who: s.participant, on: true });
        break;
      case 'deactivate':
        acc.push({ kind: 'act', depth, who: s.participant, on: false });
        break;
      case 'note':
        acc.push({ kind: 'note', depth, note: s.note });
        break;
      case 'alt': {
        acc.push({ kind: 'hdr', depth, block: 'alt', label: s.branches[0]?.label });
        flattenStatements(s.branches[0]?.body ?? [], depth + 1, acc);
        for (let i = 1; i < s.branches.length; i++) {
          acc.push({ kind: 'else', depth, label: s.branches[i]?.label });
          flattenStatements(s.branches[i]!.body, depth + 1, acc);
        }
        acc.push({ kind: 'ftr', depth });
        break;
      }
      case 'opt':
        acc.push({ kind: 'hdr', depth, block: 'opt', label: s.label });
        flattenStatements(s.body, depth + 1, acc);
        acc.push({ kind: 'ftr', depth });
        break;
      case 'loop':
        acc.push({ kind: 'hdr', depth, block: 'loop', label: s.label });
        flattenStatements(s.body, depth + 1, acc);
        acc.push({ kind: 'ftr', depth });
        break;
      case 'par': {
        acc.push({ kind: 'hdr', depth, block: 'par', label: s.branches[0]?.label });
        flattenStatements(s.branches[0]?.body ?? [], depth + 1, acc);
        for (let i = 1; i < s.branches.length; i++) {
          acc.push({ kind: 'and', depth, label: s.branches[i]?.label });
          flattenStatements(s.branches[i]!.body, depth + 1, acc);
        }
        acc.push({ kind: 'ftr', depth });
        break;
      }
      case 'critical': {
        acc.push({ kind: 'hdr', depth, block: 'critical', label: s.branches[0]?.label });
        flattenStatements(s.branches[0]?.body ?? [], depth + 1, acc);
        for (let i = 1; i < s.branches.length; i++) {
          acc.push({ kind: 'option', depth, label: s.branches[i]?.label });
          flattenStatements(s.branches[i]!.body, depth + 1, acc);
        }
        acc.push({ kind: 'ftr', depth });
        break;
      }
      case 'break':
        acc.push({ kind: 'hdr', depth, block: 'break', label: s.label });
        flattenStatements(s.body, depth + 1, acc);
        acc.push({ kind: 'ftr', depth });
        break;
      default:
        break;
    }
  }
}

function noteHeight(text: string): number {
  const lines = text.split('\n').length || 1;
  return Math.max(NOTE_MIN_H, 16 + lines * 14);
}

function arrowDashArray(arrow: SequenceMessage['arrow']): string | null {
  switch (arrow) {
    case 'dashed-arrow':
    case 'dashed-open':
    case 'dashed-cross':
      return '6 4';
    default:
      return null;
  }
}

function useArrowhead(arrow: SequenceMessage['arrow']): boolean {
  return arrow === 'solid-arrow' || arrow === 'dashed-arrow';
}

function useCross(arrow: SequenceMessage['arrow']): boolean {
  return arrow === 'solid-cross' || arrow === 'dashed-cross';
}

/** Центр линии жизни по id; если id не найден — по label или ближайшему совпадению (избегает кучи в x=48). */
function resolveCenterX(
  id: string,
  participants: { id: string; label: string }[],
  cx: Map<string, number>,
): number {
  const d = cx.get(id);
  if (d !== undefined && Number.isFinite(d)) return d;
  const byId = participants.find((p) => p.id === id);
  if (byId) return cx.get(byId.id) ?? LEFT_MARGIN + COL_W / 2;
  const byLabel = participants.find((p) => p.label === id || p.label.trim() === id.trim());
  if (byLabel) return cx.get(byLabel.id) ?? LEFT_MARGIN + COL_W / 2;
  return LEFT_MARGIN + COL_W / 2;
}

type ParticipantDragDatum = { id: string; index: number };

function ensureSequenceArrowMarker(
  seqG: d3.Selection<SVGGElement, unknown, null, undefined>,
): void {
  const svg = seqG.node()?.ownerSVGElement;
  if (!svg) return;
  const svgSel = d3.select(svg);
  let defs = svgSel.select<SVGDefsElement>('defs.diagram-defs');
  if (defs.empty()) {
    defs = svgSel.append('defs').attr('class', 'diagram-defs');
  }
  if (!defs.select<SVGMarkerElement>('#sequence-arrowhead').empty()) return;
  defs
    .append('marker')
    .attr('id', 'sequence-arrowhead')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 10)
    .attr('refY', 5)
    .attr('markerWidth', 7)
    .attr('markerHeight', 7)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', '#334155')
    .attr('stroke', '#334155')
    .attr('stroke-width', 1.2);
}

export function renderSequenceDiagram(
  seqG: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: SequenceDiagramData,
  options: {
    width: number;
    baseHeight: number;
    autonumber: boolean;
    onParticipantReorder?: (orderedIds: string[]) => void;
    onParticipantDragActive?: (active: boolean) => void;
  },
): number {
  seqG.selectAll('*').remove();
  ensureSequenceArrowMarker(seqG);

  const flat: FlatItem[] = [];
  flattenStatements(data.statements, 0, flat);

  const orderedIds = getOrderedParticipantIds(data);
  const cx = new Map<string, number>();
  orderedIds.forEach((id, i) => {
    cx.set(id, LEFT_MARGIN + i * COL_W + COL_W / 2);
  });

  const contentW = Math.max(
    options.width,
    LEFT_MARGIN * 2 + Math.max(orderedIds.length, 1) * COL_W,
  );

  let y = TOP_MARGIN + HEADER_H + 16;
  const rowYs: { item: FlatItem; y: number; h: number }[] = [];

  for (const item of flat) {
    if (item.kind === 'hdr') {
      rowYs.push({ item, y, h: BLOCK_LABEL_H });
      y += BLOCK_LABEL_H;
      continue;
    }
    if (item.kind === 'else' || item.kind === 'and' || item.kind === 'option') {
      rowYs.push({ item, y, h: 20 });
      y += 20;
      continue;
    }
    if (item.kind === 'ftr') {
      y += 14;
      continue;
    }
    if (item.kind === 'msg') {
      rowYs.push({ item, y, h: ROW_H });
      y += ROW_H;
      continue;
    }
    if (item.kind === 'note') {
      const h = noteHeight(item.note.text);
      rowYs.push({ item, y, h });
      y += h + 12;
      continue;
    }
    if (item.kind === 'act') {
      rowYs.push({ item, y, h: 10 });
      y += 10;
    }
  }

  const flatIndexToRow = new Map<number, { y: number; h: number }>();
  {
    let ri = 0;
    for (let fi = 0; fi < flat.length; fi += 1) {
      if (flat[fi]!.kind === 'ftr') continue;
      const row = rowYs[ri];
      if (row) flatIndexToRow.set(fi, { y: row.y, h: row.h });
      ri += 1;
    }
  }

  const fragmentRanges: { top: number; bottom: number; depth: number }[] = [];
  {
    const stack: { flatIdx: number; depth: number }[] = [];
    for (let fi = 0; fi < flat.length; fi += 1) {
      const it = flat[fi]!;
      if (it.kind === 'hdr') {
        stack.push({ flatIdx: fi, depth: it.depth });
      } else if (it.kind === 'ftr') {
        const popped = stack.pop();
        if (!popped) continue;
        const start = flatIndexToRow.get(popped.flatIdx);
        let lastFi = fi - 1;
        while (lastFi > popped.flatIdx && flat[lastFi]!.kind === 'ftr') lastFi -= 1;
        const endRow = flatIndexToRow.get(lastFi);
        if (start && endRow) {
          const top = start.y;
          const bottom = Math.max(endRow.y + endRow.h + 6, start.y + start.h + 12);
          if (bottom > top) {
            fragmentRanges.push({
              top,
              bottom,
              depth: popped.depth,
            });
          }
        }
      }
    }
  }

  const totalH = Math.max(options.baseHeight, y + 48);

  seqG
    .append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', contentW)
    .attr('height', totalH)
    .attr('fill', '#fafafa')
    .attr('stroke', 'none');

  const frag = seqG.append('g').attr('class', 'sequence-fragments');
  for (const fr of fragmentRanges) {
    const inset = FRAGMENT_PAD + fr.depth * 8;
    frag
      .append('rect')
      .attr('x', LEFT_MARGIN + inset)
      .attr('y', fr.top)
      .attr('width', contentW - 2 * (LEFT_MARGIN + inset))
      .attr('height', fr.bottom - fr.top)
      .attr('rx', 6)
      .attr('fill', 'rgba(148, 163, 184, 0.08)')
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1.2);
  }

  const lineY2Local = totalH - 16 - TOP_MARGIN;
  orderedIds.forEach((id, i) => {
    const xBase = LEFT_MARGIN + i * COL_W;
    const p = data.participants.find((q) => q.id === id)!;
    const styles = data.participantStyles[id] ?? {};
    const fill = styles.fill ?? '#ffffff';
    const stroke = styles.stroke ?? '#94a3b8';
    const sw = styles['stroke-width'] ? String(styles['stroke-width']) : '1.5px';

    const pg = seqG
      .append('g')
      .attr('class', 'sequence-participant')
      .attr('data-participant-id', id)
      .datum({ id, index: i } satisfies ParticipantDragDatum)
      .attr('transform', `translate(${xBase}, ${TOP_MARGIN})`)
      .style('cursor', options.onParticipantReorder ? 'grab' : 'default');

    pg.append('rect')
      .attr('x', 4)
      .attr('y', 0)
      .attr('width', COL_W - 8)
      .attr('height', HEADER_H - 4)
      .attr('rx', 4)
      .attr('fill', fill)
      .attr('stroke', stroke)
      .attr('stroke-width', sw);

    pg.append('text')
      .attr('x', COL_W / 2)
      .attr('y', HEADER_H / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .style('font-size', '12px')
      .style('font-weight', '600')
      .style('fill', '#0f172a')
      .style('pointer-events', 'none')
      .text(p.label.length > 22 ? `${p.label.slice(0, 22)}…` : p.label);

    pg.append('line')
      .attr('x1', COL_W / 2)
      .attr('x2', COL_W / 2)
      .attr('y1', HEADER_H)
      .attr('y2', lineY2Local)
      .attr('stroke', '#64748b')
      .attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '5 4')
      .style('pointer-events', 'none');

    if (options.onParticipantReorder) {
      const dragAcc = { dx: 0 };
      const reorder = options.onParticipantReorder;
      const onDrag = options.onParticipantDragActive;
      pg.call(
        d3
          .drag<SVGGElement, ParticipantDragDatum>()
          .on('start', function () {
            dragAcc.dx = 0;
            onDrag?.(true);
            d3.select(this).style('cursor', 'grabbing').raise();
          })
          .on('drag', function (event, d) {
            dragAcc.dx += event.dx;
            d3.select(this).attr(
              'transform',
              `translate(${xBase + dragAcc.dx}, ${TOP_MARGIN})`,
            );
          })
          .on('end', function (event, d) {
            d3.select(this).style('cursor', 'grab');
            onDrag?.(false);
            const centerAbs =
              xBase + COL_W / 2 + dragAcc.dx;
            let newIdx = Math.round(
              (centerAbs - LEFT_MARGIN - COL_W / 2) / COL_W,
            );
            newIdx = Math.max(0, Math.min(orderedIds.length - 1, newIdx));
            const next = [...orderedIds];
            const [item] = next.splice(d.index, 1);
            next.splice(newIdx, 0, item);
            d3.select(this).attr('transform', `translate(${xBase}, ${TOP_MARGIN})`);
            const changed = next.some((pid, idx) => pid !== orderedIds[idx]);
            if (changed) reorder(next);
          }),
      );
    }
  });

  /** LIFO стек открытых Y по участнику (активации). */
  const actStack = new Map<string, number[]>();
  const lastIncomingY = new Map<string, number>();
  const lastOutgoingY = new Map<string, number>();
  const pushAct = (who: string, openY: number): void => {
    const a = actStack.get(who) ?? [];
    a.push(openY);
    actStack.set(who, a);
  };
  const popAct = (who: string): number | undefined => {
    const a = actStack.get(who);
    if (!a?.length) return undefined;
    const y = a.pop()!;
    if (a.length === 0) actStack.delete(who);
    else actStack.set(who, a);
    return y;
  };

  let autonum = 0;
  for (const { item, y: rowY, h } of rowYs) {
    const yy =
      rowY +
      (item.kind === 'msg'
        ? ROW_H / 2
        : item.kind === 'note'
          ? 14
          : item.kind === 'act'
            ? 5
            : 0);

    if (item.kind === 'hdr') {
      seqG
        .append('text')
        .attr('x', LEFT_MARGIN + item.depth * 12)
        .attr('y', rowY + 14)
        .style('font-size', '11px')
        .style('font-weight', '700')
        .style('fill', '#334155')
        .text(`${item.block}${item.label ? ` ${item.label}` : ''}`);
      seqG
        .append('line')
        .attr('x1', LEFT_MARGIN)
        .attr('x2', contentW - LEFT_MARGIN)
        .attr('y1', rowY + BLOCK_LABEL_H - 2)
        .attr('y2', rowY + BLOCK_LABEL_H - 2)
        .attr('stroke', '#cbd5e1')
        .attr('stroke-width', 1);
      continue;
    }

    if (item.kind === 'else') {
      seqG
        .append('text')
        .attr('x', LEFT_MARGIN + item.depth * 12)
        .attr('y', rowY + 14)
        .style('font-size', '10px')
        .style('font-style', 'italic')
        .style('fill', '#64748b')
        .text(`else${item.label ? ` ${item.label}` : ''}`);
      continue;
    }

    if (item.kind === 'and') {
      seqG
        .append('text')
        .attr('x', LEFT_MARGIN + item.depth * 12)
        .attr('y', rowY + 14)
        .style('font-size', '10px')
        .style('font-weight', '600')
        .style('fill', '#64748b')
        .text(`and${item.label ? ` ${item.label}` : ''}`);
      continue;
    }

    if (item.kind === 'option') {
      seqG
        .append('text')
        .attr('x', LEFT_MARGIN + item.depth * 12)
        .attr('y', rowY + 14)
        .style('font-size', '10px')
        .style('fill', '#64748b')
        .text(`option${item.label ? ` ${item.label}` : ''}`);
      continue;
    }

    if (item.kind === 'msg') {
      const m = item.msg;
      autonum += 1;
      const x1 = resolveCenterX(m.from, data.participants, cx);
      const x2 = resolveCenterX(m.to, data.participants, cx);
      const labelY = yy - MSG_LABEL_GAP;
      let label = m.label;
      if (options.autonumber) {
        label = `${autonum}. ${label}`;
      }

      if (m.from === m.to) {
        lastIncomingY.set(m.to, yy);
        lastOutgoingY.set(m.from, yy);
        const loopW = 42;
        const loopH = 26;
        const startX = x1;
        const startY = yy;
        const endX = x1;
        const endY = yy + loopH;
        const loopPath = `M ${startX} ${startY} L ${startX + loopW} ${startY} L ${startX + loopW} ${endY} L ${endX} ${endY}`;
        const showHead = useArrowhead(m.arrow) && !useCross(m.arrow);
        seqG
          .append('path')
          .attr('d', loopPath)
          .attr('fill', 'none')
          .attr('stroke', '#334155')
          .attr('stroke-width', 1.5)
          .attr('marker-end', showHead ? 'url(#sequence-arrowhead)' : null)
          .attr('stroke-dasharray', arrowDashArray(m.arrow));
        if (useCross(m.arrow)) {
          seqG
            .append('path')
            .attr(
              'd',
              `M ${endX - 4} ${endY - 4} L ${endX + 4} ${endY + 4} M ${endX + 4} ${endY - 4} L ${endX - 4} ${endY + 4}`,
            )
            .attr('stroke', '#334155')
            .attr('stroke-width', 1.5);
        }
      } else {
        lastOutgoingY.set(m.from, yy);
        lastIncomingY.set(m.to, yy);
        const showArrowHead = useArrowhead(m.arrow) && !useCross(m.arrow);
        seqG
          .append('line')
          .attr('x1', x1)
          .attr('y1', yy)
          .attr('x2', x2)
          .attr('y2', yy)
          .attr('stroke', '#334155')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', arrowDashArray(m.arrow))
          .attr('marker-end', showArrowHead ? 'url(#sequence-arrowhead)' : null);

        if (useCross(m.arrow)) {
          const endX = x2 > x1 ? x2 - 6 : x2 + 6;
          seqG
            .append('path')
            .attr(
              'd',
              `M ${endX - 4} ${yy - 4} L ${endX + 4} ${yy + 4} M ${endX + 4} ${yy - 4} L ${endX - 4} ${yy + 4}`,
            )
            .attr('stroke', '#334155')
            .attr('stroke-width', 1.5);
        }
      }

      seqG
        .append('text')
        .attr('x', m.from === m.to ? x1 + 20 : (x1 + x2) / 2)
        .attr('y', labelY)
        .attr('text-anchor', 'middle')
        .style('font-size', '11px')
        .style('fill', '#1e293b')
        .text(label.length > 80 ? `${label.slice(0, 80)}…` : label);

      if (m.activation === 'activate') {
        pushAct(m.to, yy);
      } else if (m.activation === 'deactivate') {
        const oy = popAct(m.from);
        if (oy !== undefined) {
          const xi = resolveCenterX(m.from, data.participants, cx) - 5;
          seqG
            .append('rect')
            .attr('x', xi)
            .attr('y', oy)
            .attr('width', 10)
            .attr('height', Math.max(8, yy - oy))
            .attr('fill', 'rgba(79, 70, 229, 0.25)')
            .attr('stroke', '#4f46e5')
            .attr('stroke-width', 1);
        }
      }
      continue;
    }

    if (item.kind === 'note') {
      const n = item.note;
      const lines = n.text.split('\n');
      let nx = LEFT_MARGIN;
      const noteW = 200;
      if (n.placement === 'over' && n.participants.length >= 1) {
        const xs = n.participants.map((id) => resolveCenterX(id, data.participants, cx));
        const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
        nx = mid - noteW / 2;
      } else if (n.placement === 'left' && n.participants[0]) {
        nx = resolveCenterX(n.participants[0], data.participants, cx) - COL_W / 2 - noteW - 12;
      } else if (n.placement === 'right' && n.participants[0]) {
        nx = resolveCenterX(n.participants[0], data.participants, cx) + COL_W / 2 + 12;
      }
      nx = Math.max(12, Math.min(nx, contentW - noteW - 12));
      const nh = h;
      seqG
        .append('rect')
        .attr('x', nx)
        .attr('y', rowY)
        .attr('width', noteW)
        .attr('height', nh)
        .attr('rx', 4)
        .attr('fill', '#fef9c3')
        .attr('stroke', '#ca8a04')
        .attr('stroke-width', 1);
      lines.forEach((ln, li) => {
        seqG
          .append('text')
          .attr('x', nx + 8)
          .attr('y', rowY + 18 + li * 14)
          .style('font-size', '11px')
          .style('fill', '#422006')
          .text(ln.length > 42 ? `${ln.slice(0, 42)}…` : ln);
      });
      continue;
    }

    if (item.kind === 'act') {
      const pid = item.who;
      const xi = resolveCenterX(pid, data.participants, cx) - 5;
      if (item.on) {
        // Для отдельного `activate X` привязываем старт к последней входящей стрелке в X.
        const openY = lastIncomingY.get(pid) ?? yy;
        pushAct(pid, openY);
      } else {
        // Для отдельного `deactivate X` привязываем конец к последней исходящей стрелке из X.
        const closeY = lastOutgoingY.get(pid) ?? yy;
        const oy = popAct(pid);
        if (oy !== undefined) {
          seqG
            .append('rect')
            .attr('x', xi)
            .attr('y', oy)
            .attr('width', 10)
            .attr('height', Math.max(8, closeY - oy))
            .attr('fill', 'rgba(79, 70, 229, 0.2)')
            .attr('stroke', '#4f46e5')
            .attr('stroke-width', 1);
        }
      }
    }
  }

  return totalH;
}
