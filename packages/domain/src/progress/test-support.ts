import type { Achievement } from '@linguapop/content';
import type { ProgressEvent } from '../events';
import type { ProgressContext } from './fold';

/** Estructura de unidades de la versión heredada: 5 unidades de 3 lecciones. */
export const UNIT_IDS = ['u-saludos', 'u-comida', 'u-familia', 'u-viajes', 'u-trabajo'] as const;

const logro = (
  id: string,
  stat: Achievement['condition']['stat'],
  atLeast: number,
): Achievement => ({
  id,
  icon: '🎯',
  name: id,
  description: id,
  condition: { stat, atLeast },
});

/** Los 14 logros de la versión heredada, en su orden. */
export const LEGACY_ACHIEVEMENTS: Achievement[] = [
  logro('first', 'lessons', 1),
  logro('streak3', 'streak', 3),
  logro('streak7', 'streak', 7),
  logro('xp100', 'xp', 100),
  logro('xp500', 'xp', 500),
  logro('perfect', 'perfectLessons', 1),
  logro('unit1', 'unitsCompleted', 1),
  logro('unit3', 'unitsCompleted', 3),
  logro('unit5', 'unitsCompleted', 5),
  logro('nova', 'calls', 1),
  logro('c50', 'correctAnswers', 50),
  logro('gems200', 'gems', 200),
  logro('goal', 'dailyGoalReached', 1),
  logro('timed', 'timedBest', 10),
];

export const TEST_CONTEXT: ProgressContext = {
  units: UNIT_IDS.map((id) => ({ id, lessonIds: [1, 2, 3].map((n) => `${id}-l${n}`) })),
  achievements: LEGACY_ACHIEVEMENTS,
};

let contador = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++contador).padStart(12, '0')}`;

/** Fabrica un evento válido; `payload` se comprueba con el tipo de cada evento. */
export function evento<T extends ProgressEvent['type']>(
  type: T,
  payload: Extract<ProgressEvent, { type: T }>['payload'],
  occurredAt = '2026-10-27T12:00:00.000Z',
  id = uuid(),
): Extract<ProgressEvent, { type: T }> {
  return { id, type, occurredAt, contentVersion: 1, payload } as Extract<
    ProgressEvent,
    { type: T }
  >;
}

export const sesion = (
  payload: Omit<
    Extract<ProgressEvent, { type: 'session_completed@1' }>['payload'],
    'durationSec' | 'outOfHearts'
  > &
    Partial<{ durationSec: number; outOfHearts: boolean }>,
  occurredAt?: string,
) => evento('session_completed@1', { durationSec: 60, outOfHearts: false, ...payload }, occurredAt);
