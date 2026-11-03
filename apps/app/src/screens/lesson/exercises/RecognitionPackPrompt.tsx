import type { ModelPack } from '@linguapop/domain';
import { useEffect, useReducer } from 'react';
import { t } from '../../../i18n';
import styles from './RecognitionPackPrompt.module.css';

/** Vuelve a pintar el componente cuando cambia el estado, el avance o el error del modelo. */
export function usePackUpdates(pack: ModelPack | undefined): void {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => pack?.subscribe(refresh), [pack]);
}

/**
 * Ofrece bajar el reconocimiento de voz al dispositivo cuando el navegador no tiene el suyo.
 * Nunca descarga solo: el botón es la aceptación y el aviso dice cuánto pesa. No pinta nada si el
 * modelo ya está listo o no existe.
 */
export function RecognitionPackPrompt({ pack }: { pack: ModelPack | undefined }) {
  usePackUpdates(pack);
  if (!pack || pack.state() === 'ready') return null;
  const state = pack.state();
  const detail = pack.error();

  if (state === 'downloading') {
    const percent = Math.round(pack.progress() * 100);
    return (
      <div className={styles.box} role="status">
        <p className={styles.text}>{t('recpack.downloading', { percent })}</p>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label={t('recpack.bar')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <i style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.box}>
      <p className={styles.text} role={state === 'failed' ? 'alert' : undefined}>
        {state === 'failed' ? t('recpack.failed') : t('recpack.offer', { size: pack.sizeMb })}
      </p>
      {detail && <p className={styles.error}>{t('recpack.error', { detail })}</p>}
      <button type="button" className={styles.button} onClick={() => void pack.download()}>
        {state === 'failed' ? t('recpack.retry') : t('recpack.download')}
      </button>
    </div>
  );
}
