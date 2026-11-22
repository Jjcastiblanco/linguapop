import { readingExercises, type ReadingText } from '@linguapop/content';
import { unlockedReadings } from '@linguapop/domain';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useProgress, useServices } from '../../composition/context';
import { t } from '../../i18n';
import styles from './ReadingScreen.module.css';

const KIND_EMOJI = { message: '💬', sign: '🪧', dialogue: '🗣️' } as const;

/**
 * «Lectura corta»: textos de 3 a 6 líneas con palabras ya enseñadas y preguntas de comprensión.
 * No usa vidas ni XP; cada respuesta se registra y entra al calendario de repaso.
 */
export function ReadingScreen() {
  const { composition, progress } = useServices();
  const state = useProgress((s) => s.progress);
  const navigate = useNavigate();
  const [open, setOpen] = useState<ReadingText | null>(null);

  const texts = unlockedReadings({
    units: composition.course.units,
    progress: state,
    random: composition.random,
    readings: composition.readings,
  });

  const exit = () => navigate('/practicar', { replace: true });

  if (open) {
    return (
      <ReadingSession
        key={open.id}
        text={open}
        onBack={() => setOpen(null)}
        record={(exerciseId, correct) =>
          void progress.getState().record([
            {
              type: 'exercise_answered@1',
              payload: { exerciseId, correct, mode: 'practice' },
            },
          ])
        }
      />
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.close}
          aria-label={t('practice.read.close')}
          onClick={exit}
        >
          ✕
        </button>
        <span className={styles.count}>{t('practice.read')}</span>
      </div>
      <div className={styles.body}>
        <h1>{t('practice.read.title')}</h1>
        {texts.length === 0 ? (
          <p className={styles.notice} data-testid="read-empty">
            {t('practice.read.locked')}
          </p>
        ) : (
          texts.map((text) => {
            const done = readingExercises(text).every((e) => state.reviews[e.id] !== undefined);
            return (
              <button
                key={text.id}
                type="button"
                className={styles.card}
                data-testid={`read-${text.id}`}
                onClick={() => setOpen(text)}
              >
                <span aria-hidden="true">{KIND_EMOJI[text.kind]}</span>
                <span className={styles.grow}>{text.title}</span>
                {done && <span className={styles.done}>{t('practice.read.done')}</span>}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function ReadingSession({
  text,
  onBack,
  record,
}: {
  text: ReadingText;
  onBack: () => void;
  record: (exerciseId: string, correct: boolean) => void;
}) {
  const questions = readingExercises(text);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [hits, setHits] = useState(0);

  const question = text.questions[index];
  const finished = index >= text.questions.length;

  function answer(optionIndex: number) {
    if (!question || picked !== null) return;
    const correct = optionIndex === question.answerIndex;
    setPicked(optionIndex);
    if (correct) setHits((n) => n + 1);
    record(questions[index]!.id, correct);
  }

  function next() {
    setPicked(null);
    setIndex((i) => i + 1);
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.close}
          aria-label={t('practice.read.leave')}
          onClick={onBack}
        >
          ✕
        </button>
        <span className={styles.count}>
          {finished
            ? t('practice.read.done.title')
            : t('practice.read.progress', { n: index + 1, total: text.questions.length })}
        </span>
      </div>

      <div className={styles.body}>
        <h1>{text.title}</h1>
        <div className={styles.text} data-testid="read-text">
          {text.lines.map((line, i) => (
            <p
              key={i}
              className={!finished && question?.line === i ? styles.focus : undefined}
              aria-current={!finished && question?.line === i ? 'true' : undefined}
              data-testid={`read-line-${i}`}
            >
              {line}
            </p>
          ))}
        </div>

        {finished ? (
          <>
            <p className={styles.notice} data-testid="read-score">
              {t('practice.read.score', { n: hits, total: text.questions.length })}
            </p>
            <button type="button" className={styles.action} onClick={onBack}>
              {t('practice.read.back')}
            </button>
          </>
        ) : (
          question && (
            <>
              <p className={styles.prompt}>{question.prompt}</p>
              <div className={styles.options}>
                {question.options.map((option, i) => (
                  <button
                    key={option}
                    type="button"
                    className={`${styles.option} ${picked !== null && i === question.answerIndex ? styles.good : ''} ${picked === i && i !== question.answerIndex ? styles.miss : ''}`}
                    disabled={picked !== null}
                    onClick={() => answer(i)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {picked !== null && (
                <div className={styles.feedback} role="status">
                  {picked === question.answerIndex
                    ? t('practice.read.good')
                    : t('practice.read.miss', { answer: question.options[question.answerIndex]! })}
                </div>
              )}
              {picked !== null && (
                <button type="button" className={styles.action} onClick={next}>
                  {t(
                    index + 1 >= text.questions.length
                      ? 'practice.read.finish'
                      : 'practice.read.next',
                  )}
                </button>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
