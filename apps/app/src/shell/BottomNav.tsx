import { NavLink } from 'react-router';
import { t, type TextKey } from '../i18n';
import styles from './BottomNav.module.css';

const TABS: ReadonlyArray<{ to: string; icon: string; label: TextKey }> = [
  { to: '/aprender', icon: '🏠', label: 'nav.learn' },
  { to: '/practicar', icon: '🎯', label: 'nav.practice' },
  { to: '/ligas', icon: '🏆', label: 'nav.leagues' },
  { to: '/perfil', icon: '👤', label: 'nav.profile' },
];

/** Navegación inferior: Aprender, Practicar, Ligas y Perfil. */
export function BottomNav() {
  return (
    <nav className={styles.nav} aria-label={t('nav.label')}>
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
        >
          <span className={styles.icon} aria-hidden="true">
            {tab.icon}
          </span>
          {t(tab.label)}
        </NavLink>
      ))}
    </nav>
  );
}
