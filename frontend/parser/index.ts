import { type DiagramModel } from './model';
import {
  sourceHasLayoutPositionHints,
  stripLayoutHintsFromSource,
  upsertLayoutHint,
  upsertLayoutSize,
} from './layoutHintSync';
import { parseFlowchart } from './flowchart';
import { parseClassDiagram } from './classDiagram';
import { parseSequenceDiagram } from './sequence';
import { parseErDiagram } from './erDiagram';

export type DiagramType = 'flowchart' | 'class' | 'sequence' | 'er';

export type { DiagramEdgePoint, DiagramModel } from './model';
export {
  sourceHasLayoutPositionHints,
  stripLayoutHintsFromSource,
  upsertLayoutHint,
  upsertLayoutSize,
};
export * from './flowchartSync';

export function parseMermaidFlowchart(
  source: string,
  useAutoLayout = true,
): DiagramModel {
  return parseFlowchart(source, useAutoLayout);
}

export function parseMermaidByType(
  source: string,
  diagramType: DiagramType,
  useAutoLayout = true,
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
  return parseFlowchart(source, useAutoLayout);
}

