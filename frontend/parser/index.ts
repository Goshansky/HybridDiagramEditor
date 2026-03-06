import { parseMermaidAst } from './parser';
import { buildDiagramModel, type DiagramModel } from './model';

export type { DiagramModel } from './model';

export function parseMermaidFlowchart(source: string): DiagramModel {
  const ast = parseMermaidAst(source);
  return buildDiagramModel(ast);
}

