import type { ProgressEvent } from '../events';

/** Clave con la que `linguapop.html` guarda su estado en `localStorage`. */
export const LEGACY_STORAGE_KEY = 'linguapop_v1';

/** Tipo del evento sintético; el servidor lo guarda con `source = legacy`. */
export const LEGACY_EVENT_TYPE = 'legacy_imported@1' as const;

/** Unidades de la versión heredada, en el orden en que guarda `done` y `chest`. */
const LEGACY_UNITS = ['u-saludos', 'u-comida', 'u-familia', 'u-viajes', 'u-trabajo'] as const;
const LESSONS_PER_UNIT = 3;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Entero no negativo; lo que no lo sea cuenta como 0. */
const count = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

function counts(v: unknown, keep: (k: string) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(v)) return out;
  for (const [k, n] of Object.entries(v)) {
    if (keep(k) && count(n) > 0) out[k] = count(n);
  }
  return out;
}

/**
 * Id estable del evento de importación de una cuenta: la misma cuenta produce el mismo id en
 * cualquier dispositivo, así el servidor ignora el segundo envío. Es un UUID v4 con forma válida
 * derivado de un hash de 128 bits (no es criptográfico: solo necesita ser estable y repartido).
 */
export function legacyEventId(accountId: string): string {
  let h = [1779033703, 3144134277, 1013904242, 2773480762];
  for (let i = 0; i < accountId.length; i++) {
    const c = accountId.charCodeAt(i);
    h = [
      h[1]! ^ Math.imul(h[0]! ^ c, 597399067),
      h[2]! ^ Math.imul(h[1]! ^ c, 2869860233),
      h[3]! ^ Math.imul(h[2]! ^ c, 951274213),
      h[0]! ^ Math.imul(h[3]! ^ c, 2716044179),
    ];
  }
  const hex = h.map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Convierte el estado de `linguapop.html` en el evento de importación. Devuelve `null` si no hay
 * nada que importar (sin datos, ilegibles o sin progreso). Lo que no se entiende se descarta: los
 * ejercicios a repasar usan posiciones del código viejo que ya no existen, así que no se importan.
 */
export function legacyImportEvent(
  raw: unknown,
  meta: { id: string; nowMs: number; contentVersion: number },
): Extract<ProgressEvent, { type: typeof LEGACY_EVENT_TYPE }> | null {
  if (!isRecord(raw)) return null;
  const stats = isRecord(raw.stats) ? raw.stats : {};
  const done = isRecord(raw.done) ? raw.done : {};
  const chest = isRecord(raw.chest) ? raw.chest : {};

  const lessonsDone: Record<string, number> = {};
  const chestsOpened: string[] = [];
  LEGACY_UNITS.forEach((unit, i) => {
    const n = Math.min(count(done[i]), LESSONS_PER_UNIT);
    if (n > 0) lessonsDone[unit] = n;
    if (chest[i]) chestsOpened.push(unit);
  });

  const lastDay = typeof raw.lastDay === 'string' && DAY.test(raw.lastDay) ? raw.lastDay : '';
  const streak = lastDay ? count(raw.streak) : 0;
  const achievements: Record<string, string> = {};
  if (isRecord(raw.ach)) {
    for (const [id, when] of Object.entries(raw.ach)) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || typeof when !== 'number') continue;
      const date = new Date(when);
      if (!Number.isNaN(date.getTime())) achievements[id] = date.toISOString();
    }
  }
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '';

  const payload = {
    ...(name ? { displayName: name } : {}),
    ...(count(raw.goal) > 0 ? { dailyGoalXp: count(raw.goal) } : {}),
    xp: count(raw.xp),
    gems: count(raw.gems),
    lessonsDone,
    chestsOpened,
    stats: {
      lessons: count(stats.lessons),
      correct: count(stats.correct),
      total: count(stats.total),
      perfect: count(stats.perfect),
      timedBest: count(stats.timedBest),
      calls: count(stats.calls),
      seconds: count(stats.seconds),
      callSeconds: count(stats.callSec),
    },
    streak: {
      streak,
      best: Math.max(count(raw.best), streak),
      lastDay,
      shieldMonth:
        typeof raw.shield === 'string' && /^\d{4}-\d{2}$/.test(raw.shield) ? raw.shield : '',
    },
    xpByDay: counts(raw.xpHist, (k) => DAY.test(k)),
    words: counts(raw.words, (k) => k.length > 0),
    achievements,
  };

  const hasProgress =
    payload.xp > 0 ||
    payload.stats.lessons > 0 ||
    payload.stats.calls > 0 ||
    Object.keys(payload.lessonsDone).length > 0 ||
    payload.streak.best > 0;
  if (!hasProgress) return null;

  return {
    id: meta.id,
    type: LEGACY_EVENT_TYPE,
    occurredAt: new Date(meta.nowMs).toISOString(),
    contentVersion: meta.contentVersion,
    payload,
  };
}
