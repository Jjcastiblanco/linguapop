import { describe, expect, it } from 'vitest';
import { audioKey, collectPairTexts, collectSpokenTexts } from './audio';
import { READING_MIN_COVERAGE } from './reading';
import { seedCourse, seedPairs, seedReadings } from './seed';
import { RESERVED_EXERCISE_PREFIXES, validateContent } from './validate';

const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const semilla = () => ({
  course: copia(seedCourse),
  readings: copia(seedReadings),
  pairs: copia(seedPairs),
});
const problemas = (
  input: ReturnType<typeof semilla>,
  options?: Parameters<typeof validateContent>[1],
) => {
  const r = validateContent(input, options);
  return r.ok ? [] : r.problems;
};

describe('validateContent', () => {
  it('la semilla completa valida y devuelve el contenido tipado', () => {
    const r = validateContent(semilla());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content.readings).toHaveLength(seedReadings.length);
      expect(r.content.pairs).toHaveLength(seedPairs.length);
    }
  });

  it('lecturas y pares son opcionales: un curso solo también valida', () => {
    expect(validateContent({ course: copia(seedCourse) }).ok).toBe(true);
  });

  it('un curso inválido, lecturas inválidas y pares inválidos se reportan cada uno con su código', () => {
    const input = semilla();
    (input.course as { units: unknown[] }).units = [];
    input.readings = [{ ...input.readings[0]!, lines: ['una sola línea'] }];
    input.pairs = [{ ...input.pairs[0]!, b: input.pairs[0]!.a }];
    const codes = new Set(problemas(input).map((p) => p.code));
    expect(codes).toEqual(new Set(['course-schema', 'readings-schema', 'pairs-schema']));
  });

  it('una lectura con palabras sin enseñar dice cuáles y dónde', () => {
    const input = semilla();
    input.readings[0]!.lines[0] = 'Hello zebra giraffe okapi';
    const [p] = problemas(input);
    expect(p).toMatchObject({ code: 'reading-coverage', where: input.readings[0]!.id });
    expect(p!.message).toContain('zebra, giraffe, okapi');
    expect(p!.message).toContain(`${READING_MIN_COVERAGE * 100} %`);
  });

  it('una lectura de una unidad que no está en el curso se reporta', () => {
    const input = semilla();
    input.readings[0]!.unitId = 'u-inventada';
    expect(problemas(input)).toEqual([
      expect.objectContaining({ code: 'reading-unit', where: input.readings[0]!.id }),
    ]);
  });

  it('un id de lectura o de par repetido lo rechaza el esquema', () => {
    const input = semilla();
    input.readings.push(copia(input.readings[0]!));
    input.pairs.push(copia(input.pairs[0]!));
    expect(new Set(problemas(input).map((p) => p.code))).toEqual(
      new Set(['readings-schema', 'pairs-schema']),
    );
  });

  it.each(RESERVED_EXERCISE_PREFIXES)(
    'un ejercicio cuyo id empieza por «%s» está reservado y se rechaza',
    (prefijo) => {
      const nuevo = `${prefijo}saludos`;
      const renombrar = <T>(x: T): T =>
        JSON.parse(JSON.stringify(x).replaceAll('u-saludos', nuevo)) as T;
      const input = { course: renombrar(seedCourse), readings: renombrar(seedReadings) };
      const r = validateContent(input);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        const reservados = r.problems.filter((p) => p.code === 'reserved-prefix');
        expect(reservados.length).toBeGreaterThan(10);
        expect(reservados[0]!.message).toContain(prefijo);
        expect(reservados[0]!.where.startsWith(nuevo)).toBe(true);
      }
    },
  );

  it('sin claves de audio no se comprueba el audio; con ellas, lo que falta se reporta', () => {
    expect(problemas(semilla())).toEqual([]);
    const faltan = problemas(semilla(), { audioKeys: new Set() });
    expect(faltan.length).toBeGreaterThan(300);
    expect(new Set(faltan.map((p) => p.code))).toEqual(new Set(['audio-missing']));
  });

  it('con todas las claves de lo que se dice el audio no falta', () => {
    const claves = new Set(
      [...collectSpokenTexts(seedCourse.units), ...collectPairTexts(seedPairs)].map((x) =>
        audioKey(x.text, x.speed, x.voice),
      ),
    );
    expect(problemas(semilla(), { audioKeys: claves })).toEqual([]);
  });

  it('un par nuevo sin grabación en alguna voz se reporta por palabra', () => {
    const input = semilla();
    input.pairs.push({
      id: 'pair-zebra-cebra',
      a: { en: 'zebra', es: 'cebra' },
      b: { en: 'zeal', es: 'celo' },
      contrast: 'b-v',
    });
    const r = validateContent(input, { audioKeys: new Set() });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const zebra = r.problems.filter((p) => p.where === 'audio: zebra');
      // una grabación por voz, y cada mensaje dice cuál falta
      expect(zebra).toHaveLength(5);
      expect(new Set(zebra.map((p) => p.message)).size).toBe(5);
    }
  });

  it('un defecto de esquema no esconde los demás: se reportan juntos con su ubicación', () => {
    const input = semilla();
    input.pairs = [{ ...input.pairs[0]!, b: input.pairs[0]!.a }];
    input.readings[0]!.lines[0] = 'Hello zebra giraffe okapi';
    const ps = problemas(input);
    expect(new Set(ps.map((p) => p.code))).toEqual(new Set(['pairs-schema', 'reading-coverage']));
    expect(ps.find((p) => p.code === 'pairs-schema')!.where).toBe(
      `pairs.${input.pairs[0]!.id}.b.en`,
    );
  });

  it('los defectos de esquema de las lecturas nombran la lectura y no solo su posición', () => {
    const input = semilla();
    input.readings[1] = { ...input.readings[1]!, lines: ['solo una'] };
    const ps = problemas(input);
    expect(ps[0]!.where.startsWith(`readings.${input.readings[1]!.id}.`)).toBe(true);
  });

  it('el 95 % exacto pasa y un poco menos no', () => {
    const exacto = semilla();
    // 20 palabras en total, una sin enseñar: justo 95 %
    exacto.readings = [
      {
        ...exacto.readings[0]!,
        lines: [
          'Hello hello hello hello hello',
          'Hello hello hello hello hello',
          'Hello hello hello hello hello',
          'Hello hello hello hello zebra',
        ],
        questions: exacto.readings[0]!.questions.map((q) => ({ ...q, line: 0 })),
      },
    ];
    expect(problemas(exacto)).toEqual([]);
    const menos = copia(exacto);
    menos.readings[0]!.lines[2] = 'Hello hello hello hello giraffe';
    expect(problemas(menos).map((p) => p.code)).toEqual(['reading-coverage']);
    expect(problemas(menos)[0]!.message).toContain('90.0 %');
  });
});

