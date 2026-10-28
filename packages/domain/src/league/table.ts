import { addDays, weekday, type DayKey } from '../streak';
import { BOT_FACES, BOT_NAMES, hashString } from './bots';

/** Los primeros puestos suben de liga. */
export const PROMOTION_ZONE_SIZE = 10;
/** Desde este puesto (contado desde 1) se baja de liga. */
export const DEMOTION_ZONE_START = 26;
/** XP total desde el que se llega a Plata y a Oro. */
export const SILVER_XP = 500;
export const GOLD_XP = 1500;

export type LeagueTier = 'bronze' | 'silver' | 'gold';
export type LeagueZone = 'promotion' | 'safe' | 'demotion';

export type LeagueRow = {
  rank: number;
  name: string;
  /** Cara del bot; el estudiante usa la mascota, por eso aquí va vacío. */
  face: string;
  xp: number;
  me: boolean;
  zone: LeagueZone;
};

export type LeagueInput = {
  day: DayKey;
  /** Hora local, de 0 a 23. */
  hour: number;
  xpByDay: Readonly<Record<DayKey, number>>;
  totalXp: number;
  playerName: string;
};

export type League = {
  tier: LeagueTier;
  /** Días que quedan de la semana, contando hoy: de 7 (lunes) a 1 (domingo). */
  daysLeft: number;
  weekStart: DayKey;
  rows: LeagueRow[];
};

/** Lunes de la semana de un día. */
export function weekStart(day: DayKey): DayKey {
  return addDays(day, -(weekday(day) ?? 0));
}

/** XP que el estudiante ganó en la semana (lunes a domingo) de un día. */
export function weekXp(xpByDay: Readonly<Record<DayKey, number>>, day: DayKey): number {
  const start = weekStart(day);
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += xpByDay[addDays(start, i)] ?? 0;
  return sum;
}

export function leagueTier(totalXp: number): LeagueTier {
  return totalXp < SILVER_XP ? 'bronze' : totalXp < GOLD_XP ? 'silver' : 'gold';
}

function zoneOf(rank: number): LeagueZone {
  return rank <= PROMOTION_ZONE_SIZE
    ? 'promotion'
    : rank >= DEMOTION_ZONE_START
      ? 'demotion'
      : 'safe';
}

/**
 * Tabla semanal simulada: el XP de cada bot depende solo de la semana y de cuánto ha avanzado,
 * así que el mismo día y hora dan siempre la misma tabla. En empate el estudiante queda primero.
 */
export function leagueTable(input: LeagueInput): League {
  const start = weekStart(input.day);
  const dow = weekday(input.day) ?? 0;
  const progress = Math.min(1, (dow + input.hour / 24 + 0.25) / 7);

  const players: Omit<LeagueRow, 'rank' | 'zone'>[] = BOT_NAMES.map((name) => ({
    name,
    face: BOT_FACES[hashString(name) % BOT_FACES.length]!,
    xp: Math.round((60 + (hashString(start + name) % 520)) * progress),
    me: false,
  }));
  players.push({
    name: input.playerName,
    face: '',
    xp: weekXp(input.xpByDay, input.day),
    me: true,
  });
  players.sort((a, b) => b.xp - a.xp || (a.me ? -1 : b.me ? 1 : 0));

  return {
    tier: leagueTier(input.totalXp),
    daysLeft: 7 - dow,
    weekStart: start,
    rows: players.map((p, i) => ({ ...p, rank: i + 1, zone: zoneOf(i + 1) })),
  };
}
