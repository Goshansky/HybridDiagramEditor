import React from 'react';

import type {
  ClassBoxModel,
  ClassFieldModel,
  ClassMethodModel,
  ClassRelationKind,
  ClassVisibility,
  DiagramEdgeModel,
  DiagramModel,
} from '../../parser';
import {
  generateClassDiagramMermaid,
  parseParams,
} from '../../parser';
import { useAppDispatch } from '../store';
import { clearSelectedElement } from '../store/uiSlice';
import { enableAutoLayout } from '../store/diagramSlice';

const VIS: ClassVisibility[] = ['+', '-', '#', '~'];

const RELATIONS: { value: ClassRelationKind; label: string }[] = [
  { value: 'inheritance', label: 'Наследование (<|)' },
  { value: 'implementation', label: 'Реализация (<|..)' },
  { value: 'composition', label: 'Композиция (*)' },
  { value: 'aggregation', label: 'Агрегация (o)' },
  { value: 'association', label: 'Ассоциация (-->)' },
  { value: 'dependency', label: 'Зависимость (..>)' },
  { value: 'bidirectional', label: 'Связь (—)' },
];

const STEREO_PRESET_LIST = ['interface', 'abstract', 'service', 'enum'] as const;

function cloneModel(m: DiagramModel): DiagramModel {
  return JSON.parse(JSON.stringify(m)) as DiagramModel;
}

function parseStrokeWidth(styles: Record<string, string>): number {
  const raw = styles['stroke-width'] ?? styles.strokeWidth;
  if (!raw) return 2;
  const n = Number.parseFloat(String(raw).replace(/px/gi, '').trim());
  return Number.isFinite(n) ? Math.min(10, Math.max(0.5, n)) : 2;
}

function normalizeHex(input: string, fallback: string): string {
  const t = input?.trim();
  if (t?.startsWith('#') && (t.length === 7 || t.length === 4)) return t;
  return fallback;
}

export interface ClassDiagramPropertiesPanelProps {
  model: DiagramModel;
  source: string;
  onSourceChange: (next: string) => void;
  selectedNodeId: string | null;
  selectedEdgeIndex: number | null;
}

