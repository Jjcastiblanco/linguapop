import { t } from '../i18n';
import styles from './Nova.module.css';

export type NovaExpression = 'neutral' | 'smirk' | 'happy' | 'surprised' | 'think';

export type NovaProps = {
  expression?: NovaExpression;
  /** Nova está hablando: la boca se abre y se cierra. */
  talking?: boolean;
  /** Si es solo adorno, se oculta a los lectores de pantalla. */
  decorative?: boolean;
  className?: string;
};

const SKIN = '#f1c4a0';
const LIP = '#a8324a';

/** Nova, la compañera sarcástica pero amable: parpadea, mueve la boca al hablar y cambia de expresión. */
export function Nova({
  expression = 'neutral',
  talking = false,
  decorative = false,
  className,
}: NovaProps) {
  const classes = [styles.nova, talking ? styles.talking : '', className].filter(Boolean).join(' ');
  return (
    <svg
      className={classes}
      viewBox="0 0 300 400"
      data-expr={expression}
      data-talking={talking ? 'true' : 'false'}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': t('mascot.nova') })}
    >
      <g className={styles.bob}>
        <path
          className={styles.hairback}
          d="M68 130 C36 210 46 330 78 372 L222 372 C254 330 264 210 232 130 C222 36 78 36 68 130Z"
          fill="#5b21b6"
        />
        <path d="M128 240 L128 306 L172 306 L172 240Z" fill={SKIN} />
        <path d="M128 280 Q150 300 172 280 L172 306 L128 306Z" fill="#dba57f" />
        <path
          d="M24 400 C24 338 66 308 112 298 L188 298 C234 308 276 338 276 400Z"
          fill="#1f2937"
        />
        <path d="M112 298 L150 346 L188 298Z" fill="#f472b6" />
        <path
          d="M112 298 L132 400 M188 298 L168 400"
          stroke="#14b8a6"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="132" cy="352" r="4" fill="#14b8a6" />
        <circle cx="168" cy="352" r="4" fill="#14b8a6" />
        <circle cx="88" cy="196" r="12" fill={SKIN} />
        <circle cx="212" cy="196" r="12" fill={SKIN} />
        <circle cx="87" cy="214" r="4.5" fill="#2dd4bf" />
        <circle cx="213" cy="214" r="4.5" fill="#2dd4bf" />
        <ellipse cx="150" cy="190" rx="62" ry="73" fill={SKIN} />
        <ellipse cx="112" cy="220" rx="13" ry="8" fill="#ff8aa8" opacity=".35" />
        <ellipse cx="188" cy="220" rx="13" ry="8" fill="#ff8aa8" opacity=".35" />

        <g className={styles.eyes} data-part="eyes">
          <ellipse cx="122" cy="192" rx="16" ry="11.5" fill="#fff" />
          <ellipse cx="178" cy="192" rx="16" ry="11.5" fill="#fff" />
          <g className={styles.pupil}>
            <circle cx="122" cy="192" r="8.5" fill="#0ea5a4" />
            <circle cx="122" cy="192" r="4.2" fill="#0b1b2b" />
            <circle cx="125" cy="189" r="2.2" fill="#fff" />
          </g>
          <g className={styles.pupil}>
            <circle cx="178" cy="192" r="8.5" fill="#0ea5a4" />
            <circle cx="178" cy="192" r="4.2" fill="#0b1b2b" />
            <circle cx="181" cy="189" r="2.2" fill="#fff" />
          </g>
          <path
            d="M104 186 Q122 171 140 186"
            fill="none"
            stroke="#2a1346"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          <path
            d="M160 186 Q178 171 196 186"
            fill="none"
            stroke="#2a1346"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
        </g>
        <path
          className={`${styles.brow} ${styles.browL}`}
          data-part="brow-left"
          d="M104 170 Q122 160 140 167"
          fill="none"
          stroke="#4c1d95"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          className={`${styles.brow} ${styles.browR}`}
          data-part="brow-right"
          d="M160 167 Q178 160 196 170"
          fill="none"
          stroke="#4c1d95"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M150 202 Q145 216 153 218"
          fill="none"
          stroke="#d09872"
          strokeWidth="2.6"
          strokeLinecap="round"
        />

        <g className={`${styles.mouth} ${styles.mNeutral}`} data-part="mouth-neutral">
          <path
            d="M137 238 Q150 242 163 238"
            fill="none"
            stroke={LIP}
            strokeWidth="3.6"
            strokeLinecap="round"
          />
        </g>
        <g className={`${styles.mouth} ${styles.mSmirk}`} data-part="mouth-smirk">
          <path
            d="M136 240 Q150 243 167 229"
            fill="none"
            stroke={LIP}
            strokeWidth="3.6"
            strokeLinecap="round"
          />
          <path
            d="M167 229 q4 -1 5 -5"
            fill="none"
            stroke="#d09872"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </g>
        <g className={`${styles.mouth} ${styles.mSmile}`} data-part="mouth-smile">
          <path
            d="M132 232 Q150 256 168 232Z"
            fill="#fff"
            stroke={LIP}
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
        </g>
        <g className={`${styles.mouth} ${styles.mOpen}`} data-part="mouth-open">
          <ellipse cx="150" cy="240" rx="9" ry="11" fill="#7a1c33" />
        </g>
        <g className={`${styles.mouth} ${styles.mTalk}`} data-part="mouth-talk">
          <ellipse cx="150" cy="240" rx="13" ry="10" fill="#7a1c33" />
          <ellipse cx="150" cy="245" rx="7" ry="4" fill="#ff7b9a" />
        </g>

        <path
          d="M82 190 C66 104 118 60 150 60 C190 60 236 104 218 190 C212 152 200 128 178 120 C162 142 132 142 112 122 C96 134 88 158 82 190Z"
          fill="#8b5cf6"
        />
        <path
          d="M118 86 Q150 68 188 90"
          fill="none"
          stroke="#c4b5fd"
          strokeWidth="5"
          strokeLinecap="round"
          opacity=".7"
        />
        <path d="M82 188 C66 244 72 304 94 336 C102 284 100 232 102 196Z" fill="#7c3aed" />
        <path d="M218 188 C234 244 228 304 206 336 C198 284 200 232 198 196Z" fill="#7c3aed" />
        <path d="M200 92 l5 11 12 1 -9 8 3 12 -11 -7 -11 7 3 -12 -9 -8 12 -1Z" fill="#f9a8d4" />
      </g>
    </svg>
  );
}
