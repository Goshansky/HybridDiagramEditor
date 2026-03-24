export function extractLayoutHints(source: string): Record<string, { x: number; y: number }> {
  const layout: Record<string, { x: number; y: number }> = {};
  const lines = source.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('%%')) continue;
    const body = trimmed.slice(2).trim();
    if (!body.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(body) as {
        layout?: Record<string, { x?: number; y?: number }>;
      };
      for (const [id, point] of Object.entries(parsed.layout ?? {})) {
        if (typeof point.x === 'number' && typeof point.y === 'number') {
          layout[id] = { x: point.x, y: point.y };
        }
      }
    } catch {
      // ignore malformed hint comment
    }
  }
  return layout;
}
