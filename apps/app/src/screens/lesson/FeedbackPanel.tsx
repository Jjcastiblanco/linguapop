import type { AnswerResult } from '@linguapop/domain';
import type { Exercise } from '@linguapop/content';
import { useMemo } from 'react';
import { useServices } from '../../composition/context';
import { t, type TextKey } from '../../i18n';
import styles from './LessonScreen.module.css';

const PRAISES: readonly TextKey[] = [
  'feedback.ok.1',
  'feedback.ok.2',
  'feedback.ok.3',
  'feedback.ok.4',
  'feedback.ok.5',
];

/** Resultado de la comprobación: felicitación o respuesta correcta, con su aviso y la explicación del ejercicio. */
export function FeedbackPanel({ exercise, result }: { exercise: Exercise; result: AnswerResult }) {
  const { composition } = useServices();
  const praise = useMemo(
    () => t(PRAISES[Math.floor(composition.random.next() * PRAISES.length)] ?? 'feedback.ok.1'),
    [composition, exercise.id],
  );
  const notes = [
    result.typo ? t('feedback.typo', { answer: result.correctAnswer }) : null,
    result.translation ?? null,
    result.mistakes
      ? t(result.mistakes === 1 ? 'feedback.mistakes' : 'feedback.mistakes.many', {
          n: result.mistakes,
        })
      : null,
    result.pronunciation !== undefined
      ? t('feedback.pronunciation', { n: result.pronunciation })
      : null,
    result.heard ? t('feedback.heard', { text: result.heard }) : null,
  ].filter((n): n is string => n !== null);

  return (
    <div className={styles.feedback} role="status">
      {result.ok ? (
        <b>{result.skipped ? t('feedback.skipped') : praise}</b>
      ) : (
        <>
          <b>{t('feedback.wrong')}</b>
          <div>{result.correctAnswer}</div>
        </>
      )}
      {notes.map((n) => (
        <div key={n}>{n}</div>
      ))}
      {exercise.tip && <div className={styles.tip}>💡 {exercise.tip}</div>}
    </div>
  );
}
