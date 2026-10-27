import { describe, expect, it } from 'vitest';
import { seedUnits } from './seed';

// Fórmula de la versión heredada: 3 lecciones de 10 ejercicios con desfases 0, 7 y 14.
const DESFASES = [0, 7, 14];

describe('semilla: unidad Saludos', () => {
  const saludos = seedUnits.find((u) => u.id === 'u-saludos');

  it('existe y tiene 20 ejercicios con los seis tipos', () => {
    expect(saludos).toBeDefined();
    expect(saludos!.exercises).toHaveLength(20);
    const tipos = new Set(saludos!.exercises.map((e) => e.type));
    expect([...tipos].sort()).toEqual(['listen', 'match', 'mc', 'order', 'speak', 'write']);
  });

  it('tiene 3 lecciones de 10 ejercicios iguales a las de la versión heredada', () => {
    const ids = saludos!.exercises.map((e) => e.id);
    expect(saludos!.lessons).toHaveLength(3);
    saludos!.lessons.forEach((leccion, j) => {
      const esperado = Array.from({ length: 10 }, (_, n) => ids[(DESFASES[j]! + n) % ids.length]);
      expect(leccion.exerciseIds).toEqual(esperado);
    });
  });

  it('conserva datos de la unidad y vocabulario de ejemplo', () => {
    expect(saludos!.name).toBe('Saludos');
    const primero = saludos!.exercises[0]!;
    expect(primero.type).toBe('mc');
    if (primero.type === 'mc') {
      expect(primero.options[primero.answerIndex]!.text).toBe('Hello');
    }
  });
});
