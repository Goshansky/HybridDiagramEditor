/**
 * Точки выхода луча из центра узла к цели — граница фигуры (flowchart).
 */

export type NodeShape =
  | 'rect'
  | 'circle'
  | 'diamond'
  | 'oval'
  | 'parallelogram'
  | 'cloud'
  | 'trapezoid_slash'
  | 'trapezoid_backslash'
  | 'flag'
  | 'class_box'
  | 'er_box';

export interface PositionedNodeLike {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: NodeShape;
}

/** Отступ конца линии от границы «к» узлу, чтобы маркер стрелки не залезал на фигуру (в координатах холста). */
export const ARROW_TIP_GAP = 6;

function unitToward(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { ux: number; uy: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { ux: 1, uy: 0 };
  return { ux: dx / len, uy: dy / len };
}

/** Луч из (cx,cy) в направлении u (единичный) до выхода из оси-выровненного прямоугольника [-hw,hw]×[-hh,hh] вокруг центра. */
function rayExitAxisAlignedRect(
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  ux: number,
  uy: number,
): { x: number; y: number } {
  let tMin = Infinity;
  if (Math.abs(ux) > 1e-12) {
    const tR = hw / ux;
    const yR = cy + tR * uy;
    if (tR > 0 && Math.abs(yR - cy) <= hh + 1e-6) tMin = Math.min(tMin, tR);
    const tL = (-hw) / ux;
    const yL = cy + tL * uy;
    if (tL > 0 && Math.abs(yL - cy) <= hh + 1e-6) tMin = Math.min(tMin, tL);
  }
  if (Math.abs(uy) > 1e-12) {
    const tT = (-hh) / uy;
    const xT = cx + tT * ux;
    if (tT > 0 && Math.abs(xT - cx) <= hw + 1e-6) tMin = Math.min(tMin, tT);
    const tB = hh / uy;
    const xB = cx + tB * ux;
    if (tB > 0 && Math.abs(xB - cx) <= hw + 1e-6) tMin = Math.min(tMin, tB);
  }
  if (!Number.isFinite(tMin) || tMin === Infinity) return { x: cx, y: cy };
  return { x: cx + ux * tMin, y: cy + uy * tMin };
}

function rayExitEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  ux: number,
  uy: number,
): { x: number; y: number } {
  const denom = (ux * ux) / (rx * rx) + (uy * uy) / (ry * ry);
  if (denom < 1e-18) return { x: cx, y: cy };
  const t = 1 / Math.sqrt(denom);
  return { x: cx + ux * t, y: cy + uy * t };
}

