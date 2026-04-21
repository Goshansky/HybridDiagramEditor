import {
  type ClassDefStatementAst,
  type ClassStatementAst,
  type DiagramAst,
  type Direction,
  type DirectionStatementAst,
  type EdgeOperator,
  type GraphAst,
  type LayoutHintAst,
  type LayoutHintData,
  type LinkStyleStatementAst,
  type NodeShape,
  type NodeStatementAst,
  type ParsedNode,
  type Position,
  type Range,
  type StatementAst,
  type StyleStatementAst,
  type SubgraphBlockAst,
} from './ast';
import { type Token, type TokenType, tokenize } from './tokenizer';

export class ParseError extends Error {
  readonly position: Position;

  constructor(message: string, position: Position) {
    super(message);
    this.name = 'ParseError';
    this.position = position;
  }
}

export class Parser {
  private readonly tokens: Token[];
  private readonly source: string;
  private current = 0;
  private graph?: GraphAst;
  private subgraphDepth = 0;
  private subgraphGroupIds: string[] = [];

  constructor(source: string, tokens?: Token[]) {
    this.source = source;
    this.tokens = tokens ?? tokenize(source);
  }

  parseDiagram(): DiagramAst {
    this.subgraphGroupIds = [];
    this.subgraphDepth = 0;
    const statements: StatementAst[] = [];

    while (!this.match('EOF')) {
      this.skipNewlines();
      if (this.match('EOF')) break;

      if (this.check('SUBGRAPH')) {
        statements.push(this.parseSubgraphBlock());
        continue;
      }

      const stmt = this.parseStatement();
      if (!stmt) {
        continue;
      }

      if (stmt.type === 'Graph') {
        this.graph = stmt;
      } else {
        statements.push(stmt);
      }
    }

    return {
      type: 'Diagram',
      graph: this.graph,
      statements,
      subgraphGroupIds:
        this.subgraphGroupIds.length > 0 ? [...this.subgraphGroupIds] : undefined,
    };
  }

  /** subgraph id [[заголовок]] … end — тело хранится в AST для рамок на холсте. */
  private parseSubgraphBlock(): SubgraphBlockAst {
    const startTok = this.consume('SUBGRAPH');
    let id = '';
    if (this.check('IDENT')) {
      const idTok = this.consume('IDENT');
      id = idTok.value ?? '';
      if (id) this.subgraphGroupIds.push(id);
    }
    let title: string | undefined;
    if (this.check('NODE_SHAPE_TEXT')) {
      const st = this.peek();
      if (st.meta?.shape === 'rect') {
        const shapeTok = this.advance();
        title = shapeTok.value?.trim() || undefined;
      }
    }
    this.consumeLineRemainder();
    const rawBody = this.parseBlockUntilMatchingEnd();
    const endTok = this.previous();
    const { body, direction } = this.extractFirstDirectionFromSubgraphBody(rawBody);
    return {
      type: 'SubgraphBlock',
      id,
      title,
      direction,
      body,
      range: makeRange(startTok.start, endTok.end),
    };
  }

  /** Первый `direction …` в теле подграфа выносится в поле блока; вложенные subgraph обрабатываются рекурсивно. */
  private extractFirstDirectionFromSubgraphBody(stmts: StatementAst[]): {
    body: StatementAst[];
    direction?: Direction;
  } {
    let direction: Direction | undefined;
    const body: StatementAst[] = [];
    for (const s of stmts) {
      if (s.type === 'DirectionStatement') {
        if (!direction) direction = s.direction;
        continue;
      }
      if (s.type === 'SubgraphBlock') {
        const inner = this.extractFirstDirectionFromSubgraphBody(s.body);
        body.push({
          ...s,
          type: 'SubgraphBlock',
          body: inner.body,
          direction: inner.direction,
        });
      } else {
        body.push(s);
      }
    }
    return { body, direction };
  }

