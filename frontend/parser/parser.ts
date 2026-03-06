import {
  type DiagramAst,
  type EdgeOperator,
  type GraphAst,
  type LayoutHintAst,
  type LayoutHintData,
  type NodeShape,
  type NodeStatementAst,
  type ParsedNode,
  type Position,
  type Range,
  type StatementAst,
  type StyleStatementAst,
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

  constructor(source: string, tokens?: Token[]) {
    this.source = source;
    this.tokens = tokens ?? tokenize(source);
  }

  parseDiagram(): DiagramAst {
    const statements: StatementAst[] = [];

    while (!this.match('EOF')) {
      this.skipNewlines();
      if (this.match('EOF')) break;

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
    };
  }

  private parseStatement(): StatementAst | null {
    const token = this.peek();

    switch (token.type) {
      case 'GRAPH':
        return this.parseGraph();
      case 'STYLE':
        return this.parseStyle();
      case 'COMMENT':
        return this.parseLayoutOrComment();
      case 'IDENT':
        return this.parseNodeOrEdge();
      case 'NEWLINE':
        this.advance();
        return null;
      default:
        this.advance();
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
      direction: (directionToken.value ?? 'TD') as 'TD' | 'LR',
      range,
    };
  }

  private parseNodeOrEdge(): StatementAst {
    const startToken = this.peek();
    const fromNode = this.parseNodeCore();

    if (this.check('ARROW') || this.check('LINE')) {
      const opToken = this.advance();
      const operator: EdgeOperator = opToken.type === 'ARROW' ? 'arrow' : 'line';

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
    let label: string | undefined;
    let shape: NodeShape | undefined;
    let end = idToken.end;

    if (this.check('NODE_SHAPE_TEXT')) {
      const shapeToken = this.advance();
      label = shapeToken.value ?? undefined;
      shape = (shapeToken.meta?.shape as NodeShape | undefined) ?? undefined;
      end = shapeToken.end;
    }

    return {
      id: idToken.value ?? '',
      label,
      shape,
      range: makeRange(idToken.start, end),
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
      try {
        const parsed = JSON.parse(trimmed) as {
          layout?: Record<string, LayoutHintData>;
        };
        if (parsed && typeof parsed === 'object' && parsed.layout) {
          const ast: LayoutHintAst = {
            type: 'LayoutHint',
            raw: trimmed,
            layout: parsed.layout,
            range: makeRange(commentToken.start, commentToken.end),
          };
          return ast;
        }
        // no layout key – treat as plain comment
      } catch (e) {
        const ast: LayoutHintAst = {
          type: 'LayoutHint',
          raw: trimmed,
          layout: null,
          error: e instanceof Error ? e.message : 'Unknown JSON error',
          range: makeRange(commentToken.start, commentToken.end),
        };
        // layout с ошибкой – вернём хинт, builder решит, что с ним делать
        return ast;
      }
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

