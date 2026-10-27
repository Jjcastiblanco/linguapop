import { describe, expect, it } from 'vitest';
import puntuacion from '../fixtures/puntuacion.json';
import racha from '../fixtures/racha.json';
import texto from '../fixtures/texto.json';

// Casos de referencia tomados una vez de la versión heredada (linguapop.html).
// Las historias de texto, puntuación y racha comparan el dominio contra estos datos.

const ARCHIVOS = [
  ['texto', texto],
  ['puntuacion', puntuacion],
  ['racha', racha],
] as const;

describe.each(ARCHIVOS)('casos de referencia: %s', (_nombre, datos) => {
  it('indican el archivo, el commit y la suma de la versión heredada de la que salieron', () => {
    expect(datos.origen.archivo).toBe('linguapop.html');
    expect(datos.origen.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(datos.origen.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('casos de texto', () => {
  it('son al menos 60 y cubren normalización, similitud y respuestas de Nova', () => {
    const total = texto.normalizar.length + texto.similitud.length + texto.respuestasNova.length;
    expect(total).toBeGreaterThanOrEqual(60);
    expect(texto.normalizar.length).toBeGreaterThanOrEqual(25);
    expect(texto.similitud.length).toBeGreaterThanOrEqual(10);
    expect(texto.respuestasNova.length).toBeGreaterThanOrEqual(30);
  });

  it('las similitudes están entre 0 y 1', () => {
    for (const c of texto.similitud) {
      expect(c.esperado).toBeGreaterThanOrEqual(0);
      expect(c.esperado).toBeLessThanOrEqual(1);
    }
  });

  it('las respuestas de Nova incluyen aceptadas y rechazadas de varios temas', () => {
    expect(texto.respuestasNova.some((c) => c.esperado)).toBe(true);
    expect(texto.respuestasNova.some((c) => !c.esperado)).toBe(true);
    expect(new Set(texto.respuestasNova.map((c) => c.tema)).size).toBeGreaterThanOrEqual(5);
    for (const c of texto.respuestasNova) {
      expect(c.turno).toBeGreaterThanOrEqual(1);
      expect(c.turno).toBeLessThanOrEqual(8);
    }
  });
});

describe('casos de puntuación', () => {
  it('cubren todos los modos de sesión', () => {
    expect(puntuacion.escenarios.length).toBeGreaterThanOrEqual(10);
    const modos = new Set(puntuacion.escenarios.map((e) => e.sesion.mode));
    for (const modo of ['lesson', 'review', 'practice', 'timed', 'test']) {
      expect(modos.has(modo), modo).toBe(true);
    }
  });

  it('cada escenario trae su estado inicial y el esperado, y el XP nunca baja', () => {
    for (const e of puntuacion.escenarios) {
      expect(e.esperado.xp, e.nombre).toBeGreaterThanOrEqual(e.estadoInicial.xp);
      expect(e.esperado.done, e.nombre).toHaveLength(5);
    }
  });
});

describe('casos de racha', () => {
  it('son al menos 10 e incluyen el protector usado, el reinicio y el cambio de mes', () => {
    expect(racha.casos.length).toBeGreaterThanOrEqual(10);
    expect(racha.casos.some((c) => c.esperado.shield !== c.estado.shield)).toBe(true);
    expect(racha.casos.some((c) => c.esperado.streak === 1 && c.estado.streak > 1)).toBe(true);
    expect(
      racha.casos.some(
        (c) => c.hoy.slice(5, 7) !== c.estado.lastDay.slice(5, 7) && c.estado.lastDay,
      ),
    ).toBe(true);
  });

  it('la racha visible antes de actuar nunca supera la guardada', () => {
    for (const c of racha.casos)
      expect(c.rachaVisibleAntes, c.nombre).toBeLessThanOrEqual(c.estado.streak);
  });
});
