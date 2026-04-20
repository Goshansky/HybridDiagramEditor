/**
 * Разбор текста sequenceDiagram (построчно, рекурсивный спуск).
 * Не использует общий Lexer — см. tokenizer SEQ_KW для подсветки/ключевых слов.
 */
import type { DiagramModel } from './model';
import type {
  SequenceAltBranch,
  SequenceArrowKind,
  SequenceCriticalBranch,
  SequenceDiagramData,
  SequenceMessage,
  SequenceNote,
  SequenceParBranch,
  SequenceParticipant,
  SequenceStatement,
} from './sequenceModel';

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

/** Порядок: более длинные шаблоны первыми. */
const ARROW_PATTERNS: { pat: string; kind: SequenceArrowKind }[] = [
  { pat: '-->>', kind: 'dashed-arrow' },
  { pat: '->>', kind: 'solid-arrow' },
  { pat: '--)', kind: 'dashed-open' },
  { pat: '--x', kind: 'dashed-cross' },
  { pat: '->', kind: 'solid' },
  { pat: '-x', kind: 'solid-cross' },
];

function parseStyleProps(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const t = raw.trim().replace(/;+$/, '');
  if (!t) return out;
  for (const part of t.split(',')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function findLeftmostArrow(left: string): { idx: number; pat: string; kind: SequenceArrowKind } | null {
  const sorted = [...ARROW_PATTERNS].sort((a, b) => b.pat.length - a.pat.length);
  for (let i = 0; i < left.length; i += 1) {
    for (const { pat, kind } of sorted) {
      if (left.slice(i, i + pat.length) === pat) {
        return { idx: i, pat, kind };
      }
    }
  }
  return null;
}

/** Разбор строки сообщения: A ->>+ B : text */
export function tryParseMessageLine(line: string): SequenceMessage | null {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  const label = line.slice(colonIdx + 1).trim();
  const left = line.slice(0, colonIdx).trim();

  const found = findLeftmostArrow(left);
  if (!found) return null;

  const from = left.slice(0, found.idx).trim();
  let rest = left.slice(found.idx + found.pat.length).trim();
  let activation: 'activate' | 'deactivate' | undefined;
  if (rest.startsWith('+')) {
    activation = 'activate';
    rest = rest.slice(1).trim();
  } else if (rest.startsWith('-')) {
    activation = 'deactivate';
    rest = rest.slice(1).trim();
  }
  const to = rest.split(/\s+/)[0];
  if (!from || !to) return null;

  return {
    id: nextId('m'),
    from,
    to,
    arrow: found.kind,
    label,
    activation: activation ?? null,
  };
}

function firstToken(line: string): string {
  return line.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

export class SequenceParseCursor {
  lines: string[] = [];
  i = 0;

  constructor(source: string) {
    this.lines = source.split(/\r?\n/);
  }

  peek(): string | null {
    while (this.i < this.lines.length) {
      const t = this.lines[this.i]?.trim() ?? '';
      if (!t || t.startsWith('%%')) {
        this.i += 1;
        continue;
      }
      return this.lines[this.i] ?? null;
    }
    return null;
  }

  peekTrimmed(): string | null {
    const p = this.peek();
    return p ? p.trim() : null;
  }

  consume(): string | null {
    const p = this.peek();
    if (p === null) return null;
    this.i += 1;
    return p;
  }
}

function parseParticipantLine(line: string): SequenceParticipant | null {
  const t = line.trim();
  const mActor = t.match(/^actor\s+(\S+)(?:\s+as\s+(.+))?$/i);
  if (mActor) {
    return {
      id: mActor[1]!,
      label: (mActor[2] ?? mActor[1])!.trim(),
      type: 'actor',
    };
  }
  const m = t.match(/^participant\s+(\S+)(?:\s+as\s+(.+))?$/i);
  if (m) {
    return {
      id: m[1]!,
      label: (m[2] ?? m[1])!.trim(),
      type: 'participant',
    };
  }
  return null;
}

function parseNoteLine(line: string): SequenceNote | null {
  const t = line.trim();
  const over = t.match(/^Note\s+over\s+([^:]+):\s*(.*)$/i);
  if (over) {
    const targets = over[1]!
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return {
      id: nextId('n'),
      placement: 'over',
      participants: targets,
      text: decodeNoteText(over[2] ?? ''),
    };
  }
  const lr = t.match(/^Note\s+(left|right)\s+of\s+([^:]+):\s*(.*)$/i);
  if (lr) {
    return {
      id: nextId('n'),
      placement: lr[1]!.toLowerCase() as 'left' | 'right',
      participants: [lr[2]!.trim()],
      text: decodeNoteText(lr[3] ?? ''),
    };
  }
  return null;
}

function decodeNoteText(s: string): string {
  return s.replace(/<br\s*\/?>/gi, '\n');
}

function parseOneStatement(c: SequenceParseCursor): SequenceStatement | null {
  const line = c.peek();
  if (!line) return null;
  const trimmed = line.trim();
  const head = firstToken(trimmed);

  if (head === 'autonumber') {
    c.consume();
    return null;
  }

  if (head === 'activate') {
    const m = trimmed.match(/^activate\s+(\S+)/i);
    c.consume();
    if (!m) return null;
    return { kind: 'activate', participant: m[1]! };
  }
  if (head === 'deactivate') {
    const m = trimmed.match(/^deactivate\s+(\S+)/i);
    c.consume();
    if (!m) return null;
    return { kind: 'deactivate', participant: m[1]! };
  }

  if (head === 'note') {
    const n = parseNoteLine(trimmed);
    c.consume();
    if (!n) return null;
    return { kind: 'note', note: n };
  }

  if (head === 'alt') {
    return parseAltBlock(c);
  }
  if (head === 'opt') {
    return parseOptBlock(c);
  }
  if (head === 'loop') {
    return parseLoopBlock(c);
  }
  if (head === 'par') {
    return parseParBlock(c);
  }
  if (head === 'critical') {
    return parseCriticalBlock(c);
  }
  if (head === 'break') {
    return parseBreakBlock(c);
  }

  const msg = tryParseMessageLine(trimmed);
  if (msg) {
    c.consume();
    return { kind: 'message', message: msg };
  }

  c.consume();
  return null;
}

function parseStatementList(c: SequenceParseCursor, until: (head: string) => boolean): SequenceStatement[] {
  const out: SequenceStatement[] = [];
  while (c.peek()) {
    const t = c.peekTrimmed() ?? '';
    const head = firstToken(t);
    if (until(head)) break;
    const st = parseOneStatement(c);
    if (st) out.push(st);
  }
  return out;
}

function parseAltBlock(c: SequenceParseCursor): SequenceStatement {
  const firstLine = c.consume() ?? '';
  const m = firstLine.match(/^alt\s*(.*)$/i);
  const branches: SequenceAltBranch[] = [{ label: m?.[1]?.trim(), body: [] }];

  branches[0]!.body = parseStatementList(c, (h) => h === 'else' || h === 'end');

  while (c.peekTrimmed() && firstToken(c.peekTrimmed()!) === 'else') {
    const el = c.consume() ?? '';
    const em = el.match(/^else\s*(.*)$/i);
    const body = parseStatementList(c, (h) => h === 'else' || h === 'end');
    branches.push({ label: em?.[1]?.trim(), body });
  }

  if (firstToken(c.peekTrimmed() ?? '') === 'end') {
    c.consume();
  }

  return { kind: 'alt', branches };
}

function parseOptBlock(c: SequenceParseCursor): SequenceStatement {
  const firstLine = c.consume() ?? '';
  const m = firstLine.match(/^opt\s*(.*)$/i);
  const body = parseStatementList(c, (h) => h === 'end');
  if (firstToken(c.peekTrimmed() ?? '') === 'end') c.consume();
  return { kind: 'opt', label: m?.[1]?.trim(), body };
}

function parseLoopBlock(c: SequenceParseCursor): SequenceStatement {
  const firstLine = c.consume() ?? '';
  const m = firstLine.match(/^loop\s*(.*)$/i);
  const body = parseStatementList(c, (h) => h === 'end');
  if (firstToken(c.peekTrimmed() ?? '') === 'end') c.consume();
  return { kind: 'loop', label: m?.[1]?.trim(), body };
}

function parseParBlock(c: SequenceParseCursor): SequenceStatement {
  const firstLine = c.consume() ?? '';
  const m = firstLine.match(/^par\s*(.*)$/i);
  const branches: SequenceParBranch[] = [];

  const firstBody = parseStatementList(c, (h) => h === 'and' || h === 'end');
  branches.push({ label: m?.[1]?.trim(), body: firstBody });

  while (c.peekTrimmed() && firstToken(c.peekTrimmed()!) === 'and') {
    const andLine = c.consume() ?? '';
    const am = andLine.match(/^and\s*(.*)$/i);
    const body = parseStatementList(c, (h) => h === 'and' || h === 'end');
    branches.push({ label: am?.[1]?.trim(), body });
  }

  if (firstToken(c.peekTrimmed() ?? '') === 'end') c.consume();
  return { kind: 'par', branches };
}

function parseCriticalBlock(c: SequenceParseCursor): SequenceStatement {
  const firstLine = c.consume() ?? '';
  const m = firstLine.match(/^critical\s*(.*)$/i);
  const branches: SequenceCriticalBranch[] = [];

  const main = parseStatementList(c, (h) => h === 'option' || h === 'end');
  branches.push({ label: m?.[1]?.trim(), body: main });

  while (c.peekTrimmed() && firstToken(c.peekTrimmed()!) === 'option') {
    const ol = c.consume() ?? '';
    const om = ol.match(/^option\s*(.*)$/i);
    const body = parseStatementList(c, (h) => h === 'option' || h === 'end');
    branches.push({ label: om?.[1]?.trim(), body });
  }

  if (firstToken(c.peekTrimmed() ?? '') === 'end') c.consume();
  return { kind: 'critical', branches };
}

function parseBreakBlock(c: SequenceParseCursor): SequenceStatement {
  const firstLine = c.consume() ?? '';
  const m = firstLine.match(/^break\s*(.*)$/i);
  const body = parseStatementList(c, (h) => h === 'end');
  if (firstToken(c.peekTrimmed() ?? '') === 'end') c.consume();
  return { kind: 'break', label: m?.[1]?.trim(), body };
}

export function parseSequenceDiagramData(source: string): SequenceDiagramData {
  idSeq = 0;
  const c = new SequenceParseCursor(source);
  const participants: SequenceParticipant[] = [];
  const seen = new Set<string>();
  const addParticipant = (p: SequenceParticipant): void => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    participants.push(p);
  };

  let autonumber = false;
  const participantStyles: Record<string, Record<string, string>> = {};

  const statements: SequenceStatement[] = [];
  while (c.peek()) {
    const raw = c.peek()!;
    const trimmed = raw.trim();
    const head = firstToken(trimmed);

    if (head === 'sequencediagram') {
      c.consume();
      continue;
    }

    const pp = parseParticipantLine(trimmed);
    if (pp) {
      addParticipant(pp);
      c.consume();
      continue;
    }

    if (head === 'autonumber') {
      autonumber = true;
      c.consume();
      continue;
    }

    if (head === 'style') {
      const sm = trimmed.match(/^style\s+(\S+)\s+(.+)$/i);
      c.consume();
      if (sm) {
        participantStyles[sm[1]!] = parseStyleProps(sm[2]!);
      }
      continue;
    }

    const st = parseOneStatement(c);
    if (st) statements.push(st);
  }

  const refIds = new Set<string>();
  function walkRefs(stmts: SequenceStatement[]): void {
    for (const s of stmts) {
      switch (s.kind) {
        case 'message':
          refIds.add(s.message.from);
          refIds.add(s.message.to);
          break;
        case 'activate':
        case 'deactivate':
          refIds.add(s.participant);
          break;
        case 'note':
          for (const id of s.note.participants) refIds.add(id);
          break;
        case 'alt':
          for (const b of s.branches) walkRefs(b.body);
          break;
        case 'opt':
        case 'loop':
        case 'break':
          walkRefs(s.body);
          break;
        case 'par':
          for (const b of s.branches) walkRefs(b.body);
          break;
        case 'critical':
          for (const b of s.branches) walkRefs(b.body);
          break;
        default:
          break;
      }
    }
  }
  walkRefs(statements);

  for (const id of refIds) {
    if (!seen.has(id)) {
      addParticipant({ id, label: id, type: 'participant' });
    }
  }

  return {
    participants,
    statements,
    autonumber,
    participantStyles,
  };
}

export function sequenceDataToDiagramModel(data: SequenceDiagramData): DiagramModel {
  const spacing = 200;
  const startX = 120;
  const topY = 56;
  const nodes = data.participants.map((p, idx) => ({
    id: p.id,
    label: p.label,
    shape: 'rect' as const,
    styles: data.participantStyles[p.id] ?? {},
    x: startX + idx * spacing,
    y: topY,
  }));

  const edges: DiagramModel['edges'] = [];
  let ei = 0;
  function collectMessages(stmts: SequenceStatement[]): void {
    for (const s of stmts) {
      switch (s.kind) {
        case 'message':
          edges.push({
            from: s.message.from,
            to: s.message.to,
            label: s.message.label,
            type: 'arrow',
            styles: {},
          });
          ei += 1;
          break;
        case 'alt':
          for (const b of s.branches) collectMessages(b.body);
          break;
        case 'opt':
        case 'loop':
        case 'break':
          collectMessages(s.body);
          break;
        case 'par':
          for (const b of s.branches) collectMessages(b.body);
          break;
        case 'critical':
          for (const b of s.branches) collectMessages(b.body);
          break;
        default:
          break;
      }
    }
  }
  collectMessages(data.statements);

  return {
    nodes,
    edges,
    layout: {},
    metadata: {
      direction: 'LR',
      diagramType: 'sequence',
    },
    sequenceData: data,
  };
}
