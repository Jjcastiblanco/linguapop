import type { ExerciseOf, ListenResult } from '@linguapop/domain';
import { useEffect, useRef, useState } from 'react';
import { useServices } from '../../../composition/context';
import { t, type TextKey } from '../../../i18n';
import styles from './Exercise.module.css';
import type { ExerciseProps } from './types';

type Unavailable = Extract<ListenResult, { kind: 'unavailable' }>['reason'];
const UNAVAILABLE: Record<Unavailable, TextKey> = {
  unsupported: 'speak.unavailable.unsupported',
  'not-allowed': 'speak.unavailable.not-allowed',
  network: 'speak.unavailable.network',
  'no-microphone': 'speak.unavailable.no-microphone',
  error: 'speak.unavailable.error',
};

/**
 * Hablar. Con micrófono: se toca, se habla y se comprueba lo que se entendió. Sin él (o si falla)
 * se puede escribir la frase, y siempre se puede omitir el ejercicio (AD-11).
 */
export function SpeakExercise({
  exercise,
  locked,
  onAnswer,
  onSubmit,
}: ExerciseProps<ExerciseOf<'speak'>>) {
  const { composition } = useServices();
  const { speech } = composition;
  const [unavailable, setUnavailable] = useState<Unavailable | null>(() =>
    speech.capabilities().canListen ? null : 'unsupported',
  );
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<string>(t('speak.prompt'));
  const [typed, setTyped] = useState('');
  const mounted = useRef(true);

  // Al salir de este ejercicio se corta cualquier voz o escucha en curso.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      speech.cancel();
    };
  }, [speech]);

  const toggleMic = async () => {
    if (locked) return;
    if (listening) {
      speech.cancel();
      return;
    }
    speech.cancel(); // que la voz de Nova o de la frase no se cuele en el micrófono
    setListening(true);
    setStatus(t('speak.listening'));
    const result = await speech.listen({
      onInterim: (text) => mounted.current && setStatus(t('speak.heard', { text })),
    });
    if (!mounted.current) return;
    setListening(false);
    if (result.kind === 'heard') {
      setStatus(t('speak.heard', { text: result.alternatives[0] ?? '' }));
      onAnswer({ type: 'speak', heard: result.alternatives });
    } else if (result.kind === 'silence') {
      setStatus(t('speak.silence'));
    } else {
      setUnavailable(result.reason);
      setStatus('');
    }
  };

  return (
    <>
      <p className={styles.prompt}>{t('speak.title')}</p>
      <div className={styles.phraseCard}>
        <div className={styles.phrase}>{exercise.en}</div>
        <div className={styles.translation}>{exercise.es}</div>
        <button
          type="button"
          className={styles.hear}
          onClick={() => void speech.speak(exercise.en)}
        >
          🔊 {t('speak.hear')}
        </button>
      </div>

      {unavailable === null ? (
        <>
          <button
            type="button"
            className={`${styles.mic} ${listening ? styles.listening : ''}`}
            aria-label={listening ? t('speak.mic.stop') : t('speak.mic')}
            aria-pressed={listening}
            disabled={locked}
            onClick={() => void toggleMic()}
          >
            <span aria-hidden="true">🎤</span>
          </button>
          <p className={styles.heard} aria-live="polite" data-testid="heard">
            {status}
          </p>
        </>
      ) : (
        <>
          <p className={styles.notice} role="note">
            {t(UNAVAILABLE[unavailable])}
          </p>
          <textarea
            className={`${styles.field} ${styles.typed}`}
            value={typed}
            disabled={locked}
            placeholder={t('speak.typed.placeholder')}
            aria-label={t('speak.typed.placeholder')}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => {
              setTyped(e.target.value);
              onAnswer(
                e.target.value.trim() ? { type: 'speak-typed', text: e.target.value } : null,
              );
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (typed.trim()) onSubmit();
              }
            }}
          />
        </>
      )}

      <button
        type="button"
        className={styles.skip}
        disabled={locked}
        onClick={() => onSubmit({ type: 'speak-skipped' })}
      >
        {t('speak.skip')}
      </button>
    </>
  );
}
