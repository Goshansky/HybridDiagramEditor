interface LayoutPoint {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface LayoutDocument {
  layout?: Record<string, LayoutPoint>;
  edgeStyles?: Record<string, Record<string, unknown>>;
  /** Порядок колонок sequenceDiagram (id участников слева направо). */
  sequenceParticipantOrder?: string[];
  [key: string]: unknown;
}

interface HintBlock {
  startLine: number;
  endLine: number;
  json: LayoutDocument;
}

function isPrimitiveJsonValue(v: unknown): v is string | number | boolean | null {
  return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function stringifyHintJson(value: unknown, indentLevel = 0): string {
  const indent = '  '.repeat(indentLevel);
  if (isPrimitiveJsonValue(value)) return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const parts = value.map((item) => `${'  '.repeat(indentLevel + 1)}${stringifyHintJson(item, indentLevel + 1)}`);
    return `[\n${parts.join(',\n')}\n${indent}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const canInline = entries.every(([, v]) => isPrimitiveJsonValue(v));
    if (canInline) {
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')}}`;
    }
    const parts = entries.map(
      ([k, v]) => `${'  '.repeat(indentLevel + 1)}${JSON.stringify(k)}: ${stringifyHintJson(v, indentLevel + 1)}`,
    );
    return `{\n${parts.join(',\n')}\n${indent}}`;
  }

  return JSON.stringify(String(value));
}

export function formatLayoutHintBlock(doc: LayoutDocument): string[] {
  const pretty = stringifyHintJson(doc, 0);
  return pretty.split('\n').map((line) => `%% ${line}`);
}

function extractHintBlock(lines: string[]): HintBlock | null {
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith('%%')) continue;
    const commentBody = trimmed.slice(2).trim();
    if (!commentBody.startsWith('{')) continue;

    let rawJson = commentBody;
    let sawParseError = false;
    for (let j = i; j < lines.length; j += 1) {
      if (j > i) {
        const nextTrimmed = lines[j].trim();
        if (!nextTrimmed.startsWith('%%')) break;
        rawJson += `\n${nextTrimmed.slice(2).trim()}`;
      }

      try {
        const parsed = JSON.parse(rawJson) as LayoutDocument;
        if (parsed && typeof parsed === 'object') {
          return { startLine: i, endLine: j, json: parsed };
        }
      } catch {
        sawParseError = true;
        // читаем дальше, пока JSON не станет валидным
      }
    }
    if (sawParseError) {
      // eslint-disable-next-line no-console
      console.warn('Invalid layout hint JSON, ignoring block', rawJson);
    }
  }
  return null;
}

function mergeLayoutPoint(
  prev: LayoutPoint | undefined,
  x: number,
  y: number,
  size?: { width?: number; height?: number },
): LayoutPoint {
  const next: LayoutPoint = {
    x: Math.round(x),
    y: Math.round(y),
  };
  if (size?.width !== undefined) next.width = Math.round(size.width);
  else if (prev?.width !== undefined) next.width = prev.width;
  if (size?.height !== undefined) next.height = Math.round(size.height);
  else if (prev?.height !== undefined) next.height = prev.height;
  return next;
}

/** Есть ли в коде блок layout с координатами хотя бы одного узла. */
export function sourceHasLayoutPositionHints(source: string): boolean {
  const lines = source.split(/\r?\n/);
  const block = extractHintBlock(lines);
  const layout = block?.json.layout;
  if (!layout || typeof layout !== 'object') return false;
  return Object.values(layout).some((p) => {
    if (!p || typeof p !== 'object') return false;
    const o = p as unknown as Record<string, unknown>;
    return typeof o.x === 'number' && typeof o.y === 'number';
  });
}

