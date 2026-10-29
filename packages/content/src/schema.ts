import { z } from 'zod';
import { findUntaughtTerms } from './teach';

/** Identificador estable en minúsculas con guiones, por ejemplo `u-saludos-e07`. */
const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id inválido: minúsculas, números y guiones');
const Texto = z.string().trim().min(1, 'el texto no puede estar vacío');
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color hexadecimal de 6 dígitos');

const base = {
  id: Slug,
  /** Explicación breve que se muestra al responder. */
  tip: Texto.optional(),
  /** Un ejercicio retirado sigue resolviendo en versiones históricas pero no se muestra. */
  retired: z.boolean().optional(),
};

const MultipleChoice = z
  .object({
    ...base,
    type: z.literal('mc'),
    prompt: Texto,
    options: z
      .array(z.object({ emoji: Texto, text: Texto }))
      .min(2)
      .max(6),
    answerIndex: z.number().int().min(0),
  })
  .refine((e) => e.answerIndex < e.options.length, {
    message: 'answerIndex debe apuntar a una opción existente',
    path: ['answerIndex'],
  });

const Order = z.object({
  ...base,
  type: z.literal('order'),
  es: Texto,
  en: Texto,
  extraWords: z.array(Texto),
});

const Write = z.object({
  ...base,
  type: z.literal('write'),
  es: Texto,
  en: Texto,
  alternatives: z.array(Texto),
});

const Match = z
  .object({
    ...base,
    type: z.literal('match'),
    pairs: z
      .array(z.object({ es: Texto, en: Texto }))
      .min(2)
      .max(8),
  })
  .refine((e) => new Set(e.pairs.map((p) => p.es)).size === e.pairs.length, {
    message: 'las palabras en español de los pares deben ser distintas',
    path: ['pairs'],
  })
  .refine((e) => new Set(e.pairs.map((p) => p.en)).size === e.pairs.length, {
    message: 'las palabras en inglés de los pares deben ser distintas',
    path: ['pairs'],
  });

const Listen = z.object({ ...base, type: z.literal('listen'), en: Texto, es: Texto });
const Speak = z.object({ ...base, type: z.literal('speak'), en: Texto, es: Texto });

export const ExerciseSchema = z.discriminatedUnion('type', [
  MultipleChoice,
  Order,
  Write,
  Match,
  Listen,
  Speak,
]);

/** Tarjeta de «Palabras nuevas»: lo que la lección enseña antes de evaluarlo. */
export const TeachCardSchema = z.object({
  en: Texto,
  es: Texto,
  emoji: Texto.optional(),
});

export const LessonSchema = z.object({
  id: Slug,
  /** Palabras y frases que la lección enseña antes de sus ejercicios; opcional (aditivo, C6). */
  teach: z.array(TeachCardSchema).max(12).optional(),
  /** Lista ordenada de ids de ejercicio de la misma unidad. */
  exerciseIds: z.array(Slug).min(1).max(30),
});

export const UnitSchema = z
  .object({
    id: Slug,
    name: Texto,
    emoji: Texto,
    color: Color,
    colorDark: Color,
    description: Texto,
    exercises: z.array(ExerciseSchema).min(15, 'cada unidad necesita al menos 15 ejercicios'),
    lessons: z.array(LessonSchema).min(1),
  })
  .superRefine((unit, ctx) => {
    const ids = new Set<string>();
    unit.exercises.forEach((e, i) => {
      if (ids.has(e.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `id de ejercicio repetido: ${e.id}`,
          path: ['exercises', i, 'id'],
        });
      }
      ids.add(e.id);
      if (!e.id.startsWith(`${unit.id}-`)) {
        ctx.addIssue({
          code: 'custom',
          message: `el id ${e.id} debe empezar por ${unit.id}-`,
          path: ['exercises', i, 'id'],
        });
      }
    });
    const lessonIds = new Set<string>();
    unit.lessons.forEach((l, i) => {
      if (lessonIds.has(l.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `id de lección repetido: ${l.id}`,
          path: ['lessons', i, 'id'],
        });
      }
      lessonIds.add(l.id);
      l.exerciseIds.forEach((id, j) => {
        if (!ids.has(id)) {
          ctx.addIssue({
            code: 'custom',
            message: `la lección ${l.id} usa un ejercicio inexistente: ${id}`,
            path: ['lessons', i, 'exerciseIds', j],
          });
        }
      });
    });
  });

