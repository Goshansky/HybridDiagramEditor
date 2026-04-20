import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Github } from 'lucide-react';

import { logout } from '../store/authSlice';
import { useAppDispatch } from '../store';
import { DashboardProfilePanel } from './DashboardProfilePanel';
import { DashboardProjectsPanel } from './DashboardProjectsPanel';
import styles from './Dashboard.module.css';

type DashboardTab = 'profile' | 'projects' | 'docs';

export const Dashboard: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<DashboardTab>('profile');

  useEffect(() => {
    const requestedTab = (location.state as { tab?: string } | null)?.tab;
    if (requestedTab === 'profile' || requestedTab === 'projects' || requestedTab === 'docs') {
      setActiveTab(requestedTab);
    }
  }, [location.state]);

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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.brandLink}>
          <span className={styles.brandHex} />
          <span className={styles.brand}>HDE</span>
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
        <a
          className={styles.githubLink}
          href="https://github.com/Goshansky/HybridDiagramEditor"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub репозиторий"
        >
          <Github size={20} />
        </a>
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
