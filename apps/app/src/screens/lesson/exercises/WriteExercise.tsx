import type { ExerciseOf } from '@linguapop/domain';
import { useState } from 'react';
import { t } from '../../../i18n';
import styles from './Exercise.module.css';
import type { ExerciseProps } from './types';

/** Escribir la traducción; Enter comprueba y Mayús+Enter hace un salto de línea. */
export function WriteExercise({
  exercise,
  locked,
  onAnswer,
  onSubmit,
}: ExerciseProps<ExerciseOf<'write'>>) {
  const [text, setText] = useState('');
  return (
    <>
      <p className={styles.prompt}>{exercise.es}</p>
      <textarea
        className={styles.field}
        value={text}
        disabled={locked}
        placeholder={t('lesson.write.placeholder')}
        aria-label={t('lesson.hint.write')}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus
        onChange={(e) => {
          setText(e.target.value);
          onAnswer(e.target.value.trim() ? { type: 'write', text: e.target.value } : null);
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
