import {
  dayKey,
  leagueTable,
  leagueTier,
  leagueZone,
  localHour,
  type LeagueStanding,
  type LeagueTier,
  type LeagueZone,
} from '@linguapop/domain';
import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAccount, useProgress, useServices } from '../../composition/context';
import { pendingXp } from '../../stores';
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

/** La tabla real: cargando, lista o sin poder obtenerla (se cae a la simulada). */
type Real = { kind: 'loading' } | { kind: 'ready'; rows: LeagueStanding[] } | { kind: 'offline' };

/** Cuánto se espera al servidor antes de quedarse con la liga simulada. */
const OPEN_TIMEOUT_MS = 10_000;

/** Tras un aviso de la liga se espera este rato por si llegan más y se vuelve a leer una sola vez. */
export const REFRESH_DELAY_MS = 1_500;
/** Con avisos sin pausa la espera no se alarga más que esto: la tabla no se queda sin actualizar. */
export const REFRESH_MAX_WAIT_MS = 5_000;

/**
 * Pantalla Ligas (7.4). Con sesión muestra la tabla semanal que calcula el servidor, con los bots
 * marcados; como invitado, un aviso para iniciar sesión sobre la tabla simulada; y si el servidor no
 * responde, la tabla simulada. El cliente no calcula semana ni puestos de la tabla real.
 */
