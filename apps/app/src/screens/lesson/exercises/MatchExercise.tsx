import { isCorrectPair, shuffle } from '@linguapop/domain';
import type { ExerciseOf } from '@linguapop/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../../composition/context';
import { t } from '../../../i18n';
import styles from './Exercise.module.css';
import type { ExerciseProps } from './types';

/** Cuánto se ve en rojo una pareja equivocada antes de soltarse (milisegundos). */
export const WRONG_FLASH_MS = 500;

/** Emparejar: se toca una palabra en español y su traducción; las parejas acertadas se apartan. */
export function MatchExercise({ exercise, locked, onAnswer }: ExerciseProps<ExerciseOf<'match'>>) {
  const { composition } = useServices();
  const { left, right } = useMemo(
    () => ({
      left: shuffle(
        exercise.pairs.map((p) => p.es),
        composition.random,
      ),
      right: shuffle(
        exercise.pairs.map((p) => p.en),
        composition.random,
      ),
    }),
    // Se mezcla una sola vez por ejercicio: el contenedor lo vuelve a montar con cada ejercicio nuevo.
    [exercise.id],
  );
  const [selLeft, setSelLeft] = useState<string | null>(null);
  const [selRight, setSelRight] = useState<string | null>(null);
  const [matched, setMatched] = useState<ReadonlySet<string>>(new Set());
  const [wrong, setWrong] = useState<{ es: string; en: string } | null>(null);
  const mistakes = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const tryPair = (es: string, en: string) => {
    setSelLeft(null);
    setSelRight(null);
    if (isCorrectPair(exercise, es, en)) {
      composition.sound.play('ok');
      const next = new Set(matched).add(es);
      setMatched(next);
      if (next.size === exercise.pairs.length)
        onAnswer({ type: 'match', mistakes: mistakes.current });
    } else {
      composition.sound.play('bad');
      mistakes.current += 1;
      setWrong({ es, en });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setWrong(null), WRONG_FLASH_MS);
    }
  };

  const pickLeft = (es: string) => {
    if (locked || wrong) return;
    composition.sound.play('click');
    if (selRight) tryPair(es, selRight);
    else setSelLeft(es);
  };
  const pickRight = (en: string) => {
    if (locked || wrong) return;
    composition.sound.play('click');
    void composition.speech.speak(en);
    if (selLeft) tryPair(selLeft, en);
    else setSelRight(en);
  };

  const stateOf = (isMatched: boolean, isSelected: boolean, isWrong: boolean) =>
    isMatched ? styles.matched : isWrong ? styles.bad : isSelected ? styles.selected : '';

  return (
    <>
      <p className={styles.prompt}>{t('match.title')}</p>
      <div className={styles.columns}>
        <div className={styles.column} aria-label={t('match.spanish')}>
          {left.map((es) => {
            const isMatched = matched.has(es);
            return (
              <button
                key={es}
                type="button"
                className={`${styles.pairButton} ${stateOf(isMatched, selLeft === es, wrong?.es === es)}`}
                data-state={
                  isMatched
                    ? 'matched'
                    : wrong?.es === es
                      ? 'wrong'
                      : selLeft === es
                        ? 'selected'
                        : 'idle'
                }
                aria-pressed={selLeft === es}
                disabled={locked || isMatched}
                onClick={() => pickLeft(es)}
              >
                {es}
              </button>
            );
          })}
        </div>
        <div className={styles.column} aria-label={t('match.english')}>
          {right.map((en) => {
            const es = exercise.pairs.find((p) => p.en === en)?.es ?? '';
            const isMatched = matched.has(es);
            return (
              <button
                key={en}
                type="button"
                className={`${styles.pairButton} ${stateOf(isMatched, selRight === en, wrong?.en === en)}`}
                data-state={
                  isMatched
                    ? 'matched'
                    : wrong?.en === en
                      ? 'wrong'
                      : selRight === en
                        ? 'selected'
                        : 'idle'
                }
                aria-pressed={selRight === en}
                disabled={locked || isMatched}
                onClick={() => pickRight(en)}
              >
                {en}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
