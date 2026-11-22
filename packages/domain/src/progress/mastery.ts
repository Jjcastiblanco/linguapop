import type { Course, Exercise } from '@linguapop/content';
import { RETENTION7_MIN, type ProgressState } from './state';

/** Habilidades que mide el informe de dominio. */
export const SKILLS = ['listen', 'speak', 'write', 'recognize'] as const;
export type Skill = (typeof SKILLS)[number];

/** Habilidad de un ejercicio según su tipo en el curso (no según cómo lo presente el repaso). */
export function skillOf(type: Exercise['type']): Skill {
  switch (type) {
    case 'listen':
      return 'listen';
    case 'speak':
      return 'speak';
    case 'write':
    case 'order':
      return 'write';
    case 'mc':
    case 'match':
      return 'recognize';
  }
}

export type MasteryShare = { mastered: number; total: number; percent: number };

export type MasteryReport = {
  byUnit: Array<MasteryShare & { unitId: string }>;
  bySkill: Record<Skill, MasteryShare>;
  /** Porcentaje de aciertos a +7 días, o `null` si aún hay menos de `RETENTION7_MIN` resultados. */
  retention7: number | null;
};

const share = (mastered: number, total: number): MasteryShare => ({
  mastered,
  total,
  percent: total ? Math.round((100 * mastered) / total) : 0,
});

/** Porcentaje de ejercicios dominados por unidad y por habilidad, y retención a 7 días. Puro. */
export function masteryReport(
  units: Course['units'],
  progress: Pick<ProgressState, 'reviews' | 'retention7'>,
): MasteryReport {
  const skills = Object.fromEntries(SKILLS.map((k) => [k, { mastered: 0, total: 0 }])) as Record<
    Skill,
    { mastered: number; total: number }
  >;
  const byUnit = units.map((u) => {
    let mastered = 0;
    let total = 0;
    for (const e of u.exercises) {
      if (e.retired) continue;
      const done = progress.reviews[e.id]?.mastered === true;
      const skill = skills[skillOf(e.type)];
      total += 1;
      skill.total += 1;
      if (done) {
        mastered += 1;
        skill.mastered += 1;
      }
    }
    return { unitId: u.id, ...share(mastered, total) };
  });
  const results = progress.retention7;
  const retention7 =
    results.length >= RETENTION7_MIN
      ? Math.round((100 * results.filter(Boolean).length) / results.length)
      : null;
  return {
    byUnit,
    bySkill: Object.fromEntries(
      SKILLS.map((k) => [k, share(skills[k].mastered, skills[k].total)]),
    ) as Record<Skill, MasteryShare>,
    retention7,
  };
}