function raySegmentIntersect(
  ox: number,
  oy: number,
  ux: number,
  uy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number | null {
  const wx = bx - ax;
  const wy = by - ay;
  const crossDW = ux * wy - uy * wx;
  if (Math.abs(crossDW) < 1e-12) return null;
  const axo = ax - ox;
  const ayo = ay - oy;
  const crossAW = axo * wy - ayo * wx;
  const crossAD = axo * uy - ayo * ux;
  const t = crossAW / crossDW;
  const s = crossAD / crossDW;
  if (t >= 0 && s >= 0 && s <= 1) return t;
  return null;
}

function exitConvexPolygon(
  cx: number,
  cy: number,
  vertsLocal: Array<[number, number]>,
  tx: number,
  ty: number,
): { x: number; y: number } {
  const { ux, uy } = unitToward(cx, cy, tx, ty);
  let tMin = Infinity;
  const n = vertsLocal.length;
  for (let i = 0; i < n; i += 1) {
    const a = vertsLocal[i];
    const b = vertsLocal[(i + 1) % n];
    const ax = cx + a[0];
    const ay = cy + a[1];
    const bx = cx + b[0];
    const by = cy + b[1];
    const t = raySegmentIntersect(cx, cy, ux, uy, ax, ay, bx, by);
    if (t !== null && t > 1e-9) tMin = Math.min(tMin, t);
  }
  if (!Number.isFinite(tMin) || tMin === Infinity) return { x: cx, y: cy };
  return { x: cx + ux * tMin, y: cy + uy * tMin };
}

function boundaryPointToward(
  node: PositionedNodeLike,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const { x: cx, y: cy, width: w, height: h, shape } = node;
  const { ux, uy } = unitToward(cx, cy, targetX, targetY);
  const hw = w / 2;
  const hh = h / 2;

  switch (shape) {
    case 'rect':
    case 'class_box':
    case 'er_box':
      return rayExitAxisAlignedRect(cx, cy, hw, hh, ux, uy);
    case 'circle': {
      const r = Math.min(w, h) / 2;
      return { x: cx + ux * r, y: cy + uy * r };
    }
    case 'oval':
      return rayExitEllipse(cx, cy, hw, hh, ux, uy);
    case 'diamond': {
      const verts: Array<[number, number]> = [
        [0, -hh],
        [hw, 0],
        [0, hh],
        [-hw, 0],
      ];
      return exitConvexPolygon(cx, cy, verts, targetX, targetY);
    }
    case 'parallelogram': {
      const skew = Math.min(16, w * 0.12);
      const verts: Array<[number, number]> = [
        [-hw + skew, -hh],
        [hw, -hh],
        [hw - skew, hh],
        [-hw, hh],
      ];
      return exitConvexPolygon(cx, cy, verts, targetX, targetY);
    }
    case 'trapezoid_slash': {
      const skew = Math.min(16, w * 0.12);
      const verts: Array<[number, number]> = [
        [-hw + skew, -hh],
        [hw, -hh],
        [hw - skew, hh],
        [-hw, hh],
      ];
      return exitConvexPolygon(cx, cy, verts, targetX, targetY);
    }
    case 'trapezoid_backslash': {
      const skew = Math.min(16, w * 0.12);
      const verts: Array<[number, number]> = [
        [-hw, -hh],
        [hw - skew, -hh],
        [hw, hh],
        [-hw + skew, hh],
      ];
      return exitConvexPolygon(cx, cy, verts, targetX, targetY);
    }
    case 'flag': {
      const notch = Math.min(10, w * 0.1);
      const verts: Array<[number, number]> = [
        [-hw, -hh],
        [hw - notch, -hh],
        [hw + notch * 0.6, 0],
        [hw - notch, hh],
        [-hw, hh],
      ];
      return exitConvexPolygon(cx, cy, verts, targetX, targetY);
    }
    case 'cloud':
      // Аппроксимация ограничивающим эллипсом (path масштабируется под w/h)
      return rayExitEllipse(cx, cy, hw * 0.95, hh * 0.95, ux, uy);
    default:
      return rayExitAxisAlignedRect(cx, cy, hw, hh, ux, uy);
  }
}

/**
 * Точки (x1,y1)-(x2,y2) на границах узлов; для стрелки конец укорачивается на ARROW_TIP_GAP к «from».
 */
export function computeEdgeEndpointsBetweenNodes(
  from: PositionedNodeLike,
  to: PositionedNodeLike,
  edgeType: 'arrow' | 'line',
): { x1: number; y1: number; x2: number; y2: number } {
  const pStart = boundaryPointToward(from, to.x, to.y);
  const pEnd = boundaryPointToward(to, from.x, from.y);

  let x2 = pEnd.x;
  let y2 = pEnd.y;

  if (edgeType === 'arrow') {
    const { ux, uy } = unitToward(pStart.x, pStart.y, pEnd.x, pEnd.y);
    x2 -= ux * ARROW_TIP_GAP;
    y2 -= uy * ARROW_TIP_GAP;
  }

  return { x1: pStart.x, y1: pStart.y, x2, y2 };
}

/** Укорачивает последний сегмент полилинии на gap (для маркера стрелки на path). */
export function trimPolylineEndForArrow(
  points: Array<{ x: number; y: number }>,
  gap: number,
): Array<{ x: number; y: number }> {
  if (points.length < 2 || gap <= 0) return points;
  const out = points.map((p) => ({ x: p.x, y: p.y }));
  const n = out.length;
  const a = out[n - 2];
  const b = out[n - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return out;
  const t = Math.max(0, (len - gap) / len);
  out[n - 1] = { x: a.x + dx * t, y: a.y + dy * t };
  return out;
}