describe('audio remoto en el contenido', () => {
  const audio = (cambio: Record<string, unknown> = {}) => ({
    baseUrl: 'https://proyecto.supabase.co/storage/v1/object/public/audio/',
    keys: ['0123456789abcd', 'abcdef0123456'],
    ...cambio,
  });

  it('es opcional: sin él no hay campo en el resultado', () => {
    const r = validateContent(semilla());
    expect(r.ok && 'audio' in r.content).toBe(false);
  });

  it('un audio válido pasa y se devuelve tipado', () => {
    const r = validateContent({ ...semilla(), audio: audio() });
    expect(r.ok && r.content.audio?.keys).toHaveLength(2);
  });

  it('rechaza direcciones que no son https con barra final y sin credenciales ni parámetros', () => {
    for (const baseUrl of [
      'http://proyecto.supabase.co/audio/',
      'https://proyecto.supabase.co/audio',
      'https://usuario:clave@proyecto.supabase.co/audio/',
      'https://proyecto.supabase.co/audio/?x=1',
      'https://proyecto.supabase.co/audio/#a',
      'javascript:alert(1)//',
      'https://a..b/audio/',
      'https://proyecto.supabase.co:99999/audio/',
      'https://proyecto.supabase.co/../audio/',
      'https://proyecto.supabase.co/%2e%2e/audio/',
      'https://proyecto.supabase.co/./audio/',
      '/audio/',
      '',
    ]) {
      const p = problemas({ ...semilla(), audio: audio({ baseUrl }) } as never);
      expect(
        p.map((x) => x.code),
        baseUrl,
      ).toContain('audio-schema');
    }
  });

  it('rechaza claves que no son una huella, repetidas o en exceso', () => {
    for (const keys of [
      ['../x'],
      ['0123456789ABCD'],
      ['abc'],
      ['0123456789abcd', '0123456789abcd'],
    ]) {
      const p = problemas({ ...semilla(), audio: audio({ keys }) } as never);
      expect(
        p.map((x) => x.code),
        keys.join(),
      ).toContain('audio-schema');
    }
  });
});
