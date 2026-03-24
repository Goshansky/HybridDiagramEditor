import { type DiagramModel } from './model';
import { upsertLayoutHint } from './layoutHintSync';
import { parseFlowchart } from './flowchart';
import { parseClassDiagram } from './classDiagram';
import { parseSequenceDiagram } from './sequence';
import { parseErDiagram } from './erDiagram';

export type DiagramType = 'flowchart' | 'class' | 'sequence' | 'er';

export type { DiagramModel } from './model';
export { upsertLayoutHint };

export function parseMermaidFlowchart(source: string): DiagramModel {
  return parseFlowchart(source);
}

export function parseMermaidByType(
  source: string,
  diagramType: DiagramType,
): DiagramModel {
  if (diagramType === 'class') {
    return parseClassDiagram(source);
  }
  if (diagramType === 'sequence') {
    return parseSequenceDiagram(source);
  }
  if (diagramType === 'er') {
    return parseErDiagram(source);
  }
  return parseFlowchart(source);
}

