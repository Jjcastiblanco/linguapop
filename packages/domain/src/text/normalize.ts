/**
 * Normaliza un texto para compararlo con tolerancia: minúsculas, sin acentos ni puntuación,
 * con las contracciones del inglés expandidas ("I'm" pasa a "i am", "don't" a "do not").
 */
export function normalizeText(input: string): string {
  let s = String(input ?? '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  s = s
    .replace(/\bcannot\b/g, 'can not')
    .replace(/\bcan't\b/g, 'can not')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bi'm\b/g, 'i am')
    .replace(/\blet's\b/g, 'let us')
    .replace(/\b(it|that|what|he|she|there|here|who|how)'s\b/g, '$1 is')
    .replace(/\b(\w+)n't\b/g, '$1 not')
    .replace(/\b(\w+)'re\b/g, '$1 are')
    .replace(/\b(\w+)'ll\b/g, '$1 will')
    .replace(/\b(\w+)'ve\b/g, '$1 have')
    .replace(/\b(\w+)'d\b/g, '$1 would');
  return s
    .replace(/'/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
