import type { DiagramModel } from './model';
import { extractLayoutHints } from './layoutHints';
import {
  estimateErEntitySize,
  parseErAttributeLine,
  type EntityAttribute,
  type ERDiagramData,
  type ERDiagramEntity,
  type ERDiagramRelationship,
} from './erModel';
import { applyErDiagramLayout } from '../src/services/layoutService';

function parseStyleProps(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const trimmed = raw.trim().replace(/;+$/, '');
  if (!trimmed) return result;
  for (const part of trimmed.split(',')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) result[k] = v;
  }
  return result;
}

function extractEdgeLabel(trimmed: string): { core: string; label?: string } {
  const m = trimmed.match(/^(.*?)\s:\s*(.+)$/);
  if (!m) return { core: trimmed };
  let lab = m[2]!.trim();
  if (
    (lab.startsWith('"') && lab.endsWith('"')) ||
    (lab.startsWith("'") && lab.endsWith("'"))
  ) {
    lab = lab.slice(1, -1);
  }
  return { core: m[1]!.trim(), label: lab };
}

/** Строка связи: ENTITY left--right ENTITY [: label], также .. вместо --. */
export function parseRelationshipLine(trimmed: string): ERDiagramRelationship | null {
  if (!trimmed || trimmed.startsWith('%%')) return null;
  if (/^erDiagram\b/i.test(trimmed)) return null;
  if (/^style\s+/i.test(trimmed)) return null;
  if (/^[A-Za-z_][\w]*\s*\{\s*$/.test(trimmed)) return null;

  const { core, label } = extractEdgeLabel(trimmed);
  if (!/--|\.\./.test(core)) return null;

  const m = core.match(
    /^([A-Za-z_][A-Za-z0-9_]*)\s+(.+?)(--|\.\.)(.+?)\s+([A-Za-z_][A-Za-z0-9_]*)$/,
  );
  if (!m) return null;

  const from = m[1]!;
  const left = m[2]!.trim();
  const conn = m[3]!;
  const right = m[4]!.trim();
  const to = m[5]!;

  const styles: ERDiagramRelationship['styles'] = {};
  if (conn === '..') {
    styles.strokeDasharray = '6 4';
  }

  return {
    from,
    to,
    leftCardinality: left,
    rightCardinality: right,
    label,
    styles: Object.keys(styles).length ? styles : undefined,
  };
}

export function parseErDiagramAst(source: string): ERDiagramData {
  const lines = source.split(/\r?\n/);
  const entityMap = new Map<string, ERDiagramEntity>();
  const relationships: ERDiagramRelationship[] = [];

  const ensureEntity = (id: string): ERDiagramEntity => {
    let e = entityMap.get(id);
    if (!e) {
      e = { id, attributes: [], styles: {} };
      entityMap.set(id, e);
    }
    return e;
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('%%')) {
      i += 1;
      continue;
    }

    if (/^erDiagram\b/i.test(trimmed)) {
      i += 1;
      continue;
    }

    const openM = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\{\s*$/);
    if (openM) {
      const id = openM[1]!;
      const collected: EntityAttribute[] = [];
      i += 1;
      while (i < lines.length) {
        const L = lines[i]!.trim();
        if (L === '}') {
          i += 1;
          break;
        }
        if (!L || L.startsWith('%%')) {
          i += 1;
          continue;
        }
        const attr = parseErAttributeLine(L);
        if (attr) collected.push(attr);
        i += 1;
      }
      const prev = entityMap.get(id);
      entityMap.set(id, {
        id,
        attributes: collected,
        styles: prev?.styles ?? {},
      });
      continue;
    }

    const styleM = trimmed.match(/^style\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/i);
    if (styleM) {
      const id = styleM[1]!;
      const props = parseStyleProps(styleM[2]!);
      const ent = ensureEntity(id);
      ent.styles = { ...ent.styles, ...props };
      i += 1;
      continue;
    }

    const rel = parseRelationshipLine(trimmed);
    if (rel) {
      ensureEntity(rel.from);
      ensureEntity(rel.to);
      relationships.push(rel);
    }
    i += 1;
  }

  return {
    entities: [...entityMap.values()],
    relationships,
  };
}

export function erDataToDiagramModel(
  data: ERDiagramData,
  layoutHints: Record<string, { x: number; y: number }>,
): DiagramModel {
  const nodes: DiagramModel['nodes'] = data.entities.map((ent) => {
    const { width, height } = estimateErEntitySize(ent);
    const pos = layoutHints[ent.id];
    const styles: Record<string, string> = {};
    if (ent.styles?.fill) styles.fill = ent.styles.fill;
    if (ent.styles?.stroke) styles.stroke = ent.styles.stroke;
    if (ent.styles?.strokeWidth !== undefined) {
      styles['stroke-width'] = `${ent.styles.strokeWidth}px`;
    }
    return {
      id: ent.id,
      label: ent.id,
      shape: 'er_box',
      styles,
      width,
      height,
      x: pos?.x,
      y: pos?.y,
      erEntity: ent,
    };
  });

  const edges: DiagramModel['edges'] = data.relationships.map((r) => {
    const st: Record<string, string> = {};
    if (r.styles?.stroke) st.stroke = r.styles.stroke;
    if (r.styles?.strokeDasharray) st['stroke-dasharray'] = r.styles.strokeDasharray;
    return {
      from: r.from,
      to: r.to,
      label: r.label,
      type: 'line',
      styles: st,
      erLeftCard: r.leftCardinality,
      erRightCard: r.rightCardinality,
    };
  });

  const layout: DiagramModel['layout'] = {};
  for (const n of nodes) {
    if (typeof n.x === 'number' && typeof n.y === 'number') {
      layout[n.id] = { x: n.x, y: n.y };
    }
  }

  return {
    nodes,
    edges,
    layout,
    metadata: {
      direction: 'LR',
      diagramType: 'er',
    },
    erData: data,
  };
}

export function parseErDiagram(source: string, useAutoLayout = true): DiagramModel {
  const data = parseErDiagramAst(source);
  const hints = extractLayoutHints(source);
  const model = erDataToDiagramModel(data, hints);
  applyErDiagramLayout(model, useAutoLayout);
  return model;
}
