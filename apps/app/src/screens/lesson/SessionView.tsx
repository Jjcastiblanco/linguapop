import { currentExercise, lessonProgress, remainingSec, type Answer } from '@linguapop/domain';
import type { TeachCard, Unit } from '@linguapop/content';
import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router';
import { useLesson, useProgress, useServices } from '../../composition/context';
import { activatePro, buyItem } from '../shop';
import { t } from '../../i18n';
import { Fox } from '../../mascots';
import { Modal } from '../../ui/Modal';
import { FeedbackPanel } from './FeedbackPanel';
import { TeachIntro } from './TeachIntro';
import styles from './LessonScreen.module.css';
import { LessonResult, formatDuration } from './LessonResult';
import { ExerciseView } from './exercises/ExerciseView';

type Props = {
  /** Unidad de la lección; las sesiones de práctica sueltas no la tienen. */
  unit?: Unit;
  /** A dónde se vuelve al cerrar o terminar la sesión. */
  exitTo: string;
  /** Tarjetas de «Palabras nuevas» que se ven antes del primer ejercicio; sin ellas no hay fase. */
  teach?: readonly TeachCard[];
};

/**
 * Cuerpo de una sesión ya iniciada en el almacén: ejercicios uno a uno, feedback, cuenta atrás
 * (si la sesión tiene límite de tiempo), salida confirmada y pantalla final. Lo usan la lección
 * y los modos de práctica.
 */
export function SessionView({ unit, exitTo, teach = [] }: Props) {
  const services = useServices();
  const { composition, lesson: sessionStore, toast } = services;
  const progress = useProgress((s) => s.progress);
  const lesson = useLesson((s) => s.lesson);
  const failure = useLesson((s) => s.failure);
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Answer | null>(null);
  const [now, setNow] = useState(() => composition.clock.now());
  const leaving = useRef(false);
  const [introDone, setIntroDone] = useState(teach.length === 0);

  const timed = lesson?.config.timeLimitSec !== undefined;
  const intro = !introDone && lesson !== null && lesson.phase === 'answering';
  const running =
    lesson !== null && !intro && (lesson.phase === 'answering' || lesson.phase === 'feedback');

  // Con límite de tiempo, cada segundo se avanza el reloj y se deja que el motor decida si terminó.
  useEffect(() => {
    if (!timed || !running) return;
    const id = setInterval(() => {
      setNow(composition.clock.now());
      sessionStore.getState().tick();
    }, 1000);
    return () => clearInterval(id);
  }, [timed, running, composition, sessionStore]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      running && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );

  const leave = () => {
    leaving.current = true;
    sessionStore.getState().clear();
    navigate(exitTo, { replace: true });
  };

  /** Compra vidas y vuelve; sin gemas se avisa y se queda. */
  const recharge = async () => {
    const outcome = await buyItem(services, 'hearts');
    if (outcome === 'no-gems') return toast.getState().show(t('shop.nogems'));
    if (outcome === 'bought') toast.getState().show(t('shop.bought'));
    leave();
  };
  const goPro = async () => {
    await activatePro(services);
    toast.getState().show(t('pro.activated'));
    leave();
  };

  if (failure === 'no-hearts') {
    return (
      <div className={`${styles.screen}`}>
        <div className={`${styles.body} ${styles.center}`}>
          <Fox mood="sad" className={styles.centerFox} />
          <h2>{t('lesson.nohearts.title')}</h2>
          <p>{t('lesson.nohearts.text')}</p>
          <button
            type="button"
            className={`${styles.action} ${styles.actionBlue}`}
            onClick={() => void recharge()}
          >
            {t('lesson.nohearts.recharge')}
          </button>
          <button type="button" className={styles.action} onClick={() => void goPro()}>
            {t('lesson.nohearts.pro')}
          </button>
          <button type="button" className={styles.ghost} onClick={leave}>
            {t('lesson.nohearts.back')}
          </button>
        </div>
      </div>
    );
  }
  if (!lesson) return null;

  if (lesson.phase === 'finished' && lesson.summary) {
    return (
      <div className={styles.screen}>
        <LessonResult lesson={lesson} summary={lesson.summary} unit={unit} onContinue={leave} />
      </div>
    );
  }

  if (intro) {
    return (
      <TeachIntro
        cards={teach}
        onDone={() => setIntroDone(true)}
        onClose={() => navigate(exitTo)}
      />
    );
  }

  const exercise = currentExercise(lesson);
  if (!exercise) return null;
  const feedback = lesson.phase === 'feedback' ? lesson.feedback : null;
  const pro = progress.settings.plan === 'pro';
  const percent = Math.round(lessonProgress(lesson) * 100);
  const left = remainingSec(lesson, now);

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

  const check = (answer?: Answer) => {
    const toSend = answer ?? draft;
    if (lesson.phase === 'answering' && toSend) sessionStore.getState().submit(toSend);
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
          onClick={() => navigate(exitTo)}
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
        {left !== null && (
          <span className={styles.chip} role="timer" aria-label={t('session.time')}>
            <span aria-hidden="true">⏱</span>
            <span data-testid="session-time">{formatDuration(left)}</span>
          </span>
        )}
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
          onClick={feedback ? next : () => check()}
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
