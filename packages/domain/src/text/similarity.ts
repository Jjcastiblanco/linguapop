import { normalizeText } from './normalize';

/** Distancia de edición entre dos cadenas. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n]!;
}

/** Parecido entre dos textos, de 0 a 1; tolera errores del reconocimiento de voz. */
export function similarity(a: string, b: string): number {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ta = x.split(' ');
  const tb = y.split(' ');
  let common = 0;
  const pool = tb.slice();
  for (const word of ta) {
    const k = pool.indexOf(word);
    if (k >= 0) {
      common++;
      pool.splice(k, 1);
    }
  }
  const dice = (2 * common) / (ta.length + tb.length);
  const chars = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  return Math.max(dice, chars);
}
