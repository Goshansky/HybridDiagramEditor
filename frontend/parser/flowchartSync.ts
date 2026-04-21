import type { DiagramEdgeModel } from './model';
import type { NodeShape } from './ast';

export type FlowNodeShape = NodeShape;

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function serializeNode(id: string, label: string, shape: FlowNodeShape): string {
  if (shape === 'diamond') return `${id}{${label}}`;
  if (shape === 'circle') return `${id}((${label}))`;
  if (shape === 'oval') return `${id}([${label}])`;
  if (shape === 'parallelogram') return `${id}[[${label}]]`;
  if (shape === 'cloud') return `${id}[(${label})]`;
  return `${id}[${label}]`;
}

export function replaceNodeDefinition(
  source: string,
  nodeId: string,
  label: string,
  shape: FlowNodeShape,
): string {
  const lines = source.split(/\r?\n/);
  const shapeBody =
    '(\\[[^\\]]*\\]|\\{[^}]*\\}|\\(\\([^)]*\\)\\)|\\(\\[[^\\]]*\\]\\)|\\[\\[[^\\]]*\\]\\]|\\[\\([^)]*\\)\\]|>[^\\]]*\\])';
  const lineNodePattern = new RegExp(`^\\s*${escapeRegExp(nodeId)}\\s*${shapeBody}\\s*$`);
  const bareNodePattern = new RegExp(`^\\s*${escapeRegExp(nodeId)}\\s*$`);
  const shapeOnlyPattern = new RegExp(
    `^\\s*(?:\\[\\s*${escapeRegExp(nodeId)}\\s*\\]|\\{\\s*${escapeRegExp(nodeId)}\\s*\\}|\\(\\(\\s*${escapeRegExp(nodeId)}\\s*\\)\\)|\\(\\[\\s*${escapeRegExp(nodeId)}\\s*\\]\\)|\\[\\[\\s*${escapeRegExp(nodeId)}\\s*\\]\\]|\\[\\(\\s*${escapeRegExp(nodeId)}\\s*\\)\\]|>\\s*${escapeRegExp(nodeId)}\\s*\\])\\s*$`,
  );
  const replacement = serializeNode(nodeId, label, shape);
  const idx = lines.findIndex((line) => lineNodePattern.test(line));
  if (idx >= 0) {
    const indent = lines[idx].match(/^(\s*)/)?.[1] ?? '';
    lines[idx] = `${indent}${replacement}`;
    return lines.join('\n');
  }
  const bareIdx = lines.findIndex((line) => bareNodePattern.test(line));
  if (bareIdx >= 0) {
    const indent = lines[bareIdx].match(/^(\s*)/)?.[1] ?? '';
    lines[bareIdx] = `${indent}${replacement}`;
    return lines.join('\n');
  }
  const shapeOnlyIdx = lines.findIndex((line) => shapeOnlyPattern.test(line));
  if (shapeOnlyIdx >= 0) {
    const indent = lines[shapeOnlyIdx].match(/^(\s*)/)?.[1] ?? '';
    lines[shapeOnlyIdx] = `${indent}${replacement}`;
    return lines.join('\n');
  }
  return `${source.trimEnd()}\n  ${replacement}`;
}

export function replaceEdgeDefinition(
  source: string,
  edge: { from: string; to: string; label?: string; type: 'arrow' | 'line' },
  newLabel: string,
): string {
  const lines = source.split(/\r?\n/);
  const op = edge.type === 'line' ? '---' : '-->';
  const from = escapeRegExp(edge.from);
  const to = escapeRegExp(edge.to);
  const hasCurrentLabel = edge.label !== undefined && edge.label !== '';
  const exactPattern = hasCurrentLabel
    ? new RegExp(
        `\\b${from}\\b\\s*${escapeRegExp(op)}\\|${escapeRegExp(edge.label ?? '')}\\|\\s*\\b${to}\\b`,
      )
    : new RegExp(`\\b${from}\\b\\s*${escapeRegExp(op)}\\s*\\b${to}\\b`);
  const fallbackPattern = new RegExp(
    `\\b${from}\\b\\s*${escapeRegExp(op)}(?:\\|[^|]*\\|)?\\s*\\b${to}\\b`,
  );
  const replacement = newLabel
    ? `${edge.from} ${op}|${newLabel}| ${edge.to}`
    : `${edge.from} ${op} ${edge.to}`;
  let idx = lines.findIndex((line) => exactPattern.test(line));
  if (idx < 0) {
    idx = lines.findIndex((line) => fallbackPattern.test(line));
  }
  if (idx >= 0) {
    const indent = lines[idx].match(/^(\s*)/)?.[1] ?? '';
    lines[idx] = `${indent}${replacement}`;
    return lines.join('\n');
  }
  return `${source.trimEnd()}\n  ${replacement}`;
}

