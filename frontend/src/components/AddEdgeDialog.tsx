import React, { useState } from 'react';

interface AddEdgeDialogProps {
  defaultLabel?: string;
  onCancel: () => void;
  onSubmit: (payload: { label: string }) => void;
}

export const AddEdgeDialog: React.FC<AddEdgeDialogProps> = ({
  defaultLabel = '',
  onCancel,
  onSubmit,
}) => {
  const [label, setLabel] = useState(defaultLabel);
  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Добавить связь</div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Метка связи (опционально)"
          style={inputStyle}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={secondaryStyle} onClick={onCancel}>
            Отмена
          </button>
          <button style={primaryStyle} onClick={() => onSubmit({ label: label.trim() })}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2,6,23,0.6)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 120,
};
const dialogStyle: React.CSSProperties = {
  minWidth: 360,
  background: '#020617',
  border: '1px solid #334155',
  borderRadius: 8,
  padding: 12,
  display: 'grid',
  gap: 8,
};
const inputStyle: React.CSSProperties = {
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e5e7eb',
  borderRadius: 6,
  padding: '8px 10px',
};
const primaryStyle: React.CSSProperties = {
  border: '1px solid #1d4ed8',
  background: '#1d4ed8',
  color: '#fff',
  borderRadius: 6,
  padding: '8px 12px',
  cursor: 'pointer',
};
const secondaryStyle: React.CSSProperties = {
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e5e7eb',
  borderRadius: 6,
  padding: '8px 12px',
  cursor: 'pointer',
};
