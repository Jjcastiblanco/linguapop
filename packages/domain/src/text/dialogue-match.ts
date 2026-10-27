import { normalizeText } from './normalize';
import { similarity } from './similarity';

/** Lo que hace falta de un turno de diálogo para decidir si una respuesta vale. */
export type TurnMatcher = {
  /** Frases aceptadas; `*` equivale a una o más palabras cualesquiera. */
  accepted: readonly string[];
  /** Palabras que invalidan la respuesta aunque coincida con un patrón. */
  rejectWords?: readonly string[] | undefined;
  /** Expresión regular que la respuesta normalizada también debe cumplir. */
  requiredPattern?: string | undefined;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compara una respuesta ya normalizada con un patrón aceptado. */
export function matchesPattern(normalized: string, pattern: string): boolean {
  const pat = normalizeText(pattern.replace(/\*/g, ' STAR ')).replace(/\bstar\b/g, '*');
  if (pat.includes('*')) {
    const re = new RegExp(
      '(^| )' +
        pat
          .split('*')
          .map((p) => escapeRegExp(p.trim()))
          .join('[a-z0-9 ]+') +
        '( |$)',
    );
    return re.test(normalized);
  }
  if (!pat) return false;
  if (normalized === pat) return true;
  const patWords = pat.split(' ');
  const words = normalized.split(' ');
  if (patWords.length >= 2 && (' ' + normalized + ' ').includes(' ' + pat + ' ')) return true;
  if (patWords.length === 1 && words.length <= 4 && words.includes(pat)) return true;
  return similarity(normalized, pat) >= 0.78;
}

/** ¿La respuesta del estudiante vale para este turno? Ignora mayúsculas, puntuación y acentos. */
export function matchesTurn(text: string, turn: TurnMatcher): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (turn.rejectWords && normalized.split(' ').some((w) => turn.rejectWords!.includes(w)))
    return false;
  if (turn.requiredPattern) {
    let required: RegExp;
    try {
      required = new RegExp('\\b' + turn.requiredPattern + '\\b');
    } catch {
      return false; // un patrón mal escrito nunca debe romper la conversación
    }
    if (!required.test(normalized)) return false;
  }
  return turn.accepted.some((p) => matchesPattern(normalized, p));
}
