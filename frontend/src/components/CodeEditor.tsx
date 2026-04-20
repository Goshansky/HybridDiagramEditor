import React, { useEffect, useMemo, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Copy, FileUp, GitBranch, Image, RefreshCw, Save } from 'lucide-react';
import type { DiagramType } from '../services/diagramApi';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  diagramType: DiagramType;
  onDiagramTypeChange: (type: DiagramType) => void;
  onOpenFile: () => void;
  onSaveCode: () => void;
  onCopyCode: () => void;
  onSaveVersion: () => void;
  onDownloadSvg: () => void;
  onDownloadPng: () => void;
  canSaveVersion: boolean;
  isSynced?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  diagramType,
  onDiagramTypeChange,
  onOpenFile,
  onSaveCode,
  onCopyCode,
  onSaveVersion,
  onDownloadSvg,
  onDownloadPng,
  canSaveVersion,
  isSynced = false,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const stats = useMemo(() => {
    const lines = value.length === 0 ? 1 : value.split(/\r?\n/).length;
    return { lines, chars: value.length };
  }, [value]);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '.cm-editor': {
            backgroundColor: '#111827',
            color: '#f3f4f6',
            fontSize: '14px',
            fontFamily:
              'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          },
          '.cm-gutters': {
            backgroundColor: '#1f2937',
            borderRight: '1px solid #374151',
            color: '#6b7280',
          },
          '.cm-activeLineGutter': {
            backgroundColor: '#111827',
          },
          '.cm-cursor': {
            borderLeftColor: '#60a5fa',
          },
          '.cm-selectionBackground': {
            backgroundColor: '#1e40af',
          },
          '&.cm-focused .cm-selectionBackground': {
            backgroundColor: '#1e40af',
          },
          '.cm-lineNumbers .cm-gutterMarker': {
            color: '#6b7280',
          },
          '.cm-content': {
            caretColor: '#60a5fa',
            color: '#e5e7eb',
          },
          '.cm-line': {
            padding: '0 0 0 8px',
          },
        }, { dark: true }),
      ],
    });

    const editor = new EditorView({
      state,
      parent: containerRef.current,
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
    };
  }, []);

  // Update editor content when value prop changes (external updates)
  useEffect(() => {
    if (editorRef.current) {
      const currentValue = editorRef.current.state.doc.toString();
      if (currentValue !== value) {
        editorRef.current.dispatch({
          changes: {
            from: 0,
            to: currentValue.length,
            insert: value,
          },
        });
      }
    }
  }, [value]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      editorRef.current?.requestMeasure();
    });
    ro.observe(root);
    return () => {
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-code-editor-root
      style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f9fafb', borderRadius: '8px', minHeight: 0 }}
    >
      <div
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>Редактор кода</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button title="Открыть файл" onClick={onOpenFile} style={headerIconButtonStyle}>
            <FileUp size={16} color="#4b5563" />
          </button>
          <button title="Сохранить текст" onClick={onSaveCode} style={headerIconButtonStyle}>
            <Save size={16} color="#4b5563" />
          </button>
          <select
            value={diagramType}
            onChange={(event) => onDiagramTypeChange(event.target.value as DiagramType)}
            style={{
              minWidth: 180,
              padding: '7px 10px',
              background: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 13,
              color: '#111827',
            }}
          >
            <option value="flowchart">Блок-схема</option>
            <option value="class">Диаграмма классов</option>
            <option value="sequence">Диаграмма последовательности</option>
            <option value="er">ER-диаграмма</option>
          </select>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          flex: 1,
          minHeight: 280,
          minWidth: 200,
          width: '100%',
          overflow: 'hidden',
          maxWidth: '100%',
        }}
      >
        <div
          style={{
            backgroundColor: '#111827',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
            overflow: 'hidden',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
        {/* Header */}
        <div
          style={{
            backgroundColor: '#1f2937',
            padding: '8px 16px',
            fontSize: '12px',
            color: '#9ca3af',
            fontFamily:
              'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>diagram.mmd</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <RefreshCw
                size={12}
                color={isSynced ? '#4ade80' : '#9ca3af'}
                  style={{ animation: isSynced ? 'none' : 'spin 1s linear infinite' }}
              />
              <span style={{ color: isSynced ? '#4ade80' : '#9ca3af' }}>
                {isSynced ? 'Синхронизировано' : 'Синхронизация...'}
              </span>
            </div>
            <button
              onClick={onCopyCode}
              title="Скопировать код"
              style={{
                ...headerIconButtonStyle,
                color: '#cbd5e1',
                border: '1px solid #334155',
                background: '#111827',
              }}
            >
              <Copy size={14} />
              <span style={{ fontSize: 11 }}>Скопировать</span>
            </button>
          </div>
        </div>

        {/* Editor Container */}
          <div
            ref={containerRef}
            style={{
              flex: 1,
              minHeight: 0,
            }}
          />
        </div>
      </div>
      </div>

      <div
        style={{
          background: '#ffffff',
          borderTop: '1px solid #e5e7eb',
          padding: '8px 16px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: '#4b5563',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Строк: {stats.lines}</span>
          <span style={{ color: '#9ca3af' }}>|</span>
          <span>Символов: {stats.chars}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '9999px', background: '#22c55e' }} />
          <span>Автосинхронизация: Код ↔ Диаграмма</span>
        </div>
      </div>
      <div
        style={{
          background: '#ffffff',
          borderTop: '1px solid #e5e7eb',
          padding: '10px 16px 12px',
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          onClick={onSaveVersion}
          disabled={!canSaveVersion}
          style={{
            ...actionButtonBaseStyle,
            background: '#6f42c1',
            borderColor: '#6f42c1',
            color: '#fff',
            opacity: canSaveVersion ? 1 : 0.6,
            cursor: canSaveVersion ? 'pointer' : 'not-allowed',
          }}
          title={canSaveVersion ? 'Сохранить версию' : 'Сначала выбери диаграмму'}
        >
          <GitBranch size={15} />
          <span>Сохранить версию</span>
        </button>
        <button onClick={onDownloadSvg} style={actionButtonBaseStyle}>
          <Image size={15} />
          <span>Скачать SVG</span>
        </button>
        <button onClick={onDownloadPng} style={actionButtonBaseStyle}>
          <Image size={15} />
          <span>Скачать PNG</span>
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .cm-editor {
          height: 100% !important;
        }

        .cm-scroller {
          font-family: JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          line-height: 1.6 !important;
          overflow: auto !important;
        }

        .cm-lineNumbers {
          color: #6b7280 !important;
        }
      `}</style>
    </div>
  );
};

const actionButtonBaseStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#ffffff',
  color: '#374151',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
};

const headerIconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#ffffff',
  cursor: 'pointer',
};
