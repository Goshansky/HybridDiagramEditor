import { parseMermaidAst } from './parser';
import { buildDiagramModel, type DiagramModel } from './model';
import { applyDagreLayout } from '../src/services/layoutService';

export function parseFlowchart(
  source: string,
  useAutoLayout = true,
): DiagramModel {
  const ast = parseMermaidAst(source);
  const model = buildDiagramModel(ast);
  model.metadata.diagramType = 'flowchart';
  applyDagreLayout(model, useAutoLayout);
  return model;
}
