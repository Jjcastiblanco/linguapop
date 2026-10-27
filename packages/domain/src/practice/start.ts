import type { SessionMode } from '../events';
import type { LessonConfig } from '../lesson';
import { currentHearts, type ProgressState } from '../progress';
import type { DayKey } from '../streak';
import {
  TIMED_SECONDS,
  buildPersonalizedList,
  buildPlacementList,
  buildReviewList,
  buildTimedList,
  type PracticeInput,
} from './lists';
import { isUnitComplete } from './unlock';

export type PracticeKind =
  | { kind: 'review' }
  | { kind: 'personalized' }
  | { kind: 'timed' }
  | { kind: 'placement'; unitId: string };

export type PracticeFailure =
  'pro-required' | 'nothing-to-review' | 'unit-not-found' | 'unit-completed' | 'no-hearts';

export type PracticeResult =
  { ok: true; config: LessonConfig } | { ok: false; reason: PracticeFailure };

const MODE: Record<PracticeKind['kind'], SessionMode> = {
  review: 'review',
  personalized: 'practice',
  timed: 'timed',
  placement: 'test',
};

/**
 * Prepara la configuración de una sesión de práctica. Todos estos modos son del plan PRO.
 * `today` sirve para saber las vidas del día en el plan gratis.
 */
export function practiceConfig(
  request: PracticeKind,
  input: PracticeInput & { progress: ProgressState },
  today: DayKey,
): PracticeResult {
  const { progress } = input;
  if (progress.settings.plan !== 'pro') return { ok: false, reason: 'pro-required' };
  const base = {
    mode: MODE[request.kind],
    plan: progress.settings.plan,
    hearts: currentHearts(progress, today),
  };

  switch (request.kind) {
    case 'review': {
      const exercises = buildReviewList(input);
      return exercises.length === 0
        ? { ok: false, reason: 'nothing-to-review' }
        : { ok: true, config: { ...base, exercises } };
    }
    case 'personalized':
      return { ok: true, config: { ...base, exercises: buildPersonalizedList(input) } };
    case 'timed':
      return {
        ok: true,
        config: { ...base, exercises: buildTimedList(input), timeLimitSec: TIMED_SECONDS },
      };
    case 'placement': {
      const unit = input.units.find((u) => u.id === request.unitId);
      if (!unit) return { ok: false, reason: 'unit-not-found' };
      if (isUnitComplete(unit, progress.lessonsDone))
        return { ok: false, reason: 'unit-completed' };
      return {
        ok: true,
        config: { ...base, exercises: buildPlacementList(input, unit.id), unitId: unit.id },
      };
    }
  }
}
