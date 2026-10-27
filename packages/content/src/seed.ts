import achievements from '../seed/achievements.json';
import tPedirComida from '../seed/dialogues/t-pedir-comida.json';
import tHablarDeLaFamilia from '../seed/dialogues/t-hablar-de-la-familia.json';
import tHablarDelTrabajo from '../seed/dialogues/t-hablar-del-trabajo.json';
import tPlanearUnViaje from '../seed/dialogues/t-planear-un-viaje.json';
import tPresentarse from '../seed/dialogues/t-presentarse.json';
import comida from '../seed/units/comida.json';
import familia from '../seed/units/familia.json';
import saludos from '../seed/units/saludos.json';
import trabajo from '../seed/units/trabajo.json';
import viajes from '../seed/units/viajes.json';
import {
  AchievementSchema,
  CourseSchema,
  DialogueTopicSchema,
  UnitSchema,
  type Achievement,
  type Course,
  type DialogueTopic,
  type Unit,
} from './schema';

/**
 * Contenido semilla: se valida al cargarse, así un JSON inválido falla de inmediato.
 * El orden es el del camino de aprendizaje.
 */
export const seedUnits: Unit[] = [saludos, comida, familia, viajes, trabajo].map((u) =>
  UnitSchema.parse(u),
);

export const seedDialogues: DialogueTopic[] = [
  tPresentarse,
  tPedirComida,
  tHablarDeLaFamilia,
  tPlanearUnViaje,
  tHablarDelTrabajo,
].map((d) => DialogueTopicSchema.parse(d));

export const seedAchievements: Achievement[] = achievements.map((a) => AchievementSchema.parse(a));

/** El curso completo (español a inglés, A1–A2) validado, con todas sus referencias cruzadas. */
export const seedCourse: Course = CourseSchema.parse({
  schemaVersion: 1,
  from: 'es',
  to: 'en',
  level: 'A1-A2',
  units: seedUnits,
  dialogues: seedDialogues,
  achievements: seedAchievements,
});
