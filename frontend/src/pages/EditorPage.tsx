import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useLocation } from 'react-router-dom';

import { parseMermaidFlowchart, upsertLayoutHint } from '../../parser';
import { DiagramCanvas } from '../components/DiagramCanvas';
import { Toolbar } from '../components/Toolbar';
import { useAppDispatch, useAppSelector } from '../store';
import { logout, setAuthUser } from '../store/authSlice';
import {
  createDiagram,
  getDiagram,
  listDiagrams,
  updateDiagram,
} from '../services/diagramApi';
import {
  setDiagrams,
  setCurrentDiagramType,
  setSelectedDiagramId,
  upsertDiagram,
} from '../store/diagramSlice';
import { getCurrentUser } from '../services/userApi';

const initialExample = `graph TD
  A[Начало] --> B{Условие}
  B -->|Да| C[Действие 1]
  B -->|Нет| D[Действие 2]
  %% { "layout": { "A": { "x": 100, "y": 50 }, "B": { "x": 250, "y": 150 } } }`;

export const EditorPage: React.FC = () => {
  const [source, setSource] = useState(initialExample);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewType, setViewType] = useState<'flowchart' | 'class' | 'sequence'>('flowchart');
  const [zoomNonce, setZoomNonce] = useState(0);
  const [zoomType, setZoomType] = useState<'in' | 'out' | 'reset'>('reset');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const diagramItems = useAppSelector((state) => state.diagram.items);
  const selectedDiagramId = useAppSelector(
    (state) => state.diagram.selectedDiagramId,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const location = useLocation();
  const routeDiagramId = (location.state as { diagramId?: number } | null)?.diagramId;

  const loadDiagramById = async (diagramId: number): Promise<void> => {
    try {
      const diagram = await getDiagram(diagramId);
      setSource(diagram.content);
      dispatch(setCurrentDiagramType(diagram.diagram_type));
      setStatusMessage(`Загружена диаграмма "${diagram.name}"`);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.detail ?? 'Не удалось открыть выбранную диаграмму')
        : 'Не удалось открыть выбранную диаграмму';
      setStatusMessage(message);
    }
  };

  const parsed = useMemo(() => {
    try {
      return {
        model: parseMermaidFlowchart(source),
        error: null as string | null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка парсера';
      return {
        model: null,
        error: msg,
      };
    }
  }, [source]);

  const triggerZoom = (type: 'in' | 'out' | 'reset'): void => {
    setZoomType(type);
    setZoomNonce((prev) => prev + 1);
  };

  useEffect(() => {
    let mounted = true;
    const loadDiagrams = async (): Promise<void> => {
      try {
        const diagrams = await listDiagrams();
        if (!mounted) return;
        dispatch(
          setDiagrams(
            diagrams.map((item) => ({
              id: item.id,
              name: item.name,
              updatedAt: item.updated_at,
              diagramType: item.diagram_type,
            })),
          ),
        );
      } catch (error) {
        if (!mounted) return;
        const message = axios.isAxiosError(error)
          ? (error.response?.data?.detail ?? 'Не удалось загрузить список диаграмм')
          : 'Не удалось загрузить список диаграмм';
        setStatusMessage(message);
      }
    };
    void loadDiagrams();
    return () => {
      mounted = false;
    };
  }, [dispatch]);

  useEffect(() => {
    let mounted = true;
    const loadCurrentUser = async (): Promise<void> => {
      try {
        const user = await getCurrentUser();
        if (!mounted) return;
        dispatch(setAuthUser(user));
      } catch {
        // user profile load is optional for editor screen
      }
    };
    void loadCurrentUser();
    return () => {
      mounted = false;
    };
  }, [dispatch]);

  useEffect(() => {
    if (typeof routeDiagramId === 'number') {
      dispatch(setSelectedDiagramId(routeDiagramId));
      void loadDiagramById(routeDiagramId);
      return;
    }
    if (selectedDiagramId !== null) {
      void loadDiagramById(selectedDiagramId);
    }
  }, [dispatch, routeDiagramId, selectedDiagramId]);

  const downloadTextFile = (filename: string, content: string): void => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCanvasElement = (): SVGSVGElement | null =>
    document.getElementById('diagram-canvas') as SVGSVGElement | null;

  const saveAsSvg = (): void => {
    const svgElement = getCanvasElement();
    if (!svgElement) {
      setStatusMessage('SVG холст не найден');
      return;
    }
    const clone = svgElement.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const serializer = new XMLSerializer();
    const svgText = serializer.serializeToString(clone);
    downloadTextFile('diagram.svg', svgText);
    setStatusMessage('SVG сохранен');
  };

  const saveAsPng = async (): Promise<void> => {
    const svgElement = getCanvasElement();
    if (!svgElement) {
      setStatusMessage('SVG холст не найден');
      return;
    }

    const serializer = new XMLSerializer();
    const svgText = serializer.serializeToString(svgElement);
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = svgElement.clientWidth || 800;
      canvas.height = svgElement.clientHeight || 600;
      const context = canvas.getContext('2d');
      if (!context) {
        setStatusMessage('Не удалось получить контекст canvas');
        return;
      }
      context.fillStyle = '#020617';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = 'diagram.png';
      a.click();
      setStatusMessage('PNG сохранен');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const saveVersionToServer = async (): Promise<void> => {
    try {
      if (selectedDiagramId === null) {
        const enteredName = window.prompt('Название диаграммы', 'Новая диаграмма');
        const name = enteredName?.trim();
        if (!name) {
          setStatusMessage('Сохранение отменено: не указано название');
          return;
        }
        const created = await createDiagram({
          name,
          type: 'flowchart',
          content: source,
        });
        dispatch(
          upsertDiagram({
            id: created.id,
            name: created.name,
            updatedAt: created.updated_at,
            diagramType: created.diagram_type,
          }),
        );
        dispatch(setSelectedDiagramId(created.id));
        setStatusMessage(`Создана диаграмма "${created.name}"`);
        return;
      }

      const updated = await updateDiagram(selectedDiagramId, { content: source });
      dispatch(
        upsertDiagram({
          id: updated.id,
          name: updated.name,
          updatedAt: updated.updated_at,
          diagramType: updated.diagram_type,
        }),
      );
      setStatusMessage(`Диаграмма "${updated.name}" обновлена`);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.detail ?? 'Не удалось сохранить диаграмму')
        : 'Не удалось сохранить диаграмму';
      setStatusMessage(message);
    }
  };

  const restoreFromServer = async (): Promise<void> => {
    if (selectedDiagramId === null) {
      setStatusMessage('Сначала выбери диаграмму из списка');
      return;
    }
    try {
      const diagram = await getDiagram(selectedDiagramId);
      setSource(diagram.content);
      setStatusMessage(`Загружена сохраненная версия "${diagram.name}"`);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.detail ?? 'Не удалось загрузить диаграмму')
        : 'Не удалось загрузить диаграмму';
      setStatusMessage(message);
    }
  };

  const openFile = (): void => {
    fileInputRef.current?.click();
  };

  const handleOpenFile: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    setSource(text);
    setStatusMessage(`Файл "${file.name}" открыт`);
    event.target.value = '';
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
        gap: '16px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        background: '#0f172a',
        color: '#e5e7eb',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>
          Hybrid Diagram Editor
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/projects" style={topActionLinkStyle}>
            Проекты
          </Link>
          <Link to="/profile" style={topActionLinkStyle}>
            Профиль
          </Link>
          <button
            onClick={() => dispatch(logout())}
            style={{
              border: '1px solid #334155',
              background: '#020617',
              color: '#e5e7eb',
              borderRadius: 6,
              padding: '8px 12px',
              cursor: 'pointer',
            }}
          >
            Выйти
          </button>
        </div>
      </div>

      <Toolbar
        viewType={viewType}
        diagrams={diagramItems}
        selectedDiagramId={selectedDiagramId}
        onSelectDiagram={(diagramId) => {
          dispatch(setSelectedDiagramId(diagramId));
          if (diagramId === null) {
            setStatusMessage('Режим новой диаграммы');
            return;
          }
          void loadDiagramById(diagramId);
        }}
        onViewTypeChange={setViewType}
        onOpenFile={openFile}
        onSaveCode={() => {
          downloadTextFile('diagram.mmd', source);
          setStatusMessage('Код сохранен');
        }}
        onSaveImageSvg={saveAsSvg}
        onSaveImagePng={() => {
          void saveAsPng();
        }}
        onSaveVersion={() => {
          void saveVersionToServer();
        }}
        onRestoreLastVersion={() => {
          void restoreFromServer();
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".mmd,.txt,.md"
        style={{ display: 'none' }}
        onChange={handleOpenFile}
      />

      {statusMessage ? (
        <div
          style={{
            fontSize: 12,
            color: '#93c5fd',
            marginTop: -8,
          }}
        >
          {statusMessage}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '16px', flex: 1 }}>
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          style={{
            flex: 1,
            minHeight: '320px',
            background: '#020617',
            color: '#e5e7eb',
            borderRadius: '8px',
            border: '1px solid #1f2937',
            padding: '12px',
            fontFamily:
              'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: '13px',
            resize: 'vertical',
          }}
        />

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Режим отображения: {viewType}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={zoomButtonStyle} onClick={() => triggerZoom('in')}>
                +
              </button>
              <button style={zoomButtonStyle} onClick={() => triggerZoom('out')}>
                -
              </button>
              <button style={zoomButtonStyle} onClick={() => triggerZoom('reset')}>
                Сброс
              </button>
            </div>
          </div>

          {parsed.error ? (
            <div
              style={{
                background: '#7f1d1d',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '13px',
              }}
            >
              <strong>Parse error:</strong> {parsed.error}
            </div>
          ) : null}

          <div
            style={{
              flex: 1,
              minHeight: '320px',
            }}
          >
            {parsed.model ? (
              <DiagramCanvas
                model={parsed.model}
                canvasId="diagram-canvas"
                zoomCommand={{ type: zoomType, nonce: zoomNonce }}
                selectedNodeId={selectedNodeId ?? undefined}
                onSelectNode={setSelectedNodeId}
                onNodePositionChange={(id, x, y) => {
                  setSource((prevSource) => {
                    const nextSource = upsertLayoutHint(prevSource, id, x, y);
                    return nextSource === prevSource ? prevSource : nextSource;
                  });
                  setStatusMessage(`Обновлен layout-хинт для узла "${id}"`);
                }}
              />
            ) : (
              <div
                style={{
                  background: '#020617',
                  borderRadius: '8px',
                  border: '1px solid #1f2937',
                  padding: '12px',
                  fontSize: '13px',
                  color: '#9ca3af',
                }}
              >
                Нет корректной модели для визуализации.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const zoomButtonStyle: React.CSSProperties = {
  border: '1px solid #334155',
  background: '#020617',
  color: '#e5e7eb',
  borderRadius: 6,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 13,
};

const topActionLinkStyle: React.CSSProperties = {
  border: '1px solid #334155',
  background: '#020617',
  color: '#e5e7eb',
  borderRadius: 6,
  padding: '8px 12px',
  textDecoration: 'none',
  fontSize: 13,
};