/** Turno del diálogo con Nova. `accepted` admite el comodín `*`. */
export const DialogueTurnSchema = z.object({
  nova: Texto,
  accepted: z.array(Texto).min(1),
  hint: Texto,
  comment: Texto,
  /** Palabras que invalidan una respuesta aunque coincida con un patrón. */
  rejectWords: z.array(Texto).optional(),
  /** Expresión regular que la respuesta normalizada también debe cumplir. */
  requiredPattern: Texto.optional(),
});

export const DialogueTopicSchema = z.object({
  id: Slug,
  unitId: Slug,
  title: Texto,
  emoji: Texto,
  intro: Texto,
  outro: Texto,
  turns: z.array(DialogueTurnSchema).min(8, 'cada tema necesita al menos 8 turnos'),
});

/** Estadísticas que puede usar una condición de logro (lista cerrada). */
export const ACHIEVEMENT_STATS = [
  'lessons',
  'streak',
  'xp',
  'perfectLessons',
  'unitsCompleted',
  'calls',
  'correctAnswers',
  'gems',
  'dailyGoalReached',
  'timedBest',
] as const;

export const AchievementSchema = z.object({
  id: Slug,
  icon: Texto,
  name: Texto,
  description: Texto,
  condition: z.object({
    stat: z.enum(ACHIEVEMENT_STATS),
    atLeast: z.number().int().min(1),
  }),
});

export const CourseSchema = z
  .object({
    schemaVersion: z.literal(1),
    from: z.literal('es'),
    to: z.literal('en'),
    level: Texto,
    units: z.array(UnitSchema).min(1),
    dialogues: z.array(DialogueTopicSchema),
    achievements: z.array(AchievementSchema),
  })
  .superRefine((course, ctx) => {
    const unitIds = new Set<string>();
    course.units.forEach((u, i) => {
      if (unitIds.has(u.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `id de unidad repetido: ${u.id}`,
          path: ['units', i, 'id'],
        });
      }
      unitIds.add(u.id);
    });
    const topicIds = new Set<string>();
    course.dialogues.forEach((d, i) => {
      if (topicIds.has(d.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `id de tema repetido: ${d.id}`,
          path: ['dialogues', i, 'id'],
        });
      }
      topicIds.add(d.id);
    });
    const achievementIds = new Set<string>();
    course.achievements.forEach((a, i) => {
      if (achievementIds.has(a.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `id de logro repetido: ${a.id}`,
          path: ['achievements', i, 'id'],
        });
      }
      achievementIds.add(a.id);
    });
    findUntaughtTerms(course.units).forEach(({ unitId, lessonId, exerciseId, term }) => {
      ctx.addIssue({
        code: 'custom',
        message: `la lección ${lessonId} evalúa «${term}» (${exerciseId}) sin enseñarla antes`,
        path: ['units', course.units.findIndex((u) => u.id === unitId), 'lessons'],
      });
    });
    course.dialogues.forEach((d, i) => {
      if (!unitIds.has(d.unitId)) {
        ctx.addIssue({
          code: 'custom',
          message: `el tema ${d.id} apunta a una unidad inexistente: ${d.unitId}`,
          path: ['dialogues', i, 'unitId'],
        });
      }
    });
  });

export type Exercise = z.infer<typeof ExerciseSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type TeachCard = z.infer<typeof TeachCardSchema>;
export type Unit = z.infer<typeof UnitSchema>;
export type DialogueTurn = z.infer<typeof DialogueTurnSchema>;
export type DialogueTopic = z.infer<typeof DialogueTopicSchema>;
export type Achievement = z.infer<typeof AchievementSchema>;
export type Course = z.infer<typeof CourseSchema>;
export type AchievementStat = (typeof ACHIEVEMENT_STATS)[number];
