interface LayoutPoint {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

interface LayoutDocument {
  layout?: Record<string, LayoutPoint>;
  [key: string]: unknown;
}

interface HintBlock {
  startLine: number;
  endLine: number;
  json: LayoutDocument;
}

function extractHintBlock(lines: string[]): HintBlock | null {
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith('%%')) continue;
    const commentBody = trimmed.slice(2).trim();
    if (!commentBody.startsWith('{')) continue;

    let rawJson = commentBody;
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
        // читаем дальше, пока JSON не станет валидным
      }
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
    const o = p as Record<string, unknown>;
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
    const replacement = `%% ${JSON.stringify(nextJson)}`;
    const nextLines = [
      ...lines.slice(0, block.startLine),
      replacement,
      ...lines.slice(block.endLine + 1),
    ];
    return nextLines.join('\n');
  }

  const nextJson: LayoutDocument = { layout: { [nodeId]: nextPoint } };
  const hintLine = `%% ${JSON.stringify(nextJson)}`;
  return source.trimEnd() ? `${source.trimEnd()}\n${hintLine}` : hintLine;
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
