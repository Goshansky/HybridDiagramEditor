import React, { useState } from 'react';

export type FlowNodeShape = 'rect' | 'diamond' | 'circle' | 'oval' | 'parallelogram' | 'cloud';

interface AddNodeDialogProps {
  defaultLabel?: string;
  defaultShape?: FlowNodeShape;
  showShape?: boolean;
  onCancel: () => void;
  onSubmit: (payload: { label: string; shape: FlowNodeShape }) => void;
}

export const AddNodeDialog: React.FC<AddNodeDialogProps> = ({
  defaultLabel = 'Новый узел',
  defaultShape = 'rect',
  showShape = true,
  onCancel,
  onSubmit,
}) => {
  const [label, setLabel] = useState(defaultLabel);
  const [shape, setShape] = useState<FlowNodeShape>(defaultShape);
  return (
    <DialogShell title="Добавить узел" onCancel={onCancel}>
      <input value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} />
      {showShape ? (
        <select
          value={shape}
          onChange={(e) => setShape(e.target.value as FlowNodeShape)}
          style={inputStyle}
        >
          <option value="rect">Прямоугольник</option>
          <option value="diamond">Ромб</option>
          <option value="circle">Круг</option>
          <option value="oval">Овал</option>
          <option value="parallelogram">Параллелограмм</option>
          <option value="cloud">Облако</option>
        </select>
      ) : null}
      <div style={actionsStyle}>
        <button style={secondaryStyle} onClick={onCancel}>
          Отмена
        </button>
        <button
          style={primaryStyle}
          onClick={() => onSubmit({ label: label.trim() || 'Новый узел', shape })}
        >
          Добавить
        </button>
      </div>
    </DialogShell>
  );
};

interface DialogShellProps {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
}

const DialogShell: React.FC<DialogShellProps> = ({ title, children, onCancel }) => (
  <div style={overlayStyle} onClick={onCancel}>
    <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  </div>
);

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.28)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 120,
};

const dialogStyle: React.CSSProperties = {
  minWidth: 360,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 12,
  display: 'grid',
  gap: 8,
  boxShadow: '0 14px 30px rgba(15,23,42,0.16)',
  color: '#111827',
};

const inputStyle: React.CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#ffffff',
  color: '#111827',
  borderRadius: 6,
  padding: '8px 10px',
};

const actionsStyle: React.CSSProperties = { display: 'flex', gap: 8, justifyContent: 'flex-end' };
const primaryStyle: React.CSSProperties = {
  border: '1px solid #1d4ed8',
  background: '#1d4ed8',
  color: '#fff',
  borderRadius: 6,
  padding: '8px 12px',
  cursor: 'pointer',
};
const secondaryStyle: React.CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#ffffff',
  color: '#374151',
  borderRadius: 6,
  padding: '8px 12px',
  cursor: 'pointer',
};
