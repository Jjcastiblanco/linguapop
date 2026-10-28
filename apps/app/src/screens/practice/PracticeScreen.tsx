import {
  PRICES,
  dayKey,
  isNovaUnlocked,
  isUnitComplete,
  monthKey,
  practiceConfig,
  type PracticeFailure,
  type PracticeKind,
} from '@linguapop/domain';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useProgress, useServices } from '../../composition/context';
import { t, type TextKey } from '../../i18n';
import { Modal } from '../../ui/Modal';
import { activatePro as switchToPro, buyItem, type BuyOutcome } from '../shop';
import styles from './PracticeScreen.module.css';

/** Ruta de la sesión de práctica ya iniciada en el almacén de lección. */
export const PRACTICE_SESSION_PATH = '/practicar/sesion';

const NOTICE: Partial<Record<PracticeFailure, TextKey>> = {
  'nothing-to-review': 'practice.review.empty',
  'no-hearts': 'practice.nohearts',
};

const BUY_NOTICE: Record<BuyOutcome, TextKey> = {
  bought: 'shop.bought',
  'no-gems': 'shop.nogems',
  'hearts-full': 'shop.heartsfull',
  'shield-ready': 'shop.shieldready',
};

/** Pantalla Practicar: modos de práctica (PRO), tienda de gemas, protector de racha y palabras a mejorar. */
export function PracticeScreen() {
  const services = useServices();
  const { composition, lesson } = services;
  const progress = useProgress((s) => s.progress);
  const navigate = useNavigate();
  const [notice, setNotice] = useState('');
  const [proFor, setProFor] = useState<TextKey | null>(null);
  const [picking, setPicking] = useState(false);
  const { units } = composition.course;

  // Al volver aquí no queda ninguna sesión anterior a medias.
  useEffect(() => {
    lesson.getState().clear();
  }, [lesson]);

  const today = dayKey(composition.clock.now(), progress.settings.timeZone);
  const pro = progress.settings.plan === 'pro';
  const reviewCount = progress.errors.length + Object.keys(progress.words).length;
  const novaOpen = isNovaUnlocked(units, progress.lessonsDone);
  const shieldUsed = progress.streak.shieldMonth === monthKey(today);
  const words = Object.keys(progress.words);

  function start(request: PracticeKind, feature: TextKey) {
    setNotice('');
    setPicking(false);
    const result = practiceConfig(request, { units, progress, random: composition.random }, today);
    if (!result.ok) {
      if (result.reason === 'pro-required') setProFor(feature);
      else setNotice(NOTICE[result.reason] ? t(NOTICE[result.reason]!) : '');
      return;
    }
    lesson.getState().start(result.config);
    navigate(PRACTICE_SESSION_PATH);
  }

  async function activatePro() {
    setProFor(null);
    await switchToPro(services);
    setNotice(t('pro.activated'));
  }

  async function buy(item: keyof typeof PRICES) {
    const outcome = await buyItem(services, item);
    setNotice(t(BUY_NOTICE[outcome]));
  }

  const shieldText = !pro ? 'shield.free' : shieldUsed ? 'shield.used' : 'shield.available';

  return (
    <div>
      <h1 className={styles.srOnly}>{t('screen.practice.title')}</h1>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      <button
        type="button"
        className={styles.pcard}
        onClick={() => start({ kind: 'review' }, 'practice.review')}
      >
        <span className={styles.em} aria-hidden="true">
          📝
        </span>
        <span className={styles.grow}>
          <b>
            {t('practice.review')} <span className={styles.pro}>{t('app.pro')}</span>
          </b>
          <small>
            {reviewCount === 0
              ? t('practice.review.clear')
              : t(reviewCount === 1 ? 'practice.review.pending.one' : 'practice.review.pending', {
                  n: reviewCount,
                })}
          </small>
        </span>
        <span aria-hidden="true">›</span>
      </button>

      <button
        type="button"
        className={styles.pcard}
        onClick={() => start({ kind: 'personalized' }, 'practice.personal')}
      >
        <span className={styles.em} aria-hidden="true">
          🧠
        </span>
        <span className={styles.grow}>
          <b>
            {t('practice.personal')} <span className={styles.pro}>{t('app.pro')}</span>
          </b>
          <small>{t('practice.personal.sub')}</small>
        </span>
        <span aria-hidden="true">›</span>
      </button>

      <button
        type="button"
        className={styles.pcard}
        onClick={() => start({ kind: 'timed' }, 'practice.timed')}
      >
        <span className={styles.em} aria-hidden="true">
          ⏱️
        </span>
        <span className={styles.grow}>
          <b>
            {t('practice.timed')} <span className={styles.pro}>{t('app.pro')}</span>
          </b>
          <small>{t('practice.timed.sub', { best: progress.stats.timedBest })}</small>
        </span>
        <span aria-hidden="true">›</span>
      </button>

      <button
        type="button"
        className={styles.pcard}
        onClick={() => (pro ? setPicking(true) : setProFor('practice.placement'))}
      >
        <span className={styles.em} aria-hidden="true">
          🏁
        </span>
        <span className={styles.grow}>
          <b>
            {t('practice.placement')} <span className={styles.pro}>{t('app.pro')}</span>
          </b>
          <small>{t('practice.placement.sub')}</small>
        </span>
        <span aria-hidden="true">›</span>
      </button>

      <button
        type="button"
        className={styles.pcard}
        disabled={!novaOpen}
        onClick={() => navigate('/llamada')}
      >
        <span className={styles.em} aria-hidden="true">
          📞
        </span>
        <span className={styles.grow}>
          <b>
            {t('practice.call')} <span className={styles.pro}>{t('app.pro')}</span>
          </b>
          <small>
            {novaOpen
              ? t('practice.call.sub')
              : `🔒 ${t('practice.call.locked', { unit: units[0]?.name ?? '' })}`}
          </small>
        </span>
        <span aria-hidden="true">›</span>
      </button>

      <section className={styles.card} aria-label={t('shop.title')}>
        <b>🛍️ {t('shop.title')}</b>
        <div className={styles.muted} style={{ margin: '4px 0 8px' }}>
          {t('shop.balance', { gems: progress.gems })}
        </div>
        <div className={styles.row}>
          <button type="button" className={styles.buy} onClick={() => buy('hearts')}>
            {t('shop.hearts')}
          </button>
          <button type="button" className={styles.buy} onClick={() => buy('streak_shield')}>
            {t('shop.shield')}
          </button>
        </div>
      </section>

      <section className={styles.card} aria-label={t('shield.title')}>
        <div className={styles.row}>
          <span style={{ fontSize: 30 }} aria-hidden="true">
            🛡️
          </span>
          <div className={styles.grow}>
            <b>
              {t('shield.title')} <span className={styles.pro}>{t('app.pro')}</span>
            </b>
            <div className={styles.muted} data-testid="shield-status">
              {t(shieldText)}
            </div>
          </div>
        </div>
      </section>

      {words.length > 0 && (
        <section className={styles.card} aria-label={t('practice.words')}>
          <b>🗣️ {t('practice.words')}</b>
          <div>
            {words.map((w) => (
              <button
                key={w}
                type="button"
                className={styles.pill}
                aria-label={t('practice.words.listen', { word: w })}
                onClick={() => void composition.speech.speak(w, { rate: 0.8 })}
              >
                🔊 {w}
              </button>
            ))}
          </div>
        </section>
      )}

      {proFor && (
        <Modal title={t('pro.title', { feature: t(proFor) })} onClose={() => setProFor(null)}>
          <p className={styles.muted}>{t('pro.text')}</p>
          <div className={styles.sheet}>
            <button type="button" className={styles.primary} onClick={() => void activatePro()}>
              {t('pro.activate')}
            </button>
            <button type="button" onClick={() => setProFor(null)}>
              {t('pro.later')}
            </button>
          </div>
        </Modal>
      )}

      {picking && (
        <Modal title={t('practice.placement')} onClose={() => setPicking(false)}>
          <p className={styles.muted}>{t('practice.placement.intro')}</p>
          <div className={styles.sheet}>
            {units.map((u) => {
              const done = isUnitComplete(u, progress.lessonsDone);
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={done}
                  onClick={() => start({ kind: 'placement', unitId: u.id }, 'practice.placement')}
                >
                  {u.emoji} {t('practice.placement.skip', { unit: u.name })}
                  {done ? ' ✅' : ''}
                </button>
              );
            })}
            <button type="button" onClick={() => setPicking(false)}>
              {t('practice.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
