import type { MinimalPair } from '@linguapop/content';
import type { Random } from '../ports';
import { shuffle } from '../random';

/** Intentos de una sesión de «Entrena tu oído». */
export const EAR_SESSION_SIZE = 10;

type PairWord = MinimalPair['a'];

/** Un intento: suena `word` y hay que tocarla entre `word` y `other`. */
export type EarAttempt = { pairId: string; word: PairWord; other: PairWord };

/**
 * Arma una sesión de identificar: `size` pares distintos (todos si hay menos) y, en cada uno, cuál
 * de las dos palabras suena. Todo el azar sale del `random` inyectado, así que es repetible.
 */
export function buildEarSession(
  pairs: readonly MinimalPair[],
  random: Random,
  size: number = EAR_SESSION_SIZE,
): EarAttempt[] {
  return shuffle(pairs, random)
    .slice(0, Math.max(0, size))
    .map((pair): EarAttempt => {
      const first = random.next() < 0.5;
      return {
        pairId: pair.id,
        word: first ? pair.a : pair.b,
        other: first ? pair.b : pair.a,
      };
    });
}
