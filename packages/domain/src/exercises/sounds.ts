import { normalizeText } from '../text';

/**
 * Sustituciones de sonidos típicas de quien habla español, para evaluar «hablar» por inteligibilidad
 * y no por parecido exacto de letras. Trabajan sobre lo que el reconocimiento escribió: una
 * palabra dicha con otro sonido llega como otra palabra parecida.
 *
 * - `accept`: de baja carga funcional, no cambia casi nunca el significado; se acepta sin aviso.
 * - `warn`: puede confundir con otra palabra; la frase se acepta si tiene 3 palabras o más
 *   (el contexto la salva) y se avisa del sonido con una pista en español.
 */
export type SoundSubstitution = 'epenthesis' | 'th' | 'b-v' | 'long-short-i';

export const ACCEPTED_SUBSTITUTIONS: readonly SoundSubstitution[] = ['epenthesis', 'th'];
export const WARNED_SUBSTITUTIONS = [
  'b-v',
  'long-short-i',
] as const satisfies readonly SoundSubstitution[];

/** Qué sustitución explica que se oyera `heard` donde se esperaba `expected` (ya normalizadas). */
export function substitutionOf(heard: string, expected: string): SoundSubstitution | null {
  // Una «e» delante de s + consonante: «espeak» por «speak», «eschool» por «school».
  if (heard === `e${expected}` && /^s[^aeiouyh\s\d]/.test(expected)) return 'epenthesis';
  // /θ/ y /ð/ dichas como t, d, s o f: «tink», «sink», «fink», «dis».
  if (expected.includes('th')) {
    const variants = ['t', 'd', 's', 'f'].map((c) => expected.replace(/th/g, c));
    if (variants.includes(heard)) return 'th';
  }
  // /v/ dicha como /b/: «best» por «vest»; «berry» por «very» (la ortografía de berry añade una r,
  // por eso se admite una letra de diferencia sobre la palabra con la v cambiada por b).
  if (expected.includes('v')) {
    const asB = expected.replace(/v/g, 'b');
    if (heard === asB || heard === asB.replace(/er/, 'err')) return 'b-v';
  }
  // Vocal larga dicha como corta: «ship» por «sheep», «live» por «leave», «sit» por «seat».
  if (/ee|ea/.test(expected) && heard === expected.replace(/ee|ea/g, 'i')) return 'long-short-i';
  return null;
}

export type SoundHint = {
  /** Sustitución que avisa, o `word` si solo se sabe qué palabra no coincidió. */
  kind: (typeof WARNED_SUBSTITUTIONS)[number] | 'word';
  /** La palabra que se esperaba y la que se oyó. */
  expected: string;
  heard: string;
};

/** Mínimo de palabras de una frase para aceptarla con una sustitución de las que avisan. */
export const WARNED_MIN_WORDS = 3;

export type SpeechJudgement = {
  /** Se acepta por sustituciones de baja carga (o por una de las que avisan, en frase larga). */
  accepted: boolean;
  hint?: SoundHint;
};

/**
 * Juzga una alternativa del reconocimiento contra la frase esperada, palabra por palabra. Solo
 * opina si tienen las mismas palabras en número; si no, devuelve nulo y manda el parecido de texto.
 */
export function judgeSpeech(heard: string, expected: string): SpeechJudgement | null {
  const h = normalizeText(heard).split(' ').filter(Boolean);
  const t = normalizeText(expected).split(' ').filter(Boolean);
  if (h.length === 0 || h.length !== t.length) return null;
  const diffs = t.flatMap((word, i) => (h[i] === word ? [] : [i]));
  if (diffs.length === 0) return { accepted: true };

  // Las sustituciones aceptadas no cuentan como problema: lo demás es lo que se juzga.
  const kinds = diffs.map((i) => substitutionOf(h[i]!, t[i]!));
  const bad = diffs.filter((_, n) => !(kinds[n] && ACCEPTED_SUBSTITUTIONS.includes(kinds[n]!)));
  if (bad.length === 0) return { accepted: true };
  const first = bad[0]!;
  const kind = bad.length === 1 ? kinds[diffs.indexOf(first)] : null;
  if (kind && (WARNED_SUBSTITUTIONS as readonly SoundSubstitution[]).includes(kind)) {
    return {
      accepted: t.length >= WARNED_MIN_WORDS,
      hint: {
        kind: kind as SoundHint['kind'],
        expected: t[first]!,
        heard: h[first]!,
      },
    };
  }
  if (bad.length <= 2) {
    return { accepted: false, hint: { kind: 'word', expected: t[first]!, heard: h[first]! } };
  }
  return null;
}
