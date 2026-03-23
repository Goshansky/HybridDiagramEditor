import { parseMermaidAst } from './parser';
import { buildDiagramModel, type DiagramModel } from './model';
import { upsertLayoutHint } from './layoutHintSync';

export type { DiagramModel } from './model';
export { upsertLayoutHint };

export function parseMermaidFlowchart(source: string): DiagramModel {
  const ast = parseMermaidAst(source);
  return buildDiagramModel(ast);
}

