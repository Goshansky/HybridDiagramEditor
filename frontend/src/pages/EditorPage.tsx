import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useLocation } from 'react-router-dom';

import { parseMermaidByType, upsertLayoutHint } from '../../parser';
import { AddEdgeDialog } from '../components/AddEdgeDialog';
import { AddNodeDialog, type FlowNodeShape } from '../components/AddNodeDialog';
import { ContextMenu } from '../components/ContextMenu';
import { DiagramCanvas } from '../components/DiagramCanvas';
import { EdgeEditor } from '../components/EdgeEditor';
import { NodeEditor } from '../components/NodeEditor';
import { SidePanel } from '../components/SidePanel';
import { Toolbar } from '../components/Toolbar';
import { useAppDispatch, useAppSelector } from '../store';
import { logout, setAuthUser } from '../store/authSlice';
import {
  createDiagram,
  getDiagram,
  listDiagrams,
  listVersions,
  updateDiagram,
  type DiagramType,
} from '../services/diagramApi';
import {
  clearVersions,
  setDiagrams,
  setCurrentDiagramType,
  setSelectedDiagramId,
  setVersions,
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
  const [zoomNonce, setZoomNonce] = useState(0);
  const [zoomType, setZoomType] = useState<'in' | 'out' | 'reset'>('reset');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingNodePos, setPendingNodePos] = useState<{ x: number; y: number } | null>(null);
  const [showAddNodeDialog, setShowAddNodeDialog] = useState(false);
  const [showAddEdgeDialog, setShowAddEdgeDialog] = useState(false);
  const [edgeDraft, setEdgeDraft] = useState<{ from: string; to: string } | null>(null);
  const [edgeAddModeFrom, setEdgeAddModeFrom] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingEdge, setEditingEdge] = useState<{
    from: string;
    to: string;
    label?: string;
    type: 'arrow' | 'line';
  } | null>(null);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const dispatch = useAppDispatch();
  const diagramItems = useAppSelector((state) => state.diagram.items);
  const currentDiagramType = useAppSelector((state) => state.diagram.currentDiagramType);
  const versions = useAppSelector((state) => state.diagram.versions);
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
      setSelectedVersionId(null);
      dispatch(clearVersions());
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
        model: parseMermaidByType(source, currentDiagramType),
        error: null as string | null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка парсера';
      return {
        model: null,
        error: msg,
      };
    }
  }, [currentDiagramType, source]);

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
          type: currentDiagramType,
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

  const loadVersionsForCurrentDiagram = async (): Promise<void> => {
    if (selectedDiagramId === null) {
      dispatch(clearVersions());
      setSelectedVersionId(null);
      return;
    }
    try {
      const versionItems = await listVersions(selectedDiagramId);
      dispatch(
        setVersions(
          versionItems.map((version) => ({
            id: version.id,
            diagramId: version.diagram_id,
            versionNumber: version.version_number,
            createdAt: version.created_at,
            content: version.content,
          })),
        ),
      );
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.detail ?? 'Не удалось загрузить версии')
        : 'Не удалось загрузить версии';
      setStatusMessage(message);
    }
  };

  const handleSelectVersion = (versionId: number | null): void => {
    setSelectedVersionId(versionId);
    if (versionId === null) return;
    const selected = versions.find((version) => version.id === versionId);
    if (!selected) return;
    setSource(selected.content);
    setStatusMessage(`Загружен предпросмотр версии v${selected.versionNumber}`);
  };

  const restoreSelectedVersion = async (): Promise<void> => {
    if (selectedDiagramId === null || selectedVersionId === null) {
      setStatusMessage('Сначала выбери диаграмму и версию');
      return;
    }
    const selected = versions.find((version) => version.id === selectedVersionId);
    if (!selected) {
      setStatusMessage('Выбранная версия не найдена');
      return;
    }
    try {
      const updated = await updateDiagram(selectedDiagramId, {
        content: selected.content,
      });
      setSource(updated.content);
      dispatch(
        upsertDiagram({
          id: updated.id,
          name: updated.name,
          updatedAt: updated.updated_at,
          diagramType: updated.diagram_type,
        }),
      );
      setStatusMessage(`Восстановлена версия v${selected.versionNumber}`);
      await loadVersionsForCurrentDiagram();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.detail ?? 'Не удалось восстановить версию')
        : 'Не удалось восстановить версию';
      setStatusMessage(message);
    }
  };

  const handleSelectDiagramType = (diagramType: DiagramType): void => {
    if (diagramType === currentDiagramType) {
      return;
    }
    const applyTemplate = window.confirm(
      'Заменить текущий текст на шаблон выбранного типа? Нажми "Отмена", чтобы оставить как есть.',
    );
    dispatch(setCurrentDiagramType(diagramType));
    if (applyTemplate) {
      setSource(getTemplateByDiagramType(diagramType));
      setStatusMessage(`Выбран тип "${diagramType}", загружен шаблон`);
    } else {
      setStatusMessage(`Выбран тип "${diagramType}", текущий текст сохранен`);
    }
  };

  const handleCreateDiagram = async (): Promise<void> => {
    const enteredName = window.prompt('Название диаграммы', 'Новая диаграмма');
    const name = enteredName?.trim();
    if (!name) {
      setStatusMessage('Создание отменено: не указано название');
      return;
    }

    const typeValue = window.prompt(
      'Тип диаграммы: flowchart | class | sequence | er',
      currentDiagramType,
    );
    const selectedType = normalizeDiagramType(typeValue ?? currentDiagramType);
    if (!selectedType) {
      setStatusMessage('Создание отменено: указан некорректный тип');
      return;
    }

    try {
      const template = getTemplateByDiagramType(selectedType);
      const created = await createDiagram({
        name,
        type: selectedType,
        content: template,
      });
      dispatch(
        upsertDiagram({
          id: created.id,
          name: created.name,
          updatedAt: created.updated_at,
          diagramType: created.diagram_type,
        }),
      );
      dispatch(setCurrentDiagramType(created.diagram_type));
      dispatch(setSelectedDiagramId(created.id));
      setSource(created.content || template);
      setSelectedVersionId(null);
      dispatch(clearVersions());
      setStatusMessage(`Создана диаграмма "${created.name}" (${created.diagram_type})`);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.detail ?? 'Не удалось создать диаграмму')
        : 'Не удалось создать диаграмму';
      setStatusMessage(message);
    }
  };

  const beginAddNode = (at?: { x: number; y: number }): void => {
    if (currentDiagramType !== 'flowchart') {
      setStatusMessage('Добавление узлов через canvas пока поддерживается только для flowchart');
      return;
    }
    setPendingNodePos(at ?? { x: 180, y: 140 });
    setShowAddNodeDialog(true);
    setContextMenuPos(null);
  };

  const beginAddEdge = (): void => {
    if (currentDiagramType !== 'flowchart') {
      setStatusMessage('Добавление связей через canvas пока поддерживается только для flowchart');
      return;
    }
    setEdgeAddModeFrom(null);
    setStatusMessage('Режим добавления связи: кликни узел-источник, затем узел-цель');
    setContextMenuPos(null);
  };

  const handleCreateNode = (payload: { label: string; shape: FlowNodeShape }): void => {
    const nextId = getNextNodeId(source);
    const def = serializeNode(nextId, payload.label, payload.shape);
    setSource((prev) => {
      const withNode = `${prev.trimEnd()}\n  ${def}`;
      const pos = pendingNodePos ?? { x: 180, y: 140 };
      return upsertLayoutHint(withNode, nextId, pos.x, pos.y);
    });
    setShowAddNodeDialog(false);
    setPendingNodePos(null);
    setStatusMessage(`Добавлен узел "${nextId}"`);
  };

  const handleCanvasNodeSelect = (id: string | null): void => {
    setSelectedNodeId(id);
    if (!id) {
      return;
    }
    // Edge creation mode: first click picks source, second click picks target.
    if (edgeAddModeFrom === null) {
      setEdgeAddModeFrom(id);
      setStatusMessage(`Источник связи: "${id}". Теперь кликни узел-цель.`);
      return;
    }
    if (edgeAddModeFrom === id) {
      setStatusMessage('Источник и цель не должны совпадать');
      return;
    }
    setEdgeDraft({ from: edgeAddModeFrom, to: id });
    setShowAddEdgeDialog(true);
    setEdgeAddModeFrom(null);
  };

  const handleCreateEdge = (payload: { label: string }): void => {
    if (!edgeDraft) return;
    const edgeLine = payload.label
      ? `${edgeDraft.from} -->|${payload.label}| ${edgeDraft.to}`
      : `${edgeDraft.from} --> ${edgeDraft.to}`;
    setSource((prev) => `${prev.trimEnd()}\n  ${edgeLine}`);
    setShowAddEdgeDialog(false);
    setEdgeDraft(null);
    setStatusMessage(`Добавлена связь ${edgeDraft.from} -> ${edgeDraft.to}`);
  };

  const handleNodeEditSave = (payload: { label: string; shape: FlowNodeShape }): void => {
    if (!editingNodeId) return;
    setSource((prev) => replaceNodeDefinition(prev, editingNodeId, payload.label, payload.shape));
    setEditingNodeId(null);
    setStatusMessage(`Узел "${editingNodeId}" обновлен`);
  };

  const handleEdgeEditSave = (payload: { label: string }): void => {
    if (!editingEdge) return;
    setSource((prev) => replaceEdgeDefinition(prev, editingEdge, payload.label));
    setStatusMessage(`Связь ${editingEdge.from} -> ${editingEdge.to} обновлена`);
    setEditingEdge(null);
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
          {!showSidePanel && (
            <button
              onClick={() => setShowSidePanel(true)}
              style={{
                border: '1px solid #334155',
                background: '#020617',
                color: '#e5e7eb',
                borderRadius: 6,
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              Панель
            </button>
          )}
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
        diagrams={diagramItems}
        selectedDiagramId={selectedDiagramId}
        diagramType={currentDiagramType}
        versions={versions}
        selectedVersionId={selectedVersionId}
        onSelectDiagram={(diagramId) => {
          dispatch(setSelectedDiagramId(diagramId));
          if (diagramId === null) {
            dispatch(clearVersions());
            setSelectedVersionId(null);
            setStatusMessage('Режим новой диаграммы');
            return;
          }
          void loadDiagramById(diagramId);
        }}
        onCreateDiagram={() => {
          void handleCreateDiagram();
        }}
        onSelectDiagramType={handleSelectDiagramType}
        onLoadVersions={() => {
          void loadVersionsForCurrentDiagram();
        }}
        onSelectVersion={handleSelectVersion}
        onRestoreSelectedVersion={() => {
          void restoreSelectedVersion();
        }}
        onAddNode={() => beginAddNode()}
        onAddEdge={beginAddEdge}
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
        {showSidePanel && (
          <SidePanel
            diagramType={currentDiagramType}
            onDiagramTypeChange={handleSelectDiagramType}
            onOpenFile={openFile}
            onSaveCode={() => {
              downloadTextFile('diagram.mmd', source);
              setStatusMessage('Код сохранен');
            }}
            onSaveImage={saveAsSvg}
            onSaveVersion={() => {
              void saveVersionToServer();
            }}
            onRestore={() => {
              void restoreFromServer();
            }}
            onClose={() => setShowSidePanel(false)}
          />
        )}
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
              Режим отображения: {currentDiagramType}
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
                disableNodeDrag={currentDiagramType === 'sequence'}
                selectedNodeId={selectedNodeId ?? undefined}
                onSelectNode={handleCanvasNodeSelect}
                onCanvasContextMenu={(x, y) => setContextMenuPos({ x, y })}
                onNodeDoubleClick={(id) => {
                  if (currentDiagramType !== 'flowchart') return;
                  setEditingNodeId(id);
                }}
                onEdgeDoubleClick={(edge) => {
                  if (currentDiagramType !== 'flowchart') return;
                  setEditingEdge(edge);
                }}
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
      {contextMenuPos ? (
        <ContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          onAddNode={() => beginAddNode({ x: contextMenuPos.x - 420, y: contextMenuPos.y - 180 })}
          onAddEdge={beginAddEdge}
          onClose={() => setContextMenuPos(null)}
        />
      ) : null}
      {showAddNodeDialog ? (
        <AddNodeDialog
          onCancel={() => {
            setShowAddNodeDialog(false);
            setPendingNodePos(null);
          }}
          onSubmit={handleCreateNode}
        />
      ) : null}
      {showAddEdgeDialog ? (
        <AddEdgeDialog
          onCancel={() => {
            setShowAddEdgeDialog(false);
            setEdgeDraft(null);
          }}
          onSubmit={handleCreateEdge}
        />
      ) : null}
      {editingNodeId ? (
        <NodeEditor
          initialLabel={findNodeLabel(parsed.model?.nodes ?? [], editingNodeId) ?? editingNodeId}
          initialShape={(findNodeShape(parsed.model?.nodes ?? [], editingNodeId) ?? 'rect') as FlowNodeShape}
          onCancel={() => setEditingNodeId(null)}
          onSubmit={handleNodeEditSave}
        />
      ) : null}
      {editingEdge ? (
        <EdgeEditor
          initialLabel={editingEdge.label ?? ''}
          onCancel={() => setEditingEdge(null)}
          onSubmit={handleEdgeEditSave}
        />
      ) : null}
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

function getTemplateByDiagramType(diagramType: DiagramType): string {
  if (diagramType === 'class') {
    return `classDiagram
  class User {
    +id: int
    +email: string
    +login()
  }
  class Admin
  User <|-- Admin`;
  }
  if (diagramType === 'sequence') {
    return `sequenceDiagram
  participant A as User
  participant B as Service
  A->>B: Request
  B-->>A: Response`;
  }
  if (diagramType === 'er') {
    return `erDiagram
  USER {
    int id
    string email
  }
  ORDER {
    int id
    int user_id
  }
  USER ||--o{ ORDER : has`;
  }
  return `graph TD
  A[Начало] --> B{Условие}
  B -->|Да| C[Действие 1]
  B -->|Нет| D[Действие 2]`;
}

function normalizeDiagramType(raw: string): DiagramType | null {
  const value = raw.trim().toLowerCase();
  if (value === 'flowchart' || value === 'class' || value === 'sequence' || value === 'er') {
    return value;
  }
  return null;
}

function getNextNodeId(source: string): string {
  const ids = new Set<string>();
  const regex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[|\{|\(\(|\(\[|\[\[|\[\(|>)/g;
  let match: RegExpExecArray | null = regex.exec(source);
  while (match) {
    ids.add(match[1]);
    match = regex.exec(source);
  }
  let i = 1;
  while (ids.has(`NewNode${i}`)) i += 1;
  return `NewNode${i}`;
}

function serializeNode(id: string, label: string, shape: FlowNodeShape): string {
  if (shape === 'diamond') return `${id}{${label}}`;
  if (shape === 'circle') return `${id}((${label}))`;
  if (shape === 'oval') return `${id}([${label}])`;
  if (shape === 'parallelogram') return `${id}[[${label}]]`;
  if (shape === 'cloud') return `${id}[(${label})]`;
  return `${id}[${label}]`;
}

function replaceNodeDefinition(source: string, nodeId: string, label: string, shape: FlowNodeShape): string {
  const lines = source.split(/\r?\n/);
  const nodePattern = new RegExp(`\\b${escapeRegExp(nodeId)}\\s*(\\[[^\\]]*\\]|\\{[^}]*\\}|\\(\\([^)]*\\)\\)|\\(\\[[^\\]]*\\]\\)|\\[\\[[^\\]]*\\]\\]|\\[\\([^)]*\\)\\]|>[^\\]]*\\])`);
  const replacement = serializeNode(nodeId, label, shape);
  const idx = lines.findIndex((line) => nodePattern.test(line));
  if (idx >= 0) {
    lines[idx] = lines[idx].replace(nodePattern, replacement);
    return lines.join('\n');
  }
  return `${source.trimEnd()}\n  ${replacement}`;
}

function replaceEdgeDefinition(
  source: string,
  edge: { from: string; to: string; label?: string; type: 'arrow' | 'line' },
  newLabel: string,
): string {
  const lines = source.split(/\r?\n/);
  const op = edge.type === 'line' ? '---' : '-->';
  const from = escapeRegExp(edge.from);
  const to = escapeRegExp(edge.to);
  const linePattern = new RegExp(`\\b${from}\\b\\s*${escapeRegExp(op)}(?:\\|[^|]*\\|)?\\s*\\b${to}\\b`);
  const replacement = newLabel ? `${edge.from} ${op}|${newLabel}| ${edge.to}` : `${edge.from} ${op} ${edge.to}`;
  const idx = lines.findIndex((line) => linePattern.test(line));
  if (idx >= 0) {
    lines[idx] = replacement;
    return lines.join('\n');
  }
  return `${source.trimEnd()}\n  ${replacement}`;
}

function findNodeLabel(nodes: Array<{ id: string; label: string }>, id: string): string | null {
  return nodes.find((n) => n.id === id)?.label ?? null;
}

function findNodeShape(
  nodes: Array<{ id: string; shape?: string }>,
  id: string,
): FlowNodeShape | null {
  const shape = nodes.find((n) => n.id === id)?.shape;
  if (
    shape === 'rect' ||
    shape === 'diamond' ||
    shape === 'circle' ||
    shape === 'oval' ||
    shape === 'parallelogram' ||
    shape === 'cloud'
  ) {
    return shape;
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
