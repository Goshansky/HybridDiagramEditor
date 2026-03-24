import React from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onAddNode: () => void;
  onAddEdge: () => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onAddNode,
  onAddEdge,
  onClose,
}) => (
  <>
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 90 }}
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    />
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 100,
        background: '#020617',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: 6,
        minWidth: 180,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      <button style={itemStyle} onClick={onAddNode}>
        Добавить узел
      </button>
      <button style={itemStyle} onClick={onAddEdge}>
        Добавить связь
      </button>
    </div>
  </>
);

const itemStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e5e7eb',
  borderRadius: 6,
  padding: '8px 10px',
  cursor: 'pointer',
  marginBottom: 4,
};
