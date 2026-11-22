import { buildEarSession, type EarAttempt } from '@linguapop/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useServices } from '../../composition/context';
import { t } from '../../i18n';
import styles from './EarTrainingScreen.module.css';

/**
 * «Entrena tu oído»: sesión de identificar la palabra de un par mínimo que suena. No es una
 * lección: no usa vidas ni XP, y el pliegue de eventos ignora sus respuestas (ids `pair-…`).
 */
export function EarTrainingScreen() {
  const { composition, progress } = useServices();
  const navigate = useNavigate();
  const [attempts] = useState<EarAttempt[]>(() =>
    buildEarSession(composition.pairs, composition.random),
  );
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [hits, setHits] = useState(0);
  const [noSound, setNoSound] = useState(false);

  const attempt = attempts[index];
  const finished = index >= attempts.length;

  // Cada reproducción lleva un número: si cambió el intento, un resultado tardío no cuenta.
  const playing = useRef(0);
  const play = useCallback(
    async (text: string) => {
      const mine = ++playing.current;
      const ok = composition.speech.capabilities().canSpeak
        ? await composition.speech.speak(text, { rate: 1 })
        : false;
      if (mine === playing.current) setNoSound(!ok);
    },
    [composition],
  );

  // Cada intento suena al aparecer.
  const word = attempt?.word.en;
  useEffect(() => {
    if (word) void play(word);
    return () => {
      playing.current++;
      composition.speech.cancel();
    };
  }, [word, index, play, composition]);

  const exit = () => navigate('/practicar', { replace: true });

  function answer(choice: string) {
    if (!attempt || picked !== null) return;
    const correct = choice === attempt.word.en;
    setPicked(choice);
    if (correct) setHits((n) => n + 1);
    void progress.getState().record([
      {
        type: 'exercise_answered@1',
        payload: { exerciseId: attempt.pairId, correct, mode: 'practice' },
      },
    ]);
  }

  function skip() {
    if (!attempt || picked !== null) return;
    void progress.getState().record([
      {
        type: 'exercise_answered@1',
        payload: { exerciseId: attempt.pairId, correct: false, mode: 'practice', skipped: true },
      },
    ]);
    next();
  }

  function next() {
    setPicked(null);
    setNoSound(false);
    setIndex((i) => i + 1);
  }

  if (finished) {
    return (
      <div className={styles.screen}>
        <div className={`${styles.body} ${styles.center}`}>
          <h1>{t('practice.ear.done')}</h1>
          <p data-testid="ear-score">
            {t('practice.ear.score', { n: hits, total: attempts.length })}
          </p>
          <button type="button" className={styles.action} onClick={exit}>
            {t('practice.ear.back')}
          </button>
        </div>
      </div>
    );
  }
  if (!attempt) return null;

  const options = [attempt.word, attempt.other].sort((a, b) => a.en.localeCompare(b.en));
  const answered = picked !== null;
  const right = picked === attempt.word.en;

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.close}
          aria-label={t('practice.ear.close')}
          onClick={exit}
        >
          ✕
        </button>
        <span className={styles.count}>
          {t('practice.ear.progress', { n: index + 1, total: attempts.length })}
        </span>
      </div>

      <div className={styles.body}>
        <h1>{t('practice.ear.title')}</h1>
        <button
          type="button"
          className={styles.listen}
          aria-label={t('practice.ear.listen')}
          onClick={() => void play(attempt.word.en)}
        >
          🔊
        </button>
        {noSound && (
          <p className={styles.notice} role="status">
            {t('practice.ear.nosound')}
          </p>
        )}
        <div className={styles.options}>
          {options.map((o) => (
            <button
              key={o.en}
              type="button"
              className={`${styles.option} ${answered && o.en === attempt.word.en ? styles.good : ''}`}
              disabled={answered}
              onClick={() => answer(o.en)}
            >
              {o.en}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`${styles.foot} ${answered ? (right ? styles.footGood : styles.footMiss) : ''}`}
      >
        {answered ? (
          <>
            <div className={styles.feedback} role="status">
              {right
                ? t('practice.ear.good')
                : t('practice.ear.miss', { word: attempt.word.en, es: attempt.word.es })}
            </div>
            <button type="button" className={styles.action} onClick={next}>
              {t(index + 1 >= attempts.length ? 'practice.ear.finish' : 'practice.ear.next')}
            </button>
          </>
        ) : (
          noSound && (
            <button type="button" className={styles.ghost} onClick={skip}>
              {t('practice.ear.skip')}
            </button>
          )
        )}
      </div>
    </div>
  );
}
