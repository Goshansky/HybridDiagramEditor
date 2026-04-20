/** Модель sequenceDiagram (Mermaid) — отдельно от flowchart nodes/edges. */

export type SequenceParticipantKind = 'participant' | 'actor';

export interface SequenceParticipant {
  id: string;
  label: string;
  type: SequenceParticipantKind;
}

/** Типы стрелок sequenceDiagram (как в Mermaid). */
export type SequenceArrowKind =
  | 'solid' // ->
  | 'solid-arrow' // ->>
  | 'dashed-arrow' // -->>
  | 'dashed-open' // --) пунктир без стрелки
  | 'dashed-cross' // --x
  | 'solid-cross' // -x
  | 'dotted-arrow'; // ..>> если понадобится

export interface SequenceMessage {
  id: string;
  from: string;
  to: string;
  arrow: SequenceArrowKind;
  label: string;
  /** Короткая форма activate/deactivate на стрелке: A->>+B / A-->>-B */
  activation?: 'activate' | 'deactivate' | null;
}

export interface SequenceNote {
  id: string;
  placement: 'over' | 'left' | 'right';
  participants: string[];
  text: string;
}

export type SequenceBlockKind =
  | 'alt'
  | 'opt'
  | 'loop'
  | 'par'
  | 'critical'
  | 'break';

/** Ветка alt: условие + тело. Первая ветка — после `alt`, дальше `else`. */
export interface SequenceAltBranch {
  label?: string;
  body: SequenceStatement[];
}

export interface SequenceParBranch {
  label?: string;
  body: SequenceStatement[];
}

export interface SequenceCriticalBranch {
  label?: string;
  body: SequenceStatement[];
}

export type SequenceStatement =
  | { kind: 'message'; message: SequenceMessage }
  | { kind: 'activate'; participant: string }
  | { kind: 'deactivate'; participant: string }
  | { kind: 'note'; note: SequenceNote }
  | { kind: 'alt'; branches: SequenceAltBranch[] }
  | { kind: 'opt'; label?: string; body: SequenceStatement[] }
  | { kind: 'loop'; label?: string; body: SequenceStatement[] }
  | { kind: 'par'; label?: string; branches: SequenceParBranch[] }
  | { kind: 'critical'; branches: SequenceCriticalBranch[] }
  | { kind: 'break'; label?: string; body: SequenceStatement[] };

export interface SequenceDiagramData {
  participants: SequenceParticipant[];
  statements: SequenceStatement[];
  autonumber: boolean;
  /** style NodeId fill:...,stroke:... */
  participantStyles: Record<string, Record<string, string>>;
}
