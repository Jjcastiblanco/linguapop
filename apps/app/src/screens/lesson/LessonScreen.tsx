import {
  currentExercise,
  currentHearts,
  dayKey,
  exercisesOfLesson,
  lessonProgress,
  type Answer,
} from '@linguapop/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useBlocker, useNavigate, useParams } from 'react-router';
import { useLesson, useProgress, useServices } from '../../composition/context';
import { t } from '../../i18n';
import { Fox } from '../../mascots';
import { Modal } from '../../ui/Modal';
import { FeedbackPanel } from './FeedbackPanel';
import styles from './LessonScreen.module.css';
import { ExerciseView } from './exercises/ExerciseView';

/** Pantalla de lección: ejercicios uno a uno sobre el motor del dominio, con feedback y salida confirmada. */
export function LessonScreen() {
  const { unitId, lessonId } = useParams();
  const { composition, lesson: sessionStore } = useServices();
  const progress = useProgress((s) => s.progress);
  const lesson = useLesson((s) => s.lesson);
  const failure = useLesson((s) => s.failure);
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Answer | null>(null);
  const leaving = useRef(false);

  const unit = composition.course.units.find((u) => u.id === unitId);
  const lessonDef = unit?.lessons.find((l) => l.id === lessonId);
  const exercises = useMemo(
    () => (unit && lessonDef ? exercisesOfLesson(unit, lessonDef) : []),
    [unit, lessonDef],
  );

  // Se empieza una sola vez al abrir la pantalla; al salir se cierra la sesión.
  useEffect(() => {
    if (!unit || !lessonDef || exercises.length === 0) return;
    const state = sessionStore.getState();
    const today = dayKey(composition.clock.now(), progress.settings.timeZone);
    const done = progress.lessonsDone[unit.id] ?? 0;
    state.start({
      mode: 'lesson',
      exercises,
      unitId: unit.id,
      lessonId: lessonDef.id,
      plan: progress.settings.plan,
      hearts: currentHearts(progress, today),
      isReplay: unit.lessons.indexOf(lessonDef) < done,
    });
    return () => sessionStore.getState().clear();
    // La sesión se arma con el progreso del momento de abrir; no debe reiniciarse al registrar eventos.
  }, [unit, lessonDef, exercises]);

  const active = lesson !== null && (lesson.phase === 'answering' || lesson.phase === 'feedback');
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );

  if (!unit || !lessonDef || exercises.length === 0) return <Navigate to="/aprender" replace />;

  const leave = () => {
    leaving.current = true;
    sessionStore.getState().clear();
    navigate('/aprender', { replace: true });
  };

  if (failure === 'no-hearts') {
    return (
      <div className={`${styles.screen}`}>
        <div className={`${styles.body} ${styles.center}`}>
          <Fox mood="sad" className={styles.centerFox} />
          <h2>{t('lesson.nohearts.title')}</h2>
          <p>{t('lesson.nohearts.text')}</p>
          <button type="button" className={styles.action} onClick={leave}>
            {t('lesson.nohearts.back')}
          </button>
        </div>
      </div>
    );
  }
  if (!lesson) return null;

  if (lesson.phase === 'finished') {
    const summary = lesson.summary;
    return (
      <div className={styles.screen}>
        <div className={`${styles.body} ${styles.center}`}>
          <Fox mood={summary?.outOfHearts ? 'sad' : 'celebrate'} className={styles.centerFox} />
          <h2>
            {summary?.outOfHearts ? t('lesson.finished.nohearts') : t('lesson.finished.title')}
          </h2>
          <p>⚡ {summary?.score.xp ?? 0} XP</p>
          <button type="button" className={styles.action} onClick={leave}>
            {t('lesson.finished.continue')}
          </button>
        </div>
      </div>
    );
  }

  const exercise = currentExercise(lesson);
  if (!exercise) return null;
  const feedback = lesson.phase === 'feedback' ? lesson.feedback : null;
  const pro = progress.settings.plan === 'pro';
  const percent = Math.round(lessonProgress(lesson) * 100);

  const hintKey =
    exercise.type === 'mc'
      ? 'lesson.hint.mc'
      : exercise.type === 'order'
        ? 'lesson.hint.order'
        : exercise.type === 'write'
          ? 'lesson.hint.write'
          : 'lesson.translate';
  const mood = feedback ? (feedback.result.ok ? 'happy' : 'sad') : 'idle';
  const bubble = feedback
    ? feedback.result.ok
      ? t('lesson.fox.ok')
      : lesson.outOfHearts
        ? t('lesson.fox.nohearts')
        : t('lesson.fox.bad')
    : t(hintKey);

  const check = () => {
    if (lesson.phase === 'answering' && draft) sessionStore.getState().submit(draft);
  };
  const next = () => {
    setDraft(null);
    sessionStore.getState().next();
  };

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.close}
          aria-label={t('lesson.close')}
          onClick={() => navigate('/aprender')}
        >
          ✕
        </button>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label={t('lesson.progress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <i style={{ width: `${percent}%` }} />
        </div>
        <span className={styles.chip} role="status" aria-label={t('lesson.hearts')}>
          <span aria-hidden="true">❤️</span>
          <span data-testid="lesson-hearts">{pro ? '∞' : lesson.hearts}</span>
        </span>
      </div>

      <div className={styles.body}>
        <div className={styles.foxLine}>
          <Fox mood={mood} className={styles.fox} decorative />
          <div className={styles.bubble} data-testid="bubble">
            {bubble}
          </div>
        </div>
        <ExerciseView
          key={`${exercise.id}:${lesson.index}`}
          exercise={exercise}
          locked={feedback !== null}
          result={feedback?.result ?? null}
          onAnswer={setDraft}
          onSubmit={check}
        />
      </div>

      <div
        className={`${styles.foot} ${feedback ? (feedback.result.ok ? styles.footGood : styles.footBad) : ''}`}
      >
        {feedback && <FeedbackPanel exercise={exercise} result={feedback.result} />}
        <button
          type="button"
          className={`${styles.action} ${feedback ? (feedback.result.ok ? styles.actionOk : styles.actionBad) : ''}`}
          disabled={!feedback && !draft}
          onClick={feedback ? next : check}
        >
          {feedback ? t('lesson.continue') : t('lesson.check')}
        </button>
      </div>

      {blocker.state === 'blocked' && (
        <Modal title={t('exit.title')} onClose={() => blocker.reset()}>
          <p>{t('exit.text')}</p>
          <div className={styles.sheetButtons}>
            <button
              type="button"
              className={`${styles.action} ${styles.actionOk}`}
              onClick={() => blocker.reset()}
            >
              {t('exit.stay')}
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => {
                leaving.current = true;
                sessionStore.getState().abort();
                blocker.proceed();
              }}
            >
              {t('exit.leave')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
