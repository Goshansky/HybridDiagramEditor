import React from 'react';

import type { DiagramModel, DiagramType } from '../../parser';
import {
  replaceEdgeDefinition,
  replaceEdgeOperator,
  replaceNodeDefinition,
  upsertEdgeStyleInHint,
  upsertLayoutHint,
  upsertLayoutSize,
  upsertNodeStyleLine,
  type FlowNodeShape,
} from '../../parser';
import { ClassDiagramPropertiesPanel } from './ClassDiagramPropertiesPanel';
import { ErDiagramPropertiesPanel } from './ErDiagramPropertiesPanel';
import { useAppDispatch, useAppSelector } from '../store';
import {
  clearSelectedElement,
  getSelectedEdgeIndexFromState,
  getSelectedNodeIdFromState,
} from '../store/uiSlice';

export interface PropertiesPanelProps {
  diagramType: DiagramType;
  model: DiagramModel | null;
  source: string;
  onSourceChange: (next: string) => void;
}

const SHAPES: FlowNodeShape[] = [
  'rect',
  'diamond',
  'circle',
  'oval',
  'parallelogram',
  'cloud',
];

function parseStrokeWidth(styles: Record<string, string>): number {
  const raw = styles['stroke-width'] ?? styles.strokeWidth;
  if (!raw) return 1.5;
  const n = Number.parseFloat(String(raw).replace(/px/gi, '').trim());
  return Number.isFinite(n) ? n : 1.5;
}

function normalizeHex(input: string, fallback: string): string {
  const t = input?.trim();
  if (t?.startsWith('#') && (t.length === 7 || t.length === 4)) return t;
  return fallback;
}

function parseEdgeStrokeColor(styles: Record<string, string>): string {
  return normalizeHex(styles.stroke ?? '', '#4b5563');
}

function parseEdgeStrokeWidthForInput(styles: Record<string, string>): number {
  const raw = styles['stroke-width'] ?? styles.strokeWidth;
  if (raw === undefined || raw === '') return 2;
  const n = Number.parseFloat(String(raw).replace(/px/gi, '').trim());
  return Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : 2;
}

function edgeDashMode(styles: Record<string, string>): 'solid' | 'dashed' {
  const d = styles['stroke-dasharray'];
  if (!d || d === 'none') return 'solid';
  return 'dashed';
}

