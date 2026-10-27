import type { Random } from '../ports';

export const CHEST_MIN_GEMS = 30;
export const CHEST_GEM_RANGE = 31; // de 30 a 60 gemas
export const CHEST_XP = 20;

export type ChestReward = { gems: number; xp: number };

/** Premio de abrir el cofre de una unidad: de 30 a 60 gemas y 20 de XP. */
export function rollChestReward(random: Random): ChestReward {
  return { gems: CHEST_MIN_GEMS + Math.floor(random.next() * CHEST_GEM_RANGE), xp: CHEST_XP };
}
