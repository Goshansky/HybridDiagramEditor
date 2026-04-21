import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';

import { parseMermaidByType } from '../../parser';
import { DiagramCanvas } from '../components/DiagramCanvas';

import {
  createDiagram,
  deleteDiagram,
  listVersions,
  renameDiagram,
  type DiagramType,
  type VersionDto,
} from '../services/diagramApi';
import { listProjects } from '../services/projectApi';
import {
  removeProject,
  setCurrentDiagramType,
  setProjects,
  setSelectedDiagramId,
  upsertProject,
} from '../store/diagramSlice';
import { useAppDispatch, useAppSelector } from '../store';

export const DashboardProjectsPanel: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const projects = useAppSelector((state) => state.diagram.projects);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [versionsByProject, setVersionsByProject] = useState<Record<number, VersionDto[]>>({});
  const [selectedVersionByProject, setSelectedVersionByProject] = useState<Record<number, number>>({});
  const [versionsExpandedByProject, setVersionsExpandedByProject] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let mounted = true;
    const loadProjects = async (): Promise<void> => {
      setLoading(true);
      setStatusMessage(null);
      try {
        const items = await listProjects();
        if (!mounted) return;
        dispatch(
          setProjects(
            items.map((item) => ({
              id: item.id,
              name: item.name,
              updatedAt: item.updated_at,
              diagramType: item.diagram_type,
              versionsCount: item.versions_count,
            })),
          ),
        );
        const versionsList = await Promise.all(
          items.map(async (item) => {
            const versions = await listVersions(item.id);
            return { projectId: item.id, versions };
          }),
        );
        if (!mounted) return;
        const nextVersions: Record<number, VersionDto[]> = {};
        const nextSelected: Record<number, number> = {};
        const nextExpanded: Record<number, boolean> = {};
        for (const entry of versionsList) {
          nextVersions[entry.projectId] = entry.versions;
          const latest = [...entry.versions].sort((a, b) => b.version_number - a.version_number)[0];
          if (latest) {
            nextSelected[entry.projectId] = latest.id;
          }
          nextExpanded[entry.projectId] = false;
        }
        setVersionsByProject(nextVersions);
        setSelectedVersionByProject(nextSelected);
        setVersionsExpandedByProject(nextExpanded);
      } catch (error) {
        if (!mounted) return;
        const message = axios.isAxiosError(error)
          ? (error.response?.data?.detail ?? 'Не удалось загрузить проекты')
          : 'Не удалось загрузить проекты';
        setStatusMessage(message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void loadProjects();
    return () => {
      mounted = false;
    };
  }, [dispatch]);

  const onRename = async (id: number, currentName: string): Promise<void> => {
    const entered = window.prompt('Новое название диаграммы', currentName);
    const name = entered?.trim();
    if (!name || name === currentName) return;
    try {
      const updated = await renameDiagram(id, { name });
      dispatch(
        upsertProject({
          id: updated.id,
          name: updated.name,
          updatedAt: updated.updated_at,
          diagramType: updated.diagram_type,
          versionsCount: projects.find((item) => item.id === id)?.versionsCount ?? 0,
        }),
      );
      setStatusMessage(`Диаграмма "${updated.name}" переименована`);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.detail ?? 'Не удалось переименовать диаграмму')
        : 'Не удалось переименовать диаграмму';
      setStatusMessage(message);
    }
  };

  const onDelete = async (id: number, name: string): Promise<void> => {
    const approved = window.confirm(`Удалить диаграмму "${name}"?`);
    if (!approved) return;
    try {
      await deleteDiagram(id);
      dispatch(removeProject(id));
      setStatusMessage(`Диаграмма "${name}" удалена`);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.detail ?? 'Не удалось удалить диаграмму')
        : 'Не удалось удалить диаграмму';
      setStatusMessage(message);
    }
  };

  const onOpen = (id: number, diagramType: 'flowchart' | 'class' | 'sequence' | 'er'): void => {
    dispatch(setSelectedDiagramId(id));
    dispatch(setCurrentDiagramType(diagramType));
    navigate('/', { state: { diagramId: id } });
  };

  const onCreateNew = async (): Promise<void> => {
    const entered = window.prompt('Название диаграммы', 'Новая диаграмма');
    const name = entered?.trim();
    if (!name) return;
    const type: DiagramType = 'flowchart';
    try {
      const created = await createDiagram({
        name,
        type,
        content: getTemplateByDiagramType(type),
      });
      dispatch(
        upsertProject({
          id: created.id,
          name: created.name,
          updatedAt: created.updated_at,
          diagramType: created.diagram_type,
          versionsCount: 1,
        }),
      );
      onOpen(created.id, created.diagram_type);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.detail ?? 'Не удалось создать диаграмму')
        : 'Не удалось создать диаграмму';
      setStatusMessage(message);
    }
  };

  return (
    <div style={{ color: '#111827' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Список проектов</h2>
        <button style={buttonPrimaryStyle} onClick={() => { void onCreateNew(); }}>
          Новая диаграмма
        </button>
      </div>

      {loading ? <div style={{ color: '#1d4ed8', marginBottom: 12 }}>Загрузка...</div> : null}
      {statusMessage ? <div style={statusStyle}>{statusMessage}</div> : null}

      <div style={projectsGridStyle}>
        {projects.map((project) => (
          <article key={project.id} style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25, wordBreak: 'break-word', flex: 1 }}>
                {project.name}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={iconButtonStyle}
                  title="Переименовать"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onRename(project.id, project.name);
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  style={{ ...iconButtonStyle, color: '#b91c1c' }}
                  title="Удалить"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onDelete(project.id, project.name);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div
              style={mainRowStyle}
              onDoubleClick={() => onOpen(project.id, project.diagramType)}
              title="Двойной клик — открыть проект"
            >
              <div>
                <button
                  style={versionsToggleButtonStyle}
                  onClick={(event) => {
                    event.stopPropagation();
                    setVersionsExpandedByProject((prev) => ({
                      ...prev,
                      [project.id]: !prev[project.id],
                    }));
                  }}
                >
                  <span style={{ ...metaLabelStyle, color: '#334155' }}>Версии</span>
                  {versionsExpandedByProject[project.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <div
                  style={
                    versionsExpandedByProject[project.id]
                      ? versionsExpandedContainerStyle
                      : versionsCollapsedContainerStyle
                  }
                >
                  {!versionsExpandedByProject[project.id] ? (
                    <div style={versionCurrentStyle}>
                      {getCurrentVersionLabel(
                        versionsByProject[project.id] ?? [],
                        selectedVersionByProject[project.id],
                      )}
                    </div>
                  ) : (
                    <div style={versionsListStyle}>
                      {(versionsByProject[project.id] ?? [])
                        .slice()
                        .sort((a, b) => b.version_number - a.version_number)
                        .map((version) => (
                          <button
                            key={version.id}
                            style={{
                              ...versionButtonStyle,
                              ...(selectedVersionByProject[project.id] === version.id ? selectedVersionButtonStyle : null),
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedVersionByProject((prev) => ({ ...prev, [project.id]: version.id }));
                            }}
                          >
                            v{version.version_number}
                          </button>
                        ))}
                      {(versionsByProject[project.id] ?? []).length === 0 ? (
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>Нет версий</span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div style={previewWrapStyle}>
                <div style={previewTitleStyle}>Превью проекта</div>
                <div style={previewBoxStyle}>
                  <ProjectPreview
                    projectType={project.diagramType}
                    content={resolvePreviewContent(
                      versionsByProject[project.id] ?? [],
                      selectedVersionByProject[project.id],
                    )}
                  />
                </div>
              </div>
            </div>

            <div style={metaBottomStyle}>
              Обновлено: {new Date(project.updatedAt).toLocaleString('ru-RU')}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

const projectsGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 16,
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-soft)',
  borderRadius: 12,
  padding: 18,
  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'start',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 12,
};

const mainRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '140px 1fr',
  gap: 14,
  alignItems: 'stretch',
  marginBottom: 10,
  cursor: 'pointer',
};

const metaLabelStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: 13,
};

const metaBottomStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: 12,
};

const iconButtonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: '1px solid var(--border-soft)',
  background: '#fff',
  color: '#334155',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const versionsListStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
};

const versionsExpandedContainerStyle: React.CSSProperties = {
  marginTop: 8,
  height: 250,
  overflowY: 'auto',
  paddingRight: 4,
};

const versionsCollapsedContainerStyle: React.CSSProperties = {
  marginTop: 8,
  minHeight: 34,
};

const versionButtonStyle: React.CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#334155',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 13,
  textAlign: 'left',
  cursor: 'pointer',
};

const versionsToggleButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: '1px solid var(--border-soft)',
  background: '#fff',
  color: '#334155',
  borderRadius: 8,
  padding: '6px 10px',
  cursor: 'pointer',
};

const versionCurrentStyle: React.CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#f8fafc',
  color: '#334155',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 13,
};

const selectedVersionButtonStyle: React.CSSProperties = {
  border: '1px solid #3b82f6',
  background: '#eff6ff',
  color: '#1d4ed8',
};

const previewWrapStyle: React.CSSProperties = {
  minHeight: 240,
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  gap: 6,
};

const previewTitleStyle: React.CSSProperties = {
  color: '#334155',
  fontSize: 13,
  fontWeight: 600,
};

const previewBoxStyle: React.CSSProperties = {
  border: '2px solid var(--border-soft)',
  borderRadius: 14,
  background: '#f8fafc',
  minHeight: 220,
  overflow: 'hidden',
};

const buttonStyle: React.CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#111827',
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 13,
  cursor: 'pointer',
};

