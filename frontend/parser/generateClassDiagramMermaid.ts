import type {
  ClassBoxModel,
  ClassFieldModel,
  ClassMethodModel,
  DiagramEdgeModel,
  DiagramModel,
} from './model';
import { buildHintDocumentFromModel } from './generateMermaid';
import { estimateClassBoxSize } from './classDiagram';
import { formatLayoutHintBlock } from './layoutHintSync';

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

const REL_PAT: Record<NonNullable<DiagramEdgeModel['classRelation']>, string> = {
  inheritance: '<|--',
  implementation: '<|..',
  composition: '*--',
  aggregation: 'o--',
  association: '-->',
  dependency: '..>',
  bidirectional: '--',
};

function formatLeft(id: string, mult?: string): string {
  return mult?.trim() ? `${id} "${mult}"` : id;
}

function formatRight(id: string, mult?: string): string {
  return mult?.trim() ? `"${mult}" ${id}` : id;
}

/** Строка связи classDiagram, согласованная с parseRelationLine в classDiagram.ts. */
export function serializeClassEdgeLine(e: DiagramEdgeModel): string {
  const k = e.classRelation ?? 'association';
  const pat = REL_PAT[k];
  if (!pat) return '';

  let leftStr: string;
  let rightStr: string;
  if (k === 'inheritance' || k === 'implementation') {
    leftStr = formatLeft(e.to, e.fromMultiplicity);
    rightStr = formatRight(e.from, e.toMultiplicity);
  } else {
    leftStr = formatLeft(e.from, e.fromMultiplicity);
    rightStr = formatRight(e.to, e.toMultiplicity);
  }

  const labelPart = e.label?.trim() ? ` : ${e.label.trim()}` : '';
  return `  ${leftStr} ${pat} ${rightStr}${labelPart}`;
}

function serializeField(f: ClassFieldModel): string {
  const st = f.isStatic ? '$' : '';
  return `${st}${f.visibility}${f.name}: ${f.type}`;
}

function serializeMethod(m: ClassMethodModel): string {
  const st = m.isStatic ? '$' : '';
  const abs = m.isAbstract ? '*' : '';
  const params = m.params.map((p) => `${p.name}: ${p.type}`).join(', ');
  return `${st}${m.visibility}${m.name}(${params}) ${m.returnType}${abs}`;
}

function serializeClassBlock(box: ClassBoxModel): string[] {
  const inner: string[] = [];
  if (box.stereotype?.trim()) {
    inner.push(`<<${box.stereotype.trim()}>>`);
  }
  for (const f of box.fields) {
    inner.push(serializeField(f));
  }
  for (const m of box.methods) {
    inner.push(serializeMethod(m));
  }
  return inner;
}

function syncClassNodeSizes(model: DiagramModel): void {
  for (const n of model.nodes) {
    if (n.shape === 'class_box' && n.classBox) {
      const { width, height } = estimateClassBoxSize(n.classBox);
      n.width = width;
      n.height = height;
    }
  }
}

/**
 * Полный текст classDiagram из модели + объединённый JSON-хинт (layout + edgeStyles).
 */
export function generateClassDiagramMermaid(model: DiagramModel, source: string): string {
  const lines: string[] = ['classDiagram'];

  for (const n of model.nodes) {
    if (n.shape !== 'class_box' || !n.classBox) continue;
    const box = n.classBox;
    const body = serializeClassBlock(box);
    if (body.length === 0) {
      lines.push(`  class ${n.id}`);
    } else {
      lines.push(`  class ${n.id} {`);
      for (const ln of body) {
        lines.push(`    ${ln}`);
      }
      lines.push(`  }`);
    }
  }

  for (const e of model.edges) {
    lines.push(serializeClassEdgeLine(e));
  }

  if (model.classNotes?.length) {
    for (const note of model.classNotes) {
      const tid = note.targetClassId;
      if (!tid) continue;
      if (note.placement === 'left' || note.placement === 'right') {
        const t = note.text.replace(/\n/g, ' ');
        lines.push(`  note ${note.placement} of ${tid} : ${t}`);
      } else if (note.text) {
        lines.push(`  note for ${tid} "${note.text.replace(/"/g, '\\"')}"`);
      }
    }
  }

  for (const n of model.nodes) {
    if (n.shape !== 'class_box') continue;
    const st = formatNodeStyle(n.styles ?? {});
    if (st) lines.push(`  style ${n.id} ${st}`);
  }

  syncClassNodeSizes(model);
  const hintDoc = buildHintDocumentFromModel(model, source);
  lines.push(...formatLayoutHintBlock(hintDoc));
  return lines.join('\n');
}
