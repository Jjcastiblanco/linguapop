import {
  dayKey,
  leagueTable,
  localHour,
  type LeagueTier,
  type LeagueZone,
} from '@linguapop/domain';
import { Fragment } from 'react';
import { useProgress, useServices } from '../../composition/context';
import { t, type TextKey } from '../../i18n';
import styles from './LeaguesScreen.module.css';

const TIERS: Record<LeagueTier, { medal: string; name: TextKey }> = {
  bronze: { medal: '🥉', name: 'league.tier.bronze' },
  silver: { medal: '🥈', name: 'league.tier.silver' },
  gold: { medal: '🥇', name: 'league.tier.gold' },
};

const ZONES: Record<LeagueZone, { label: TextKey; style: string }> = {
  promotion: { label: 'league.zone.up', style: styles.up! },
  safe: { label: 'league.zone.safe', style: '' },
  demotion: { label: 'league.zone.down', style: styles.down! },
};

/** Pantalla Ligas: tabla semanal simulada con bots, el puesto del estudiante y las zonas de ascenso y descenso. */
export function LeaguesScreen() {
  const { composition } = useServices();
  const progress = useProgress((s) => s.progress);
  const now = composition.clock.now();
  const { timeZone } = progress.settings;
  const league = leagueTable({
    day: dayKey(now, timeZone),
    hour: localHour(now, timeZone),
    xpByDay: progress.xpByDay,
    totalXp: progress.xp,
    playerName: progress.settings.displayName,
  });
  const tier = TIERS[league.tier];

  return (
    <div>
      <h1 className={styles.srOnly}>{t('screen.leagues.title')}</h1>
      <section className={`${styles.card} ${styles.head}`}>
        <div className={styles.medal} aria-hidden="true">
          {tier.medal}
        </div>
        <h2 data-testid="league-tier">{t('league.title', { tier: t(tier.name) })}</h2>
        <div className={styles.muted} data-testid="league-days">
          {t(league.daysLeft === 1 ? 'league.days.one' : 'league.days', { n: league.daysLeft })}
        </div>
      </section>

      <ol className={`${styles.card} ${styles.table}`} aria-label={t('league.table')}>
        {league.rows.map((row, i) => {
          const zone = ZONES[row.zone];
          const first = i === 0 || league.rows[i - 1]!.zone !== row.zone;
          return (
            <Fragment key={row.rank}>
              {first && (
                <li
                  key={`z-${row.zone}`}
                  className={`${styles.zone} ${zone.style}`}
                  aria-hidden="true"
                >
                  {t(zone.label)}
                </li>
              )}
              <li
                className={`${styles.row} ${row.me ? styles.me : ''}`}
                data-testid={`league-row-${row.rank}`}
                data-me={row.me}
                data-zone={row.zone}
              >
                <span className={styles.rank}>{row.rank}</span>
                <span className={styles.avatar} aria-hidden="true">
                  {row.me ? '🦊' : row.face}
                </span>
                <span className={styles.name}>
                  {row.me ? t('league.me', { name: row.name }) : row.name}
                </span>
                <span>{t('league.xp', { xp: row.xp })}</span>
              </li>
            </Fragment>
          );
        })}
      </ol>
      <p className={`${styles.muted} ${styles.note}`}>{t('league.simulated')}</p>
    </div>
  );
}
