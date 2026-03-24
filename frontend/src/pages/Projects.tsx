import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

import { listProjects } from '../services/projectApi';
import { deleteDiagram, renameDiagram } from '../services/diagramApi';
import { useAppDispatch, useAppSelector } from '../store';
import {
  removeProject,
  setCurrentDiagramType,
  setProjects,
  setSelectedDiagramId,
  upsertProject,
} from '../store/diagramSlice';

export const Projects: React.FC = () => {
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
        if (mounted) {
          setLoading(false);
        }
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
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Проекты</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/" style={linkButtonStyle}>
            Редактор
          </Link>
          <Link to="/profile" style={linkButtonStyle}>
            Профиль
          </Link>
        </div>
      </div>

      {loading ? <div style={{ color: '#93c5fd', marginBottom: 12 }}>Загрузка...</div> : null}
      {statusMessage ? <div style={statusStyle}>{statusMessage}</div> : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {projects.map((project) => (
          <div key={project.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{project.name}</div>
                <div style={metaStyle}>
                  Тип: {project.diagramType} | Обновлено:{' '}
                  {new Date(project.updatedAt).toLocaleString()} | Версий: {project.versionsCount}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  padding: 16,
  background: '#0f172a',
  color: '#e5e7eb',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 16,
};

const cardStyle: React.CSSProperties = {
  background: '#020617',
  border: '1px solid #1f2937',
  borderRadius: 8,
  padding: 12,
};

const metaStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: '#94a3b8',
};

const buttonStyle: React.CSSProperties = {
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e5e7eb',
  borderRadius: 6,
  padding: '7px 10px',
  cursor: 'pointer',
};

const buttonDangerStyle: React.CSSProperties = {
  ...buttonStyle,
  border: '1px solid #7f1d1d',
  background: '#450a0a',
};

const buttonPrimaryStyle: React.CSSProperties = {
  ...buttonStyle,
  background: '#1d4ed8',
};

const linkButtonStyle: React.CSSProperties = {
  border: '1px solid #334155',
  background: '#020617',
  color: '#e5e7eb',
  borderRadius: 6,
  padding: '7px 10px',
  textDecoration: 'none',
  fontSize: 13,
};

const statusStyle: React.CSSProperties = {
  marginBottom: 12,
  color: '#93c5fd',
  fontSize: 13,
};
