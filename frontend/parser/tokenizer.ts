import type { Direction, NodeShape, Position } from './ast';

export type TokenType =
  | 'GRAPH'
  | 'STYLE'
  | 'DIRECTION'
  | 'IDENT'
  | 'ARROW' // -->
  | 'LINE' // ---
  | 'EDGE_LABEL' // |text|
  | 'NODE_SHAPE_TEXT' // [Text], ((Text)), {Text}
  | 'COMMENT'
  | 'NEWLINE'
  | 'EOF';

export interface BaseToken {
  type: TokenType;
  value?: string;
  start: Position;
  end: Position;
  startOffset: number;
  endOffset: number;
  meta?: Record<string, unknown>;
}

export type Token = BaseToken;

function makePosition(line: number, column: number): Position {
  return { line, column };
}

export class Lexer {
  private readonly input: string;
  private index = 0;
  private line = 1;
  private column = 1;

  constructor(input: string) {
    this.input = input;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      const ch = this.peek();

      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
        continue;
      }

      if (ch === '\n') {
        const start = this.currentPosition();
        const startOffset = this.index;
        this.advance();
        const end = this.currentPosition();
        tokens.push({
          type: 'NEWLINE',
          start,
          end,
          startOffset,
          endOffset: this.index,
        });
        continue;
      }

      // Comments: %% ...
      if (ch === '%' && this.peekNext() === '%') {
        tokens.push(this.readComment());
        continue;
      }

      // Edge labels: |text|
      if (ch === '|') {
        tokens.push(this.readEdgeLabel());
        continue;
      }

      // Arrows / lines: --> or ---
      if (ch === '-') {
        const arrowOrLine = this.readArrowOrLine();
        if (arrowOrLine) {
          tokens.push(arrowOrLine);
          continue;
        }
      }

      // Node shapes: [Text], ((Text)), {Text}
      if (ch === '[' || ch === '{' || (ch === '(' && this.peekNext() === '(')) {
        tokens.push(this.readNodeShapeText());
        continue;
      }

      // Identifiers / keywords (graph, style, TD, LR, node ids)
      if (this.isIdentifierStart(ch)) {
        tokens.push(this.readIdentifierLike());
        continue;
      }

      // Fallback: skip unknown characters
      this.advance();
    }

    const pos = this.currentPosition();
    tokens.push({
      type: 'EOF',
      start: pos,
      end: pos,
      startOffset: this.index,
      endOffset: this.index,
    });

    return tokens;
  }

  private isAtEnd(): boolean {
    return this.index >= this.input.length;
  }

  private peek(): string {
    return this.input[this.index] ?? '\0';
  }

  private peekNext(): string {
    return this.input[this.index + 1] ?? '\0';
  }

  private advance(): string {
    const ch = this.input[this.index] ?? '\0';
    this.index += 1;
    if (ch === '\n') {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    return ch;
  }

  private currentPosition(): Position {
    return makePosition(this.line, this.column);
  }

  private readComment(): Token {
    const start = this.currentPosition();
    const startOffset = this.index;
    // consume %%
    this.advance();
    this.advance();
    let text = '';
    while (!this.isAtEnd() && this.peek() !== '\n') {
      text += this.advance();
    }
    const end = this.currentPosition();
    const endOffset = this.index;
    return {
      type: 'COMMENT',
      value: text.trim(),
      start,
      end,
      startOffset,
      endOffset,
    };
  }

  private readEdgeLabel(): Token {
    const start = this.currentPosition();
    const startOffset = this.index;
    // skip opening |
    this.advance();
    let text = '';
    while (!this.isAtEnd() && this.peek() !== '|') {
      text += this.advance();
    }
    if (this.peek() === '|') {
      this.advance();
    }
    const end = this.currentPosition();
    const endOffset = this.index;
    return {
      type: 'EDGE_LABEL',
      value: text,
      start,
      end,
      startOffset,
      endOffset,
    };
  }

  private readArrowOrLine(): Token | null {
    const start = this.currentPosition();
    const startOffset = this.index;

    if (this.peek() !== '-' || this.peekNext() !== '-') {
      return null;
    }

    // consume first two dashes
    this.advance();
    this.advance();

    const third = this.peek();
    if (third === '>') {
      this.advance();
      const end = this.currentPosition();
      const endOffset = this.index;
      return {
        type: 'ARROW',
        value: '-->',
        start,
        end,
        startOffset,
        endOffset,
      };
    }

    if (third === '-') {
      this.advance();
      const end = this.currentPosition();
      const endOffset = this.index;
      return {
        type: 'LINE',
        value: '---',
        start,
        end,
        startOffset,
        endOffset,
      };
    }

    // Not actually an arrow/line, roll back by 2 (very unlikely in our subset)
    this.index -= 2;
    this.column -= 2;
    return null;
  }

  private readNodeShapeText(): Token {
    const opener = this.peek();
    const start = this.currentPosition();
    const startOffset = this.index;
    const isDoubleParen = opener === '(' && this.peekNext() === '(';
    const shape: NodeShape = opener === '[' ? 'rect' : opener === '{' ? 'diamond' : 'circle';
    const expectedCloser = opener === '[' ? ']' : opener === '{' ? '}' : ')';

    // consume opener(s)
    this.advance();
    if (isDoubleParen) {
      this.advance();
    }

    let text = '';
    while (!this.isAtEnd() && this.peek() !== '\n') {
      if (shape === 'circle' && this.peek() === ')' && this.peekNext() === ')') {
        break;
      }
      if (shape !== 'circle' && this.peek() === expectedCloser) {
        break;
      }
      text += this.advance();
    }

    if (shape === 'circle' && this.peek() === ')' && this.peekNext() === ')') {
      this.advance();
      this.advance();
    } else if (this.peek() === expectedCloser) {
      this.advance();
    }

    const end = this.currentPosition();
    const endOffset = this.index;

    return {
      type: 'NODE_SHAPE_TEXT',
      value: text,
      meta: { shape },
      start,
      end,
      startOffset,
      endOffset,
    };
  }

  private isIdentifierStart(ch: string): boolean {
    return /[A-Za-zА-Яа-я0-9_]/.test(ch);
  }

  private isIdentifierPart(ch: string): boolean {
    return /[A-Za-zА-Яа-я0-9_]/.test(ch);
  }

  private readIdentifierLike(): Token {
    const start = this.currentPosition();
    const startOffset = this.index;
    let text = '';
    while (!this.isAtEnd() && this.isIdentifierPart(this.peek())) {
      text += this.advance();
    }
    const end = this.currentPosition();
    const endOffset = this.index;

    const lower = text.toLowerCase();
    let type: TokenType = 'IDENT';
    let value: string | undefined = text;

    if (lower === 'graph') {
      type = 'GRAPH';
      value = text;
    } else if (lower === 'style') {
      type = 'STYLE';
      value = text;
    } else if (text === 'TD' || text === 'LR' || text === 'BT' || text === 'RL') {
      type = 'DIRECTION';
      value = text as Direction;
    }

    return {
      type,
      value,
      start,
      end,
      startOffset,
      endOffset,
    };
  }
}

export function tokenize(input: string): Token[] {
  return new Lexer(input).tokenize();
}

