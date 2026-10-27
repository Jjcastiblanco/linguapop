import type { ExerciseOf } from '@linguapop/domain';
import { useState } from 'react';
import { useServices } from '../../../composition/context';
import { t } from '../../../i18n';
import styles from './Exercise.module.css';
import type { ExerciseProps } from './types';

/** Velocidad del botón de escuchar despacio. */
export const SLOW_RATE = 0.55;

/**
 * Escuchar y escribir. La voz la pide el motor al entrar al ejercicio; aquí están los botones para
 * repetirla (normal o despacio). Si el dispositivo no puede hablar, la frase se muestra escrita.
 */
export function ListenExercise({
  exercise,
  locked,
  onAnswer,
  onSubmit,
}: ExerciseProps<ExerciseOf<'listen'>>) {
  const { composition } = useServices();
  const [noVoice, setNoVoice] = useState(() => !composition.speech.capabilities().canSpeak);
  const [text, setText] = useState('');

  const play = async (rate: number) => {
    const ok = await composition.speech.speak(exercise.en, { rate });
    // Un "no" suele ser solo una voz cortada por otra; si la voz se dio por averiada, se enseña la frase.
    if (!ok && !composition.speech.capabilities().canSpeak) setNoVoice(true);
  };

  return (
    <>
      <p className={styles.prompt}>{t('listen.title')}</p>
      <div className={styles.speakers}>
        <button
          type="button"
          className={styles.speaker}
          aria-label={t('listen.play')}
          disabled={locked}
          onClick={() => void play(1)}
        >
          <span aria-hidden="true">🔊</span>
        </button>
        <button
          type="button"
          className={`${styles.speaker} ${styles.speakerSlow}`}
          aria-label={t('listen.slow')}
          disabled={locked}
          onClick={() => void play(SLOW_RATE)}
        >
          <span aria-hidden="true">🐢</span>
        </button>
      </div>
      {noVoice && (
        <p className={styles.notice} role="note">
          {t('listen.novoice')} <b>{exercise.en}</b>
        </p>
      )}
      <textarea
        className={styles.field}
        value={text}
        disabled={locked}
        placeholder={t('listen.placeholder')}
        aria-label={t('listen.placeholder')}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          onAnswer(e.target.value.trim() ? { type: 'listen', text: e.target.value } : null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (text.trim()) onSubmit();
          }
        }}
      />
    </>
  );
}
