import { seedCourse } from '@linguapop/content';
import { describe, expect, it } from 'vitest';
import { CHEST_XP, isNovaUnlocked, learningPath, rollChestReward } from './index';

const units = seedCourse.units;
const camino = (lessonsDone: Record<string, number> = {}, chestsOpened: string[] = []) =>
  learningPath(units, { lessonsDone, chestsOpened });
const estados = (u: ReturnType<typeof camino>[number]) => u.lessons.map((l) => l.status);

describe('camino de aprendizaje', () => {
  it('con el progreso vacío solo la primera lección está por hacer', () => {
    const c = camino();
    expect(c).toHaveLength(5);
    expect(estados(c[0]!)).toEqual(['current', 'locked', 'locked']);
    expect(c[0]).toMatchObject({ unlocked: true, complete: false, chest: 'locked' });
    for (const u of c.slice(1)) {
      expect(u).toMatchObject({ unlocked: false, complete: false, chest: 'locked' });
      expect(estados(u)).toEqual(['locked', 'locked', 'locked']);
    }
  });

  it('cada lección hecha deja la siguiente por hacer', () => {
    expect(estados(camino({ 'u-saludos': 1 })[0]!)).toEqual(['done', 'current', 'locked']);
    expect(estados(camino({ 'u-saludos': 2 })[0]!)).toEqual(['done', 'done', 'current']);
  });

  it('al completar una unidad se abre la siguiente y su cofre queda listo', () => {
    const c = camino({ 'u-saludos': 3 });
    expect(estados(c[0]!)).toEqual(['done', 'done', 'done']);
    expect(c[0]).toMatchObject({ complete: true, chest: 'ready' });
    expect(c[1]).toMatchObject({ unlocked: true, complete: false });
    expect(estados(c[1]!)).toEqual(['current', 'locked', 'locked']);
    expect(c[2]!.unlocked).toBe(false);
  });

  it('el cofre abierto queda abierto y el de una unidad sin completar sigue cerrado', () => {
    const c = camino({ 'u-saludos': 3, 'u-comida': 1 }, ['u-saludos']);
    expect(c[0]!.chest).toBe('opened');
    expect(c[1]!.chest).toBe('locked');
  });

  it('una unidad completada sin haberse abierto (prueba de nivel) las deja todas hechas', () => {
    const c = camino({ 'u-saludos': 3, 'u-comida': 3, 'u-familia': 3 });
    expect(c.map((u) => u.complete)).toEqual([true, true, true, false, false]);
    expect(c.map((u) => u.chest)).toEqual(['ready', 'ready', 'ready', 'locked', 'locked']);
    expect(c[3]!.unlocked).toBe(true);
  });

  it('un contador mayor al de lecciones se trata como unidad completa', () => {
    expect(estados(camino({ 'u-saludos': 9 })[0]!)).toEqual(['done', 'done', 'done']);
  });

  it('una unidad cerrada no abre sus lecciones aunque el contador diga lo contrario', () => {
    const c = camino({ 'u-viajes': 2 });
    expect(c[3]!.unlocked).toBe(false);
    expect(estados(c[3]!)).toEqual(['locked', 'locked', 'locked']);
  });

  it('con todo hecho todas las unidades están completas', () => {
    const todo = Object.fromEntries(units.map((u) => [u.id, 3]));
    expect(camino(todo).every((u) => u.complete && u.chest === 'ready')).toBe(true);
  });
});

describe('Nova', () => {
  it('se desbloquea al terminar la primera unidad', () => {
    expect(isNovaUnlocked(units, {})).toBe(false);
    expect(isNovaUnlocked(units, { 'u-saludos': 2 })).toBe(false);
    expect(isNovaUnlocked(units, { 'u-saludos': 3 })).toBe(true);
    expect(isNovaUnlocked([], {})).toBe(false);
  });
});

describe('cofre', () => {
  it('da de 30 a 60 gemas y 20 de XP según el azar', () => {
    expect(rollChestReward({ next: () => 0 })).toEqual({ gems: 30, xp: CHEST_XP });
    expect(rollChestReward({ next: () => 0.5 })).toEqual({ gems: 45, xp: 20 });
    expect(rollChestReward({ next: () => 0.999999 })).toEqual({ gems: 60, xp: 20 });
  });

  it('con cualquier azar las gemas quedan dentro del rango', () => {
    for (let i = 0; i < 100; i++) {
      const g = rollChestReward({ next: () => i / 100 }).gems;
      expect(g).toBeGreaterThanOrEqual(30);
      expect(g).toBeLessThanOrEqual(60);
    }
  });
});
