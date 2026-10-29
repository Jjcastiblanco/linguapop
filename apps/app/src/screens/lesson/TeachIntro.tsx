import type { TeachCard } from '@linguapop/content';
import { useState } from 'react';
import { useServices } from '../../composition/context';
import { t } from '../../i18n';
import styles from './LessonScreen.module.css';
import card from './TeachIntro.module.css';

/** Velocidad de la repetición lenta, la misma que en Escuchar. */
const SLOW_RATE = 0.6;

type Props = {
  cards: readonly TeachCard[];
  /** Termina la fase, sea por llegar a la última tarjeta o por saltarla. */
  onDone: () => void;
  /** Cierra la lección sin empezar. */
  onClose: () => void;
};

/**
 * Fase «Palabras nuevas» (9.3): las tarjetas de la lección una por una, antes del primer ejercicio.
 * Es solo interfaz: no da XP, no cuesta vidas y no toca el motor de lección. Sin voz, el botón de
 * audio no aparece y la tarjeta se lee igual.
 */
export function TeachIntro({ cards, onDone, onClose }: Props) {
  const { composition } = useServices();
  const [index, setIndex] = useState(0);
  const [canSpeak, setCanSpeak] = useState(() => composition.speech.capabilities().canSpeak);
  const current = cards[index];
  if (!current) return null;
  const last = index === cards.length - 1;
  const percent = Math.round(((index + 1) / cards.length) * 100);

  const play = async (rate: number) => {
    const ok = await composition.speech.speak(current.en, { rate });
    if (!ok && !composition.speech.capabilities().canSpeak) setCanSpeak(false);
  };

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.close}
          aria-label={t('lesson.close')}
          onClick={onClose}
        >
          ✕
        </button>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label={t('teach.title')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <i style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className={`${styles.body} ${styles.center}`}>
        <h2 className={card.title}>{t('teach.title')}</h2>
        <p className={card.count}>{t('teach.progress', { n: index + 1, total: cards.length })}</p>
        <div className={card.card} data-testid="teach-card">
          {current.emoji && (
            <span className={card.emoji} aria-hidden="true">
              {current.emoji}
            </span>
          )}
          <p className={card.en} lang="en">
            {current.en}
          </p>
          <p className={card.es}>{current.es}</p>
          {canSpeak && (
            <div className={card.speakers}>
              <button
                type="button"
                className={card.speaker}
                aria-label={t('teach.listen')}
                onClick={() => void play(1)}
              >
                <span aria-hidden="true">🔊</span>
              </button>
              <button
                type="button"
                className={card.speaker}
                aria-label={t('teach.slow')}
                onClick={() => void play(SLOW_RATE)}
              >
                <span aria-hidden="true">🐢</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`${styles.foot} ${card.buttons}`}>
        <button
          type="button"
          className={`${styles.action} ${last ? styles.actionOk : ''}`}
          onClick={last ? onDone : () => setIndex(index + 1)}
        >
          {last ? t('teach.start') : t('teach.next')}
        </button>
        {!last && (
          <button type="button" className={styles.ghost} onClick={onDone}>
            {t('teach.skip')}
          </button>
        )}
      </div>
    </div>
  );
}
