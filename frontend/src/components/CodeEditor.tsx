import React, { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { RefreshCw } from 'lucide-react';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  isSynced?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  isSynced = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
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
            padding: '0 8px',
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
    <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
      <div
        style={{
          backgroundColor: '#111827',
          borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
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
                style={{
                  animation: isSynced ? 'none' : 'spin 1s linear infinite',
                }}
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
            minHeight: '500px',
          }}
        />
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
          line-height: 1.5 !important;
        }

        .cm-lineNumbers {
          color: #6b7280 !important;
        }
      `}</style>
    </div>
  );
};
