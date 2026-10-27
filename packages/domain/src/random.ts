import type { Random } from './ports';

/** Mezcla (Fisher-Yates) sin modificar la lista original; con un `Random` fijo es repetible. */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
