import { useEffect, useReducer } from 'react';
import { useServices } from '../../composition/context';
import { t } from '../../i18n';
import styles from './VoicePackPrompt.module.css';

/**
 * Si hay voz de respaldo, vuelve a pintar el componente cuando cambia su estado y devuelve si la
 * app puede hablar ahora. `refresh` sirve para releerlo tras un intento de voz fallido.
 */
export function useCanSpeak(): { canSpeak: boolean; refresh: () => void } {
  const { composition } = useServices();
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const pack = composition.speech.voicePack;
  useEffect(() => pack?.subscribe(refresh), [pack]);
  return { canSpeak: composition.speech.capabilities().canSpeak, refresh };
}

/**
 * Voz de respaldo. Cuando el navegador no puede hablar en inglés ofrece bajarla; cuando sí puede
 * deja un enlace para quien no oye nada (los navegadores no avisan si una voz suena o no). Nunca
 * descarga sola: tocar el botón o el enlace es la aceptación, y el enlace dice cuánto pesa.
 * No pinta nada si no hay voz de respaldo.
 */
export function VoicePackPrompt() {
  const { composition } = useServices();
  const { canSpeak } = useCanSpeak();
  const pack = composition.speech.voicePack;
  if (!pack) return null;
  const state = pack.state();
  const preferred = pack.preferred();

  if (state === 'downloading') {
    const percent = Math.round(pack.progress() * 100);
    return (
      <div className={styles.box} role="status">
        <p className={styles.text}>{t('voicepack.downloading', { percent })}</p>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label={t('voicepack.bar')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <i style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }

  if (!canSpeak) {
    return (
      <div className={styles.box}>
        <p className={styles.text} role={state === 'failed' ? 'alert' : undefined}>
          {state === 'failed' ? t('voicepack.failed') : t('voicepack.offer', { size: pack.sizeMb })}
        </p>
        <button type="button" className={styles.button} onClick={() => void pack.download()}>
          {state === 'failed' ? t('voicepack.retry') : t('voicepack.download')}
        </button>
      </div>
    );
  }

  if (state === 'failed' && preferred) {
    return (
      <div className={styles.box}>
        <p className={styles.text} role="alert">
          {t('voicepack.failed')}
        </p>
        <button type="button" className={styles.button} onClick={() => void pack.download()}>
          {t('voicepack.retry')}
        </button>
      </div>
    );
  }

  if (state === 'ready' && preferred) {
    return (
      <div className={styles.box}>
        <button type="button" className={styles.link} onClick={() => pack.setPreferred(false)}>
          {t('voicepack.back')}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.box}>
      <button
        type="button"
        className={styles.link}
        onClick={() => {
          pack.setPreferred(true);
          void pack.download();
        }}
      >
        {state === 'ready'
          ? t('voicepack.switchReady')
          : t('voicepack.switch', { size: pack.sizeMb })}
      </button>
    </div>
  );
}
