import React, { type RefObject } from 'react';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';

const handleStyle: React.CSSProperties = {
  width: 6,
  background: '#e5e7eb',
  flexShrink: 0,
  position: 'relative',
};

const handleGripStyle: React.CSSProperties = {
  position: 'absolute',
  top: '40%',
  bottom: '40%',
  left: '50%',
  width: 2,
  transform: 'translateX(-50%)',
  background: '#cbd5e1',
  borderRadius: 1,
};

export interface ResizableEditorLayoutProps {
  sidebar?: React.ReactNode | null;
  code: React.ReactNode;
  canvas: React.ReactNode;
  /** Если null — правая колонка не рендерится. */
  properties?: React.ReactNode | null;
  sidebarPanelRef?: RefObject<PanelImperativeHandle | null>;
}

export const ResizableEditorLayout: React.FC<ResizableEditorLayoutProps> = ({
  sidebar,
  code,
  canvas,
  properties,
  sidebarPanelRef,
}) => {
  const showSidebar = sidebar != null;
  const showProperties = properties != null;

  return (
    <Group
      id={
        showSidebar
          ? (showProperties ? 'hde-editor-panels-4' : 'hde-editor-panels-3')
          : (showProperties ? 'hde-editor-panels-3-nosidebar' : 'hde-editor-panels-2')
      }
      orientation="horizontal"
      style={{ flex: 1, minHeight: 0, width: '100%' }}
    >
      {showSidebar ? (
        <>
          <Panel
            id="sidebar"
            panelRef={sidebarPanelRef}
            collapsible
            collapsedSize="48px"
            defaultSize={showProperties ? '16%' : '18%'}
            minSize="11%"
            style={{ minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {sidebar}
          </Panel>
          <Separator style={handleStyle}>
            <span style={handleGripStyle} />
          </Separator>
        </>
      ) : null}
      <Panel
        id="code"
        defaultSize={showSidebar ? '28%' : '42%'}
        minSize="14%"
        style={{ minWidth: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {code}
      </Panel>
      <Separator style={handleStyle}>
        <span style={handleGripStyle} />
      </Separator>
      <Panel
        id="canvas"
        defaultSize={showProperties ? '38%' : '50%'}
        minSize="20%"
        style={{ minWidth: 300, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {canvas}
      </Panel>
      {showProperties ? (
        <>
          <Separator style={handleStyle}>
            <span style={handleGripStyle} />
          </Separator>
          <Panel
            id="properties"
            defaultSize="10%"
            minSize="10%"
            style={{ minWidth: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {properties}
          </Panel>
        </>
      ) : null}
    </Group>
  );
};
