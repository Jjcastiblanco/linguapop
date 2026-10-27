import { z } from 'zod';

const Id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const Entero = z.number().int().min(0);

export const SESSION_MODES = ['lesson', 'review', 'practice', 'timed', 'test'] as const;
export const SessionModeSchema = z.enum(SESSION_MODES);

const Payloads = {
  exercise_answered: z.object({
    exerciseId: Id,
    correct: z.boolean(),
    mode: SessionModeSchema,
    /** El estudiante omitió el ejercicio (por ejemplo, sin micrófono); no cuenta como acierto ni fallo. */
    skipped: z.boolean().optional(),
  }),
  session_completed: z.object({
    mode: SessionModeSchema,
    unitId: Id.optional(),
    lessonId: Id.optional(),
    correct: Entero,
    wrong: Entero,
    answered: Entero,
    durationSec: Entero,
    outOfHearts: z.boolean(),
  }),
  chest_opened: z.object({
    unitId: Id,
    gems: Entero,
    xp: Entero,
  }),
  call_completed: z.object({
    topicId: Id,
    durationSec: Entero,
    completed: z.boolean(),
    firstTry: Entero,
    later: Entero,
    gaveUp: Entero,
    weakWords: z.array(z.string().trim().min(1)),
    /** Intercambios de la conversación libre con IA; 0 si se usó el árbol de diálogo. */
    aiExchanges: Entero,
  }),
  settings_changed: z
    .object({
      dailyGoalXp: z.number().int().min(1).optional(),
      plan: z.enum(['free', 'pro']).optional(),
      timeZone: z.string().min(1).optional(),
      displayName: z.string().trim().min(1).max(40).optional(),
    })
    .refine((p) => Object.keys(p).length > 0, {
      message: 'settings_changed necesita al menos un campo',
    }),
  purchase: z.object({
    item: z.enum(['hearts', 'streak_shield']),
    costGems: Entero,
  }),
} as const;

/** Sobre común de todo evento: el tipo lleva su versión (`nombre@1`). */
const envelope = <T extends keyof typeof Payloads>(nombre: T) =>
  z.object({
    /** UUID generado en el cliente: el servidor ignora ids repetidos (idempotencia). */
    id: z.uuid(),
    type: z.literal(`${nombre}@1`),
    occurredAt: z.iso.datetime(),
    /** Versión del contenido con la que se generó el evento. */
    contentVersion: Entero,
    payload: Payloads[nombre],
  });

export const ProgressEventSchema = z.discriminatedUnion('type', [
  envelope('exercise_answered'),
  envelope('session_completed'),
  envelope('chest_opened'),
  envelope('call_completed'),
  envelope('settings_changed'),
  envelope('purchase'),
]);

export type ProgressEvent = z.infer<typeof ProgressEventSchema>;
export type ProgressEventType = ProgressEvent['type'];
export type SessionMode = z.infer<typeof SessionModeSchema>;
export const EVENT_TYPES = ProgressEventSchema.options.map((o) => o.shape.type.value);
