import type { Exercise, TeachCard, Unit } from './schema';

/** Una palabra o frase en inglés que un ejercicio evalúa y que ninguna lección enseñó antes. */
export type UntaughtTerm = { unitId: string; lessonId: string; exerciseId: string; term: string };

/** Minúsculas, sin acentos ni signos, para comparar `Good morning!` con `good morning`. */
export function normalizeTerm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lo que el estudiante debe saber en inglés para resolver el ejercicio: la frase que se escribe,
 * ordena, oye o dice, los pares que se emparejan, o en elegir la opción correcta o la frase entre
 * comillas de «¿Qué significa "…"?».
 */
export function evaluatedTerms(exercise: Exercise): string[] {
  switch (exercise.type) {
    case 'order':
    case 'write':
    case 'listen':
    case 'speak':
      return [exercise.en];
    case 'match':
      return exercise.pairs.map((p) => p.en);
    case 'mc': {
      const quoted = /significa\s+"([^"]+)"/i.exec(exercise.prompt)?.[1];
      return [quoted ?? exercise.options[exercise.answerIndex]!.text];
    }
  }
}

/**
 * Palabras y frases que evalúa una lección con `teach` y que ni ella ni una lección anterior del
 * curso enseñan. Una lección sin `teach` no se revisa (es aditivo, C6) salvo con `requireTeach`.
 * El orden del curso es el de las unidades y, dentro de cada una, el de sus lecciones.
 */
export function findUntaughtTerms(
  units: readonly Unit[],
  options: { requireTeach?: boolean } = {},
): UntaughtTerm[] {
  const taught = new Set<string>();
  const missing: UntaughtTerm[] = [];
  for (const unit of units) {
    const exercises = new Map(unit.exercises.map((e) => [e.id, e]));
    for (const lesson of unit.lessons) {
      lesson.teach?.forEach((card) => taught.add(normalizeTerm(card.en)));
      if (!lesson.teach && !options.requireTeach) continue;
      const seen = new Set<string>();
      for (const id of lesson.exerciseIds) {
        const exercise = exercises.get(id);
        if (!exercise) continue;
        for (const term of evaluatedTerms(exercise)) {
          const key = normalizeTerm(term);
          if (taught.has(key) || seen.has(`${id}:${key}`)) continue;
          seen.add(`${id}:${key}`);
          missing.push({ unitId: unit.id, lessonId: lesson.id, exerciseId: id, term });
        }
      }
    }
  }
  return missing;
}

/**
 * Tarjetas que el estudiante ya pudo ver al llegar a la lección: las suyas y las de las lecciones
 * anteriores del curso, con las más recientes primero. Sin la lección, devuelve una lista vacía.
 */
export function taughtThrough(units: readonly Unit[], lessonId: string): TeachCard[] {
  const lessons = units.flatMap((u) => u.lessons);
  const at = lessons.findIndex((l) => l.id === lessonId);
  if (at === -1) return [];
  return lessons
    .slice(0, at + 1)
    .reverse()
    .flatMap((l) => l.teach ?? []);
}
