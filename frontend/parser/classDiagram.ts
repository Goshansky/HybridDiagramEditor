import type {
  ClassBoxModel,
  ClassFieldModel,
  ClassMethodModel,
  ClassNoteModel,
  DiagramEdgeModel,
  DiagramModel,
  DiagramNodeModel,
} from './model';
import { extractLayoutHints } from './layoutHints';
import { applyClassDiagramLayout } from '../src/services/layoutService';

const ID = '[A-Za-z_][\\w~]*';

/** Оценка размеров блока класса для dagre. */
export function estimateClassBoxSize(cb: ClassBoxModel): { width: number; height: number } {
  const LINE = 14;
  const PAD = 8;
  const HEADER = 22;
  const stereoH = cb.stereotype ? LINE : 0;
  const sep = cb.fields.length && cb.methods.length ? 4 : 0;
  const bodyLines = cb.fields.length + cb.methods.length;
  const h =
    PAD * 2 +
    HEADER +
    stereoH +
    4 +
    bodyLines * LINE +
    sep +
    (bodyLines > 0 ? 4 : 0);
  let maxChars = cb.name.length;
  for (const f of cb.fields) {
    maxChars = Math.max(maxChars, `${f.visibility}${f.name}: ${f.type}`.length);
  }
  for (const m of cb.methods) {
    const ps = m.params.map((p) => `${p.name}: ${p.type}`).join(', ');
    maxChars = Math.max(
      maxChars,
      `${m.visibility}${m.isStatic ? '$' : ''}${m.name}(${ps}) ${m.returnType}`.length,
    );
  }
  const width = Math.min(360, Math.max(140, 7 * maxChars + PAD * 2));
  return { width, height: Math.max(72, h) };
}

function parseStyleString(raw: string): Record<string, string> {
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

function parseStereotypeLine(line: string): string | null {
  const m = line.trim().match(/^<<([^>]+)>>$/);
  return m ? m[1].trim() : null;
}

function parseMemberLine(
  line: string,
): { field?: ClassFieldModel; method?: ClassMethodModel } | null {
  const t = line.trim();
  if (!t || t.startsWith('<<')) return null;

  let isStatic = false;
  let i = 0;
  if (t[i] === '$') {
    isStatic = true;
    i += 1;
  }
  let vis: import('./model').ClassVisibility = '+';
  if (i < t.length && '+-#~'.includes(t[i]!)) {
    vis = t[i] as import('./model').ClassVisibility;
    i += 1;
  }
  const rest = t.slice(i).trim();
  if (!rest) return null;

  const open = rest.indexOf('(');
  if (open === -1) {
    const colon = rest.indexOf(':');
    if (colon === -1) return null;
    let fname = rest.slice(0, colon).trim();
    const type = rest.slice(colon + 1).trim();
    if (!fname || !type) return null;
    if (fname.startsWith('$')) {
      isStatic = true;
      fname = fname.slice(1).trim();
    }
    return {
      field: { name: fname, type, visibility: vis, isStatic: isStatic || undefined },
    };
  }

  let name = rest.slice(0, open).trim();
  if (name.startsWith('$')) {
    isStatic = true;
    name = name.slice(1).trim();
  }
  const close = rest.indexOf(')', open);
  if (close === -1) return null;
  const paramsStr = rest.slice(open + 1, close);
  let ret = rest.slice(close + 1).trim();
  let isAbstract = false;
  if (ret.endsWith('*')) {
    isAbstract = true;
    ret = ret.slice(0, -1).trim();
  }
  const params = parseParams(paramsStr);
  return {
    method: {
      name,
      params,
      returnType: ret || 'void',
      visibility: vis,
      isAbstract: isAbstract || undefined,
      isStatic: isStatic || undefined,
    },
  };
}

export function parseParams(s: string): { name: string; type: string }[] {
  const t = s.trim();
  if (!t) return [];
  const parts = t.split(',').map((x) => x.trim()).filter(Boolean);
  const out: { name: string; type: string }[] = [];
  for (const p of parts) {
    const c = p.indexOf(':');
    if (c === -1) {
      out.push({ name: p, type: '' });
    } else {
      out.push({
        name: p.slice(0, c).trim(),
        type: p.slice(c + 1).trim(),
      });
    }
  }
  return out;
}

const ARROW_SPECS: { pat: string; kind: import('./model').ClassRelationKind }[] = [
  { pat: '<|--', kind: 'inheritance' },
  { pat: '<|..', kind: 'implementation' },
  { pat: '*--', kind: 'composition' },
  { pat: 'o--', kind: 'aggregation' },
  { pat: '-->', kind: 'association' },
  { pat: '..>', kind: 'dependency' },
  { pat: '--', kind: 'bidirectional' },
];

function parseRelationLine(line: string): DiagramEdgeModel | null {
  const t = line.trim();
  if (!t || t.startsWith('%%')) return null;

  for (const { pat, kind } of ARROW_SPECS) {
    const idx = t.indexOf(pat);
    if (idx === -1) continue;
    const left = t.slice(0, idx).trim();
    const right = t.slice(idx + pat.length).trim();

    const reLeft = new RegExp(`^(${ID})\\s*(?:"([^"]*)")?\\s*$`);
    const reRight = new RegExp(`^(?:"([^"]*)")?\\s*(${ID})\\s*(?::\\s*(.+))?$`);

    const lm = left.match(reLeft);
    if (!lm) continue;
    const from = lm[1]!;
    const fromM = lm[2];

    const rm = right.match(reRight);
    if (!rm) continue;
    const toM = rm[1];
    const to = rm[2]!;
    const label = rm[3]?.trim();

    // Mermaid: `Parent <|-- Child` — направленная связь от Child к Parent (стрелка к родителю).
    let a = from;
    let b = to;
    let ma = fromM;
    let mb = toM;
    if (kind === 'inheritance' || kind === 'implementation') {
      a = to;
      b = from;
      ma = toM;
      mb = fromM;
    }

    return {
      from: a,
      to: b,
      label,
      type: kind === 'bidirectional' ? 'line' : 'arrow',
      styles: {},
      classRelation: kind,
      fromMultiplicity: ma,
      toMultiplicity: mb,
    };
  }
  return null;
}

/** Тело `{ ... }` от первой `{` до парной `}` (по всему фрагменту строк). */
function extractBraceBlock(lines: string[], startIdx: number): { content: string; nextIdx: number } {
  const rest = lines.slice(startIdx).join('\n');
  const openIdx = rest.indexOf('{');
  if (openIdx === -1) return { content: '', nextIdx: startIdx + 1 };
  let depth = 0;
  for (let i = openIdx; i < rest.length; i += 1) {
    const c = rest[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        const inner = rest.slice(openIdx + 1, i);
        const consumed = rest.slice(0, i + 1);
        const lineCount = consumed.split('\n').length;
        return { content: inner, nextIdx: startIdx + lineCount };
      }
    }
  }
  return { content: '', nextIdx: startIdx + 1 };
}