  private parseBlockUntilMatchingEnd(): StatementAst[] {
    const out: StatementAst[] = [];
    this.subgraphDepth += 1;
    while (!this.match('EOF')) {
      this.skipNewlines();
      if (this.match('EOF')) break;

      if (this.isBareSubgraphEnd()) {
        this.consume('IDENT');
        this.consumeLineRemainder();
        this.subgraphDepth -= 1;
        return out;
      }

      if (this.check('SUBGRAPH')) {
        out.push(this.parseSubgraphBlock());
        continue;
      }

      const stmt = this.parseStatement();
      if (!stmt) continue;
      if (stmt.type === 'Graph') {
        throw new ParseError(
          'Директива graph не допускается внутри subgraph',
          this.peek().start,
        );
      }
      out.push(stmt);
    }
    this.subgraphDepth -= 1;
    return out;
  }

  private isBareSubgraphEnd(): boolean {
    if (this.subgraphDepth < 1) return false;
    if (!this.check('IDENT')) return false;
    const v = (this.peek().value ?? '').toLowerCase();
    if (v !== 'end') return false;
    const next = this.tokens[this.current + 1];
    if (!next || next.type === 'NEWLINE' || next.type === 'EOF') return true;
    if (next.type === 'COMMENT') return true;
    return false;
  }

  private parseStatement(): StatementAst | null {
    const token = this.peek();

    switch (token.type) {
      case 'GRAPH':
        return this.parseGraph();
      case 'STYLE':
        return this.parseStyle();
      case 'CLASSDEF':
        return this.parseClassDef();
      case 'CLASS': {
        const c = this.parseClassStatement();
        return c;
      }
      case 'LINKSTYLE':
        return this.parseLinkStyle();
      case 'DIRECTION_KW':
        return this.parseDirectionStatement();
      case 'COMMENT':
        return this.parseLayoutOrComment();
      case 'IDENT':
        return this.parseNodeOrEdge();
      case 'NEWLINE':
        this.advance();
        return null;
      case 'TRIPLE_COLON':
        // eslint-disable-next-line no-console
        console.warn('Mermaid: ::: вне узла, строка пропущена', token.start);
        this.consumeLineRemainder();
        return null;
      default:
        // eslint-disable-next-line no-console
        console.warn(`Mermaid: неподдерживаемый токен ${token.type}, строка пропущена`, token.start);
        this.consumeLineRemainder();
        return null;
    }
  }

  private parseGraph(): GraphAst {
    const graphToken = this.consume('GRAPH');
    this.skipNewlinesAndCommentsInline();
    const directionToken = this.consume('DIRECTION');
    const range = makeRange(graphToken.start, directionToken.end);

    return {
      type: 'Graph',
      direction: (directionToken.value ?? 'TD') as 'TD' | 'LR' | 'BT' | 'RL',
      range,
    };
  }

  private parseNodeOrEdge(): StatementAst {
    const startToken = this.peek();
    const fromNode = this.parseNodeCore();

    if (this.check('ARROW') || this.check('LINE') || this.check('DOTTED_ARROW')) {
      const opToken = this.advance();
      const operator: EdgeOperator = opToken.type === 'LINE' ? 'line' : 'arrow';
      const dotted = opToken.type === 'DOTTED_ARROW';

      let label: string | undefined;
      if (this.check('EDGE_LABEL')) {
        const labelToken = this.advance();
        label = labelToken.value ?? '';
      }

      const toNode = this.parseNodeCore();

      const endToken = this.previous();
      this.consumeLineRemainder();

      return {
        type: 'EdgeStatement',
        from: fromNode,
        to: toNode,
        operator,
        dotted: dotted || undefined,
        label,
        range: makeRange(startToken.start, endToken.end),
      };
    }

    const endToken = this.previous();
    this.consumeLineRemainder();

    const nodeStmt: NodeStatementAst = {
      type: 'NodeStatement',
      node: fromNode,
    };

    // range хранится внутри node
    return nodeStmt;
  }

