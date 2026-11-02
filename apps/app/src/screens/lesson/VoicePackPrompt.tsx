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
 * Ofrece bajar la voz de respaldo cuando el navegador no tiene voz en inglés. Nunca descarga sola:
 * el botón es la aceptación. No pinta nada si ya se puede hablar o si no hay voz de respaldo.
 */
export function VoicePackPrompt() {
  const { composition } = useServices();
  const { canSpeak } = useCanSpeak();
  const pack = composition.speech.voicePack;
  if (!pack || canSpeak) return null;
  const state = pack.state();

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