function parseClassBody(content: string, box: ClassBoxModel): void {
  const bodyLines = content.split(/\r?\n/);
  for (const raw of bodyLines) {
    const line = raw.trim();
    if (!line) continue;
    const st = parseStereotypeLine(line);
    if (st) {
      box.stereotype = st;
      continue;
    }
    const mem = parseMemberLine(line);
    if (mem?.field) box.fields.push(mem.field);
    else if (mem?.method) box.methods.push(mem.method);
  }
}

function mergeClassBox(into: ClassBoxModel, from: ClassBoxModel): void {
  if (from.stereotype) into.stereotype = from.stereotype;
  for (const f of from.fields) {
    if (!into.fields.some((x) => x.name === f.name)) into.fields.push(f);
  }
  for (const m of from.methods) {
    if (!into.methods.some((x) => x.name === m.name)) into.methods.push(m);
  }
}

export function parseClassDiagram(source: string, useAutoLayout = true): DiagramModel {
  const layout = extractLayoutHints(source);
  const rawLines = source.split(/\r?\n/);
  const lines: string[] = [];
  for (const ln of rawLines) {
    const t = ln.trim();
    if (t.startsWith('%%') && !t.slice(2).trim().startsWith('{')) continue;
    lines.push(ln);
  }

  const classes = new Map<string, ClassBoxModel>();
  const notes: ClassNoteModel[] = [];
  const edges: DiagramEdgeModel[] = [];
  const classDefs = new Map<string, Record<string, string>>();
  const extraStyles = new Map<string, Record<string, string>>();

  const ensureClass = (id: string): ClassBoxModel => {
    let b = classes.get(id);
    if (!b) {
      b = { id, name: id, fields: [], methods: [] };
      classes.set(id, b);
    }
    return b;
  };

  let i = 0;
  let namespaceDepth = 0;

  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (!line) {
      i += 1;
      continue;
    }

    if (/^classDiagram\b/i.test(line)) {
      i += 1;
      continue;
    }

    if (/^namespace\s+/i.test(line) && line.includes('{')) {
      namespaceDepth += 1;
      i += 1;
      continue;
    }
    if (line === '}' && namespaceDepth > 0) {
      namespaceDepth -= 1;
      i += 1;
      continue;
    }

    const classDefM = line.match(/^classDef\s+(\w+)\s+(.+)$/);
    if (classDefM) {
      classDefs.set(classDefM[1]!, parseStyleString(classDefM[2]!));
      i += 1;
      continue;
    }

    const styleM = line.match(/^style\s+([\w~]+)\s+(.+)$/);
    if (styleM) {
      const id = styleM[1]!;
      const prev = extraStyles.get(id) ?? {};
      extraStyles.set(id, { ...prev, ...parseStyleString(styleM[2]!) });
      ensureClass(id);
      i += 1;
      continue;
    }

    const classStyleM = line.match(/^class\s+([\w~]+)\s+(\w+)\s*$/);
    if (classStyleM && !line.includes('{')) {
      const id = classStyleM[1]!;
      const defName = classStyleM[2]!;
      const styles = classDefs.get(defName);
      if (styles) {
        const prev = extraStyles.get(id) ?? {};
        extraStyles.set(id, { ...prev, ...styles });
      }
      ensureClass(id);
      i += 1;
      continue;
    }

    const noteFor1 = line.match(/^note\s+for\s+([\w~]+)\s+"([^"]*)"$/);
    if (noteFor1) {
      notes.push({ text: noteFor1[2]!, targetClassId: noteFor1[1] });
      ensureClass(noteFor1[1]!);
      i += 1;
      continue;
    }

    const noteFor2 = line.match(/^note\s+"([^"]*)"\s+for\s+([\w~]+)$/);
    if (noteFor2) {
      notes.push({ text: noteFor2[1]!, targetClassId: noteFor2[2] });
      ensureClass(noteFor2[2]!);
      i += 1;
      continue;
    }

    const noteSide = line.match(/^note\s+(left|right)\s+of\s+([\w~]+)\s*:\s*(.+)$/);
    if (noteSide) {
      notes.push({
        text: noteSide[3]!.trim(),
        targetClassId: noteSide[2]!,
        placement: noteSide[1] as 'left' | 'right',
      });
      ensureClass(noteSide[2]!);
      i += 1;
      continue;
    }

    const rel = parseRelationLine(line);
    if (rel) {
      edges.push(rel);
      ensureClass(rel.from);
      ensureClass(rel.to);
      i += 1;
      continue;
    }

    if (/^class\s+/i.test(line)) {
      const hasBrace = line.includes('{');
      if (hasBrace) {
        const head = line.slice(0, line.indexOf('{'));
        const nameM = head.match(/class\s+([\w~]+)/);
        const classId = nameM?.[1];
        if (!classId) {
          i += 1;
          continue;
        }
        const { content, nextIdx } = extractBraceBlock(lines, i);
        const box = ensureClass(classId);
        const chunk: ClassBoxModel = {
          id: classId,
          name: classId,
          fields: [],
          methods: [],
        };
        parseClassBody(content, chunk);
        mergeClassBox(box, chunk);
        i = nextIdx;
        continue;
      }
      const simple = line.match(/^class\s+([\w~]+)\s*$/);
      if (simple) {
        ensureClass(simple[1]!);
        i += 1;
        continue;
      }
    }

    i += 1;
  }

  const nodes: DiagramNodeModel[] = [];
  for (const [id, box] of classes.entries()) {
    const pos = layout[id];
    const { width, height } = estimateClassBoxSize(box);
    const merged = { ...(extraStyles.get(id) ?? {}) };
    nodes.push({
      id,
      label: box.name,
      shape: 'class_box',
      styles: merged,
      classBox: box,
      width,
      height,
      x: pos?.x,
      y: pos?.y,
    });
  }

  const model: DiagramModel = {
    nodes,
    edges,
    layout,
    metadata: {
      direction: 'TD',
      diagramType: 'class',
    },
    classNotes: notes.length ? notes : undefined,
  };

  applyClassDiagramLayout(model, useAutoLayout);
  return model;
}
