import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  BookOpen,
  FilePlus2,
  Grid3X3,
  GitBranch,
  LayoutGrid,
  Link2,
  Maximize,
  Moon,
  MoreVertical,
  Plus,
  Sun,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import {
  mergeEdgeLayoutFromCache,
  parseMermaidByType,
  replaceEdgeTarget,
  snapshotEdgesForLayoutCache,
  sourceHasLayoutPositionHints,
  stripLayoutHintsFromSource,
  upsertLayoutHint,
  upsertSequenceParticipantOrder,
} from '../../parser';
import { AddEdgeDialog } from '../components/AddEdgeDialog';
import { AddNodeDialog, type FlowNodeShape } from '../components/AddNodeDialog';
import { BurgerDrawer } from '../components/BurgerDrawer';
import drawerStyles from '../components/BurgerDrawer.module.css';
import { CodeEditor } from '../components/CodeEditor';
import { DiagramCanvas } from '../components/DiagramCanvas';
import { EdgeEditor } from '../components/EdgeEditor';
import { NodeEditor } from '../components/NodeEditor';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { ResizableEditorLayout } from '../components/ResizableEditorLayout';
import { useAppDispatch, useAppSelector } from '../store';
import { setAuthUser } from '../store/authSlice';
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
  disableAutoLayout,
  enableAutoLayout,
  setDiagrams,
  setCurrentDiagramType,
  setSelectedDiagramId,
  setVersions,
  upsertDiagram,
} from '../store/diagramSlice';
import { getCurrentUser } from '../services/userApi';
import {
  clearSelectedElement,
  getSelectedEdgeIndexFromState,
  getSelectedNodeIdFromState,
  setGridSnap,
  setSelectedEdge,
  setSelectedNode,
  toggleTheme,
} from '../store/uiSlice';

const initialExample = `graph TD
  A[Начало] --> B{Условие}
  B -->|Да| C[Действие 1]
  B -->|Нет| D[Действие 2]`;
const LAST_DIAGRAM_ID_STORAGE_KEY = 'hde:lastDiagramId';

/** Flowchart, class, er: dagre в layoutService + %% layout хинты в коде. */
function isDagreLayoutDiagramType(t: DiagramType): boolean {
  return t === 'flowchart' || t === 'class' || t === 'er';
}

