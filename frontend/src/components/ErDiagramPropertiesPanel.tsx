import React from 'react';

import type { DiagramModel, EntityAttribute } from '../../parser';
import { generateERDiagramMermaid } from '../../parser';
import { useAppDispatch, useAppSelector } from '../store';
import {
  clearSelectedElement,
  getSelectedEdgeIndexFromState,
  getSelectedNodeIdFromState,
} from '../store/uiSlice';

interface ErDiagramPropertiesPanelProps {
  model: DiagramModel;
  source: string;
  onSourceChange: (next: string) => void;
}

const ATTR_TYPES = [
  'int',
  'string',
  'date',
  'decimal',
  'boolean',
  'text',
  'float',
  'double',
  'timestamp',
] as const;
const CARDINALITIES = ['||', 'o|', '|o', '}{', '|{', '}|', '{', '}', 'o{', '}o'] as const;

function normalizeHex(input: string, fallback: string): string {
  const t = input?.trim();
  if (t?.startsWith('#') && (t.length === 7 || t.length === 4)) return t;
  return fallback;
}

function cloneModel(model: DiagramModel): DiagramModel {
  return {
    ...model,
    nodes: model.nodes.map((n) => ({
      ...n,
      styles: { ...(n.styles ?? {}) },
      classBox: n.classBox
        ? {
            ...n.classBox,
            fields: n.classBox.fields.map((f) => ({ ...f })),
            methods: n.classBox.methods.map((m) => ({
              ...m,
              params: m.params.map((p) => ({ ...p })),
            })),
          }
        : undefined,
      erEntity: n.erEntity
        ? {
            ...n.erEntity,
            attributes: n.erEntity.attributes.map((a) => ({ ...a })),
            styles: n.erEntity.styles ? { ...n.erEntity.styles } : undefined,
          }
        : undefined,
    })),
    edges: model.edges.map((e) => ({
      ...e,
      styles: { ...(e.styles ?? {}) },
      points: e.points?.map((p) => ({ ...p })),
    })),
    layout: { ...(model.layout ?? {}) },
    erData: model.erData
      ? {
          entities: model.erData.entities.map((e) => ({
            ...e,
            attributes: e.attributes.map((a) => ({ ...a })),
            styles: e.styles ? { ...e.styles } : undefined,
          })),
          relationships: model.erData.relationships.map((r) => ({
            ...r,
            styles: r.styles ? { ...r.styles } : undefined,
          })),
        }
      : undefined,
  };
}

