import { shuffle } from '@linguapop/domain';
import type { ExerciseOf } from '@linguapop/domain';
import { useMemo, useState } from 'react';
import { useServices } from '../../../composition/context';
import styles from './Exercise.module.css';
import type { ExerciseProps } from './types';

/** Elegir la traducción: las opciones se mezclan una vez por ejercicio y se comparan por su posición original. */
export function McExercise({ exercise, locked, onAnswer }: ExerciseProps<ExerciseOf<'mc'>>) {
  const { composition } = useServices();
  const options = useMemo(
    () =>
      shuffle(
        exercise.options.map((o, index) => ({ ...o, index })),
        composition.random,
      ),
    // Se mezcla una sola vez por ejercicio: el contenedor lo vuelve a montar con cada ejercicio nuevo.
    [exercise.id],
  );
  const [selected, setSelected] = useState<number | null>(null);
  const saysEnglish = exercise.prompt.includes('Cómo se dice');

  const choose = (index: number, text: string) => {
    if (locked) return;
    setSelected(index);
    onAnswer({ type: 'mc', optionIndex: index });
    composition.sound.play('click');
    if (saysEnglish) void composition.speech.speak(text);
  };

  return (
    <>
      <p className={styles.prompt}>{exercise.prompt}</p>
      <div className={styles.options}>
        {options.map((o) => {
          const state = !locked
            ? o.index === selected
              ? styles.selected
              : ''
            : o.index === exercise.answerIndex
              ? styles.good
              : o.index === selected
                ? styles.bad
                : '';
          return (
            <button
              key={o.index}
              type="button"
              className={`${styles.option} ${state}`}
              aria-pressed={o.index === selected}
              disabled={locked}
              onClick={() => choose(o.index, o.text)}
            >
              <span className={styles.emoji} aria-hidden="true">
                {o.emoji}
              </span>
              {o.text}
            </button>
          );
        })}
      </div>
    </>
  );
}