  private parseNodeCore(): ParsedNode {
    const idToken = this.consume('IDENT');
    let label: string | undefined = idToken.value ?? undefined;
    let shape: NodeShape | undefined = 'rect';
    let className: string | undefined;
    let end = idToken.end;

    if (this.check('NODE_SHAPE_TEXT')) {
      const shapeToken = this.advance();
      label = shapeToken.value ?? undefined;
      shape = (shapeToken.meta?.shape as NodeShape | undefined) ?? undefined;
      end = shapeToken.end;
    }

    if (this.check('TRIPLE_COLON')) {
      this.consume('TRIPLE_COLON');
      const clsTok = this.consume('IDENT');
      className = clsTok.value ?? undefined;
      end = clsTok.end;
    }

    return {
      id: idToken.value ?? '',
      label,
      shape,
      className,
      range: makeRange(idToken.start, end),
    };
  }

  private parseClassDef(): ClassDefStatementAst {
    const kw = this.consume('CLASSDEF');
    this.skipWhitespaceNewlinesWithinStatement();
    const nameTok = this.consume('IDENT');
    const styleStart = this.peek().startOffset;
    this.consumeLineRemainder();
    const rawStyle = this.source.slice(styleStart, this.previous().endOffset).trim();
    return {
      type: 'ClassDefStatement',
      name: nameTok.value ?? '',
      rawStyle,
      range: makeRange(kw.start, this.previous().end),
    };
  }

