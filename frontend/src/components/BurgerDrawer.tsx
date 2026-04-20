import React from 'react';
import { Menu, X } from 'lucide-react';
import styles from './BurgerDrawer.module.css';

interface BurgerDrawerProps {
  title: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

export const BurgerDrawer: React.FC<BurgerDrawerProps> = ({
  title,
  open,
  onOpen,
  onClose,
  children,
}) => {
  return (
    <>
      <button className={styles.menuButton} onClick={onOpen} aria-label="Открыть меню">
        <Menu size={18} />
      </button>
      {open ? <div className={styles.overlay} onClick={onClose} /> : null}
      <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`.trim()}>
        <div className={styles.header} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{title}</span>
          <button className={styles.menuButton} onClick={onClose} aria-label="Закрыть меню">
            <X size={16} />
          </button>
        </div>
        <div className={styles.content}>{children}</div>
      </aside>
    </>
  );
};
