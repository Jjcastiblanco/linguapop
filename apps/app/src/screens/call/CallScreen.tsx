import {
  currentUnitId,
  isNovaUnlocked,
  type FluencyLabel,
  type CallState,
} from '@linguapop/domain';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useBlocker, useNavigate } from 'react-router';
import { useCall, useProgress, useServices, useUi } from '../../composition/context';
import { t, type TextKey } from '../../i18n';
import { Fox, Nova } from '../../mascots';
import { Modal } from '../../ui/Modal';
import styles from './CallScreen.module.css';

const LABELS: Record<FluencyLabel, TextKey> = {
  excellent: 'call.fluency.excellent',
  good: 'call.fluency.good',
  practice: 'call.fluency.practice',
  'no-data': 'call.fluency.nodata',
};

/** Segundos como `mm:ss`. */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

/** Pantalla de llamada con Nova: puertas (PRO y desbloqueo), tema, timbre, videollamada y resumen. */
export function CallScreen() {
  const { composition, progress: progressStore, call: callStore } = useServices();
  const progress = useProgress((s) => s.progress);
  const call = useCall((s) => s.call);
  const talking = useCall((s) => s.talking);
  const navigate = useNavigate();
  const { units, dialogues } = composition.course;

  const pro = progress.settings.plan === 'pro';
  const novaOpen = isNovaUnlocked(units, progress.lessonsDone);

  // Al salir de la pantalla se cuelga (si hacía falta, queda registrada) y se limpia todo.
  useEffect(
    () => () => {
      callStore.getState().hangup();
      callStore.getState().reset();
    },
    [callStore],
  );

  const inCall = call !== null && (call.phase === 'ringing' || call.phase === 'active');
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      inCall && currentLocation.pathname !== nextLocation.pathname,
  );
  // Atrás cuelga la llamada pero se queda para ver el resumen.
  useEffect(() => {
    if (blocker.state === 'blocked') {
      callStore.getState().hangup();
      blocker.reset();
    }
  }, [blocker, callStore]);

  if (!pro) {
    return (
      <div className={styles.screen}>
        <Modal
          title={t('pro.title', { feature: t('practice.call') })}
          onClose={() => navigate('/aprender')}
        >
          <p>{t('pro.text')}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() =>
                void progressStore
                  .getState()
                  .record([{ type: 'settings_changed@1', payload: { plan: 'pro' } }])
              }
            >
              {t('pro.activate')}
            </button>
            <button type="button" className={styles.ghost} onClick={() => navigate('/aprender')}>
              {t('pro.later')}
            </button>
          </div>
        </Modal>
      </div>
    );
  }
  if (!novaOpen) {
    return (
      <div className={styles.screen}>
        <Modal title={t('call.locked.title')} onClose={() => navigate('/aprender')}>
          <p>{t('call.locked.text', { unit: units[0]?.name ?? '' })}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => navigate('/aprender')}>
              {t('call.locked.ok')}
            </button>
          </div>
        </Modal>
      </div>
    );
  }

  const available = (() => {
    const max = Math.max(
      0,
      units.findIndex((u) => u.id === currentUnitId(units, progress.lessonsDone)),
    );
    return dialogues.filter((d) => units.findIndex((u) => u.id === d.unitId) <= max);
  })();

  if (!call || call.phase === 'cancelled') {
    return (
      <Setup
        topics={available}
        onCall={(id) => {
          const topic = dialogues.find((d) => d.id === id);
          if (topic) callStore.getState().start(topic);
        }}
        onCancel={() => navigate('/aprender')}
      />
    );
  }
  if (call.phase === 'ended' && call.summary && !talking) {
    return (
      <Summary
        summary={call.summary}
        onBack={() => navigate('/aprender')}
        onAgain={() => callStore.getState().reset()}
      />
    );
  }
  return <Room call={call} clockNow={composition.clock.now} />;
}

