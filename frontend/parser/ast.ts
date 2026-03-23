export type Direction = 'TD' | 'LR' | 'BT' | 'RL';

export interface Position {
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export type NodeShape = 'rect' | 'circle' | 'diamond';

export interface ParsedNode {
  id: string;
  label?: string;
  shape?: NodeShape;
  range: Range;
}

export interface GraphAst {
  type: 'Graph';
  direction: Direction;
  range: Range;
}

export interface NodeStatementAst {
  type: 'NodeStatement';
  node: ParsedNode;
}

export type EdgeOperator = 'arrow' | 'line';

export interface EdgeStatementAst {
  type: 'EdgeStatement';
  from: ParsedNode;
  to: ParsedNode;
  operator: EdgeOperator;
  label?: string;
  range: Range;
}

export interface StyleStatementAst {
  type: 'StyleStatement';
  nodeId: string;
  rawStyle: string;
  range: Range;
}

export interface LayoutHintData {
  x?: number;
  y?: number;
  // room for future extensions
  [key: string]: unknown;
}

export interface LayoutHintAst {
  type: 'LayoutHint';
  raw: string;
  layout: Record<string, LayoutHintData> | null;
  range: Range;
  error?: string;
}

export interface CommentStatementAst {
  type: 'Comment';
  text: string;
  range: Range;
}

export type StatementAst =
  | NodeStatementAst
  | EdgeStatementAst
  | StyleStatementAst
  | LayoutHintAst
  | CommentStatementAst
  | GraphAst;

export interface DiagramAst {
  type: 'Diagram';
  graph?: GraphAst;
  statements: StatementAst[];
}

