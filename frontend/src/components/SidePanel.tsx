import React from 'react';
import {
  X,
  Image,
  GitBranch,
  RotateCcw,
  RefreshCw,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import type { DiagramType } from '../services/diagramApi';

interface SidePanelProps {
  diagramType: DiagramType;
  onDiagramTypeChange: (type: DiagramType) => void;
  onSaveSvg: () => void;
  onSaveImage: () => void;
  onSaveVersion: () => void;
  onRestore: () => void;
  onClose?: () => void;
  /** Свернута ли панель (узкая полоса с кнопкой развернуть). */
  collapsed?: boolean;
  onCollapseSidebar?: () => void;
  onExpandSidebar?: () => void;
  isSyncing?: boolean;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  diagramType,
  onDiagramTypeChange,
  onSaveSvg,
  onSaveImage,
  onSaveVersion,
  onRestore,
  onClose,
  collapsed = false,
  onCollapseSidebar,
  onExpandSidebar,
  isSyncing = false,
}) => {

  if (collapsed) {
    return (
      <div
        style={{
          height: '100%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
          background: '#ffffff',
          borderRadius: '8px',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          title="Развернуть панель"
          onClick={() => onExpandSidebar?.()}
          style={{
            padding: 8,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            background: '#f9fafb',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronsRight size={18} color="#374151" />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        boxSizing: 'border-box',
        background: '#ffffff',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        overflowY: 'auto',
      }}
    >
      {onCollapseSidebar ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4, marginBottom: -8 }}>
          <button
            type="button"
            title="Свернуть панель"
            onClick={() => onCollapseSidebar()}
            style={{
              padding: 6,
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              background: '#f9fafb',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronsLeft size={18} color="#374151" />
          </button>
        </div>
      ) : null}

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

      {/* Actions */}
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '12px' }}>
          Действия
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