/** Строка ребра в Mermaid (без ведущих пробелов). */
export function serializeEdgeLine(edge: DiagramEdgeModel): string {
  const op = edge.type === 'line' ? '---' : '-->';
  const labeled = edge.label !== undefined && edge.label !== '';
  if (labeled) {
    return `${edge.from} ${op}|${edge.label}| ${edge.to}`;
  }
  return `${edge.from} ${op} ${edge.to}`;
}

/** Переподключить ребро к другому целевому узлу (замена строки в тексте). */
export function replaceEdgeTarget(
  source: string,
  from: string,
  oldTo: string,
  newTo: string,
  edge: { label?: string; type: 'arrow' | 'line' },
): string {
  const lines = source.split(/\r?\n/);
  const op = edge.type === 'line' ? '---' : '-->';
  const fromRe = escapeRegExp(from);
  const toRe = escapeRegExp(oldTo);
  const labeled = edge.label !== undefined && edge.label !== '';
  const linePattern = labeled
    ? new RegExp(
        `\\b${fromRe}\\b\\s*${escapeRegExp(op)}\\|${escapeRegExp(edge.label ?? '')}\\|\\s*\\b${toRe}\\b`,
      )
    : new RegExp(`\\b${fromRe}\\b\\s*${escapeRegExp(op)}\\s*\\b${toRe}\\b`);
  const replacement = labeled
    ? `${from} ${op}|${edge.label}| ${newTo}`
    : `${from} ${op} ${newTo}`;
  const idx = lines.findIndex((line) => linePattern.test(line));
  if (idx >= 0) {
    const indent = lines[idx].match(/^(\s*)/)?.[1] ?? '';
    lines[idx] = `${indent}${replacement}`;
    return lines.join('\n');
  }
  return source;
}

export function replaceEdgeOperator(
  source: string,
  edge: { from: string; to: string; label?: string; type: 'arrow' | 'line' },
  newType: 'arrow' | 'line',
): string {
  if (edge.type === newType) return source;
  const lines = source.split(/\r?\n/);
  const oldOp = edge.type === 'line' ? '---' : '-->';
  const newOp = newType === 'line' ? '---' : '-->';
  const from = escapeRegExp(edge.from);
  const to = escapeRegExp(edge.to);
  const labeled = edge.label !== undefined && edge.label !== '';
  const linePattern = labeled
    ? new RegExp(
        `\\b${from}\\b\\s*${escapeRegExp(oldOp)}\\|${escapeRegExp(edge.label ?? '')}\\|\\s*\\b${to}\\b`,
      )
    : new RegExp(`\\b${from}\\b\\s*${escapeRegExp(oldOp)}\\s*\\b${to}\\b`);
  const replacement = labeled
    ? `${edge.from} ${newOp}|${edge.label}| ${edge.to}`
    : `${edge.from} ${newOp} ${edge.to}`;
  const idx = lines.findIndex((line) => linePattern.test(line));
  if (idx >= 0) {
    lines[idx] = replacement;
    return lines.join('\n');
  }
  return source;
}

/** Добавить или заменить строку `style NodeId ...` для flowchart. */
export function upsertNodeStyleLine(
  source: string,
  nodeId: string,
  styles: { fill?: string; stroke?: string; strokeWidth?: number },
): string {
  const parts: string[] = [];
  if (styles.fill) parts.push(`fill:${styles.fill}`);
  if (styles.stroke) parts.push(`stroke:${styles.stroke}`);
  if (styles.strokeWidth !== undefined) {
    parts.push(`stroke-width:${styles.strokeWidth}px`);
  }
  if (parts.length === 0) return source;
  const styleBody = parts.join(',');
  const newLine = `style ${nodeId} ${styleBody}`;
  const lines = source.split(/\r?\n/);
  const re = new RegExp(`^\\s*style\\s+${escapeRegExp(nodeId)}\\b`, 'i');
  const idx = lines.findIndex((line) => re.test(line));
  if (idx >= 0) {
    lines[idx] = newLine;
    return lines.join('\n');
  }
  return source.trimEnd() ? `${source.trimEnd()}\n${newLine}` : newLine;
}
