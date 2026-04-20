import type { DiagramModel } from './model';
import { parseSequenceDiagramData, sequenceDataToDiagramModel } from './sequenceParserCore';

export function parseSequenceDiagram(source: string): DiagramModel {
  const data = parseSequenceDiagramData(source);
  return sequenceDataToDiagramModel(data);
}
