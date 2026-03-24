import React, { useState } from 'react';
import { X, Settings, Palette, Grid3X3, FileUp, Save, Image, GitBranch, RotateCcw, RefreshCw } from 'lucide-react';
import type { DiagramType } from '../services/diagramApi';

interface SidePanelProps {
  diagrams: Array<{ id: number; name: string }>;
  selectedDiagramId: number | null;
  versions: Array<{ id: number; versionNumber: number; createdAt: string }>;
  selectedVersionId: number | null;
  onSelectDiagram: (diagramId: number | null) => void;
  onCreateDiagram: () => void;
  onLoadVersions: () => void;
  onSelectVersion: (versionId: number | null) => void;
  onRestoreSelectedVersion: () => void;
  diagramType: DiagramType;
  onDiagramTypeChange: (type: DiagramType) => void;
  onAddNode: () => void;
  onAddEdge: () => void;
  onOpenFile: () => void;
  onSaveCode: () => void;
  onSaveSvg: () => void;
  onSaveImage: () => void;
  onSaveVersion: () => void;
  onRestore: () => void;
  onClose?: () => void;
  isSyncing?: boolean;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  diagrams,
  selectedDiagramId,
  versions,
  selectedVersionId,
  onSelectDiagram,
  onCreateDiagram,
  onLoadVersions,
  onSelectVersion,
  onRestoreSelectedVersion,
  diagramType,
  onDiagramTypeChange,
  onAddNode,
  onAddEdge,
  onOpenFile,
  onSaveCode,
  onSaveSvg,
  onSaveImage,
  onSaveVersion,
  onRestore,
  onClose,
  isSyncing = false,
}) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [gridSnap, setGridSnap] = useState(true);

  return (
    <div
      style={{
        position: 'relative',
        width: '256px',
        background: '#ffffff',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        maxHeight: 'calc(100vh - 100px)',
        overflowY: 'auto',
      }}
    >
      {onClose ? (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            right: '8px',
            top: '8px',
            padding: '4px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#e5e7eb';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <X size={16} color="#4b5563" />
        </button>
      ) : null}

      <div>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
          Диаграмма
        </label>
        <select
          value={selectedDiagramId ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            onSelectDiagram(value ? Number(value) : null);
          }}
          style={selectStyle}
        >
          <option value="">Новая диаграмма</option>
          {diagrams.map((diagram) => (
            <option key={diagram.id} value={diagram.id}>
              {diagram.name}
            </option>
          ))}
        </select>
        <button style={{ ...actionButtonStyle, marginTop: '8px' }} onClick={onCreateDiagram}>
          Создать новую диаграмму
        </button>
      </div>

      {/* Diagram Type Selector */}
      <div>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
          Тип диаграммы
        </label>
        <select
          value={diagramType}
          onChange={(e) => onDiagramTypeChange(e.target.value as DiagramType)}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#6366f1';
            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.1)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#d1d5db';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <option value="flowchart">Блок-схема</option>
          <option value="sequence">Диаграмма последовательности</option>
          <option value="class">Диаграмма классов</option>
          <option value="er">ER-диаграмма</option>
        </select>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
          Версии
        </label>
        <select
          value={selectedVersionId ?? ''}
          onFocus={onLoadVersions}
          onChange={(event) => {
            const value = event.target.value;
            onSelectVersion(value ? Number(value) : null);
          }}
          style={selectStyle}
          disabled={selectedDiagramId === null}
        >
          <option value="">Выбери версию</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              v{version.versionNumber} ({new Date(version.createdAt).toLocaleString()})
            </option>
          ))}
        </select>
        <button
          style={{ ...actionButtonStyle, marginTop: '8px' }}
          onClick={onRestoreSelectedVersion}
          disabled={selectedDiagramId === null || selectedVersionId === null}
        >
          Восстановить эту версию
        </button>
      </div>

      {/* Settings */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Settings size={16} color="#4b5563" />
          <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#374151', margin: 0 }}>
            Настройки
          </h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Theme selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Palette size={16} color="#6b7280" />
              <span style={{ fontSize: '14px', color: '#4b5563' }}>Тема</span>
            </div>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
              style={{
                padding: '6px 8px',
                background: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="light">Светлая</option>
              <option value="dark">Темная</option>
            </select>
          </div>

          {/* Grid snap */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Grid3X3 size={16} color="#6b7280" />
              <span style={{ fontSize: '14px', color: '#4b5563' }}>Привязка к сетке</span>
            </div>
            <button
              onClick={() => setGridSnap(!gridSnap)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: gridSnap ? '#4f46e5' : '#e5e7eb',
                color: gridSnap ? '#ffffff' : '#374151',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              {gridSnap ? 'Вкл' : 'Выкл'}
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '12px' }}>
          Действия
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <ActionButton
            icon={<FileUp size={16} />}
            label="Открыть файл"
            onClick={onOpenFile}
          />
          <ActionButton
            icon={<Save size={16} />}
            label="Сохранить код"
            onClick={onSaveCode}
          />
          <ActionButton
            icon={<Image size={16} />}
            label="Сохранить как SVG"
            onClick={onSaveSvg}
          />
          <ActionButton
            icon={<Image size={16} />}
            label="Сохранить как изображение"
            onClick={onSaveImage}
          />
          <ActionButton
            icon={<Settings size={16} />}
            label="Добавить узел"
            onClick={onAddNode}
          />
          <ActionButton
            icon={<Settings size={16} />}
            label="Добавить связь"
            onClick={onAddEdge}
          />
          <ActionButton
            icon={<GitBranch size={16} />}
            label="Сохранить версию"
            onClick={onSaveVersion}
            isPrimary
          />
          <ActionButton
            icon={<RotateCcw size={16} />}
            label="Вернуть к исходному"
            onClick={onRestore}
          />
        </div>
      </div>

      {/* Sync status */}
      <div
        style={{
          background: '#dcfce7',
          border: '1px solid #86efac',
          borderRadius: '8px',
          padding: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RefreshCw
            size={16}
            color="#16a34a"
            style={{
              animation: isSyncing ? 'spin 1s linear infinite' : 'none',
            }}
          />
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#16a34a' }}>
            Синхронизация
          </span>
        </div>
        <p style={{ fontSize: '12px', color: '#22c55e', margin: '4px 0 0 0' }}>
          Код ↔ Диаграмма
        </p>
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
      `}</style>
    </div>
  );
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: '#ffffff',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '14px',
  outline: 'none',
  cursor: 'pointer',
};

const actionButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  background: '#ffffff',
  color: '#374151',
  fontSize: '14px',
  cursor: 'pointer',
};

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isPrimary?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({ icon, label, onClick, isPrimary = false }) => {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        background: isPrimary ? '#4f46e5' : '#ffffff',
        color: isPrimary ? '#ffffff' : '#374151',
        border: isPrimary ? 'none' : '1px solid #d1d5db',
        borderRadius: '8px',
        fontSize: '14px',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        if (isPrimary) {
          e.currentTarget.style.background = '#4338ca';
        } else {
          e.currentTarget.style.background = '#f3f4f6';
        }
      }}
      onMouseLeave={(e) => {
        if (isPrimary) {
          e.currentTarget.style.background = '#4f46e5';
        } else {
          e.currentTarget.style.background = '#ffffff';
        }
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};
