/** Модель erDiagram (Mermaid ER). */

export interface EntityAttribute {
  name: string;
  type: string;
  keyType?: 'PK' | 'FK' | 'UK';
}

export interface ERDiagramEntity {
  id: string;
  attributes: EntityAttribute[];
  styles?: { fill?: string; stroke?: string; strokeWidth?: number };
}

export interface ERDiagramRelationship {
  from: string;
  to: string;
  leftCardinality: string;
  rightCardinality: string;
  label?: string;
  styles?: { stroke?: string; strokeDasharray?: string };
}

export interface ERDiagramData {
  entities: ERDiagramEntity[];
  relationships: ERDiagramRelationship[];
}

const ATTR_TYPES = new Set([
  'int',
  'string',
  'date',
  'decimal',
  'boolean',
  'text',
  'float',
  'double',
  'timestamp',
]);

export function estimateErEntitySize(entity: ERDiagramEntity): { width: number; height: number } {
  const LINE = 14;
  const HEADER = 22;
  const PAD = 8;
  const lines = entity.attributes.length;
  const h = PAD * 2 + HEADER + 4 + lines * LINE + (lines > 0 ? 4 : 0);
  let maxChars = entity.id.length;
  for (const a of entity.attributes) {
    const line = `${a.type} ${a.name}${a.keyType ? ` ${a.keyType}` : ''}`;
    maxChars = Math.max(maxChars, line.length);
  }
  const width = Math.min(400, Math.max(120, 7 * maxChars + PAD * 2));
  return { width, height: Math.max(56, h) };
}

export function parseErAttributeLine(line: string): EntityAttribute | null {
  const t = line.trim();
  if (!t) return null;
  const m = t.match(
    /^(int|string|date|decimal|boolean|text|float|double|timestamp)\s+(\w+)\s*(PK|FK|UK)?\s*$/i,
  );
  if (!m) return null;
  const typ = m[1]!.toLowerCase();
  if (!ATTR_TYPES.has(typ)) return null;
  return {
    type: typ,
    name: m[2]!,
    keyType: m[3] ? (m[3].toUpperCase() as 'PK' | 'FK' | 'UK') : undefined,
  };
}
