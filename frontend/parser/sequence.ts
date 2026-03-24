import type { DiagramModel } from './model';

export function parseSequenceDiagram(source: string): DiagramModel {
  const lines = source.split(/\r?\n/);
  const participants: Array<{ id: string; label: string }> = [];
  const participantSet = new Set<string>();
  const edges: DiagramModel['edges'] = [];

  const ensureParticipant = (id: string, label?: string): void => {
    if (participantSet.has(id)) return;
    participantSet.add(id);
    participants.push({ id, label: label ?? id });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const participantMatch = trimmed.match(
      /^participant\s+([A-Za-z_][\w]*)(?:\s+as\s+(.+))?$/,
    );
    if (participantMatch) {
      ensureParticipant(participantMatch[1], participantMatch[2]?.trim());
      continue;
    }

    const msgMatch = trimmed.match(
      /^([A-Za-z_][\w]*)\s*-\>{1,2}\s*([A-Za-z_][\w]*)\s*:\s*(.+)$/,
    );
    if (msgMatch) {
      const [, from, to, label] = msgMatch;
      ensureParticipant(from);
      ensureParticipant(to);
      edges.push({
        from,
        to,
        label: label.trim(),
        type: 'arrow',
        styles: {},
      });
    }
  }

  const spacing = 180;
  const startX = 140;
  const nodes = participants.map((p, idx) => ({
    id: p.id,
    label: p.label,
    shape: 'rect' as const,
    styles: {},
    x: startX + idx * spacing,
    y: 70,
  }));

  return {
    nodes,
    edges,
    layout: {},
    metadata: {
      direction: 'LR',
      diagramType: 'sequence',
    },
  };
}
