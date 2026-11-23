import { describe, expect, it } from 'vitest';
import { audioKey } from './audio';
import { buildContent, neededAudio, planAudio, summarizeChange } from './publish';
import { seedCourse, seedPairs, seedReadings } from './seed';
import { validateContent } from './validate';

const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const input = () => ({
  course: copia(seedCourse),
  readings: copia(seedReadings),
  pairs: copia(seedPairs),
});

describe('neededAudio y planAudio', () => {
  it('lista todo lo que dice el curso y los pares, sin repetidos', () => {
    const needed = neededAudio(input());
    expect(needed.size).toBeGreaterThan(600);
    expect(needed.has(audioKey('Hello'))).toBe(true);
    expect([...needed.keys()].length).toBe(new Set(needed.keys()).size);
  });

  it('reparte entre empaquetado, ya subido y por generar', () => {
    const needed = neededAudio(input());
    const todas = [...needed.keys()].sort();
    const empaquetadas = new Set(todas.slice(0, 600));
    const subidas = new Set(todas.slice(600, 610));
    const plan = planAudio(needed, empaquetadas, subidas);
    expect(plan.bundled).toHaveLength(600);
    expect(plan.remote).toEqual(todas.slice(600));
    expect(plan.toGenerate).toEqual(todas.slice(610));
  });

  it('con todo empaquetado no hay audio remoto ni nada por generar', () => {
    const needed = neededAudio(input());
    const plan = planAudio(needed, new Set(needed.keys()), new Set());
    expect(plan.remote).toEqual([]);
    expect(plan.toGenerate).toEqual([]);
  });

  it('un par nuevo agrega sus claves por voz', () => {
    const base = neededAudio(input()).size;
    const nuevo = input();
    nuevo.pairs.push({
      id: 'pair-ship-sheep',
      a: { en: 'wolf', es: 'lobo' },
      b: { en: 'woof', es: 'guau' },
      contrast: 'i-ih',
    });
    expect(neededAudio(nuevo).size).toBe(base + 10); // 2 palabras × 5 voces
  });
});

describe('buildContent', () => {
  it('lo construido valida con el validador único, con y sin audio', () => {
    const sin = buildContent(input(), null);
    expect(sin).not.toHaveProperty('audio');
    const base = 'https://proyecto.supabase.co/storage/v1/object/public/audio/';
    const con = buildContent(input(), { baseUrl: base, keys: ['0123456789abcd'] });
    const r = validateContent({
      course: con,
      readings: con.readings,
      pairs: con.pairs,
      audio: con.audio,
    });
    expect(r.ok).toBe(true);
  });

  it('sin claves remotas no agrega el campo audio', () => {
    expect(buildContent(input(), { baseUrl: 'https://a.co/audio/', keys: [] })).not.toHaveProperty(
      'audio',
    );
  });
});

describe('summarizeChange', () => {
  const publicado = () => buildContent(input(), null);

  it('sin cambios no dice nada', () => {
    expect(summarizeChange(publicado(), publicado())).toEqual([]);
  });

  it('dice qué lecturas y pares son nuevos, cambiados y quitados', () => {
    const siguiente = buildContent(input(), null) as Record<string, any>;
    siguiente.readings[0].title = 'Otro título';
    siguiente.readings.pop();
    siguiente.pairs.push({ ...siguiente.pairs[0], id: 'pair-nuevo' });
    const lineas = summarizeChange(publicado(), siguiente);
    expect(lineas.join('\n')).toMatch(/Lecturas cambiadas: read-saludos-1/);
    expect(lineas.join('\n')).toMatch(/Lecturas quitadas:/);
    expect(lineas).toContain('Pares nuevos: pair-nuevo');
  });

  it('cuenta el audio remoto nuevo y quitado', () => {
    const a = buildContent(input(), { baseUrl: 'https://a.co/audio/', keys: ['0123456789abcd'] });
    const b = buildContent(input(), {
      baseUrl: 'https://a.co/audio/',
      keys: ['0123456789abcd', 'abcdef0123456a'],
    });
    expect(summarizeChange(a, b)).toContain('Audio remoto: 1 clips nuevos, 0 quitados');
  });

  it('un diálogo o un logro cambiado se avisa aparte', () => {
    const siguiente = buildContent(input(), null) as Record<string, any>;
    siguiente.achievements[0].name = 'Otro';
    expect(summarizeChange(publicado(), siguiente)).toContain(
      'Diálogos, logros o datos generales cambiados',
    );
  });

  it('contra un contenido ilegible lo toma como vacío', () => {
    expect(summarizeChange(null, publicado()).length).toBeGreaterThan(0);
  });
});
