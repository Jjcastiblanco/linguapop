import { shuffle } from '@linguapop/domain';
import type { ExerciseOf } from '@linguapop/domain';
import { useMemo, useState } from 'react';
import { useServices } from '../../../composition/context';
import { t } from '../../../i18n';
import styles from './Exercise.module.css';
import type { ExerciseProps } from './types';

type Token = { word: string; id: number };

/** Ordenar palabras: las fichas se mezclan una vez y se tocan para colocarlas o quitarlas. */
export function OrderExercise({ exercise, locked, onAnswer }: ExerciseProps<ExerciseOf<'order'>>) {
  const { composition } = useServices();
  const bank = useMemo<Token[]>(
    () =>
      shuffle([...exercise.en.split(' '), ...exercise.extraWords], composition.random).map(
        (word, id) => ({ word, id }),
      ),
    // Se mezcla una sola vez por ejercicio: el contenedor lo vuelve a montar con cada ejercicio nuevo.
    [exercise.id],
  );
  const [placed, setPlaced] = useState<Token[]>([]);

  const update = (next: Token[]) => {
    setPlaced(next);
    onAnswer(next.length > 0 ? { type: 'order', words: next.map((x) => x.word) } : null);
  };
  const place = (token: Token) => {
    if (locked) return;
    composition.sound.play('click');
    void composition.speech.speak(token.word, { rate: 1.1 });
    update([...placed, token]);
  };
  const remove = (token: Token) => {
    if (locked) return;
    composition.sound.play('click');
    update(placed.filter((x) => x.id !== token.id));
  };

  return (
    <>
      <p className={styles.prompt}>{exercise.es}</p>
      <div
        className={styles.answerArea}
        aria-label={t('lesson.answer.area')}
        data-testid="answer-area"
      >
        {placed.map((token) => (
          <button
            key={token.id}
            type="button"
            className={styles.token}
            disabled={locked}
            onClick={() => remove(token)}
          >
            {token.word}
          </button>
        ))}
      </div>
      <div className={styles.bank} aria-label={t('lesson.word.bank')} data-testid="word-bank">
        {bank.map((token) => {
          const used = placed.some((x) => x.id === token.id);
          return (
            <button
              key={token.id}
              type="button"
              className={`${styles.token} ${used ? styles.tokenUsed : ''}`}
              disabled={locked || used}
              onClick={() => place(token)}
            >
              {token.word}
            </button>
          );
        })}
      </div>
    </>
  );
}
