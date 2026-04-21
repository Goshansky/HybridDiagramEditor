import type { DiagramModel, DiagramNodeModel } from './model';
import { buildHintDocumentFromModel } from './generateMermaid';
import { estimateErEntitySize, type EntityAttribute } from './erModel';

function attrLine(a: EntityAttribute): string {
  return `${a.type} ${a.name}${a.keyType ? ` ${a.keyType}` : ''}`;
}

function formatStyle(styles: Record<string, string>): string | null {
  const parts: string[] = [];
  if (styles.fill) parts.push(`fill:${styles.fill}`);
  if (styles.stroke) parts.push(`stroke:${styles.stroke}`);
  const sw = styles['stroke-width'] ?? styles.strokeWidth;
  if (sw !== undefined && sw !== '') {
    const s = typeof sw === 'number' ? `${sw}px` : String(sw);
    parts.push(`stroke-width:${s}`);
  }
  return parts.length ? parts.join(',') : null;
}

function asErNodes(model: DiagramModel): DiagramNodeModel[] {
  return model.nodes.filter((n) => n.shape === 'er_box');
}

function syncErNodeSizes(model: DiagramModel): void {
  for (const n of asErNodes(model)) {
    if (!n.erEntity) continue;
    const { width, height } = estimateErEntitySize(n.erEntity);
    n.width = width;
    n.height = height;
  }
}

export function generateERDiagramMermaid(model: DiagramModel, source: string): string {
  const lines: string[] = ['erDiagram'];

  for (const n of asErNodes(model)) {
    const ent = n.erEntity;
    if (!ent) continue;
    lines.push(`  ${ent.id} {`);
    for (const a of ent.attributes) {
      lines.push(`    ${attrLine(a)}`);
    }
    lines.push('  }');
  }

  for (const e of model.edges) {
    const left = (e.erLeftCard ?? '||').trim() || '||';
    const right = (e.erRightCard ?? 'o{').trim() || 'o{';
    const label = e.label?.trim() ? ` : ${e.label.trim()}` : '';
    lines.push(`  ${e.from} ${left}--${right} ${e.to}${label}`);
  }

  for (const n of asErNodes(model)) {
    const st = formatStyle(n.styles ?? {});
    if (st) lines.push(`  style ${n.id} ${st}`);
  }

  syncErNodeSizes(model);
  const hintDoc = buildHintDocumentFromModel(model, source);
  lines.push(`%% ${JSON.stringify(hintDoc)}`);
  return lines.join('\n');
}

