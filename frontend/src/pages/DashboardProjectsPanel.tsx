import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

import { deleteDiagram, renameDiagram } from '../services/diagramApi';
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

  return (
    <div style={{ color: '#111827' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Список проектов</h2>
        <button style={buttonPrimaryStyle} onClick={() => navigate('/')}>
          Новая диаграмма
        </button>
      </div>

      {loading ? <div style={{ color: '#1d4ed8', marginBottom: 12 }}>Загрузка...</div> : null}
      {statusMessage ? <div style={statusStyle}>{statusMessage}</div> : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {projects.map((project) => (
          <div key={project.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{project.name}</div>
                <div style={metaStyle}>
                  Тип: {project.diagramType} | Обновлено:{' '}
                  {new Date(project.updatedAt).toLocaleString()} | Версий: {project.versionsCount}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'end' }}>
                <button style={buttonStyle} onClick={() => onRename(project.id, project.name)}>
                  Переименовать
                </button>
                <button style={buttonDangerStyle} onClick={() => onDelete(project.id, project.name)}>
                  Удалить
                </button>
                <button style={buttonPrimaryStyle} onClick={() => onOpen(project.id, project.diagramType)}>
                  Открыть
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 12,
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
};

const metaStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: '#6b7280',
};

const buttonStyle: React.CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#111827',
  borderRadius: 8,
  padding: '7px 10px',
  cursor: 'pointer',
};

const buttonDangerStyle: React.CSSProperties = {
  ...buttonStyle,
  border: '1px solid #fecaca',
  background: '#fef2f2',
  color: '#991b1b',
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
