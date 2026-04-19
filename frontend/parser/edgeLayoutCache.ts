import type { DiagramEdgeModel, DiagramEdgePoint, DiagramModel } from './model';

/** Снимок маршрута и стилей ребра после dagre — для восстановления при ручном парсе. */
export interface EdgeLayoutSnapshot {
  from: string;
  to: string;
  label?: string;
  type: DiagramEdgeModel['type'];
  points?: DiagramEdgePoint[];
  styles: Record<string, string>;
}

function edgeKey(e: {
  from: string;
  to: string;
  label?: string;
  type: DiagramEdgeModel['type'];
}): string {
  return `${e.from}\0${e.to}\0${e.type}\0${e.label ?? ''}`;
}

export function snapshotEdgesForLayoutCache(model: DiagramModel): EdgeLayoutSnapshot[] {
  return model.edges.map((e) => ({
    from: e.from,
    to: e.to,
    label: e.label,
    type: e.type,
    points: e.points ? e.points.map((p) => ({ x: p.x, y: p.y })) : undefined,
    styles: { ...e.styles },
  }));
}

function mergeByKey(model: DiagramModel, cache: EdgeLayoutSnapshot[]): void {
  const buckets = new Map<string, EdgeLayoutSnapshot[]>();
  for (const c of cache) {
    const k = edgeKey(c);
    const arr = buckets.get(k) ?? [];
    arr.push(c);
    buckets.set(k, arr);
  }
  const usage = new Map<string, number>();
  for (const e of model.edges) {
    const k = edgeKey(e);
    const arr = buckets.get(k);
    if (!arr?.length) continue;
    const idx = usage.get(k) ?? 0;
    if (idx >= arr.length) continue;
    const c = arr[idx];
    usage.set(k, idx + 1);
    if (c.points && c.points.length >= 2) {
      e.points = c.points.map((p) => ({ x: p.x, y: p.y }));
    }
    Object.assign(e.styles, c.styles);
  }
}

/** Копирует в модель `points` и `styles` из снимка (совпадение по индексу или по ключу). */
export function mergeEdgeLayoutFromCache(
  model: DiagramModel,
  cache: EdgeLayoutSnapshot[] | null | undefined,
): void {
  if (!cache?.length) return;

  if (model.edges.length === cache.length) {
    let indexOk = true;
    for (let i = 0; i < model.edges.length; i++) {
      const e = model.edges[i];
      const c = cache[i];
      if (!c || e.from !== c.from || e.to !== c.to || e.type !== c.type || e.label !== c.label) {
        indexOk = false;
        break;
      }
    }
    if (indexOk) {
      for (let i = 0; i < model.edges.length; i++) {
        const e = model.edges[i];
        const c = cache[i];
        if (c.points && c.points.length >= 2) {
          e.points = c.points.map((p) => ({ x: p.x, y: p.y }));
        }
        Object.assign(e.styles, c.styles);
      }
      return;
    }
  }

  mergeByKey(model, cache);
}
