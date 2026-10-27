import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { useUi } from '../composition/context';
import { BottomNav } from './BottomNav';
import styles from './AppShell.module.css';
import { TopBar } from './TopBar';

const prefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;

/** ¿Hay que mostrar el tema oscuro? Con "auto" manda la preferencia del sistema. */
function useDark(): boolean {
  const theme = useUi((s) => s.theme);
  const [system, setSystem] = useState(prefersDark);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const onChange = () => setSystem(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return theme === 'dark' || (theme === 'auto' && system);
}

/** Estructura común de las pantallas: barra superior, contenido y navegación inferior. */
export function AppShell() {
  const dark = useDark();
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  return (
    <>
      <TopBar dark={dark} />
      <main className={styles.content}>
        <Outlet />
      </main>
      <BottomNav />
    </>
  );
}