function Setup({
  topics,
  onCall,
  onCancel,
}: {
  topics: readonly { id: string; title: string; emoji: string }[];
  onCall: (id: string) => void;
  onCancel: () => void;
}) {
  const { composition } = useServices();
  const [selected, setSelected] = useState(topics[0]?.id ?? '');
  const caps = composition.speech.capabilities();
  const voice = caps.canSpeak && caps.canListen;
  return (
    <div className={styles.screen}>
      <div className={styles.setup}>
        <Nova expression="smirk" className={styles.novaBig} decorative />
        <h1>
          {t('call.setup.title')} <span className={styles.pro}>{t('app.pro')}</span>
        </h1>
        <p className={styles.muted}>{t('call.setup.topic')}</p>
        <div className={styles.topics}>
          {topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              className={styles.pill}
              aria-pressed={selected === topic.id}
              onClick={() => setSelected(topic.id)}
            >
              {topic.emoji} {topic.title}
            </button>
          ))}
        </div>
        <p className={styles.muted} data-testid="call-mode">
          {t(voice ? 'call.mode.voice' : 'call.mode.chat')}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            disabled={!selected}
            onClick={() => onCall(selected)}
          >
            📞 {t('call.setup.call')}
          </button>
          <button type="button" className={styles.ghost} onClick={onCancel}>
            {t('practice.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Room({ call, clockNow }: { call: CallState; clockNow: () => number }) {
  const { call: store, ui } = useServices();
  const progress = useProgress((s) => s.progress);
  const subtitles = useUi((s) => s.subtitles);
  const { expression, talking, listening, micOn, voiceIn, chat, subtitle, hint, log, micFailed } =
    useCall((s) => s);
  const [keyboard, setKeyboard] = useState(false);
  const [draft, setDraft] = useState('');
  const [now, setNow] = useState(clockNow);
  const logEnd = useRef<HTMLDivElement>(null);
  const ringing = call.phase === 'ringing';

  useEffect(() => {
    const id = setInterval(() => setNow(clockNow()), 500);
    return () => clearInterval(id);
  }, [clockNow]);
  useEffect(() => {
    logEnd.current?.scrollIntoView?.({ block: 'end' });
  }, [log.length]);

  const showForm = chat || keyboard || !voiceIn;
  const elapsed = ringing ? 0 : (now - call.startedAtMs) / 1000;

  function send(e: FormEvent) {
    e.preventDefault();
    store.getState().submitText(draft);
    setDraft('');
  }

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <span className={styles.recDot} aria-hidden="true" />
        <span>Nova</span>
        <span
          className={styles.timer}
          role="timer"
          aria-label={t('call.timer')}
          data-testid="call-timer"
        >
          {formatClock(elapsed)}
        </span>
      </div>
      <div className={styles.stage}>
        <Nova expression={expression} talking={talking} className={styles.nova} />
      </div>
      <div className={styles.pip}>
        <Fox mood="idle" width={44} decorative />
        <div>{progress.settings.displayName}</div>
      </div>

      {chat && (
        <div className={styles.chat} role="log" aria-label={t('call.chat')} data-testid="call-chat">
          {log.map((m, i) => (
            <div key={i} className={`${styles.msg} ${m.who === 'me' ? styles.msgMe : ''}`}>
              {m.text}
            </div>
          ))}
          <div ref={logEnd} />
        </div>
      )}
      <div className={styles.subs} aria-live="polite" data-testid="call-subs">
        {subtitles && !chat && (
          <>
            {subtitle.nova && <span>{subtitle.nova}</span>}
            {subtitle.me && <span>{t('call.me', { text: subtitle.me })}</span>}
          </>
        )}
      </div>
      {hint && (
        <div className={styles.hint} role="note" data-testid="call-hint">
          💡 {hint}
        </div>
      )}
      {micFailed && (
        <p className={styles.notice} role="status">
          {t('call.micFailed')}
        </p>
      )}

      <div className={styles.controls}>
        {showForm && (
          <form className={styles.form} onSubmit={send}>
            <input
              value={draft}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={t('call.type.placeholder')}
              aria-label={t('call.type.placeholder')}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit">{t('call.type.send')}</button>
          </form>
        )}
        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.cb}
            aria-pressed={subtitles}
            aria-label={t('call.cc')}
            onClick={() => void ui.getState().setSubtitles(!subtitles)}
          >
            CC
          </button>
          <button
            type="button"
            className={`${styles.cb} ${listening ? styles.listening : ''}`}
            aria-pressed={voiceIn && micOn}
            aria-label={t('call.mic')}
            disabled={!voiceIn}
            onClick={() => store.getState().toggleMic()}
          >
            {voiceIn && micOn ? '🎤' : '🔇'}
          </button>
          <button
            type="button"
            className={styles.cb}
            aria-pressed={showForm}
            aria-label={t('call.keyboard')}
            disabled={chat || !voiceIn}
            onClick={() => setKeyboard((k) => !k)}
          >
            ⌨️
          </button>
          <button
            type="button"
            className={`${styles.cb} ${styles.hang}`}
            aria-label={t('call.hangup')}
            onClick={() => store.getState().hangup()}
          >
            📞
          </button>
        </div>
      </div>

      {ringing && (
        <div className={styles.ringing} role="status">
          <div className={styles.ringAva}>
            <Nova expression="smirk" decorative />
          </div>
          {t('call.ringing')}
          <span className={styles.muted}>{t('call.connecting')}</span>
        </div>
      )}
    </div>
  );
}

function Summary({
  summary,
  onBack,
  onAgain,
}: {
  summary: NonNullable<CallState['summary']>;
  onBack: () => void;
  onAgain: () => void;
}) {
  return (
    <div className={styles.screen}>
      <div className={styles.summary}>
        <Nova
          expression={summary.fluency >= 60 ? 'happy' : 'smirk'}
          className={styles.novaBig}
          decorative
        />
        <h1>{t('call.ended')}</h1>
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>{t('result.xp')}</dt>
            <dd data-testid="call-xp">⚡{summary.xp}</dd>
          </div>
          <div className={styles.stat}>
            <dt>{t('call.duration')}</dt>
            <dd data-testid="call-duration">⏱️{formatClock(summary.durationSec)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>{t('call.fluency')}</dt>
            <dd data-testid="call-fluency">{summary.fluency}</dd>
          </div>
        </dl>
        <p data-testid="call-label">
          <b>{t('call.fluency.label', { label: t(LABELS[summary.label]) })}</b>
        </p>
        <div className={styles.list}>
          <b>✅ {t('call.phrases')}</b>
          {summary.phrases.length ? (
            summary.phrases.map((p, i) => (
              <div key={i} className={styles.phrase}>
                {p}
              </div>
            ))
          ) : (
            <p className={styles.muted}>{t('call.phrases.none')}</p>
          )}
        </div>
        <div className={styles.list}>
          <b>⚠️ {t('call.weak')}</b>
          {summary.weakWords.length ? (
            <>
              <ul data-testid="call-weak">
                {summary.weakWords.map((w) => (
                  <li key={w} className={styles.weak}>
                    {w}
                  </li>
                ))}
              </ul>
              <p className={styles.muted}>{t('call.weak.added')}</p>
            </>
          ) : (
            <p className={styles.muted}>{t('call.weak.none')}</p>
          )}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={onBack}>
            {t('lesson.nohearts.back')}
          </button>
          <button type="button" className={styles.ghost} onClick={onAgain}>
            {t('call.again')}
          </button>
        </div>
      </div>
    </div>
  );
}
