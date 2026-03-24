import React from 'react';
import type { DiagramType } from '../services/diagramApi';
import type { DiagramVersionItem } from '../store/diagramSlice';

type DiagramViewType = 'flowchart' | 'class' | 'sequence';

interface ToolbarProps {
  diagrams: Array<{ id: number; name: string }>;
  selectedDiagramId: number | null;
  diagramType: DiagramType;
  versions: DiagramVersionItem[];
  selectedVersionId: number | null;
  onSelectDiagram: (diagramId: number | null) => void;
  onCreateDiagram: () => void;
  onSelectDiagramType: (diagramType: DiagramType) => void;
  onLoadVersions: () => void;
  onSelectVersion: (versionId: number | null) => void;
  onRestoreSelectedVersion: () => void;
  onAddNode: () => void;
  onAddEdge: () => void;
  onOpenFile: () => void;
  onSaveCode: () => void;
  onSaveImageSvg: () => void;
  onSaveImagePng: () => void;
  onSaveVersion: () => void;
  onRestoreLastVersion: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  diagrams,
  selectedDiagramId,
  diagramType,
  versions,
  selectedVersionId,
  onSelectDiagram,
  onCreateDiagram,
  onSelectDiagramType,
  onLoadVersions,
  onSelectVersion,
  onRestoreSelectedVersion,
  onAddNode,
  onAddEdge,
  onOpenFile,
  onSaveCode,
  onSaveImageSvg,
  onSaveImagePng,
  onSaveVersion,
  onRestoreLastVersion,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        padding: 10,
        border: '1px solid #1f2937',
        borderRadius: 8,
        background: '#020617',
      }}
    >
      <select
        value={selectedDiagramId ?? ''}
        onChange={(event) => {
          const value = event.target.value;
          onSelectDiagram(value ? Number(value) : null);
        }}
        style={controlStyle}
      >
        <option value="">Новая диаграмма</option>
        {diagrams.map((diagram) => (
          <option key={diagram.id} value={diagram.id}>
            {diagram.name}
          </option>
        ))}
      </select>
      <button style={controlStyle} onClick={onCreateDiagram}>
        Создать новую диаграмму
      </button>
      <select
        value={selectedVersionId ?? ''}
        onFocus={onLoadVersions}
        onChange={(event) => {
          const value = event.target.value;
          onSelectVersion(value ? Number(value) : null);
        }}
        style={controlStyle}
        disabled={selectedDiagramId === null}
      >
        <option value="">Версии</option>
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            v{version.versionNumber} ({new Date(version.createdAt).toLocaleString()})
          </option>
        ))}
      </select>
      <button
        style={controlStyle}
        onClick={onRestoreSelectedVersion}
        disabled={selectedDiagramId === null || selectedVersionId === null}
      >
        Восстановить эту версию
      </button>
      <button style={controlStyle} onClick={onAddNode}>
        Добавить узел
      </button>
      <button style={controlStyle} onClick={onAddEdge}>
        Добавить связь
      </button>
      <button style={controlStyle} onClick={onSaveImagePng}>
        Сохранить PNG
      </button>
    </div>
  );
};

const controlStyle: React.CSSProperties = {
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e5e7eb',
  borderRadius: 6,
  padding: '8px 10px',
  cursor: 'pointer',
  fontSize: 13,
};