export const EditorPage: React.FC = () => {
  const [source, setSource] = useState(initialExample);
  const [edgePickActive, setEdgePickActive] = useState(false);
  const [zoomNonce, setZoomNonce] = useState(0);
  const [zoomType, setZoomType] = useState<'in' | 'out' | 'reset'>('reset');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [pendingNodePos, setPendingNodePos] = useState<{ x: number; y: number } | null>(null);
  const [showAddNodeDialog, setShowAddNodeDialog] = useState(false);
  const [showAddEdgeDialog, setShowAddEdgeDialog] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerVersionsLoading, setDrawerVersionsLoading] = useState(false);
  const [edgeDraft, setEdgeDraft] = useState<{ from: string; to: string } | null>(null);
  const [edgeAddModeFrom, setEdgeAddModeFrom] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingEdge, setEditingEdge] = useState<{
    from: string;
    to: string;
    label?: string;
    type: 'arrow' | 'line';
  } | null>(null);
  const dispatch = useAppDispatch();
  const diagramItems = useAppSelector((state) => state.diagram.items);
  const currentDiagramType = useAppSelector((state) => state.diagram.currentDiagramType);
  const versions = useAppSelector((state) => state.diagram.versions);
  const selectedDiagramId = useAppSelector(
    (state) => state.diagram.selectedDiagramId,
  );
  const useAutoLayout = useAppSelector((state) => state.diagram.useAutoLayout);
  /** Последний dagre-снимок рёбер (points + styles) для ручного режима (flowchart / class). */
  const dagreEdgeCacheRef = useRef<ReturnType<typeof snapshotEdgesForLayoutCache> | null>(null);
  /** Для первого автозапуска: открыть выбранный проект сразу с последней версией. */
  const autoLoadLatestForDiagramIdRef = useRef<number | null>(null);
  const selectedCanvasNodeId = useAppSelector((state) => getSelectedNodeIdFromState(state.ui));
  const selectedCanvasEdgeIndex = useAppSelector((state) =>
    getSelectedEdgeIndexFromState(state.ui),
  );
  const hasCanvasSelection = useAppSelector((state) => state.ui.selectedElementType !== null);
  const gridSnap = useAppSelector((state) => state.ui.gridSnap);
  const theme = useAppSelector((state) => state.ui.theme);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const location = useLocation();
  const routeState = (location.state as { diagramId?: number } | null) ?? null;
  const routeDiagramId = routeState?.diagramId;
  const detectedDiagramType = useMemo(
    () => detectDiagramTypeFromSource(source),
    [source],
  );
  const activeDiagramType = detectedDiagramType ?? currentDiagramType;

  useEffect(() => {
    if (detectedDiagramType && detectedDiagramType !== currentDiagramType) {
      dispatch(setCurrentDiagramType(detectedDiagramType));
    }
  }, [detectedDiagramType, currentDiagramType, dispatch]);

  const loadDiagramById = async (
    diagramId: number,
    options?: { loadLatestVersion?: boolean },
  ): Promise<void> => {
    try {
      const diagram = await getDiagram(diagramId);
      dispatch(enableAutoLayout());
      dispatch(setCurrentDiagramType(diagram.diagram_type));
      localStorage.setItem(LAST_DIAGRAM_ID_STORAGE_KEY, String(diagramId));

      if (options?.loadLatestVersion) {
        const versionItems = await listVersions(diagramId);
        const mapped = versionItems.map((version) => ({
          id: version.id,
          diagramId: version.diagram_id,
          diagramType: version.diagram_type,
          versionNumber: version.version_number,
          createdAt: version.created_at,
          content: version.content,
        }));
        dispatch(setVersions(mapped));
        if (mapped.length > 0) {
          const latest = [...mapped].sort((a, b) => b.versionNumber - a.versionNumber)[0];
          setSelectedVersionId(latest.id);
          setSource(latest.content);
          setStatusMessage(`Загружена последняя версия v${latest.versionNumber} для "${diagram.name}"`);
        } else {
          setSelectedVersionId(null);
          dispatch(clearVersions());
          setSource(diagram.content);
          setStatusMessage(`Загружена диаграмма "${diagram.name}"`);
        }
        return;
      }

      setSource(diagram.content);
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
        model: parseMermaidByType(source, activeDiagramType, useAutoLayout),
        error: null as string | null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка парсера';
      return {
        model: null,
        error: msg,
      };
    }
  }, [activeDiagramType, source, useAutoLayout]);

  useEffect(() => {
    if (!isDagreLayoutDiagramType(activeDiagramType)) {
      dagreEdgeCacheRef.current = null;
      return;
    }
    if (!parsed.model || parsed.error || !useAutoLayout) {
      return;
    }
    dagreEdgeCacheRef.current = snapshotEdgesForLayoutCache(parsed.model);
  }, [parsed.model, parsed.error, activeDiagramType, useAutoLayout]);

  const diagramModel = useMemo(() => {
    if (parsed.error || !parsed.model) return null;
    if (!isDagreLayoutDiagramType(activeDiagramType)) return parsed.model;
    const model = parsed.model;
    if (!useAutoLayout && dagreEdgeCacheRef.current?.length) {
      mergeEdgeLayoutFromCache(model, dagreEdgeCacheRef.current);
    }
    return model;
  }, [parsed.model, parsed.error, activeDiagramType, useAutoLayout, source]);

  const triggerZoom = (type: 'in' | 'out' | 'reset'): void => {
    if (type === 'in') {
      setZoomPercent((prev) => Math.min(400, Math.round(prev * 1.2)));
    } else if (type === 'out') {
      setZoomPercent((prev) => Math.max(30, Math.round(prev / 1.2)));
    } else {
      setZoomPercent(100);
    }
    setZoomType(type);
    setZoomNonce((prev) => prev + 1);
  };

  const zoomCommandStable = useMemo(
    () => ({ type: zoomType, nonce: zoomNonce }),
    [zoomType, zoomNonce],
  );

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

        if (typeof routeDiagramId === 'number') {
          return;
        }
        if (diagrams.length === 0) {
          return;
        }
        if (selectedDiagramId !== null) {
          return;
        }

        const storedIdRaw = localStorage.getItem(LAST_DIAGRAM_ID_STORAGE_KEY);
        const storedId = storedIdRaw ? Number(storedIdRaw) : NaN;
        const fromStorage = diagrams.find((d) => d.id === storedId);
        const byUpdated = [...diagrams].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )[0];
        const target = fromStorage ?? byUpdated;
        if (!target) return;

        autoLoadLatestForDiagramIdRef.current = target.id;
        dispatch(setSelectedDiagramId(target.id));
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
  }, [dispatch, routeDiagramId, selectedDiagramId]);

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
      void loadDiagramById(routeDiagramId, { loadLatestVersion: true });
      return;
    }
    if (selectedDiagramId !== null) {
      const shouldLoadLatest = autoLoadLatestForDiagramIdRef.current === selectedDiagramId;
      autoLoadLatestForDiagramIdRef.current = null;
      void loadDiagramById(selectedDiagramId, { loadLatestVersion: shouldLoadLatest });
    }
  }, [dispatch, routeDiagramId, selectedDiagramId]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => {
      setStatusMessage((prev) => (prev === statusMessage ? null : prev));
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

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
          type: activeDiagramType,
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
        localStorage.setItem(LAST_DIAGRAM_ID_STORAGE_KEY, String(created.id));
        setStatusMessage(`Создана диаграмма "${created.name}"`);
        return;
      }

      const updated = await updateDiagram(selectedDiagramId, {
        content: source,
        diagram_type: detectDiagramTypeFromSource(source) ?? activeDiagramType,
      });
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

  const loadVersionsForDiagramId = async (diagramId: number | null): Promise<void> => {
    if (diagramId === null) {
      dispatch(clearVersions());
      setSelectedVersionId(null);
      return;
    }
    setDrawerVersionsLoading(true);
    try {
      const versionItems = await listVersions(diagramId);
      dispatch(
        setVersions(
          versionItems.map((version) => ({
            id: version.id,
            diagramId: version.diagram_id,
            diagramType: version.diagram_type,
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
    } finally {
      setDrawerVersionsLoading(false);
    }
  };

  const loadVersionsForCurrentDiagram = async (): Promise<void> => {
    await loadVersionsForDiagramId(selectedDiagramId);
  };

  const handleSelectVersion = (versionId: number | null): void => {
    setSelectedVersionId(versionId);
    if (versionId === null) return;
    const selected = versions.find((version) => version.id === versionId);
    if (!selected) return;
    setSource(selected.content);
    dispatch(enableAutoLayout());
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
        diagram_type: selected.diagramType,
      });
      setSource(updated.content);
      dispatch(enableAutoLayout());
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

  const handleCreateDiagram = async (): Promise<void> => {
    const enteredName = window.prompt('Название диаграммы', 'Новая диаграмма');
    const name = enteredName?.trim();
    if (!name) {
      setStatusMessage('Создание отменено: не указано название');
      return;
    }

    try {
      const selectedType = detectDiagramTypeFromSource(source) ?? activeDiagramType;
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
      localStorage.setItem(LAST_DIAGRAM_ID_STORAGE_KEY, String(created.id));
      dispatch(enableAutoLayout());
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
    if (activeDiagramType !== 'flowchart') {
      setStatusMessage('Добавление узлов через canvas пока поддерживается только для flowchart');
      return;
    }
    setPendingNodePos(at ?? { x: 180, y: 140 });
    setShowAddNodeDialog(true);
  };

  const beginAddEdge = (): void => {
    if (activeDiagramType !== 'flowchart') {
      setStatusMessage('Добавление связей через canvas пока поддерживается только для flowchart');
      return;
    }
    setEdgePickActive(true);
    setEdgeAddModeFrom(null);
    dispatch(clearSelectedElement());
    setStatusMessage('Режим добавления связи: кликни узел-источник, затем узел-цель');
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
    if (!id) {
      dispatch(clearSelectedElement());
      if (edgePickActive) {
        setEdgePickActive(false);
        setEdgeAddModeFrom(null);
      }
      return;
    }
    if (edgePickActive) {
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
      setEdgePickActive(false);
      return;
    }
    dispatch(setSelectedNode(id));
  };

  const handleCreateEdge = (payload: { label: string }): void => {
    if (!edgeDraft) return;
    const edgeLine = payload.label
      ? `${edgeDraft.from} -->|${payload.label}| ${edgeDraft.to}`
      : `${edgeDraft.from} --> ${edgeDraft.to}`;
    setSource((prev) => appendEdgeLine(prev, edgeLine));
    setShowAddEdgeDialog(false);
    setEdgeDraft(null);
    setEdgePickActive(false);
    setStatusMessage(`Добавлена связь ${edgeDraft.from} -> ${edgeDraft.to}`);
  };

  const handleCreateEdgeByDrag = (from: string, to: string): void => {
    if (activeDiagramType !== 'flowchart') return;
    if (from === to) return;
    const edgeLine = `${from} --> ${to}`;
    setSource((prev) => appendEdgeLine(prev, edgeLine));
    setStatusMessage(`Добавлена связь ${from} -> ${to}`);
  };

  const handleNodeEditSave = (payload: { label: string; shape: FlowNodeShape }): void => {
    if (!editingNodeId) return;
    dispatch(enableAutoLayout());
    setSource((prev) => replaceNodeDefinition(prev, editingNodeId, payload.label, payload.shape));
    setEditingNodeId(null);
    setStatusMessage(`Узел "${editingNodeId}" обновлен`);
  };

  const handleEdgeEditSave = (payload: { label: string }): void => {
    if (!editingEdge) return;
    dispatch(enableAutoLayout());
    setSource((prev) => replaceEdgeDefinition(prev, editingEdge, payload.label));
    setStatusMessage(`Связь ${editingEdge.from} -> ${editingEdge.to} обновлена`);
    setEditingEdge(null);
  };

  const openFile = (): void => {
    fileInputRef.current?.click();
  };

  const handleOpenFile: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setSource(text);
    dispatch(enableAutoLayout());
    setStatusMessage(`Файл "${file.name}" открыт`);
    event.target.value = '';
  };

  const handleCodeEditorChange = (text: string): void => {
    dispatch(enableAutoLayout());
    setSource(text);
  };

  const layoutHintsInSource =
    isDagreLayoutDiagramType(activeDiagramType) && sourceHasLayoutPositionHints(source);

  const handleRestoreAutoLayout = (): void => {
    if (!isDagreLayoutDiagramType(activeDiagramType)) {
      setStatusMessage('Автораскладка с пересчётом dagre доступна для flowchart и class');
      return;
    }
    dispatch(enableAutoLayout());
    setSource((prev) => stripLayoutHintsFromSource(prev));
    setStatusMessage('Включена автораскладка: хинты позиций удалены из кода');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        padding: 0,
        gap: '0',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        background: '#ffffff',
        color: '#111827',
      }}
    >
      <nav
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <BurgerDrawer
            title="Меню редактора"
            open={drawerOpen}
            onOpen={() => setDrawerOpen(true)}
            onClose={() => setDrawerOpen(false)}
          >
            <button
              className={drawerStyles.itemButton}
              onClick={() => {
                void handleCreateDiagram();
              }}
            >
              <FilePlus2 size={16} />
              <span>Новая диаграмма</span>
            </button>

            <div className={drawerStyles.field}>
              <label className={drawerStyles.label}>Выбрать проект</label>
              <select
                className={drawerStyles.select}
                value={
                  selectedDiagramId !== null
                    ? String(selectedDiagramId)
                    : (diagramItems.length > 0 ? String(diagramItems[0].id) : '-')
                }
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === '-') {
                    return;
                  }
                  const id = Number(value);
                  dispatch(setSelectedDiagramId(id));
                  void loadDiagramById(id);
                  void loadVersionsForDiagramId(id);
                }}
              >
                {diagramItems.length > 0 ? (
                  diagramItems.map((diagram) => (
                    <option key={diagram.id} value={diagram.id}>
                      {diagram.name}
                    </option>
                  ))
                ) : (
                  <option value="-">-</option>
                )}
              </select>
            </div>

            <div className={drawerStyles.field}>
              <label className={drawerStyles.label}>Выбрать версию</label>
              <select
                className={drawerStyles.select}
                value={
                  selectedVersionId !== null
                    ? String(selectedVersionId)
                    : (versions.length > 0 ? String(versions[0].id) : '-')
                }
                disabled={selectedDiagramId === null}
                onFocus={() => {
                  void loadVersionsForCurrentDiagram();
                }}
                onChange={(event) => {
                  const value = event.target.value;
                  const nextVersionId = value && value !== '-' ? Number(value) : null;
                  handleSelectVersion(nextVersionId);
                }}
              >
                {drawerVersionsLoading ? (
                  <option value="-">Загрузка версий...</option>
                ) : versions.length > 0 ? (
                  versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      v{version.versionNumber}
                    </option>
                  ))
                ) : (
                  <option value="-">-</option>
                )}
              </select>
              <button
                className={drawerStyles.itemButton}
                onClick={() => {
                  void restoreSelectedVersion();
                }}
                disabled={selectedDiagramId === null || selectedVersionId === null}
              >
                <GitBranch size={16} />
                <span>Сохранить версию</span>
              </button>
            </div>

            <button className={drawerStyles.itemButton} onClick={() => dispatch(toggleTheme())}>
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              <span>Тема: {theme === 'light' ? 'Светлая' : 'Темная'}</span>
            </button>

            <label className={drawerStyles.toggle}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Grid3X3 size={16} />
                Привязка к сетке
              </span>
              <input
                type="checkbox"
                checked={gridSnap}
                onChange={(event) => dispatch(setGridSnap(event.target.checked))}
              />
            </label>
          </BurgerDrawer>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                background: 'linear-gradient(to right, #4f46e5, #9333ea)',
                padding: 8,
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  background: '#ffffff',
                  clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                }}
              />
            </div>
            <span style={{ fontWeight: 600, color: '#1f2937' }}>HDE</span>
          </div>

          <Link to="/dashboard" style={headerButtonStyle}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Личный кабинет</span>
          </Link>

          <Link to="/dashboard" state={{ tab: 'docs' }} style={headerLinkStyle}>
            <BookOpen size={16} />
            <span>Документация</span>
          </Link>

          <Link to="/dashboard" state={{ tab: 'projects' }} style={headerLinkStyle}>
            <GitBranch size={16} />
            <span>Проекты</span>
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} />
      </nav>

      <input
        ref={fileInputRef}
        type="file"
        accept=".mmd,.txt,.md,.puml"
        style={{ display: 'none' }}
        onChange={handleOpenFile}
      />

      {statusMessage ? (
        <div style={statusToastStyle} aria-live="polite">
          {statusMessage}
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ResizableEditorLayout
          code={
            <CodeEditor
              value={source}
              onChange={handleCodeEditorChange}
              diagramType={activeDiagramType}
              onOpenFile={openFile}
              onSaveCode={() => {
                downloadTextFile('diagram.mmd', source);
                setStatusMessage('Текст сохранен');
              }}
              onCopyCode={async () => {
                try {
                  await navigator.clipboard.writeText(source);
                  setStatusMessage('Код скопирован в буфер обмена');
                } catch {
                  setStatusMessage('Не удалось скопировать код');
                }
              }}
              onSaveVersion={() => {
                void saveVersionToServer();
              }}
              onDownloadSvg={saveAsSvg}
              onDownloadPng={() => {
                void saveAsPng();
              }}
              canSaveVersion={selectedDiagramId !== null}
              isSynced
            />
          }
          canvas={
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '8px',
            overflow: 'hidden',
            background: '#f3f4f6',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              background: '#ffffff',
              borderBottom: '1px solid #e5e7eb',
              padding: '8px 16px',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
              Интерактивный холст
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={canvasToolbarGroupStyle}>
                <button style={canvasIconButtonStyle} onClick={() => triggerZoom('out')} title="Уменьшить">
                  <ZoomOut size={16} color="#4b5563" />
                </button>
                <span style={{ padding: '0 8px', fontSize: 12, minWidth: 50, textAlign: 'center', color: '#4b5563', fontWeight: 500 }}>
                  {zoomPercent}%
                </span>
                <button style={canvasIconButtonStyle} onClick={() => triggerZoom('in')} title="Увеличить">
                  <ZoomIn size={16} color="#4b5563" />
                </button>
                <button style={canvasIconButtonStyle} onClick={() => triggerZoom('reset')} title="Вписать в экран">
                  <Maximize size={16} color="#4b5563" />
                </button>
              </div>
              <div style={canvasToolbarGroupStyle}>
                <button
                  type="button"
                  style={{
                    ...canvasIconButtonStyle,
                    gap: 6,
                    paddingLeft: 10,
                    paddingRight: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    color: layoutHintsInSource ? '#4f46e5' : '#6b7280',
                    background: layoutHintsInSource ? 'rgba(79, 70, 229, 0.1)' : undefined,
                    boxShadow: layoutHintsInSource
                      ? '0 0 0 2px rgba(79, 70, 229, 0.5), inset 0 1px 0 rgba(255,255,255,0.6)'
                      : 'none',
                  }}
                  onClick={handleRestoreAutoLayout}
                  title={
                    layoutHintsInSource
                      ? 'В коде есть ручные координаты (накладываются на dagre). Нажми — убрать хинты и пересчитать всё заново'
                      : 'Автораскладка dagre без ручных поправок'
                  }
                >
                  <LayoutGrid size={16} color={layoutHintsInSource ? '#4f46e5' : '#9ca3af'} />
                  <span>Автораскладка</span>
                </button>
              </div>
              <div style={canvasToolbarGroupStyle}>
                <button style={canvasIconButtonStyle} onClick={() => beginAddNode()} title="Добавить узел">
                  <Plus size={16} color="#4b5563" />
                </button>
                <button style={canvasIconButtonStyle} onClick={beginAddEdge} title="Добавить ребро">
                  <Link2 size={16} color="#4b5563" />
                </button>
                <button style={canvasIconButtonStyle} title="Дополнительно">
                  <MoreVertical size={16} color="#4b5563" />
                </button>
              </div>
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
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {diagramModel ? (
              <DiagramCanvas
                model={diagramModel}
                canvasId="diagram-canvas"
                zoomCommand={zoomCommandStable}
                disableNodeDrag={activeDiagramType === 'sequence'}
                gridSnap={gridSnap}
                selectedNodeId={selectedCanvasNodeId ?? undefined}
                selectedEdgeIndex={selectedCanvasEdgeIndex}
                onSelectNode={handleCanvasNodeSelect}
                onSelectEdge={(idx) => {
                  if (idx === null) return;
                  dispatch(setSelectedEdge(idx));
                }}
                onNodeDoubleClick={(id) => {
                  if (activeDiagramType !== 'flowchart') return;
                  setEditingNodeId(id);
                }}
                onEdgeDoubleClick={(edge) => {
                  if (activeDiagramType !== 'flowchart') return;
                  setEditingEdge(edge);
                }}
                onCreateEdge={handleCreateEdgeByDrag}
                onReconnectEdge={(edgeIndex, newTo) => {
                  if (activeDiagramType !== 'flowchart') return;
                  const e = diagramModel?.edges[edgeIndex];
                  if (!e) return;
                  dispatch(disableAutoLayout());
                  setSource((prev) =>
                    replaceEdgeTarget(prev, e.from, e.to, newTo, {
                      label: e.label,
                      type: e.type,
                    }),
                  );
                  setStatusMessage(`Связь: ${e.from} → ${newTo}`);
                }}
                onNodePositionChange={(id, x, y, size) => {
                  if (isDagreLayoutDiagramType(activeDiagramType)) {
                    if (diagramModel) {
                      dagreEdgeCacheRef.current = snapshotEdgesForLayoutCache(diagramModel);
                    }
                    dispatch(disableAutoLayout());
                  }
                  setSource((prevSource) => {
                    const nextSource = upsertLayoutHint(prevSource, id, x, y, size);
                    return nextSource === prevSource ? prevSource : nextSource;
                  });
                  setStatusMessage(`Обновлен layout-хинт для узла "${id}"`);
                }}
                onSequenceParticipantReorder={
                  activeDiagramType === 'sequence'
                    ? (orderedIds) => {
                        setSource((prev) => upsertSequenceParticipantOrder(prev, orderedIds));
                        setStatusMessage('Порядок участников сохранён в %%-хинте');
                      }
                    : undefined
                }
              />
            ) : (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  padding: '12px',
                  fontSize: '13px',
                  color: '#6b7280',
                }}
              >
                Нет корректной модели для визуализации.
              </div>
            )}
          </div>

          <div
            style={{
              background: '#ffffff',
              borderTop: '1px solid #e5e7eb',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#4b5563',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Узлов: {diagramModel?.nodes.length ?? 0}</span>
              <span style={{ color: '#9ca3af' }}>|</span>
              <span>Рёбер: {diagramModel?.edges.length ?? 0}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: '#22c55e' }} />
              <span>Автосинхронизация: Код ↔ Диаграмма</span>
            </div>
          </div>
        </div>
          }
          properties={
            hasCanvasSelection ? (
              <PropertiesPanel
                diagramType={activeDiagramType}
                model={diagramModel}
                source={source}
                onSourceChange={setSource}
              />
            ) : null
          }
        />
      </div>
      <div
        style={{
          background: '#1f2937',
          color: '#d1d5db',
          padding: '10px 24px 12px',
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          borderRadius: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#4ade80' }}>● Подключено</span>
          <span style={{ color: '#6b7280' }}>|</span>
          <span>Последнее сохранение: 2 минуты назад</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#9ca3af' }}>Версия: v1.2</span>
        </div>
      </div>
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
            setEdgePickActive(false);
            setEdgeAddModeFrom(null);
          }}
          onSubmit={handleCreateEdge}
        />
      ) : null}
      {editingNodeId ? (
        <NodeEditor
          initialLabel={findNodeLabel(diagramModel?.nodes ?? [], editingNodeId) ?? editingNodeId}
          initialShape={(findNodeShape(diagramModel?.nodes ?? [], editingNodeId) ?? 'rect') as FlowNodeShape}
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

const canvasToolbarGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: '#f3f4f6',
  borderRadius: 8,
  padding: 4,
};

const canvasIconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  borderRadius: 6,
  padding: 6,
  cursor: 'pointer',
};

const headerButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 16px',
  background: '#f9fafb',
  borderRadius: 8,
  color: '#374151',
  textDecoration: 'none',
};

const headerLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
  color: '#4b5563',
  textDecoration: 'none',
};

const statusToastStyle: React.CSSProperties = {
  position: 'fixed',
  top: 20,
  right: 20,
  zIndex: 10000,
  maxWidth: 420,
  fontSize: 13,
  lineHeight: 1.35,
  color: '#ffffff',
  background: '#2563eb',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 10,
  boxShadow: '0 10px 26px rgba(15, 23, 42, 0.25)',
  padding: '10px 14px',
  pointerEvents: 'none',
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

function detectDiagramTypeFromSource(source: string): DiagramType | null {
  const firstLine = source.split(/\r?\n/)[0]?.trim().toLowerCase() ?? '';
  if (!firstLine) return null;
  if (firstLine.startsWith('classdiagram')) return 'class';
  if (firstLine.startsWith('sequencediagram')) return 'sequence';
  if (firstLine.startsWith('erdiagram')) return 'er';
  if (firstLine.startsWith('flowchart') || firstLine.startsWith('graph')) return 'flowchart';
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

function appendEdgeLine(source: string, edgeLine: string): string {
  return `${source.trimEnd()}\n  ${edgeLine}`;
}
