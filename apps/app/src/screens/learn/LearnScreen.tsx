import {
  dayKey,
  isNovaUnlocked,
  learningPath,
  rollChestReward,
  type PathUnit,
} from '@linguapop/domain';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { useProgress, useServices } from '../../composition/context';
import { t } from '../../i18n';
import { Nova } from '../../mascots';
import { Confetti } from '../../ui/Confetti';
import { Modal } from '../../ui/Modal';
import styles from './LearnScreen.module.css';

/** Desplazamientos horizontales del zigzag, que se repiten a lo largo de todo el camino. */
const ZIGZAG = [0, 46, 64, 46, 0, -46, -64, -46];

type Reward = { unitName: string; gems: number; xp: number };

/** Pantalla de inicio: meta diaria, llamada con Nova y el camino de unidades, lecciones y cofres. */
export function LearnScreen() {
  const { composition, progress: store } = useServices();
  const progress = useProgress((s) => s.progress);
  const navigate = useNavigate();
  const [reward, setReward] = useState<Reward | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const { units } = composition.course;

  const today = dayKey(composition.clock.now(), progress.settings.timeZone);
  const goal = progress.settings.dailyGoalXp;
  const xpToday = progress.xpByDay[today] ?? 0;
  const path = learningPath(units, {
    lessonsDone: progress.lessonsDone,
    chestsOpened: progress.chestsOpened,
  });
  const novaOpen = isNovaUnlocked(units, progress.lessonsDone);
  const pro = progress.settings.plan === 'pro';

  // Al abrir, la lección actual se centra en pantalla.
  useEffect(() => {
    root.current
      ?.querySelector('[data-status="current"]')
      ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, []);

  async function openChest(unit: PathUnit['unit']) {
    const { gems, xp } = rollChestReward(composition.random);
    await store
      .getState()
      .record([{ type: 'chest_opened@1', payload: { unitId: unit.id, gems, xp } }]);
    composition.sound.play('win');
    setReward({ unitName: unit.name, gems, xp });
  }

  let k = 0;
  return (
    <div ref={root}>
      <h1 className={styles.srOnly}>{t('screen.learn.title')}</h1>

      <section className={styles.goal} aria-label={t('learn.goal', { xp: xpToday, goal })}>
        <div className={styles.goalIcon} aria-hidden="true">
          {xpToday >= goal ? '🎁' : '🎯'}
        </div>
        <div className={styles.goalBody}>
          <b>{t('learn.goal', { xp: xpToday, goal })}</b>
          <div className={styles.bar}>
            <i style={{ width: `${Math.min(100, Math.round((100 * xpToday) / goal))}%` }} />
          </div>
        </div>
      </section>

      <button
        type="button"
        className={styles.nova}
        disabled={!novaOpen}
        onClick={() => navigate('/llamada')}
      >
        <span className={styles.novaAvatar}>
          <Nova expression="smirk" decorative />
        </span>
        <span className={styles.novaText}>
          <span className={styles.novaTitle}>
            {t('learn.nova.title')} {pro && <span className={styles.pro}>{t('app.pro')}</span>}
          </span>
          <span className={styles.novaSub}>
            {novaOpen
              ? t('learn.nova.subtitle')
              : `🔒 ${t('learn.nova.locked', { unit: units[0]?.name ?? '' })}`}
          </span>
        </span>
        <span aria-hidden="true" style={{ fontSize: 26 }}>
          {novaOpen ? '📞' : '🔒'}
        </span>
      </button>

      {!pro && (
        <div className={styles.ad}>
          📢 {t('learn.ad')}
          <br />
          <span className={styles.pro}>{t('app.pro')}</span> {t('learn.ad.pro')}
        </div>
      )}

      {path.map((entry, unitIndex) => {
        const { unit } = entry;
        return (
          <section
            key={unit.id}
            className={styles.unit}
            aria-label={unit.name}
            data-testid={`unit-${unit.id}`}
          >
            <div
              className={styles.banner}
              style={{ background: unit.color, boxShadow: `0 5px 0 ${unit.colorDark}` }}
            >
              <div className={styles.bannerEmoji} aria-hidden="true">
                {unit.emoji}
              </div>
              <div className={styles.bannerText}>
                <b>{t('learn.unit', { n: unitIndex + 1 })}</b>
                <h3>{unit.name}</h3>
                <small>{unit.description}</small>
              </div>
              {entry.complete ? (
                <span className={styles.unitDone} role="img" aria-label={t('learn.unit.done')}>
                  ✅
                </span>
              ) : (
                <Link className={styles.skip} to="/practicar" state={{ placement: unit.id }}>
                  🏁 {t('learn.skip')} <span className={styles.pro}>{t('app.pro')}</span>
                </Link>
              )}
            </div>

            <div className={styles.path}>
              {entry.lessons.map(({ lesson, status }, i) => {
                const style = nodeStyle(unit.color, unit.colorDark, ZIGZAG[k++ % ZIGZAG.length]!);
                const label =
                  status === 'done'
                    ? t('learn.lesson.done', { n: i + 1 })
                    : status === 'locked'
                      ? t('learn.lesson.locked', { n: i + 1 })
                      : t('learn.lesson', { n: i + 1 });
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    className={`${styles.node} ${status === 'current' ? styles.current : ''}`}
                    style={style}
                    data-testid={`node-${lesson.id}`}
                    data-status={status}
                    data-label={t('learn.start')}
                    aria-label={label}
                    disabled={status === 'locked'}
                    onClick={() => navigate(`/leccion/${unit.id}/${lesson.id}`)}
                  >
                    <span aria-hidden="true">{status === 'done' ? '✓' : unit.emoji}</span>
                    {status === 'done' && (
                      <span className={styles.star} aria-hidden="true">
                        ⭐
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                className={`${styles.node} ${entry.chest === 'ready' ? styles.current : ''}`}
                style={nodeStyle('#ffc83a', '#d99a00', ZIGZAG[k++ % ZIGZAG.length]!)}
                data-testid={`chest-${unit.id}`}
                data-status={entry.chest}
                data-label={t('learn.start')}
                aria-label={
                  entry.chest === 'ready'
                    ? t('learn.chest', { unit: unit.name })
                    : entry.chest === 'opened'
                      ? t('learn.chest.opened', { unit: unit.name })
                      : t('learn.chest.locked', { unit: unit.name })
                }
                disabled={entry.chest !== 'ready'}
                onClick={() => void openChest(unit)}
              >
                <span aria-hidden="true">{entry.chest === 'opened' ? '🎉' : '🎁'}</span>
              </button>
            </div>
          </section>
        );
      })}

      {reward && (
        <>
          <Confetti count={60} />
          <Modal
            title={t('learn.chest.title', { unit: reward.unitName })}
            onClose={() => setReward(null)}
          >
            <div className={styles.chestBig} aria-hidden="true">
              🎁
            </div>
            <p className={styles.rewardLine}>
              {t('learn.chest.reward', { gems: reward.gems, xp: reward.xp })}
            </p>
            <button type="button" className={styles.ok} onClick={() => setReward(null)}>
              {t('learn.chest.ok')}
            </button>
          </Modal>
        </>
      )}
    </div>
  );
}

function nodeStyle(color: string, dark: string, x: number): CSSProperties {
  return {
    background: color,
    boxShadow: `0 7px 0 ${dark}`,
    transform: `translateX(${x}px)`,
    ['--ring' as string]: color,
  };
}