export const ErDiagramPropertiesPanel: React.FC<ErDiagramPropertiesPanelProps> = ({
  model,
  source,
  onSourceChange,
}) => {
  const dispatch = useAppDispatch();
  const selectedNodeId = useAppSelector((s) => getSelectedNodeIdFromState(s.ui));
  const selectedEdgeIndex = useAppSelector((s) => getSelectedEdgeIndexFromState(s.ui));

  const applyWith = (mutator: (draft: DiagramModel) => void): void => {
    const draft = cloneModel(model);
    mutator(draft);
    onSourceChange(generateERDiagramMermaid(draft, source));
  };

  if (selectedNodeId) {
    const node = model.nodes.find((n) => n.id === selectedNodeId && n.shape === 'er_box' && n.erEntity);
    if (!node || !node.erEntity) {
      return (
        <aside style={panelOuter}>
          <div style={panelHeader}>
            <h3 style={h3}>ER сущность</h3>
          </div>
          <p style={muted}>Сущность не найдена.</p>
        </aside>
      );
    }

    const ent = node.erEntity;
    const fill = normalizeHex(node.styles.fill ?? '', '#ffffff');
    const stroke = normalizeHex(node.styles.stroke ?? '', '#334155');
    const sw = Number.parseFloat(String(node.styles['stroke-width'] ?? '1.5').replace(/px/gi, '')) || 1.5;

    const renameEntity = (nextIdRaw: string): void => {
      const nextId = nextIdRaw.trim().replace(/\s+/g, '_');
      if (!nextId || nextId === ent.id) return;
      applyWith((draft) => {
        const dn = draft.nodes.find((n) => n.id === ent.id && n.shape === 'er_box');
        if (!dn || !dn.erEntity) return;
        dn.id = nextId;
        dn.label = nextId;
        dn.erEntity.id = nextId;
        if (draft.layout[ent.id]) {
          draft.layout[nextId] = draft.layout[ent.id]!;
          delete draft.layout[ent.id];
        }
        draft.edges.forEach((e) => {
          if (e.from === ent.id) e.from = nextId;
          if (e.to === ent.id) e.to = nextId;
        });
        if (draft.erData) {
          draft.erData.entities.forEach((e) => {
            if (e.id === ent.id) e.id = nextId;
          });
          draft.erData.relationships.forEach((r) => {
            if (r.from === ent.id) r.from = nextId;
            if (r.to === ent.id) r.to = nextId;
          });
        }
      });
    };

    const updateAttr = (idx: number, next: Partial<EntityAttribute>): void => {
      applyWith((draft) => {
        const dn = draft.nodes.find((n) => n.id === ent.id && n.shape === 'er_box');
        if (!dn?.erEntity?.attributes[idx]) return;
        dn.erEntity.attributes[idx] = { ...dn.erEntity.attributes[idx]!, ...next };
      });
    };

    const removeAttr = (idx: number): void => {
      applyWith((draft) => {
        const dn = draft.nodes.find((n) => n.id === ent.id && n.shape === 'er_box');
        if (!dn?.erEntity) return;
        dn.erEntity.attributes = dn.erEntity.attributes.filter((_, i) => i !== idx);
      });
    };

    const addAttr = (): void => {
      applyWith((draft) => {
        const dn = draft.nodes.find((n) => n.id === ent.id && n.shape === 'er_box');
        if (!dn?.erEntity) return;
        dn.erEntity.attributes.push({ name: `field_${dn.erEntity.attributes.length + 1}`, type: 'string' });
      });
    };

    return (
      <aside style={panelOuter}>
        <div style={panelHeader}>
          <h3 style={h3}>ER сущность</h3>
          <button type="button" style={linkBtn} onClick={() => dispatch(clearSelectedElement())}>
            Снять
          </button>
        </div>
        <div style={scroll}>
          <section style={section}>
            <div style={sectionTitle}>Идентификатор</div>
            <label style={label}>
              Имя сущности
              <input style={input} value={ent.id} onChange={(e) => renameEntity(e.target.value)} />
            </label>
          </section>

          <section style={section}>
            <div style={sectionTitle}>Атрибуты</div>
            {ent.attributes.map((a, i) => (
              <div key={`${ent.id}-attr-${i}`} style={attrCard}>
                <label style={label}>
                  Имя
                  <input
                    style={input}
                    value={a.name}
                    onChange={(e) => updateAttr(i, { name: e.target.value })}
                  />
                </label>
                <div style={row2}>
                  <label style={label}>
                    Тип
                    <select
                      style={input}
                      value={a.type}
                      onChange={(e) => updateAttr(i, { type: e.target.value })}
                    >
                      {ATTR_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={label}>
                    Ключ
                    <select
                      style={input}
                      value={a.keyType ?? ''}
                      onChange={(e) =>
                        updateAttr(i, {
                          keyType: e.target.value ? (e.target.value as 'PK' | 'FK' | 'UK') : undefined,
                        })
                      }
                    >
                      <option value="">none</option>
                      <option value="PK">PK</option>
                      <option value="FK">FK</option>
                      <option value="UK">UK</option>
                    </select>
                  </label>
                </div>
                <button type="button" style={dangerBtn} onClick={() => removeAttr(i)}>
                  Удалить атрибут
                </button>
              </div>
            ))}
            <button type="button" style={primaryBtn} onClick={addAttr}>
              Добавить атрибут
            </button>
          </section>

          <section style={section}>
            <div style={sectionTitle}>Стили</div>
            <label style={label}>
              Заливка
              <input
                type="color"
                style={colorInput}
                value={fill}
                onChange={(e) =>
                  applyWith((draft) => {
                    const dn = draft.nodes.find((n) => n.id === ent.id && n.shape === 'er_box');
                    if (!dn) return;
                    dn.styles.fill = e.target.value;
                  })
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
                  applyWith((draft) => {
                    const dn = draft.nodes.find((n) => n.id === ent.id && n.shape === 'er_box');
                    if (!dn) return;
                    dn.styles.stroke = e.target.value;
                  })
                }
              />
            </label>
            <label style={label}>
              Толщина (px)
              <input
                type="number"
                min={1}
                max={5}
                step={1}
                style={input}
                value={Math.round(sw)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  applyWith((draft) => {
                    const dn = draft.nodes.find((n) => n.id === ent.id && n.shape === 'er_box');
                    if (!dn) return;
                    dn.styles['stroke-width'] = `${Math.min(5, Math.max(1, Math.round(v)))}px`;
                  });
                }}
              />
            </label>
          </section>
        </div>
      </aside>
    );
  }

  if (selectedEdgeIndex !== null && model.edges[selectedEdgeIndex]) {
    const edge = model.edges[selectedEdgeIndex]!;
    const stroke = normalizeHex(edge.styles.stroke ?? '', '#4b5563');
    const sw = Number.parseFloat(String(edge.styles['stroke-width'] ?? '2').replace(/px/gi, '')) || 2;
    const left = edge.erLeftCard ?? '||';
    const right = edge.erRightCard ?? 'o{';

    return (
      <aside style={panelOuter}>
        <div style={panelHeader}>
          <h3 style={h3}>ER связь</h3>
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
            <div style={sectionTitle}>Кардинальность и метка</div>
            <div style={row2}>
              <label style={label}>
                Левая
                <select
                  style={input}
                  value={left}
                  onChange={(e) =>
                    applyWith((draft) => {
                      if (!draft.edges[selectedEdgeIndex]) return;
                      draft.edges[selectedEdgeIndex]!.erLeftCard = e.target.value;
                    })
                  }
                >
                  {CARDINALITIES.map((c) => (
                    <option key={`l-${c}`} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label style={label}>
                Правая
                <select
                  style={input}
                  value={right}
                  onChange={(e) =>
                    applyWith((draft) => {
                      if (!draft.edges[selectedEdgeIndex]) return;
                      draft.edges[selectedEdgeIndex]!.erRightCard = e.target.value;
                    })
                  }
                >
                  {CARDINALITIES.map((c) => (
                    <option key={`r-${c}`} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label style={label}>
              Метка
              <input
                style={input}
                value={edge.label ?? ''}
                onChange={(e) =>
                  applyWith((draft) => {
                    if (!draft.edges[selectedEdgeIndex]) return;
                    draft.edges[selectedEdgeIndex]!.label = e.target.value;
                  })
                }
              />
            </label>
          </section>
          <section style={section}>
            <div style={sectionTitle}>Стиль линии</div>
            <label style={label}>
              Цвет
              <input
                type="color"
                style={colorInput}
                value={stroke}
                onChange={(e) =>
                  applyWith((draft) => {
                    if (!draft.edges[selectedEdgeIndex]) return;
                    draft.edges[selectedEdgeIndex]!.styles.stroke = e.target.value;
                  })
                }
              />
            </label>
            <label style={label}>
              Толщина (px)
              <input
                type="number"
                min={1}
                max={5}
                step={0.5}
                style={input}
                value={sw}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  applyWith((draft) => {
                    if (!draft.edges[selectedEdgeIndex]) return;
                    draft.edges[selectedEdgeIndex]!.styles['stroke-width'] = `${Math.min(
                      5,
                      Math.max(1, v),
                    )}px`;
                  });
                }}
              />
            </label>
          </section>
        </div>
      </aside>
    );
  }

  return (
    <aside style={panelOuter}>
      <div style={panelHeader}>
        <h3 style={h3}>ER свойства</h3>
      </div>
      <p style={muted}>Выбери сущность или связь на ER-диаграмме.</p>
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
const section: React.CSSProperties = { marginBottom: 16 };
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
const primaryBtn: React.CSSProperties = {
  border: '1px solid #4f46e5',
  background: '#eef2ff',
  color: '#312e81',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
};
const dangerBtn: React.CSSProperties = {
  border: '1px solid #ef4444',
  background: '#fef2f2',
  color: '#991b1b',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
};
const attrCard: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 10,
  marginBottom: 10,
  background: '#fafafa',
};

