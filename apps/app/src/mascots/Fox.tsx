import { t } from '../i18n';
import styles from './Fox.module.css';

export type FoxMood = 'idle' | 'happy' | 'sad' | 'celebrate';

export type FoxProps = {
  mood?: FoxMood;
  /** Ancho del dibujo; por defecto ocupa todo el ancho de su contenedor. */
  width?: number | string;
  /** Si es solo adorno, se oculta a los lectores de pantalla. */
  decorative?: boolean;
  className?: string;
};

const DARK = '#3b1d0a';

/** El zorro de LinguaPop: reacciona con su estado de ánimo (reposo, feliz, triste o celebrando). */
export function Fox({ mood = 'idle', width, decorative = false, className }: FoxProps) {
  const joyful = mood === 'happy' || mood === 'celebrate';
  const moodClass = mood === 'idle' ? '' : styles[mood];

  return (
    <svg
      className={[styles.fox, moodClass, className].filter(Boolean).join(' ')}
      viewBox="0 0 200 200"
      data-mood={mood}
      {...(width !== undefined ? { style: { width } } : {})}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': t('mascot.fox') })}
    >
      <g className={styles.tail}>
        <path d="M146 176 C204 182 212 122 184 96 C184 128 164 142 140 146Z" fill="#ff8a1f" />
        <path d="M184 96 C196 112 200 128 196 144 C188 128 184 112 184 96Z" fill="#fff" />
      </g>
      <ellipse cx="100" cy="174" rx="52" ry="34" fill="#ff8a1f" />
      <ellipse cx="100" cy="180" rx="30" ry="26" fill="#fff4e6" />
      <path d="M38 80 L50 12 L94 52Z" fill="#ff8a1f" />
      <path d="M52 60 L56 32 L77 52Z" fill={DARK} />
      <path d="M162 80 L150 12 L106 52Z" fill="#ff8a1f" />
      <path d="M148 60 L144 32 L123 52Z" fill={DARK} />
      <ellipse cx="100" cy="104" rx="64" ry="52" fill="#ff8a1f" />
      <path
        d="M38 110 Q62 152 100 154 Q138 152 162 110 Q132 124 100 116 Q68 124 38 110Z"
        fill="#fff4e6"
      />
      <circle cx="60" cy="118" r="8" fill="#ff6b81" opacity=".35" />
      <circle cx="140" cy="118" r="8" fill="#ff6b81" opacity=".35" />

      {joyful ? (
        <g data-part="eyes-closed">
          <path
            d="M66 98 Q78 82 90 98"
            fill="none"
            stroke={DARK}
            strokeWidth="5.5"
            strokeLinecap="round"
          />
          <path
            d="M110 98 Q122 82 134 98"
            fill="none"
            stroke={DARK}
            strokeWidth="5.5"
            strokeLinecap="round"
          />
        </g>
      ) : (
        <g className={styles.blink} data-part="eyes-open">
          <circle cx="78" cy="98" r="7.5" fill={DARK} />
          <circle cx="122" cy="98" r="7.5" fill={DARK} />
          <circle cx="80.5" cy="95" r="2.6" fill="#fff" />
          <circle cx="124.5" cy="95" r="2.6" fill="#fff" />
        </g>
      )}
      {mood === 'sad' && (
        <g data-part="sad-details">
          <path d="M62 84 L90 92" stroke={DARK} strokeWidth="4.5" strokeLinecap="round" />
          <path d="M138 84 L110 92" stroke={DARK} strokeWidth="4.5" strokeLinecap="round" />
          <path data-part="tear" d="M70 108 q-5 11 0 16 q5 -5 0 -16Z" fill="#5cc4ff" />
        </g>
      )}

      <ellipse cx="100" cy="116" rx="8.5" ry="6" fill={DARK} />

      {joyful ? (
        <g data-part="mouth-open">
          <path
            d="M88 126 Q100 148 112 126 Z"
            fill="#8a1c2b"
            stroke={DARK}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="M94 138 Q100 144 106 138 Q100 134 94 138Z" fill="#ff7b9a" />
        </g>
      ) : mood === 'sad' ? (
        <path
          data-part="mouth-sad"
          d="M90 136 Q100 124 110 136"
          fill="none"
          stroke={DARK}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      ) : (
        <path
          data-part="mouth-smile"
          d="M90 126 Q100 136 110 126"
          fill="none"
          stroke={DARK}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      )}

      {mood === 'celebrate' && (
        <g data-part="sparkles">
          <text x="14" y="40" fontSize="26">
            🎉
          </text>
          <text x="150" y="36" fontSize="24">
            ✨
          </text>
          <text x="168" y="92" fontSize="20">
            ⭐
          </text>
          <text x="6" y="96" fontSize="20">
            ⭐
          </text>
        </g>
      )}
    </svg>
  );
}
