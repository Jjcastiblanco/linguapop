import { evaluatedTerms, normalizeTerm, type Exercise, type TeachCard } from '@linguapop/content';
import { useServices } from '../../composition/context';
import { t } from '../../i18n';
import { Modal } from '../../ui/Modal';
import card from './HelpSheet.module.css';

type Props = {
  /** Lo que la lección y las anteriores ya enseñaron. */
  cards: readonly TeachCard[];
  /** El ejercicio en curso: lo que evalúa no se muestra, para no dar la respuesta. */
  exercise: Exercise;
  onClose: () => void;
};

/**
 * Ayuda «¿Qué significa?» (9.4): las palabras y frases ya enseñadas con su significado y su audio,
 * para consultarlas ante la duda. Es solo consulta: no cuesta vidas ni XP, no toca el motor de
 * lección y deja fuera lo que el ejercicio en curso evalúa, para no revelar su respuesta.
 */
export function HelpSheet({ cards, exercise, onClose }: Props) {
  const { composition } = useServices();
  const asked = new Set(evaluatedTerms(exercise).map(normalizeTerm));
  const shown = cards.filter((c) => !asked.has(normalizeTerm(c.en)));
  const canSpeak = composition.speech.capabilities().canSpeak;

  return (
    <Modal title={t('help.title')} onClose={onClose}>
      {shown.length === 0 ? (
        <p>{t('help.empty')}</p>
      ) : (
        <ul className={card.list}>
          {shown.map((c) => (
            <li key={c.en} className={card.item}>
              <span className={card.emoji} aria-hidden="true">
                {c.emoji ?? ''}
              </span>
              <span className={card.words}>
                <b lang="en">{c.en}</b>
                <span>{c.es}</span>
              </span>
              {canSpeak && (
                <button
                  type="button"
                  className={card.speaker}
                  aria-label={t('help.listen', { word: c.en })}
                  onClick={() => void composition.speech.speak(c.en, { rate: 1 })}
                >
                  <span aria-hidden="true">🔊</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={card.close} onClick={onClose}>
        {t('help.close')}
      </button>
    </Modal>
  );
}
