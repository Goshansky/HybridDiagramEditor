import type { DiagramModel } from './model';
import { extractLayoutHints } from './layoutHints';

export function parseErDiagram(source: string): DiagramModel {
  const lines = source.split(/\r?\n/);
  const layout = extractLayoutHints(source);
  const nodes = new Map<
    string,
    { id: string; label: string; shape: 'rect'; styles: Record<string, string>; x?: number; y?: number }
  >();
  const edges: DiagramModel['edges'] = [];

  const ensure = (id: string): void => {
    if (!nodes.has(id)) {
      const pos = layout[id];
      nodes.set(id, {
        id,
        label: id,
        shape: 'rect',
        styles: {},
        x: pos?.x,
        y: pos?.y,
      });
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const entityMatch = trimmed.match(/^([A-Z][A-Z0-9_]*)\s*\{$/);
    if (entityMatch) {
      ensure(entityMatch[1]);
      continue;
    }

    const relationMatch = trimmed.match(
      /^([A-Z][A-Z0-9_]*)\s+([|}{o\-]+)\s+([A-Z][A-Z0-9_]*)(?:\s*:\s*(.+))?$/,
    );
    if (relationMatch) {
      const [, from, rel, to, label] = relationMatch;
      ensure(from);
      ensure(to);
      edges.push({
        from,
        to,
        label: label?.trim() ?? rel,
        type: 'line',
        styles: {},
      });
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    layout,
    metadata: {
      direction: 'TD',
      diagramType: 'er',
    },
  };
}
