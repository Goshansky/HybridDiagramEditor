import type { DiagramModel } from './model';
import { getLayoutHintDocument } from './layoutHintSync';
import { serializeEdgeLine, serializeNode } from './flowchartSync';

function formatNodeStyle(styles: Record<string, string>): string | null {
  const parts: string[] = [];
  if (styles.fill) parts.push(`fill:${styles.fill}`);
  if (styles.stroke) parts.push(`stroke:${styles.stroke}`);
  const sw = styles['stroke-width'] ?? styles.strokeWidth;
  if (sw !== undefined && sw !== '') {
    const s = typeof sw === 'number' ? `${sw}px` : String(sw);
    parts.push(`stroke-width:${s}`);
  }
  const raw = parts.join(',');
  return raw || null;
}

function buildHintDocumentFromModel(model: DiagramModel, source: string): Record<string, unknown> {
  const prev = getLayoutHintDocument(source) ?? {};
  const prevLayout =
    typeof prev.layout === 'object' && prev.layout !== null
      ? (prev.layout as Record<string, unknown>)
      : {};
  const layout: Record<string, unknown> = { ...prevLayout };
  for (const n of model.nodes) {
    if (typeof n.x === 'number' && typeof n.y === 'number') {
      const pt: Record<string, unknown> = { x: Math.round(n.x), y: Math.round(n.y) };
      if (typeof n.width === 'number') pt.width = Math.round(n.width);
      if (typeof n.height === 'number') pt.height = Math.round(n.height);
      layout[n.id] = pt;
    }
  }
  const edgeStyles: Record<string, Record<string, string>> = {};
  model.edges.forEach((e, i) => {
    if (!e.styles || Object.keys(e.styles).length === 0) return;
    edgeStyles[String(i)] = { ...e.styles };
  });
  return { ...prev, layout, edgeStyles };
}

/**
 * Полный текст flowchart из модели + объединённый JSON-хинт (layout + edgeStyles).
 * Не восстанавливает subgraph и прочие конструкции вне nodes/edges — для сложных диаграмм
 * предпочтительнее точечные правки текста (replaceEdgeTarget и т.д.).
 */
export function generateMermaidFromModel(model: DiagramModel, source: string): string {
  const dir = model.metadata.direction ?? 'TD';
  const lines: string[] = [`graph ${dir}`];
  for (const n of model.nodes) {
    lines.push(`  ${serializeNode(n.id, n.label, n.shape)}`);
  }
  for (const e of model.edges) {
    lines.push(`  ${serializeEdgeLine(e)}`);
  }
  for (const n of model.nodes) {
    const st = formatNodeStyle(n.styles);
    if (st) lines.push(`  style ${n.id} ${st}`);
  }
  const hintDoc = buildHintDocumentFromModel(model, source);
  lines.push(`%% ${JSON.stringify(hintDoc)}`);
  return lines.join('\n');
}
