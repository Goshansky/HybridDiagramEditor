import React, { useMemo, useState } from 'react';

import { parseMermaidFlowchart } from '../../parser';
import { DiagramCanvas } from '../components/DiagramCanvas';
import { useAppDispatch } from '../store';
import { logout } from '../store/authSlice';

const initialExample = `graph TD
  A[Начало] --> B{Условие}
  B -->|Да| C[Действие 1]
  B -->|Нет| D[Действие 2]
  %% { "layout": { "A": { "x": 100, "y": 50 }, "B": { "x": 250, "y": 150 } } }`;

export const EditorPage: React.FC = () => {
  const [source, setSource] = useState(initialExample);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const dispatch = useAppDispatch();

  const model = useMemo(() => {
    try {
      const result = parseMermaidFlowchart(source);
      setError(null);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка парсера';
      setError(msg);
      return null;
    }
  }, [source]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
        gap: '16px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        background: '#0f172a',
        color: '#e5e7eb',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>
          Hybrid Diagram Editor
        </h1>
        <button
          onClick={() => dispatch(logout())}
          style={{
            border: '1px solid #334155',
            background: '#020617',
            color: '#e5e7eb',
            borderRadius: 6,
            padding: '8px 12px',
            cursor: 'pointer',
          }}
        >
          Выйти
        </button>
      </div>

      <div style={{ display: 'flex', gap: '16px', flex: 1 }}>
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          style={{
            flex: 1,
            minHeight: '320px',
            background: '#020617',
            color: '#e5e7eb',
            borderRadius: '8px',
            border: '1px solid #1f2937',
            padding: '12px',
            fontFamily:
              'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: '13px',
            resize: 'vertical',
          }}
        />

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {error ? (
            <div
              style={{
                background: '#7f1d1d',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '13px',
              }}
            >
              <strong>Parse error:</strong> {error}
            </div>
          ) : null}

          <div
            style={{
              flex: 1,
              minHeight: '320px',
            }}
          >
            {model ? (
              <DiagramCanvas
                model={model}
                selectedNodeId={selectedNodeId ?? undefined}
                onSelectNode={setSelectedNodeId}
                onNodePositionChange={(id, x, y) => {
                  console.log('node moved', { id, x, y });
                }}
              />
            ) : (
              <div
                style={{
                  background: '#020617',
                  borderRadius: '8px',
                  border: '1px solid #1f2937',
                  padding: '12px',
                  fontSize: '13px',
                  color: '#9ca3af',
                }}
              >
                Нет корректной модели для визуализации.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
