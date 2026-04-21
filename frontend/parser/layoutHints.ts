import { getLayoutHintDocument } from './layoutHintSync';

export function extractLayoutHints(source: string): Record<string, { x: number; y: number }> {
  const layout: Record<string, { x: number; y: number }> = {};
  const hint = getLayoutHintDocument(source);
  const hintLayout = hint?.layout;
  if (!hintLayout || typeof hintLayout !== 'object') {
    return layout;
  }
  for (const [id, point] of Object.entries(hintLayout)) {
    if (!point || typeof point !== 'object') continue;
    const rec = point as unknown as Record<string, unknown>;
    if (typeof rec.x === 'number' && typeof rec.y === 'number') {
      layout[id] = { x: rec.x, y: rec.y };
    }
  }
  return layout;
}