const buttonPrimaryStyle: React.CSSProperties = {
  ...buttonStyle,
  border: '1px solid #3b82f6',
  background: '#3b82f6',
  color: '#fff',
};

const statusStyle: React.CSSProperties = {
  marginBottom: 12,
  color: '#1d4ed8',
  fontSize: 13,
};

function resolvePreviewContent(versions: VersionDto[], selectedVersionId: number | undefined): string {
  if (!versions.length) return '';
  const selected = versions.find((v) => v.id === selectedVersionId);
  if (selected) return selected.content;
  return [...versions].sort((a, b) => b.version_number - a.version_number)[0].content;
}

const ProjectPreview: React.FC<{
  projectType: 'flowchart' | 'class' | 'sequence' | 'er';
  content: string;
}> = ({ projectType, content }) => {
  const previewModel = React.useMemo(() => {
    if (!content.trim()) return null;
    try {
      return parseMermaidByType(content, projectType, true);
    } catch {
      return null;
    }
  }, [content, projectType]);

  if (!content.trim()) {
    return <div style={previewFallbackStyle}>Пустая версия</div>;
  }
  if (!previewModel) {
    return <div style={previewFallbackStyle}>Не удалось построить превью</div>;
  }
  return <DiagramCanvas model={previewModel} width={560} height={220} disableNodeDrag />;
};

const previewFallbackStyle: React.CSSProperties = {
  height: 220,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#94a3b8',
  fontSize: 13,
};

function getCurrentVersionLabel(versions: VersionDto[], selectedVersionId: number | undefined): string {
  if (!versions.length) return 'Нет версий';
  const selected = versions.find((v) => v.id === selectedVersionId);
  if (selected) return `v${selected.version_number}`;
  const latest = [...versions].sort((a, b) => b.version_number - a.version_number)[0];
  return latest ? `v${latest.version_number}` : 'Нет версий';
}

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
