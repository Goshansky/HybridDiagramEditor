import { parseMermaidAst } from './parser';
import { buildDiagramModel, type DiagramModel } from './model';

export function parseFlowchart(source: string): DiagramModel {
  const ast = parseMermaidAst(source);
  const model = buildDiagramModel(ast);
  model.metadata.diagramType = 'flowchart';
  return model;
}
