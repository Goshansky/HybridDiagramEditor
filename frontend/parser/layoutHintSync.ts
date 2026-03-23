interface LayoutPoint {
  x: number;
  y: number;
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

export function upsertLayoutHint(
  source: string,
  nodeId: string,
  x: number,
  y: number,
): string {
  const lines = source.split(/\r?\n/);
  const block = extractHintBlock(lines);
  const nextPoint: LayoutPoint = { x: Math.round(x), y: Math.round(y) };

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
