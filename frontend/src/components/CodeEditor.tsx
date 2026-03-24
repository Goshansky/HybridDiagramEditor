import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { FileUp, RefreshCw, Save } from 'lucide-react';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onOpenFile: () => void;
  onSaveCode: () => void;
  onGenerateFromCanvas?: () => void;
  isSynced?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  onOpenFile,
  onSaveCode,
  onGenerateFromCanvas,
  isSynced = false,
}) => {
  const [language, setLanguage] = useState<'mermaid' | 'plantuml'>('mermaid');
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f9fafb', borderRadius: '8px' }}>
      <div
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>Редактор кода</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as 'mermaid' | 'plantuml')}
            style={{
              padding: '4px 8px',
              background: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#111827',
            }}
          >
            <option value="mermaid">Mermaid</option>
            <option value="plantuml">PlantUML</option>
          </select>
          <button title="Открыть файл" onClick={onOpenFile} style={iconButtonStyle}>
            <FileUp size={16} color="#4b5563" />
          </button>
          <button title="Сохранить код" onClick={onSaveCode} style={iconButtonStyle}>
            <Save size={16} color="#4b5563" />
          </button>
          <button title="Генерировать из холста" onClick={onGenerateFromCanvas} style={iconButtonStyle}>
            <RefreshCw size={16} color="#4b5563" />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
      <div
        style={{
          minHeight: '360px',
          minWidth: '420px',
          height: '520px',
          width: '100%',
          resize: 'both',
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
          padding: '8px 16px',
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

const iconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px',
  borderRadius: '6px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
};
