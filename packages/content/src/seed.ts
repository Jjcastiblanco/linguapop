import saludos from '../seed/units/saludos.json';
import { UnitSchema, type Unit } from './schema';

/** Contenido semilla: se valida al cargarse, así un JSON inválido falla de inmediato. */
export const seedUnits: Unit[] = [UnitSchema.parse(saludos)];