  private parseClassStatement(): ClassStatementAst | null {
    const kw = this.consume('CLASS');
    const styleStart = this.peek().startOffset;
    this.consumeLineRemainder();
    const raw = this.source.slice(styleStart, this.previous().endOffset).trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      // eslint-disable-next-line no-console
      console.warn('class: ожидались id узлов и имя класса, пропуск', kw.start);
      return null;
    }
    const className = parts[parts.length - 1]!;
    const idsPart = parts.slice(0, -1).join(' ');
    const nodeIds = idsPart.split(',').map((x) => x.trim()).filter(Boolean);
    if (nodeIds.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('class: нет идентификаторов узлов, пропуск', kw.start);
      return null;
    }
    return {
      type: 'ClassStatement',
      nodeIds,
      className,
      range: makeRange(kw.start, this.previous().end),
    };
  }

  private parseLinkStyle(): LinkStyleStatementAst | null {
    const kw = this.consume('LINKSTYLE');
    const styleStart = this.peek().startOffset;
    this.consumeLineRemainder();
    const raw = this.source.slice(styleStart, this.previous().endOffset).trim();
    const m = raw.match(/^(\d+|default)\s*(.*)$/i);
    if (!m) {
      // eslint-disable-next-line no-console
      console.warn('linkStyle: не удалось разобрать, пропуск:', raw);
      return null;
    }
    let target: number | 'default';
    if (m[1]!.toLowerCase() === 'default') {
      target = 'default';
    } else {
      const n = Number.parseInt(m[1]!, 10);
      if (!Number.isFinite(n) || n < 0) {
        // eslint-disable-next-line no-console
        console.warn('linkStyle: неверный индекс, пропуск:', m[1]);
        return null;
      }
      target = n;
    }
    const rawStyle = (m[2] ?? '').trim();
    return {
      type: 'LinkStyleStatement',
      target,
      rawStyle,
      range: makeRange(kw.start, this.previous().end),
    };
  }

  private parseDirectionStatement(): DirectionStatementAst {
    const kw = this.consume('DIRECTION_KW');
    this.skipWhitespaceNewlinesWithinStatement();
    const d = this.consume('DIRECTION');
    this.consumeLineRemainder();
    return {
      type: 'DirectionStatement',
      direction: (d.value ?? 'TD') as Direction,
      range: makeRange(kw.start, this.previous().end),
    };
  }

  private parseStyle(): StyleStatementAst {
    const styleToken = this.consume('STYLE');
    this.skipWhitespaceNewlinesWithinStatement();
    const nodeToken = this.consume('IDENT');

    // everything until NEWLINE/EOF is raw style body from source
    const startToken = this.peek();
    let startOffset = startToken.startOffset;
    let endOffset = startToken.startOffset;

    while (!this.check('NEWLINE') && !this.check('EOF')) {
      const t = this.advance();
      endOffset = t.endOffset;
    }

    const rawStyle = this.source.slice(startOffset, endOffset).trim();
    this.consumeOptional('NEWLINE');

    return {
      type: 'StyleStatement',
      nodeId: nodeToken.value ?? '',
      rawStyle,
      range: makeRange(styleToken.start, nodeToken.end),
    };
  }

  private parseLayoutOrComment(): StatementAst {
    const commentToken = this.consume('COMMENT');
    const text = commentToken.value ?? '';
    const trimmed = text.trim();

    if (trimmed.startsWith('{')) {
      let rawJson = trimmed;
      let end = commentToken.end;
      let lastError: unknown = null;

      // Поддержка многострочного JSON, когда каждая строка идет с префиксом "%%".
      while (true) {
        try {
          const parsed = JSON.parse(rawJson) as {
            layout?: Record<string, LayoutHintData>;
            edgeStyles?: Record<string, Record<string, unknown>>;
          };
          if (
            parsed &&
            typeof parsed === 'object' &&
            (parsed.layout || parsed.edgeStyles)
          ) {
            const ast: LayoutHintAst = {
              type: 'LayoutHint',
              raw: rawJson,
              layout: parsed.layout ?? null,
              edgeStyles: parsed.edgeStyles ?? null,
              range: makeRange(commentToken.start, end),
            };
            return ast;
          }
          break;
        } catch (e) {
          lastError = e;
        }

        if (!this.check('NEWLINE')) {
          break;
        }
        this.advance();
        if (!this.check('COMMENT')) {
          // если после перевода строки не комментарий, откатываемся на один токен назад
          this.current -= 1;
          break;
        }

        const nextComment = this.advance();
        const nextTrimmed = (nextComment.value ?? '').trim();
        rawJson += `\n${nextTrimmed}`;
        end = nextComment.end;
      }

      const ast: LayoutHintAst = {
        type: 'LayoutHint',
        raw: rawJson,
        layout: null,
        error: lastError instanceof Error ? lastError.message : 'Unknown JSON error',
        range: makeRange(commentToken.start, end),
      };
      return ast;
    }

    return {
      type: 'Comment',
      text,
      range: makeRange(commentToken.start, commentToken.end),
    };
  }

  private skipNewlines(): void {
    while (this.check('NEWLINE')) {
      this.advance();
    }
  }

  private consumeLineRemainder(): void {
    while (!this.check('NEWLINE') && !this.check('EOF')) {
      this.advance();
    }
    this.consumeOptional('NEWLINE');
  }

  private skipWhitespaceNewlinesWithinStatement(): void {
    while (this.check('NEWLINE') || this.check('COMMENT')) {
      this.advance();
    }
  }

  private skipNewlinesAndCommentsInline(): void {
    while (this.check('NEWLINE') || this.check('COMMENT')) {
      this.advance();
    }
  }

  // basic combinators

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1] ?? this.tokens[0];
  }

  private advance(): Token {
    if (!this.match('EOF')) {
      this.current += 1;
    }
    return this.previous();
  }

  private check(type: TokenType): boolean {
    if (this.match('EOF')) return type === 'EOF';
    return this.peek().type === type;
  }

  private match(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private consume(type: TokenType): Token {
    if (this.check(type)) {
      return this.advance();
    }
    const token = this.peek();
    throw new ParseError(
      `Ожидался токен ${type}, получен ${token.type}`,
      token.start,
    );
  }

  private consumeOptional(type: TokenType): Token | null {
    if (this.check(type)) {
      return this.advance();
    }
    return null;
  }
}

function makeRange(start: Position, end: Position): Range {
  return { start, end };
}

export function parseMermaidAst(source: string): DiagramAst {
  const parser = new Parser(source);
  return parser.parseDiagram();
}

