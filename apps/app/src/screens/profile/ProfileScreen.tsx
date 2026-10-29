import { dayKey, isUnitComplete, recentXp, type PendingEvent } from '@linguapop/domain';
import { useRef, useState, type FormEvent } from 'react';
import { useInstallAvailable, useProgress, useServices, useUi } from '../../composition/context';
import { t } from '../../i18n';
import { Fox } from '../../mascots';
import { useDark } from '../../shell/AppShell';
import { Modal } from '../../ui/Modal';
import { AccountCard } from './AccountCard';
import styles from './ProfileScreen.module.css';
import { buildExport, parseImport } from './progress-file';

const GOALS = [20, 50, 100] as const;
const DAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
type SettingsPayload = Extract<PendingEvent, { type: 'settings_changed@1' }>['payload'];
export const EXPORT_FILE = 'linguapop-progreso.json';

/** Descarga un texto como archivo desde el navegador. */
function saveFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={styles.switch}
      onClick={onToggle}
    />
  );
}

/** Pantalla Perfil: estadísticas, XP de la semana, logros, ajustes y copia del progreso. */
export function ProfileScreen() {
  const { composition, progress: store, ui } = useServices();
  const progress = useProgress((s) => s.progress);
  const sound = useUi((s) => s.sound);
  const subtitles = useUi((s) => s.subtitles);
  const dark = useDark();
  const canInstall = useInstallAvailable();
  const [notice, setNotice] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const { settings, stats } = progress;
  const pro = settings.plan === 'pro';
  const today = dayKey(composition.clock.now(), settings.timeZone);
  const days = recentXp(progress.xpByDay, today, 7);
  const max = Math.max(settings.dailyGoalXp, ...days.map((d) => d.xp), 10);
  const accuracy = stats.total ? Math.round((100 * stats.correct) / stats.total) : 0;
  const { units, achievements } = composition.course;
  const unitsDone = units.filter((u) => isUnitComplete(u, progress.lessonsDone)).length;
  const unlocked = achievements.filter((a) => progress.achievements[a.id]).length;
  const goalY = 130 - (100 * settings.dailyGoalXp) / max;

  /** Guarda un cambio de ajustes del estudiante como evento. */
  const change = (payload: SettingsPayload) =>
    store.getState().record([{ type: 'settings_changed@1', payload }]);

  async function rename(e: FormEvent) {
    e.preventDefault();
    const displayName = name.trim().slice(0, 40);
    if (!displayName) return;
    setRenaming(false);
    await change({ displayName });
  }

  async function onImport(files: FileList | null) {
    const chosen = files?.[0];
    if (!chosen) return;
    const events = parseImport(await chosen.text());
    if (!events) return setNotice(t('profile.import.invalid'));
    await store.getState().importEvents(events);
    setNotice(t('profile.import.done'));
  }

  async function reset() {
    setConfirmReset(false);
    await store.getState().reset();
    setNotice(t('profile.reset.done'));
  }

  return (
    <div>
      <h1 className={styles.srOnly}>{t('screen.profile.title')}</h1>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      <section className={`${styles.card} ${styles.head}`}>
        <Fox mood="happy" className={styles.fox} decorative />
        <h2 data-testid="profile-name">
          {settings.displayName} {pro && <span className={styles.pro}>{t('app.pro')}</span>}
        </h2>
        <button
          type="button"
          className={styles.btn}
          onClick={() => {
            setName(settings.displayName);
            setRenaming(true);
          }}
        >
          ✏️ {t('profile.rename')}
        </button>
      </section>

      <dl className={styles.grid} aria-label={t('profile.stats')}>
        <Stat
          label={t('profile.streak')}
          value={t('profile.days', { n: progress.streak.streak })}
          sub={t('profile.best', { n: progress.streak.best })}
        />
        <Stat label={t('profile.xp')} value={progress.xp} />
        <Stat label={t('profile.gems')} value={progress.gems} />
        <Stat label={t('profile.accuracy')} value={`${accuracy}%`} />
        <Stat label={t('profile.lessons')} value={stats.lessons} />
        <Stat
          label={t('profile.time')}
          value={t('profile.minutes', { n: Math.round((stats.seconds + stats.callSeconds) / 60) })}
        />
        <Stat label={t('profile.calls')} value={stats.calls} />
        <Stat label={t('profile.units')} value={`${unitsDone}/${units.length}`} />
      </dl>

      <section className={styles.card} aria-label={t('profile.chart')}>
        <b>{t('profile.chart')}</b>
        <svg
          viewBox="0 0 320 160"
          className={styles.chart}
          role="img"
          aria-label={t('profile.chart')}
        >
          <line
            x1="10"
            y1={goalY}
            x2="310"
            y2={goalY}
            stroke="#22b573"
            strokeDasharray="4 4"
            opacity=".7"
          />
          {days.map((d, i) => {
            const h = Math.max(3, (100 * d.xp) / max);
            const x = 16 + i * 43;
            return (
              <g key={d.day} data-testid={`bar-${d.day}`} data-xp={d.xp}>
                <rect
                  x={x}
                  y={130 - h}
                  width="30"
                  height={h}
                  rx="8"
                  fill={i === 6 ? '#ff7a1a' : '#ffb36b'}
                />
                <text
                  x={x + 15}
                  y={124 - h}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="800"
                  fill="currentColor"
                >
                  {d.xp}
                </text>
                <text
                  x={x + 15}
                  y="148"
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="800"
                  fill="currentColor"
                  opacity=".6"
                >
                  {DAY_LETTERS[d.weekday]}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      <section className={styles.card} aria-label={t('profile.achievements')}>
        <b>
          🏆 {t('profile.achievements')} ({unlocked}/{achievements.length})
        </b>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {achievements.map((a) => {
            const on = Boolean(progress.achievements[a.id]);
            return (
              <li
                key={a.id}
                className={`${styles.ach} ${on ? '' : styles.achOff}`}
                data-unlocked={on}
              >
                <span className={styles.achIcon} aria-hidden="true">
                  {a.icon}
                </span>
                <span className={styles.achText}>
                  <b>{a.name}</b>
                  <span className={styles.muted}>{a.description}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.card} aria-label={t('profile.settings')}>
        <b>⚙️ {t('profile.settings')}</b>
        <div className={styles.setrow}>
          {t('profile.dark')}
          <Switch
            on={dark}
            label={t('profile.dark')}
            onToggle={() => void ui.getState().setTheme(dark ? 'light' : 'dark')}
          />
        </div>
        <div className={styles.setrow}>
          {t('profile.sound')}
          <Switch
            on={sound}
            label={t('profile.sound')}
            onToggle={() => void ui.getState().setSound(!sound)}
          />
        </div>
        <div className={styles.setrow}>
          {t('profile.subtitles')}
          <Switch
            on={subtitles}
            label={t('profile.subtitles')}
            onToggle={() => void ui.getState().setSubtitles(!subtitles)}
          />
        </div>
        <div className={styles.setrow}>
          {t('profile.plan')}
          <Switch
            on={pro}
            label={t('profile.plan')}
            onToggle={() => void change({ plan: pro ? 'free' : 'pro' })}
          />
        </div>
        <div className={styles.setrow}>
          {t('profile.goal')}
          <span>
            {GOALS.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={settings.dailyGoalXp === g}
                className={`${styles.pill} ${settings.dailyGoalXp === g ? styles.pillOn : ''}`}
                onClick={() => void change({ dailyGoalXp: g })}
              >
                {g} XP
              </button>
            ))}
          </span>
        </div>
        <p className={styles.muted}>{t('profile.proIncludes')}</p>
        <div className={styles.row}>
          <button
            type="button"
            className={styles.btn}
            onClick={() => saveFile(EXPORT_FILE, buildExport(store.getState().events))}
          >
            ⬇️ {t('profile.export')}
          </button>
          <button type="button" className={styles.btn} onClick={() => file.current?.click()}>
            ⬆️ {t('profile.import')}
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            className={styles.hidden}
            data-testid="import-file"
            aria-label={t('profile.import.file')}
            onChange={(e) => {
              void onImport(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        <button type="button" className={styles.danger} onClick={() => setConfirmReset(true)}>
          {t('profile.reset')}
        </button>
      </section>

      <AccountCard />

      {canInstall && (
        <section className={styles.card} aria-label={t('profile.install.title')}>
          <div className={styles.row}>
            <span style={{ fontSize: 30 }} aria-hidden="true">
              📲
            </span>
            <div style={{ flex: 1 }}>
              <b>{t('profile.install.title')}</b>
              <div className={styles.muted}>{t('profile.install.text')}</div>
            </div>
            <button
              type="button"
              className={styles.btn}
              style={{ flex: 'none' }}
              onClick={() => void composition.install.prompt()}
            >
              {t('profile.install.button')}
            </button>
          </div>
        </section>
      )}

      {renaming && (
        <Modal title={t('profile.rename')} onClose={() => setRenaming(false)}>
          <form className={styles.sheet} onSubmit={(e) => void rename(e)}>
            <input
              value={name}
              maxLength={40}
              aria-label={t('profile.name')}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className={styles.btn} disabled={!name.trim()}>
              {t('profile.save')}
            </button>
          </form>
        </Modal>
      )}

      {confirmReset && (
        <Modal title={t('profile.reset.title')} onClose={() => setConfirmReset(false)}>
          <p className={styles.muted}>{t('profile.reset.text')}</p>
          <div className={styles.sheet}>
            <button type="button" className={styles.danger} onClick={() => void reset()}>
              {t('profile.reset.confirm')}
            </button>
            <button type="button" className={styles.btn} onClick={() => setConfirmReset(false)}>
              {t('practice.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {sub && <span className={styles.muted}>{sub}</span>}
    </div>
  );
}