/** Удаляет блок %% { ... } с layout-хинтом (если есть). */
export function stripLayoutHintsFromSource(source: string): string {
  const lines = source.split(/\r?\n/);
  const block = extractHintBlock(lines);
  if (!block) return source;
  const nextLines = [
    ...lines.slice(0, block.startLine),
    ...lines.slice(block.endLine + 1),
  ];
  return nextLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function upsertLayoutHint(
  source: string,
  nodeId: string,
  x: number,
  y: number,
  size?: { width?: number; height?: number },
): string {
  const lines = source.split(/\r?\n/);
  const block = extractHintBlock(lines);
  const prevPoint =
    block?.json.layout?.[nodeId] !== undefined
      ? (block.json.layout![nodeId] as LayoutPoint)
      : undefined;
  const nextPoint = mergeLayoutPoint(prevPoint, x, y, size);

  if (block) {
    const nextJson: LayoutDocument = { ...block.json };
    nextJson.layout = { ...(nextJson.layout ?? {}), [nodeId]: nextPoint };
    const replacement = formatLayoutHintBlock(nextJson);
    const nextLines = [
      ...lines.slice(0, block.startLine),
      ...replacement,
      ...lines.slice(block.endLine + 1),
    ];
    return nextLines.join('\n');
  }

  const nextJson: LayoutDocument = { layout: { [nodeId]: nextPoint } };
  const hintLines = formatLayoutHintBlock(nextJson);
  return source.trimEnd() ? `${source.trimEnd()}\n${hintLines.join('\n')}` : hintLines.join('\n');
}

/** Обновить размеры узла в layout-хинте; якорь x/y — текущая позиция на холсте. */
export function upsertLayoutSize(
  source: string,
  nodeId: string,
  width: number,
  height: number,
  anchor: { x: number; y: number },
): string {
  return upsertLayoutHint(source, nodeId, anchor.x, anchor.y, {
    width,
    height,
  });
}

export function getLayoutHintDocument(source: string): LayoutDocument | null {
  const lines = source.split(/\r?\n/);
  const block = extractHintBlock(lines);
  return block?.json ?? null;
}

/** Сохранить порядок участников sequenceDiagram в JSON-хинте `%% { ... }`. */
export function upsertSequenceParticipantOrder(source: string, orderedIds: string[]): string {
  const lines = source.split(/\r?\n/);
  const block = extractHintBlock(lines);
  if (block) {
    const nextJson: LayoutDocument = { ...block.json };
    nextJson.sequenceParticipantOrder = orderedIds;
    const replacement = formatLayoutHintBlock(nextJson);
    return [...lines.slice(0, block.startLine), ...replacement, ...lines.slice(block.endLine + 1)].join('\n');
  }
  const nextJson: LayoutDocument = { sequenceParticipantOrder: orderedIds };
  const hintLines = formatLayoutHintBlock(nextJson);
  return source.trimEnd() ? `${source.trimEnd()}\n${hintLines.join('\n')}` : hintLines.join('\n');
}

/** Стили ребра по индексу в `model.edges` — хранятся в JSON-хинте рядом с layout. */
export function upsertEdgeStyleInHint(
  source: string,
  edgeIndex: number,
  changes: Partial<{
    stroke: string;
    strokeWidth: number;
    strokeDasharray: string | null;
  }>,
): string {
  const lines = source.split(/\r?\n/);
  const block = extractHintBlock(lines);
  const key = String(edgeIndex);
  const prev = block?.json.edgeStyles?.[key] as Record<string, unknown> | undefined;
  const nextEdge: Record<string, unknown> = { ...(prev ?? {}) };
  if (changes.stroke !== undefined) nextEdge.stroke = changes.stroke;
  if (changes.strokeWidth !== undefined) nextEdge['stroke-width'] = `${changes.strokeWidth}px`;
  if (changes.strokeDasharray !== undefined) {
    if (changes.strokeDasharray === null || changes.strokeDasharray === '') {
      delete nextEdge['stroke-dasharray'];
    } else {
      nextEdge['stroke-dasharray'] = changes.strokeDasharray;
    }
  }

  if (block) {
    const nextJson: LayoutDocument = { ...block.json };
    nextJson.edgeStyles = {
      ...(nextJson.edgeStyles ?? {}),
      [key]: nextEdge,
    };
    const replacement = formatLayoutHintBlock(nextJson);
    const nextLines = [
      ...lines.slice(0, block.startLine),
      ...replacement,
      ...lines.slice(block.endLine + 1),
    ];
    return nextLines.join('\n');
  }

  const nextJson: LayoutDocument = {
    layout: {},
    edgeStyles: { [key]: nextEdge },
  };
  const hintLines = formatLayoutHintBlock(nextJson);
  return source.trimEnd() ? `${source.trimEnd()}\n${hintLines.join('\n')}` : hintLines.join('\n');
}

/**
 * Удалить layout/edgeStyles записи для удалённых элементов.
 * - `removedNodeIds`: удаляются ключи из `layout`.
 * - `removedEdgeIndexes`: удаляются стили удалённых рёбер и переиндексируются оставшиеся.
 */
export function pruneLayoutHintAfterDeletion(
  source: string,
  opts: { removedNodeIds?: string[]; removedEdgeIndexes?: number[] },
): string {
  const lines = source.split(/\r?\n/);
  const block = extractHintBlock(lines);
  if (!block) return source;

  const removedNodeIds = new Set(opts.removedNodeIds ?? []);
  const removedEdgeIndexes = [...(opts.removedEdgeIndexes ?? [])]
    .filter((x) => Number.isFinite(x) && x >= 0)
    .sort((a, b) => a - b);
  if (removedNodeIds.size === 0 && removedEdgeIndexes.length === 0) return source;

  const nextJson: LayoutDocument = { ...block.json };

  if (nextJson.layout && typeof nextJson.layout === 'object') {
    const nextLayout: Record<string, LayoutPoint> = {};
    for (const [k, v] of Object.entries(nextJson.layout)) {
      if (!removedNodeIds.has(k)) nextLayout[k] = v;
    }
    if (Object.keys(nextLayout).length > 0) nextJson.layout = nextLayout;
    else delete nextJson.layout;
  }

  if (nextJson.edgeStyles && typeof nextJson.edgeStyles === 'object' && removedEdgeIndexes.length > 0) {
    const nextEdgeStyles: Record<string, Record<string, unknown>> = {};
    for (const [k, style] of Object.entries(nextJson.edgeStyles)) {
      const oldIdx = Number.parseInt(k, 10);
      if (!Number.isFinite(oldIdx) || oldIdx < 0) continue;
      if (removedEdgeIndexes.includes(oldIdx)) continue;
      const shift = removedEdgeIndexes.filter((x) => x < oldIdx).length;
      nextEdgeStyles[String(oldIdx - shift)] = style;
    }
    if (Object.keys(nextEdgeStyles).length > 0) nextJson.edgeStyles = nextEdgeStyles;
    else delete nextJson.edgeStyles;
  }

  if (Object.keys(nextJson).length === 0) {
    const nextLines = [...lines.slice(0, block.startLine), ...lines.slice(block.endLine + 1)];
    return nextLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
  }

  const replacement = formatLayoutHintBlock(nextJson);
  const nextLines = [
    ...lines.slice(0, block.startLine),
    ...replacement,
    ...lines.slice(block.endLine + 1),
  ];
  return nextLines.join('\n');
}
