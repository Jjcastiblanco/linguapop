import { useStore } from 'zustand';
import { useServices } from '../composition/context';
import styles from './Toaster.module.css';

/** Muestra los avisos breves sobre cualquier pantalla. Es una región `aria-live`: los lectores de pantalla anuncian cada aviso sin que tenga un rol propio que choque con los estados de cada pantalla. */
export function Toaster() {
  const toasts = useStore(useServices().toast, (s) => s.toasts);
  return (
    <div className={styles.stack} aria-live="polite" data-testid="toaster">
      {toasts.map((toast) => (
        <div key={toast.id} className={styles.toast}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}