function nodeAnchor(model: DiagramModel, nodeId: string): { x: number; y: number } {
  const node = model.nodes.find((n) => n.id === nodeId);
  const lx = model.layout[nodeId]?.x;
  const ly = model.layout[nodeId]?.y;
  const x = typeof node?.x === 'number' ? node.x : lx ?? 120;
  const y = typeof node?.y === 'number' ? node.y : ly ?? 80;
  return { x, y };
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  diagramType,
  model,
  source,
  onSourceChange,
}) => {
  const dispatch = useAppDispatch();
  const selectedNodeId = useAppSelector((s) => getSelectedNodeIdFromState(s.ui));
  const selectedEdgeIndex = useAppSelector((s) => getSelectedEdgeIndexFromState(s.ui));
  const selectionType = useAppSelector((s) => s.ui.selectedElementType);

  if (diagramType !== 'flowchart' && diagramType !== 'class' && diagramType !== 'er') {
    return (
      <aside style={panelOuter}>
        <div style={panelHeader}>
          <h3 style={h3}>Свойства</h3>
        </div>
        <p style={muted}>Для типа «{diagramType}» панель свойств пока не поддерживается.</p>
      </aside>
    );
  }

  if (!model || selectionType === null) {
    return (
      <aside style={panelOuter}>
        <div style={panelHeader}>
          <h3 style={h3}>Свойства</h3>
        </div>
        <p style={muted}>Ничего не выбрано. Кликни по узлу или связи на холсте.</p>
      </aside>
    );
  }

  if (diagramType === 'class') {
    return (
      <ClassDiagramPropertiesPanel
        model={model}
        source={source}
        onSourceChange={onSourceChange}
        selectedNodeId={selectedNodeId}
        selectedEdgeIndex={selectedEdgeIndex}
      />
    );
  }

  if (diagramType === 'er') {
    return <ErDiagramPropertiesPanel model={model} source={source} onSourceChange={onSourceChange} />;
  }

  if (selectedNodeId) {
    const node = model.nodes.find((n) => n.id === selectedNodeId);
    if (!node) {
      return (
        <aside style={panelOuter}>
          <p style={muted}>Узел не найден в модели.</p>
        </aside>
      );
    }
    const anchor = nodeAnchor(model, node.id);
    const w = typeof node.width === 'number' ? node.width : 110;
    const h = typeof node.height === 'number' ? node.height : 46;
    const fill = normalizeHex(node.styles.fill ?? '', '#ffffff');
    const stroke = normalizeHex(node.styles.stroke ?? '', '#4f46e5');
    const sw = parseStrokeWidth(node.styles);
    const shape = (node.shape ?? 'rect') as FlowNodeShape;

    const apply = (next: string): void => onSourceChange(next);

    return (
      <aside style={panelOuter}>
        <div style={panelHeader}>
          <h3 style={h3}>Узел</h3>
          <button type="button" style={linkBtn} onClick={() => dispatch(clearSelectedElement())}>
            Снять
          </button>
        </div>
        <div style={scroll}>
          <section style={section}>
            <div style={sectionTitle}>Текст и форма</div>
            <label style={label}>
              Подпись
              <input
                style={input}
                value={node.label}
                onChange={(e) =>
                  apply(replaceNodeDefinition(source, node.id, e.target.value, shape))
                }
              />
            </label>
            <label style={label}>
              Форма
              <select
                style={input}
                value={shape}
                onChange={(e) =>
                  apply(
                    replaceNodeDefinition(
                      source,
                      node.id,
                      node.label,
                      e.target.value as FlowNodeShape,
                    ),
                  )
                }
              >
                {SHAPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section style={section}>
            <div style={sectionTitle}>Позиция и размер</div>
            <div style={row2}>
              <label style={label}>
                X
                <input
                  type="number"
                  step={1}
                  style={input}
                  value={Math.round(anchor.x)}
                  onChange={(e) => {
                    const x = Number(e.target.value);
                    if (!Number.isFinite(x)) return;
                    apply(
                      upsertLayoutHint(source, node.id, x, anchor.y, {
                        width: w,
                        height: h,
                      }),
                    );
                  }}
                />
              </label>
              <label style={label}>
                Y
                <input
                  type="number"
                  step={1}
                  style={input}
                  value={Math.round(anchor.y)}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    if (!Number.isFinite(y)) return;
                    apply(
                      upsertLayoutHint(source, node.id, anchor.x, y, {
                        width: w,
                        height: h,
                      }),
                    );
                  }}
                />
              </label>
            </div>
            <div style={row2}>
              <label style={label}>
                Ширина
                <input
                  type="number"
                  min={40}
                  step={1}
                  style={input}
                  value={Math.round(w)}
                  onChange={(e) => {
                    const width = Number(e.target.value);
                    if (!Number.isFinite(width)) return;
                    apply(upsertLayoutSize(source, node.id, width, h, anchor));
                  }}
                />
              </label>
              <label style={label}>
                Высота
                <input
                  type="number"
                  min={28}
                  step={1}
                  style={input}
                  value={Math.round(h)}
                  onChange={(e) => {
                    const height = Number(e.target.value);
                    if (!Number.isFinite(height)) return;
                    apply(upsertLayoutSize(source, node.id, w, height, anchor));
                  }}
                />
              </label>
            </div>
          </section>

          <section style={section}>
            <div style={sectionTitle}>Внешний вид</div>
            <label style={label}>
              Заливка
              <input
                type="color"
                style={colorInput}
                value={fill}
                onChange={(e) =>
                  apply(
                    upsertNodeStyleLine(source, node.id, {
                      fill: e.target.value,
                      stroke,
                      strokeWidth: sw,
                    }),
                  )
                }
              />
            </label>
            <label style={label}>
              Обводка
              <input
                type="color"
                style={colorInput}
                value={stroke}
                onChange={(e) =>
                  apply(
                    upsertNodeStyleLine(source, node.id, {
                      fill,
                      stroke: e.target.value,
                      strokeWidth: sw,
                    }),
                  )
                }
              />
            </label>
            <label style={label}>
              Толщина обводки (px)
              <input
                type="number"
                min={0.5}
                step={0.5}
                style={input}
                value={sw}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  apply(
                    upsertNodeStyleLine(source, node.id, {
                      fill,
                      stroke,
                      strokeWidth: n,
                    }),
                  );
                }}
              />
            </label>
          </section>
        </div>
      </aside>
    );
  }

  if (selectedEdgeIndex !== null && model.edges[selectedEdgeIndex]) {
    const edge = model.edges[selectedEdgeIndex];
    const apply = (next: string): void => onSourceChange(next);
    const stroke = parseEdgeStrokeColor(edge.styles ?? {});
    const sw = parseEdgeStrokeWidthForInput(edge.styles ?? {});
    const dash = edgeDashMode(edge.styles ?? {});
    return (
      <aside style={panelOuter}>
        <div style={panelHeader}>
          <h3 style={h3}>Связь</h3>
          <button type="button" style={linkBtn} onClick={() => dispatch(clearSelectedElement())}>
            Снять
          </button>
        </div>
        <div style={scroll}>
          <section style={section}>
            <div style={sectionTitle}>Концы</div>
            <label style={label}>
              Откуда
              <input style={{ ...input, opacity: 0.85 }} readOnly value={edge.from} />
            </label>
            <label style={label}>
              Куда
              <input style={{ ...input, opacity: 0.85 }} readOnly value={edge.to} />
            </label>
          </section>
          <section style={section}>
            <div style={sectionTitle}>Текст и тип</div>
            <label style={label}>
              Метка
              <input
                style={input}
                value={edge.label ?? ''}
                onChange={(e) =>
                  apply(
                    replaceEdgeDefinition(
                      source,
                      {
                        from: edge.from,
                        to: edge.to,
                        label: edge.label,
                        type: edge.type,
                      },
                      e.target.value,
                      selectedEdgeIndex,
                    ),
                  )
                }
              />
            </label>
            <label style={label}>
              Тип линии
              <select
                style={input}
                value={edge.type}
                onChange={(e) => {
                  const nextType = e.target.value as 'arrow' | 'line';
                  apply(
                    replaceEdgeOperator(
                      source,
                      {
                        from: edge.from,
                        to: edge.to,
                        label: edge.label,
                        type: edge.type,
                      },
                      nextType,
                      selectedEdgeIndex,
                    ),
                  );
                }}
              >
                <option value="arrow">Стрелка (--&gt;)</option>
                <option value="line">Линия (---)</option>
              </select>
            </label>
          </section>
          <section style={section}>
            <div style={sectionTitle}>Внешний вид линии</div>
            <label style={label}>
              Толщина (px)
              <input
                type="number"
                min={1}
                max={10}
                step={1}
                style={input}
                value={sw}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  apply(
                    upsertEdgeStyleInHint(source, selectedEdgeIndex, {
                      strokeWidth: Math.min(10, Math.max(1, n)),
                    }),
                  );
                }}
              />
            </label>
            <label style={label}>
              Цвет
              <input
                type="color"
                style={colorInput}
                value={stroke}
                onChange={(e) =>
                  apply(
                    upsertEdgeStyleInHint(source, selectedEdgeIndex, {
                      stroke: e.target.value,
                    }),
                  )
                }
              />
            </label>
            <label style={label}>
              Пунктир
              <select
                style={input}
                value={dash}
                onChange={(e) => {
                  const mode = e.target.value as 'solid' | 'dashed';
                  apply(
                    upsertEdgeStyleInHint(source, selectedEdgeIndex, {
                      strokeDasharray: mode === 'dashed' ? '5 5' : null,
                    }),
                  );
                }}
              >
                <option value="solid">Сплошная</option>
                <option value="dashed">Пунктир</option>
              </select>
            </label>
          </section>
        </div>
      </aside>
    );
  }

  return (
    <aside style={panelOuter}>
      <p style={muted}>Ничего не выбрано.</p>
    </aside>
  );
};

const panelOuter: React.CSSProperties = {
  height: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  background: '#ffffff',
  borderLeft: '1px solid #e5e7eb',
};

const panelHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 14px',
  borderBottom: '1px solid #e5e7eb',
  flexShrink: 0,
};

const h3: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  color: '#111827',
};

const scroll: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  padding: 12,
};

const section: React.CSSProperties = {
  marginBottom: 16,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 8,
};

const label: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: '#374151',
  marginBottom: 10,
};

const input: React.CSSProperties = {
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 13,
  color: '#111827',
  background: '#ffffff',
};

const colorInput: React.CSSProperties = {
  ...input,
  height: 36,
  padding: 4,
  cursor: 'pointer',
};

const row2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
};

const muted: React.CSSProperties = {
  margin: 0,
  padding: 14,
  fontSize: 13,
  color: '#6b7280',
  lineHeight: 1.5,
};

const linkBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#4f46e5',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
};
