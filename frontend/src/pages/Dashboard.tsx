import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilePlus2, GitBranch, Grid3X3, Moon, Sun } from 'lucide-react';

import { logout } from '../store/authSlice';
import { BurgerDrawer } from '../components/BurgerDrawer';
import drawerStyles from '../components/BurgerDrawer.module.css';
import { createDiagram, getDiagram, listVersions, updateDiagram } from '../services/diagramApi';
import { listProjects } from '../services/projectApi';
import { setSelectedDiagramId, setCurrentDiagramType } from '../store/diagramSlice';
import { setGridSnap, toggleTheme } from '../store/uiSlice';
import { useAppDispatch, useAppSelector } from '../store';
import { DashboardProfilePanel } from './DashboardProfilePanel';
import { DashboardProjectsPanel } from './DashboardProjectsPanel';
import styles from './Dashboard.module.css';

type DashboardTab = 'profile' | 'projects' | 'docs';

export const Dashboard: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DashboardTab>('profile');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [projects, setProjects] = useState<Array<{ id: number; name: string; diagram_type: 'flowchart' | 'class' | 'sequence' | 'er' }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [versions, setVersions] = useState<Array<{ id: number; version_number: number; content: string }>>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const theme = useAppSelector((state) => state.ui.theme);
  const gridSnap = useAppSelector((state) => state.ui.gridSnap);

  const content = useMemo(() => {
    if (activeTab === 'projects') {
      return <DashboardProjectsPanel />;
    }
    if (activeTab === 'docs') {
      return <Documentation />;
    }
    return <DashboardProfilePanel />;
  }, [activeTab]);

  const handleLogout = (): void => {
    dispatch(logout());
    navigate('/login', { replace: true });
  };

  const loadProjectsForDrawer = async (): Promise<void> => {
    const items = await listProjects();
    setProjects(items.map((p) => ({ id: p.id, name: p.name, diagram_type: p.diagram_type })));
  };

  const createNewDiagramFromDrawer = async (): Promise<void> => {
    const enteredName = window.prompt('Название диаграммы', 'Новая диаграмма');
    const name = enteredName?.trim();
    if (!name) return;
    const created = await createDiagram({ name, type: 'flowchart' });
    dispatch(setSelectedDiagramId(created.id));
    dispatch(setCurrentDiagramType(created.diagram_type));
    setDrawerOpen(false);
    navigate('/', { state: { diagramId: created.id } });
  };

  const loadVersionsForProject = async (diagramId: number): Promise<void> => {
    const items = await listVersions(diagramId);
    setVersions(items.map((v) => ({ id: v.id, version_number: v.version_number, content: v.content })));
  };

  const restoreSelectedVersionFromDrawer = async (): Promise<void> => {
    if (!selectedProjectId || !selectedVersionId) return;
    const selected = versions.find((v) => v.id === selectedVersionId);
    if (!selected) return;
    await updateDiagram(selectedProjectId, { content: selected.content });
    setDrawerOpen(false);
    navigate('/', { state: { diagramId: selectedProjectId } });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <BurgerDrawer
            title="Меню"
            open={drawerOpen}
            onOpen={() => {
              setDrawerOpen(true);
              void loadProjectsForDrawer();
            }}
            onClose={() => setDrawerOpen(false)}
          >
            <button
              className={drawerStyles.itemButton}
              onClick={() => {
                void createNewDiagramFromDrawer();
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
                  selectedProjectId !== null
                    ? String(selectedProjectId)
                    : (projects.length > 0 ? String(projects[0].id) : '-')
                }
                onChange={(event) => {
                  const value = event.target.value;
                  const v = value && value !== '-' ? Number(value) : null;
                  setSelectedProjectId(v);
                  setSelectedVersionId(null);
                  setVersions([]);
                  if (v) {
                    void loadVersionsForProject(v);
                  }
                }}
              >
                {projects.length > 0 ? (
                  projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                ) : (
                  <option value="-">-</option>
                )}
              </select>
              <button
                className={drawerStyles.itemButton}
                disabled={!selectedProjectId}
                onClick={() => {
                  if (!selectedProjectId) return;
                  dispatch(setSelectedDiagramId(selectedProjectId));
                  const selectedProject = projects.find((p) => p.id === selectedProjectId);
                  if (selectedProject) dispatch(setCurrentDiagramType(selectedProject.diagram_type));
                  setDrawerOpen(false);
                  navigate('/', { state: { diagramId: selectedProjectId } });
                }}
              >
                <span>Открыть проект в редакторе</span>
              </button>
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
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedVersionId(value && value !== '-' ? Number(value) : null);
                }}
                disabled={!selectedProjectId}
              >
                {versions.length > 0 ? (
                  versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version_number}
                    </option>
                  ))
                ) : (
                  <option value="-">-</option>
                )}
              </select>
              <button className={drawerStyles.itemButton} onClick={() => void restoreSelectedVersionFromDrawer()}>
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
          <div className={styles.brand}>Hybrid Diagram Editor</div>
        </div>
        <Link to="/" className={styles.outlineButton}>
          Редактор
        </Link>
      </header>

      <main className={styles.main}>
        <aside className={styles.sidebar}>
          <SidebarButton
            active={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
            label="Личная информация"
          />
          <SidebarButton
            active={activeTab === 'projects'}
            onClick={() => setActiveTab('projects')}
            label="Мои проекты"
          />
          <SidebarButton
            active={activeTab === 'docs'}
            onClick={() => setActiveTab('docs')}
            label="Документация"
          />
          <button className={styles.tabButton} onClick={handleLogout}>
            Выйти
          </button>
        </aside>

        <section className={styles.contentWrap}>
          <div className={styles.contentCard}>{content}</div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>© 2026 Hybrid Diagram Editor. Все права защищены.</div>
        <div className={styles.footerLinks}>
          <a className={styles.footerLink} href="#" onClick={(e) => e.preventDefault()}>
            Документация
          </a>
          <a className={styles.footerLink} href="#" onClick={(e) => e.preventDefault()}>
            О проекте
          </a>
        </div>
      </footer>
    </div>
  );
};

const SidebarButton: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({
  active,
  onClick,
  label,
}) => (
  <button
    className={`${styles.tabButton} ${active ? styles.tabButtonActive : ''}`.trim()}
    onClick={onClick}
  >
    {label}
  </button>
);

const Documentation: React.FC = () => (
  <div>
    <h2 className={styles.sectionTitle}>Документация</h2>
    <p className={styles.paragraph}>
      Приложение поддерживает создание и редактирование диаграмм в синтаксисе Mermaid с живой
      визуализацией и двусторонней синхронизацией кода и холста.
    </p>
    <ul className={styles.list}>
      <li>Типы диаграмм: flowchart, class, sequence, er.</li>
      <li>
        Поддержка <code>subgraph</code>, стилей узлов и рёбер, меток связей, пунктирных линий{' '}
        <code>{'-.->'}</code>, shape-маркеров.
      </li>
      <li>
        Layout-хинты в комментариях (<code>{'%% {"layout": {...}}'}</code>) для хранения ручных координат и размеров.
      </li>
      <li>Версионирование диаграмм: история изменений и загрузка предыдущих ревизий.</li>
      <li>Экспорт через инструменты редактора и управление проектами из вкладки "Мои проекты".</li>
      <li>JWT-аутентификация, личный кабинет, смена пароля и защищённые маршруты.</li>
    </ul>
    <p className={styles.paragraph} style={{ marginTop: 16 }}>
      Быстрый старт: откройте "Мои проекты", выберите диаграмму или создайте новую, затем перейдите в "Редактор".
    </p>
  </div>
);