export const ClassDiagramPropertiesPanel: React.FC<ClassDiagramPropertiesPanelProps> = ({
  model,
  source,
  onSourceChange,
  selectedNodeId,
  selectedEdgeIndex,
}) => {
  const dispatch = useAppDispatch();

  const commitModel = (next: DiagramModel): void => {
    dispatch(enableAutoLayout());
    onSourceChange(generateClassDiagramMermaid(next, source));
  };

  if (selectedNodeId) {
    const node = model.nodes.find((n) => n.id === selectedNodeId);
    if (!node?.classBox) {
      return (
        <aside style={panelOuter}>
          <p style={muted}>Узел не найден или не класс.</p>
        </aside>
      );
    }
    const box = node.classBox;
    const fill = normalizeHex(node.styles?.fill ?? '', '#ffffff');
    const stroke = normalizeHex(node.styles?.stroke ?? '', '#4f46e5');
    const sw = parseStrokeWidth(node.styles ?? {});

    const stereoSelectValue =
      !box.stereotype
        ? ''
        : STEREO_PRESET_LIST.includes(box.stereotype as (typeof STEREO_PRESET_LIST)[number])
          ? box.stereotype
          : '__custom__';

    const updateBox = (patch: Partial<ClassBoxModel>): void => {
      const next = cloneModel(model);
      const n = next.nodes.find((x) => x.id === node.id);
      if (!n?.classBox) return;
      Object.assign(n.classBox, patch);
      n.label = n.classBox.name;
      commitModel(next);
    };

    const updateStyles = (styles: Record<string, string | undefined>): void => {
      const next = cloneModel(model);
      const n = next.nodes.find((x) => x.id === node.id);
      if (!n) return;
      const merged: Record<string, string> = { ...(n.styles ?? {}) };
      for (const [k, v] of Object.entries(styles)) {
        if (typeof v === 'string') merged[k] = v;
        else delete merged[k];
      }
      n.styles = merged;
      commitModel(next);
    };

    const setField = (index: number, patch: Partial<ClassFieldModel>): void => {
      const fields = [...box.fields];
      fields[index] = { ...fields[index]!, ...patch };
      updateBox({ fields });
    };

    const addField = (): void => {
      updateBox({
        fields: [...box.fields, { name: 'field', type: 'string', visibility: '+' }],
      });
    };

    const removeField = (index: number): void => {
      updateBox({ fields: box.fields.filter((_, i) => i !== index) });
    };

    const setMethod = (index: number, patch: Partial<ClassMethodModel>): void => {
      const methods = [...box.methods];
      methods[index] = { ...methods[index]!, ...patch };
      updateBox({ methods });
    };

    const addMethod = (): void => {
      updateBox({
        methods: [
          ...box.methods,
          {
            name: 'method',
            params: [],
            returnType: 'void',
            visibility: '+',
          },
        ],
      });
    };

    const removeMethod = (index: number): void => {
      updateBox({ methods: box.methods.filter((_, i) => i !== index) });
    };

    return (
      <aside style={panelOuter}>
        <div style={panelHeader}>
          <h3 style={h3}>Класс</h3>
          <button type="button" style={linkBtn} onClick={() => dispatch(clearSelectedElement())}>
            Снять
          </button>
        </div>
        <div style={scroll}>
          <section style={section}>
            <div style={sectionTitle}>Идентификатор</div>
            <label style={label}>
              id (в коде)
              <input style={{ ...input, opacity: 0.85 }} readOnly value={node.id} />
            </label>
            <label style={label}>
              Имя
              <input
                style={input}
                value={box.name}
                onChange={(e) => updateBox({ name: e.target.value })}
              />
            </label>
          </section>

          <section style={section}>
            <div style={sectionTitle}>Стереотип</div>
            <label style={label}>
              Пресет
              <select
                style={input}
                value={stereoSelectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__custom__') updateBox({ stereotype: '' });
                  else updateBox({ stereotype: v || undefined });
                }}
              >
                <option value="">—</option>
                {STEREO_PRESET_LIST.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="__custom__">Свой текст</option>
              </select>
            </label>
            {stereoSelectValue === '__custom__' && (
              <label style={label}>
                Текст стереотипа
                <input
                  style={input}
                  value={box.stereotype ?? ''}
                  onChange={(e) => updateBox({ stereotype: e.target.value || undefined })}
                  placeholder="например repository"
                />
              </label>
            )}
          </section>

          <section style={section}>
            <div style={sectionTitle}>Поля</div>
            {box.fields.map((f, i) => (
              <div key={`f-${i}`} style={blockCard}>
                <div style={row2}>
                  <label style={label}>
                    Видимость
                    <select
                      style={input}
                      value={f.visibility}
                      onChange={(e) =>
                        setField(i, { visibility: e.target.value as ClassVisibility })
                      }
                    >
                      {VIS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={label}>
                    Статич.
                    <select
                      style={input}
                      value={f.isStatic ? 'yes' : 'no'}
                      onChange={(e) => setField(i, { isStatic: e.target.value === 'yes' })}
                    >
                      <option value="no">нет</option>
                      <option value="yes">да ($)</option>
                    </select>
                  </label>
                </div>
                <label style={label}>
                  Имя
                  <input style={input} value={f.name} onChange={(e) => setField(i, { name: e.target.value })} />
                </label>
                <label style={label}>
                  Тип
                  <input style={input} value={f.type} onChange={(e) => setField(i, { type: e.target.value })} />
                </label>
                <button type="button" style={smallBtn} onClick={() => removeField(i)}>
                  Удалить поле
                </button>
              </div>
            ))}
            <button type="button" style={smallBtn} onClick={addField}>
              + Добавить поле
            </button>
          </section>

          <section style={section}>
            <div style={sectionTitle}>Методы</div>
            {box.methods.map((m, i) => (
              <div key={`m-${i}`} style={blockCard}>
                <div style={row2}>
                  <label style={label}>
                    Видимость
                    <select
                      style={input}
                      value={m.visibility}
                      onChange={(e) =>
                        setMethod(i, { visibility: e.target.value as ClassVisibility })
                      }
                    >
                      {VIS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={label}>
                    Статич.
                    <select
                      style={input}
                      value={m.isStatic ? 'yes' : 'no'}
                      onChange={(e) => setMethod(i, { isStatic: e.target.value === 'yes' })}
                    >
                      <option value="no">нет</option>
                      <option value="yes">да ($)</option>
                    </select>
                  </label>
                </div>
                <label style={label}>
                  Имя
                  <input
                    style={input}
                    value={m.name}
                    onChange={(e) => setMethod(i, { name: e.target.value })}
                  />
                </label>
                <label style={label}>
                  Параметры (name: type, …)
                  <input
                    style={input}
                    value={m.params.map((p) => `${p.name}: ${p.type}`).join(', ')}
                    onChange={(e) =>
                      setMethod(i, {
                        params: parseParams(e.target.value),
                      })
                    }
                  />
                </label>
                <label style={label}>
                  Возвращаемый тип
                  <input
                    style={input}
                    value={m.returnType}
                    onChange={(e) => setMethod(i, { returnType: e.target.value })}
                  />
                </label>
                <label style={{ ...label, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!m.isAbstract}
                    onChange={(e) => setMethod(i, { isAbstract: e.target.checked })}
                  />
                  Абстрактный (*)
                </label>
                <button type="button" style={smallBtn} onClick={() => removeMethod(i)}>
                  Удалить метод
                </button>
              </div>
            ))}
            <button type="button" style={smallBtn} onClick={addMethod}>
              + Добавить метод
            </button>
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
                  updateStyles({
                    fill: e.target.value,
                    stroke,
                    'stroke-width': `${sw}px`,
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
                  updateStyles({
                    fill,
                    stroke: e.target.value,
                    'stroke-width': `${sw}px`,
                  })
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
                  updateStyles({
                    fill,
                    stroke,
                    'stroke-width': `${n}px`,
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
    const stroke = normalizeHex(edge.styles?.stroke ?? '', '#4b5563');
    const sw = parseStrokeWidth(edge.styles ?? {});
    const rel = (edge.classRelation ?? 'association') as ClassRelationKind;

    const updateEdge = (patch: Partial<DiagramEdgeModel>): void => {
      const next = cloneModel(model);
      const e = next.edges[selectedEdgeIndex];
      if (!e) return;
      Object.assign(e, patch);
      if (patch.classRelation === 'bidirectional') {
        e.type = 'line';
      } else if (patch.classRelation === 'association' || patch.classRelation) {
        e.type = 'arrow';
      }
      commitModel(next);
    };

    const updateEdgeStyles = (patch: Record<string, string | undefined>): void => {
      const next = cloneModel(model);
      const e = next.edges[selectedEdgeIndex];
      if (!e) return;
      e.styles = { ...(e.styles ?? {}) };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') delete e.styles[k];
        else e.styles[k] = v;
      }
      commitModel(next);
    };

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
            <div style={sectionTitle}>UML</div>
            <label style={label}>
              Тип связи
              <select
                style={input}
                value={rel}
                onChange={(e) =>
                  updateEdge({
                    classRelation: e.target.value as ClassRelationKind,
                  })
                }
              >
                {RELATIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={label}>
              Метка
              <input
                style={input}
                value={edge.label ?? ''}
                onChange={(e) => updateEdge({ label: e.target.value || undefined })}
              />
            </label>
            <div style={row2}>
              <label style={label}>
                Кратность от
                <input
                  style={input}
                  value={edge.fromMultiplicity ?? ''}
                  onChange={(e) => updateEdge({ fromMultiplicity: e.target.value || undefined })}
                />
              </label>
              <label style={label}>
                Кратность до
                <input
                  style={input}
                  value={edge.toMultiplicity ?? ''}
                  onChange={(e) => updateEdge({ toMultiplicity: e.target.value || undefined })}
                />
              </label>
            </div>
          </section>
          <section style={section}>
            <div style={sectionTitle}>Линия</div>
            <label style={label}>
              Цвет
              <input
                type="color"
                style={colorInput}
                value={stroke}
                onChange={(e) =>
                  updateEdgeStyles({
                    stroke: e.target.value,
                  })
                }
              />
            </label>
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
                  updateEdgeStyles({
                    'stroke-width': `${Math.min(10, Math.max(1, n))}px`,
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

const smallBtn: React.CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#f9fafb',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
  marginBottom: 8,
};

const blockCard: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 10,
  marginBottom: 10,
  background: '#fafafa',
};
