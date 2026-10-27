import { dayKey, visibleStreak, type LessonState, type LessonSummary } from '@linguapop/domain';
import type { Unit } from '@linguapop/content';
import { useProgress, useServices } from '../../composition/context';
import { t } from '../../i18n';
import { Fox } from '../../mascots';
import { Confetti } from '../../ui/Confetti';
import styles from './LessonResult.module.css';

type Props = {
  lesson: LessonState;
  summary: LessonSummary;
  unit: Unit;
  onContinue: () => void;
};

/** Minutos y segundos con dos dígitos en los segundos: `1:05`. */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Pantalla final de lección: premio, precisión, tiempo, racha y, si toca, la unidad completada. */
export function LessonResult({ lesson, summary, unit, onContinue }: Props) {
  const { composition } = useServices();
  const progress = useProgress((s) => s.progress);
  const { score, outOfHearts } = summary;
  const { config } = lesson;

  const today = dayKey(composition.clock.now(), progress.settings.timeZone);
  const streak = visibleStreak(progress.streak, today, progress.settings.plan);
  const lastOfUnit = unit.lessons.at(-1)?.id === config.lessonId;
  const unitCompleted = !outOfHearts && !config.isReplay && lastOfUnit;

  return (
    <div className={`${styles.body}`}>
      {!outOfHearts && <Confetti count={unitCompleted || score.perfect ? 90 : 50} />}
      <Fox mood={outOfHearts ? 'sad' : 'celebrate'} className={styles.fox} />
      <h2>{outOfHearts ? t('lesson.finished.nohearts') : t('lesson.finished.title')}</h2>
      {outOfHearts && <p className={styles.note}>{t('lesson.nohearts.text')}</p>}
      {score.perfect && <p className={styles.badge}>{t('result.perfect')}</p>}
      {unitCompleted && (
        <p className={styles.unit} role="status">
          {t('result.unit', { unit: unit.name })}
        </p>
      )}

      <dl className={styles.stats}>
        <div className={`${styles.stat} ${styles.xp}`}>
          <dt>{t('result.xp')}</dt>
          <dd data-testid="result-xp">⚡ {score.xp}</dd>
        </div>
        <div className={`${styles.stat} ${styles.acc}`}>
          <dt>{t('result.accuracy')}</dt>
          <dd data-testid="result-accuracy">🎯 {score.accuracy}%</dd>
        </div>
        <div className={`${styles.stat} ${styles.time}`}>
          <dt>{t('result.time')}</dt>
          <dd data-testid="result-time">⏱ {formatDuration(summary.durationSec)}</dd>
        </div>
        <div className={`${styles.stat} ${styles.gems}`}>
          <dt>{t('result.gems')}</dt>
          <dd data-testid="result-gems">💎 {score.gems}</dd>
        </div>
      </dl>

      {config.isReplay && !outOfHearts && <p className={styles.note}>{t('result.replay')}</p>}
      {streak > 0 && (
        <p className={styles.streak} data-testid="result-streak">
          🔥 {t(streak === 1 ? 'result.streak.one' : 'result.streak', { n: streak })}
        </p>
      )}

      <button type="button" className={styles.action} onClick={onContinue}>
        {t('lesson.finished.continue')}
      </button>
    </div>
  );
}
