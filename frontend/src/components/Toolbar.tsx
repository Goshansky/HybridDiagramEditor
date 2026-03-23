import React from 'react';

type DiagramViewType = 'flowchart' | 'class' | 'sequence';

interface ToolbarProps {
  viewType: DiagramViewType;
  diagrams: Array<{ id: number; name: string }>;
  selectedDiagramId: number | null;
  onSelectDiagram: (diagramId: number | null) => void;
  onViewTypeChange: (value: DiagramViewType) => void;
  onOpenFile: () => void;
  onSaveCode: () => void;
  onSaveImageSvg: () => void;
  onSaveImagePng: () => void;
  onSaveVersion: () => void;
  onRestoreLastVersion: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  viewType,
  diagrams,
  selectedDiagramId,
  onSelectDiagram,
  onViewTypeChange,
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
      <select
        value={viewType}
        onChange={(event) => onViewTypeChange(event.target.value as DiagramViewType)}
        style={controlStyle}
      >
        <option value="flowchart">Блок-схема</option>
        <option value="class">Диаграмма классов (визуальный режим)</option>
        <option value="sequence">Диаграмма последовательности (визуальный режим)</option>
      </select>
      <button style={controlStyle} onClick={onOpenFile}>
        Открыть файл
      </button>
      <button style={controlStyle} onClick={onSaveCode}>
        Сохранить код
      </button>
      <button style={controlStyle} onClick={onSaveImageSvg}>
        Сохранить SVG
      </button>
      <button style={controlStyle} onClick={onSaveImagePng}>
        Сохранить PNG
      </button>
      <button style={controlStyle} onClick={onSaveVersion}>
        Сохранить версию
      </button>
      <button style={controlStyle} onClick={onRestoreLastVersion}>
        Вернуться к последней версии
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