export function LeaguesScreen() {
  const { composition } = useServices();
  const account = useAccount();
  const progress = useProgress((s) => s.progress);
  const { leagueRemote, auth } = composition;
  const online = account !== null && leagueRemote.available();
  // La respuesta lleva la cuenta a la que pertenece: la tabla de otra cuenta nunca se pinta.
  const [answer, setAnswer] = useState<{ accountId: string; real: Real } | null>(null);

  const accountId = account?.id ?? null;
  const real: Real = answer && answer.accountId === accountId ? answer.real : { kind: 'loading' };
  useEffect(() => {
    if (!online || accountId === null) return;
    let current = true;
    const settle = (value: Real) => {
      if (!current) return;
      clearTimeout(timer);
      setAnswer({ accountId, real: value });
    };
    const timer = setTimeout(() => settle({ kind: 'offline' }), OPEN_TIMEOUT_MS);
    leagueRemote.open().then(
      // Sin la propia fila la tabla no es de esta persona: se trata como sin respuesta.
      (rows) => settle(rows.some((r) => r.isMe) ? { kind: 'ready', rows } : { kind: 'offline' }),
      () => settle({ kind: 'offline' }),
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [online, accountId, leagueRemote]);

  // Con la tabla a la vista se escucha la cohorte: cada aviso (sin datos) lleva a leer la vista otra vez.
  const showing = online && real.kind === 'ready';
  useEffect(() => {
    if (!showing || accountId === null) return;
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstPing: number | undefined;
    let latest = 0;
    const read = () => {
      firstPing = undefined;
      // Una lectura lenta no pisa a una más nueva.
      const mine = ++latest;
      leagueRemote.refresh().then(
        async (rows) => {
          // Una lectura sin la propia fila no es de esta persona: se queda la tabla que ya se ve.
          if (!current || mine !== latest || !rows.some((r) => r.isMe)) return;
          // Lo pendiente se vuelve a medir justo después de leer el servidor: lo que ya llegó a él
          // deja de contarse aparte.
          const xp = await pendingXp(composition).catch(() => 0);
          if (!current || mine !== latest) return;
          setPending(xp);
          setAnswer({ accountId, real: { kind: 'ready', rows } });
        },
        () => undefined,
      );
    };
    const stop = leagueRemote.watch(() => {
      clearTimeout(timer);
      const now = Date.now();
      firstPing ??= now;
      const wait = Math.max(0, Math.min(REFRESH_DELAY_MS, firstPing + REFRESH_MAX_WAIT_MS - now));
      timer = setTimeout(read, wait);
    });
    return () => {
      current = false;
      clearTimeout(timer);
      stop();
    };
  }, [showing, accountId, leagueRemote, composition]);

  // XP propio que el servidor aún no tiene: se suma a la fila propia y desaparece al sincronizar.
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!online) return;
    let current = true;
    pendingXp(composition).then(
      (xp) => current && setPending(xp),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [online, composition, progress]);

  const tier = TIERS[leagueTier(progress.xp)];
  const head = (days: string | null) => (
    <section className={`${styles.card} ${styles.head}`}>
      <div className={styles.medal} aria-hidden="true">
        {tier.medal}
      </div>
      <h2 data-testid="league-tier">{t('league.title', { tier: t(tier.name) })}</h2>
      {days && (
        <div className={styles.muted} data-testid="league-days">
          {days}
        </div>
      )}
    </section>
  );

  if (online && real.kind === 'loading') {
    return (
      <div>
        <h1 className={styles.srOnly}>{t('screen.leagues.title')}</h1>
        {head(null)}
        <p className={`${styles.muted} ${styles.note}`} role="status">
          {t('league.loading')}
        </p>
      </div>
    );
  }

  if (online && real.kind === 'ready') {
    return (
      <div>
        <h1 className={styles.srOnly}>{t('screen.leagues.title')}</h1>
        {head(t('league.week'))}
        <ol className={`${styles.card} ${styles.table}`} aria-label={t('league.table')}>
          {real.rows.map((row, i) => {
            const zone = leagueZone(row.rank);
            const first = i === 0 || leagueZone(real.rows[i - 1]!.rank) !== zone;
            return (
              <Fragment key={i}>
                {first && (
                  <li className={`${styles.zone} ${ZONES[zone].style}`} aria-hidden="true">
                    {t(ZONES[zone].label)}
                  </li>
                )}
                <li
                  className={`${styles.row} ${row.isMe ? styles.me : ''}`}
                  data-testid={`league-row-${i + 1}`}
                  data-me={row.isMe}
                  data-bot={row.isBot}
                  data-zone={zone}
                >
                  <span className={styles.rank}>{row.rank}</span>
                  <span className={styles.avatar} aria-hidden="true">
                    {row.isMe ? '🦊' : row.isBot ? '🤖' : '🙂'}
                  </span>
                  <span className={styles.name}>
                    {row.isMe ? t('league.me', { name: row.name }) : row.name}
                    {row.isBot && <span className={styles.bot}>{t('league.bot')}</span>}
                  </span>
                  <span>{t('league.xp', { xp: row.xp + (row.isMe ? pending : 0) })}</span>
                </li>
              </Fragment>
            );
          })}
        </ol>
        <p className={`${styles.muted} ${styles.note}`}>{t('league.real')}</p>
      </div>
    );
  }

  return (
    <Simulated
      head={head}
      notice={
        online ? (
          <p className={`${styles.muted} ${styles.note}`} role="status">
            {t('league.offline')}
          </p>
        ) : null
      }
      above={
        account === null && auth.available() ? (
          <section className={styles.card} data-testid="league-signin">
            <p className={styles.signinText}>{t('league.signin')}</p>
            <Link className={styles.signinLink} to="/perfil">
              {t('league.signin.action')}
            </Link>
          </section>
        ) : null
      }
    />
  );
}

/** La tabla simulada con bots de siempre: el respaldo cuando no hay tabla real. */
function Simulated({
  head,
  above,
  notice,
}: {
  head: (days: string | null) => React.ReactNode;
  above: React.ReactNode;
  /** Aviso de que la tabla no es real: va entre la cabecera y la lista para que se vea sin bajar. */
  notice: React.ReactNode;
}) {
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

  return (
    <div>
      <h1 className={styles.srOnly}>{t('screen.leagues.title')}</h1>
      {above}
      {head(t(league.daysLeft === 1 ? 'league.days.one' : 'league.days', { n: league.daysLeft }))}
      {notice}

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
