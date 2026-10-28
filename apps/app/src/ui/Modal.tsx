import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Modal.module.css';

export type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/** Hoja inferior de diálogo: se cierra con Escape o tocando fuera, y devuelve el foco al cerrarse. */
export function Modal({ title, onClose, children }: ModalProps) {
  const titleId = useId();
  const sheet = useRef<HTMLDivElement>(null);
  // El cierre se guarda aparte: si el efecto dependiera de él se repetiría en cada render y le robaría el foco al campo de texto.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    sheet.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previo?.focus?.();
    };
  }, []);

  return (
    <div className={styles.backdrop} onClick={onClose} data-testid="modal-backdrop">
      <div
        ref={sheet}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
