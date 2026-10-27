import { describe, expect, it } from 'vitest';
import puntuacion from '../../fixtures/puntuacion.json';
import { ProgressEventSchema } from '../events';
import { applyEvent, foldEvents, parseKnownEvents } from './fold';
import { MAX_HEARTS, PRICES, currentHearts, initialProgress, type ProgressState } from './state';
import { TEST_CONTEXT as ctx, UNIT_IDS, evento, sesion } from './test-support';

const HOY = '2026-10-27';

// ---------- Escenarios de referencia de la versión heredada ----------

type Escenario = (typeof puntuacion.escenarios)[number];

function estadoDesde(e: Escenario['estadoInicial']): ProgressState {
  const base = initialProgress();
  return {
    ...base,
    xp: e.xp,
    gems: e.gems,
    settings: { ...base.settings, plan: e.pro ? 'pro' : 'free', dailyGoalXp: e.goal },
    lessonsDone: Object.fromEntries(UNIT_IDS.map((id, i) => [id, e.done[i] ?? 0])),
    stats: { ...base.stats, ...e.stats },
    achievements: Object.fromEntries((e.ach as string[]).map((a) => [a, 'antes'])),
    streak: { streak: e.streak, best: e.best, lastDay: e.lastDay, shieldMonth: e.shield },
    xpByDay: e.xpHoy ? { [HOY]: e.xpHoy } : {},
  };
}

function eventoDesde(s: Escenario['sesion']) {
  const usaUnidad = s.mode === 'lesson' || s.mode === 'test';
  return sesion({
    mode: s.mode as 'lesson' | 'review' | 'practice' | 'timed' | 'test',
    ...(usaUnidad ? { unitId: UNIT_IDS[s.unit] } : {}),
    ...(s.mode === 'lesson' ? { lessonId: `${UNIT_IDS[s.unit]}-l${s.lesson + 1}` } : {}),
    correct: s.correct,
    wrong: s.wrong,
    answered: s.answered,
    outOfHearts: s.outOfHearts,
  });
}

describe('pliegue: escenarios de referencia de la versión heredada', () => {
  it.each(puntuacion.escenarios)('$nombre', (e) => {
    const resultado = foldEvents([eventoDesde(e.sesion)], ctx, {
      initial: estadoDesde(e.estadoInicial),
    });
    expect(resultado.xp).toBe(e.esperado.xp);
    expect(resultado.gems).toBe(e.esperado.gems);
    expect(UNIT_IDS.map((id) => resultado.lessonsDone[id] ?? 0)).toEqual(e.esperado.done);
    expect({
      lessons: resultado.stats.lessons,
      correct: resultado.stats.correct,
      total: resultado.stats.total,
      perfect: resultado.stats.perfect,
      timedBest: resultado.stats.timedBest,
    }).toEqual(e.esperado.stats);
    expect(Object.keys(resultado.achievements).sort()).toEqual(e.esperado.ach);
    expect(resultado.streak).toEqual({
      streak: e.esperado.streak,
      best: e.esperado.best,
      lastDay: e.esperado.lastDay,
      shieldMonth: e.esperado.shield,
    });
  });
});

// ---------- Idempotencia, orden y eventos desconocidos ----------

describe('pliegue: idempotencia y orden', () => {
  const lecciones = [
    sesion(
      {
        mode: 'lesson',
        unitId: 'u-saludos',
        lessonId: 'u-saludos-l1',
        correct: 10,
        wrong: 0,
        answered: 10,
      },
      '2026-10-27T10:00:00.000Z',
    ),
    sesion(
      {
        mode: 'lesson',
        unitId: 'u-saludos',
        lessonId: 'u-saludos-l2',
        correct: 8,
        wrong: 2,
        answered: 10,
      },
      '2026-10-27T11:00:00.000Z',
    ),
    sesion(
      {
        mode: 'lesson',
        unitId: 'u-saludos',
        lessonId: 'u-saludos-l3',
        correct: 9,
        wrong: 1,
        answered: 10,
      },
      '2026-10-28T09:00:00.000Z',
    ),
  ];

  it('un id repetido cuenta una sola vez', () => {
    const una = foldEvents(lecciones, ctx);
    const repetidas = foldEvents([...lecciones, lecciones[0]!, lecciones[1]!, lecciones[0]!], ctx);
    expect(repetidas).toEqual(una);
    expect(una.xp).toBeGreaterThan(0);
  });

  it('no depende del orden de llegada', () => {
    const ordenado = foldEvents(lecciones, ctx);
    expect(foldEvents([...lecciones].reverse(), ctx)).toEqual(ordenado);
    expect(foldEvents([lecciones[1]!, lecciones[2]!, lecciones[0]!], ctx)).toEqual(ordenado);
  });

  it('eventos con la misma fecha se ordenan por id, siempre igual', () => {
    const a = evento(
      'purchase@1',
      { item: 'hearts', costGems: 30 },
      '2026-10-27T12:00:00.000Z',
      '00000000-0000-4000-8000-0000000000aa',
    );
    const b = sesion(
      { mode: 'practice', correct: 5, wrong: 0, answered: 5 },
      '2026-10-27T12:00:00.000Z',
    );
    expect(foldEvents([a, b], ctx)).toEqual(foldEvents([b, a], ctx));
  });

  it('el estado desde cero es el mismo que plegar en dos tramos', () => {
    const entero = foldEvents(lecciones, ctx);
    const parcial = foldEvents(lecciones.slice(0, 2), ctx);
    const resto = foldEvents(lecciones.slice(2), ctx, { initial: parcial });
    expect(resto).toEqual(entero);
  });

  it('los eventos rechazados por el servidor no cuentan', () => {
    const rechazado = new Set([lecciones[1]!.id]);
    const resultado = foldEvents(lecciones, ctx, { rejectedIds: rechazado });
    expect(resultado.lessonsDone['u-saludos']).toBe(1); // la 3 ya no es la siguiente sin la 2
    expect(resultado.stats.correct).toBe(19); // 10 de la lección 1 y 9 de la 3, sin los 8 rechazados
  });

  it('un cliente ignora los eventos de tipos o versiones que no conoce', () => {
    const valido = lecciones[0]!;
    const ajenos = [
      {
        ...valido,
        id: '00000000-0000-4000-8000-0000000000b1',
        type: 'level_up@1',
        payload: { level: 2 },
      },
      { ...valido, id: '00000000-0000-4000-8000-0000000000b2', type: 'purchase@2', payload: {} },
      'basura',
      null,
    ];
    const conocidos = parseKnownEvents([valido, ...ajenos]);
    expect(conocidos).toHaveLength(1);
    expect(ProgressEventSchema.safeParse(conocidos[0]).success).toBe(true);
  });

  it('plegar nunca modifica el estado recibido', () => {
    const inicial = initialProgress();
    const copia = JSON.parse(JSON.stringify(inicial)) as typeof inicial;
    foldEvents(lecciones, ctx, { initial: inicial });
    expect(inicial).toEqual(copia);
  });
});

// ---------- Progreso de lecciones y unidades ----------

describe('pliegue: lecciones y unidades', () => {
  it('una lección solo avanza si es la siguiente; repetirla no avanza ni da gemas', () => {
    let s = foldEvents(
      [
        sesion({
          mode: 'lesson',
          unitId: 'u-saludos',
          lessonId: 'u-saludos-l1',
          correct: 10,
          wrong: 0,
          answered: 10,
        }),
      ],
      ctx,
    );
    expect(s.lessonsDone['u-saludos']).toBe(1);
    const gemasAntes = s.gems;
    s = applyEvent(
      s,
      sesion(
        {
          mode: 'lesson',
          unitId: 'u-saludos',
          lessonId: 'u-saludos-l1',
          correct: 10,
          wrong: 0,
          answered: 10,
        },
        '2026-10-27T13:00:00.000Z',
      ),
      ctx,
    );
    expect(s.lessonsDone['u-saludos']).toBe(1);
    expect(s.gems).toBeGreaterThanOrEqual(gemasAntes); // solo bonos de logros, nunca el premio de la lección
    s = applyEvent(
      s,
      sesion(
        {
          mode: 'lesson',
          unitId: 'u-saludos',
          lessonId: 'u-saludos-l3',
          correct: 10,
          wrong: 0,
          answered: 10,
        },
        '2026-10-27T14:00:00.000Z',
      ),
      ctx,
    );
    expect(s.lessonsDone['u-saludos']).toBe(1); // saltarse la 2 no cuenta
  });

  it('una prueba de nivel aprobada completa todas las unidades hasta la elegida', () => {
    const s = foldEvents(
      [sesion({ mode: 'test', unitId: 'u-familia', correct: 11, wrong: 1, answered: 12 })],
      ctx,
    );
    expect(UNIT_IDS.map((id) => s.lessonsDone[id] ?? 0)).toEqual([3, 3, 3, 0, 0]);
  });

  it('el cofre se abre una vez y solo con la unidad completa', () => {
    const cofre = (at: string) =>
      evento('chest_opened@1', { unitId: 'u-saludos', gems: 40, xp: 20 }, at);
    const sinCompletar = foldEvents([cofre('2026-10-27T10:00:00.000Z')], ctx);
    expect(sinCompletar.chestsOpened).toEqual([]);
    expect(sinCompletar.gems).toBe(50);

    const completa = estadoDesde({
      ...puntuacion.escenarios[0]!.estadoInicial,
      done: [3, 0, 0, 0, 0],
    });
    const una = foldEvents([cofre('2026-10-27T10:00:00.000Z')], ctx, { initial: completa });
    expect(una.chestsOpened).toEqual(['u-saludos']);
    expect(una.gems).toBeGreaterThanOrEqual(90);
    expect(una.xp).toBe(20);
    expect(una.streak.streak).toBe(0); // abrir un cofre no cuenta como actividad de racha
    const dos = foldEvents(
      [cofre('2026-10-27T10:00:00.000Z'), cofre('2026-10-27T11:00:00.000Z')],
      ctx,
      { initial: completa },
    );
    expect(dos.xp).toBe(20);
  });
});

// ---------- Errores, palabras y vidas ----------

describe('pliegue: errores, palabras y vidas', () => {
  const resp = (
    exerciseId: string,
    correct: boolean,
    mode: 'lesson' | 'review' | 'timed' = 'lesson',
    extra: { skipped?: boolean } = {},
    at = '2026-10-27T10:00:00.000Z',
  ) => evento('exercise_answered@1', { exerciseId, correct, mode, ...extra }, at);

  it('un fallo agrega el ejercicio al repaso y suma su debilidad', () => {
    const s = foldEvents(
      [
        resp('u-saludos-e03', false),
        resp('u-saludos-e03', false, 'lesson', {}, '2026-10-27T10:01:00.000Z'),
      ],
      ctx,
    );
    expect(s.errors).toEqual(['u-saludos-e03']);
    expect(s.weak['u-saludos-e03']).toBe(2);
  });

  it('acertar en el repaso lo quita; acertar en una lección no', () => {
    const fallo = resp('u-saludos-e03', false);
    expect(
      foldEvents(
        [fallo, resp('u-saludos-e03', true, 'lesson', {}, '2026-10-27T10:05:00.000Z')],
        ctx,
      ).errors,
    ).toEqual(['u-saludos-e03']);
    const repasado = foldEvents(
      [fallo, resp('u-saludos-e03', true, 'review', {}, '2026-10-27T10:05:00.000Z')],
      ctx,
    );
    expect(repasado.errors).toEqual([]);
    expect(repasado.weak['u-saludos-e03']).toBe(1); // la debilidad histórica se conserva
  });

  it('un ejercicio omitido no cambia nada', () => {
    const s = foldEvents([resp('u-saludos-e03', false, 'lesson', { skipped: true })], ctx);
    expect(s.errors).toEqual([]);
    expect(s.weak).toEqual({});
  });

  it('los ejercicios de palabra (w-) van a las palabras a mejorar y salen al acertar en repaso', () => {
    const s = foldEvents(
      [resp('w-cheese', false), resp('w-cheese', false, 'lesson', {}, '2026-10-27T10:01:00.000Z')],
      ctx,
    );
    expect(s.words).toEqual({ cheese: 2 });
    expect(s.errors).toEqual([]);
    const limpio = applyEvent(
      s,
      resp('w-cheese', true, 'review', {}, '2026-10-27T10:09:00.000Z'),
      ctx,
    );
    expect(limpio.words).toEqual({});
  });

  it('el repaso pendiente tiene un tope de 200', () => {
    const muchos = Array.from({ length: 205 }, (_, i) =>
      resp(
        `u-saludos-e${i}`,
        false,
        'lesson',
        {},
        `2026-10-27T10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`,
      ),
    );
    expect(foldEvents(muchos, ctx).errors).toHaveLength(200);
  });

  it('en el plan gratis cada fallo quita una vida, salvo en el desafío; en PRO no', () => {
    const gratis = evento('settings_changed@1', { plan: 'free' }, '2026-10-27T09:00:00.000Z');
    const s = foldEvents(
      [
        gratis,
        resp('u-saludos-e01', false),
        resp('u-saludos-e02', false, 'lesson', {}, '2026-10-27T10:01:00.000Z'),
        resp('u-saludos-e04', false, 'timed', {}, '2026-10-27T10:02:00.000Z'),
      ],
      ctx,
    );
    expect(s.hearts).toBe(MAX_HEARTS - 2);
    const pro = foldEvents([resp('u-saludos-e01', false)], ctx);
    expect(pro.hearts).toBe(MAX_HEARTS);
  });

  it('las vidas nunca bajan de 0 y se recargan al empezar un día nuevo', () => {
    const gratis = evento('settings_changed@1', { plan: 'free' }, '2026-10-27T09:00:00.000Z');
    const fallos = Array.from({ length: 7 }, (_, i) =>
      resp(`u-saludos-e0${i}`, false, 'lesson', {}, `2026-10-27T10:0${i}:00.000Z`),
    );
    const s = foldEvents([gratis, ...fallos], ctx);
    expect(s.hearts).toBe(0);
    expect(currentHearts(s, '2026-10-27')).toBe(0);
    expect(currentHearts(s, '2026-10-28')).toBe(MAX_HEARTS);
    const otroDia = applyEvent(
      s,
      resp('u-saludos-e09', false, 'lesson', {}, '2026-10-28T10:00:00.000Z'),
      ctx,
    );
    expect(otroDia.hearts).toBe(MAX_HEARTS - 1);
  });
});

// ---------- Llamadas ----------

describe('pliegue: llamadas con Nova', () => {
  const llamada = (
    p: Partial<{
      firstTry: number;
      later: number;
      gaveUp: number;
      completed: boolean;
      durationSec: number;
      aiExchanges: number;
      weakWords: string[];
    }> = {},
  ) =>
    evento('call_completed@1', {
      topicId: 't-presentarse',
      durationSec: 200,
      completed: true,
      firstTry: 5,
      later: 2,
      gaveUp: 1,
      weakWords: ['thank', 'fine'],
      aiExchanges: 0,
      ...p,
    });

  it('da XP por respuestas y por completar, cuenta la llamada y suma las palabras', () => {
    const s = foldEvents([llamada()], ctx);
    expect(s.xp).toBe(5 * 15 + 2 * 8 + 20);
    expect(s.stats.calls).toBe(1);
    expect(s.stats.callSeconds).toBe(200);
    expect(s.words).toEqual({ thank: 1, fine: 1 });
    expect(s.streak.streak).toBe(1);
    expect(s.achievements['nova']).toBeDefined();
  });

  it('colgar pronto y sin respuestas no cuenta como llamada', () => {
    const s = foldEvents(
      [
        llamada({
          firstTry: 0,
          later: 0,
          gaveUp: 0,
          completed: false,
          durationSec: 10,
          weakWords: [],
        }),
      ],
      ctx,
    );
    expect(s.stats.calls).toBe(0);
    expect(s.xp).toBe(0);
  });

  it('con IA da 12 de XP por intercambio', () => {
    const s = foldEvents(
      [llamada({ aiExchanges: 6, firstTry: 0, later: 0, gaveUp: 0, weakWords: [] })],
      ctx,
    );
    expect(s.xp).toBe(6 * 12 + 20);
  });
});

// ---------- Ajustes, metas y logros ----------

describe('pliegue: ajustes, meta diaria y logros', () => {
  const lec = (at: string, lessonId = 'u-saludos-l1') =>
    sesion(
      { mode: 'lesson', unitId: 'u-saludos', lessonId, correct: 10, wrong: 0, answered: 10 },
      at,
    );

  it('la meta diaria cambia cuándo se paga el bono', () => {
    const meta20 = foldEvents(
      [
        evento('settings_changed@1', { dailyGoalXp: 20 }, '2026-10-27T09:00:00.000Z'),
        lec('2026-10-27T10:00:00.000Z'),
      ],
      ctx,
    );
    const meta1000 = foldEvents(
      [
        evento('settings_changed@1', { dailyGoalXp: 1000 }, '2026-10-27T09:00:00.000Z'),
        lec('2026-10-27T10:00:00.000Z'),
      ],
      ctx,
    );
    expect(meta20.gems - meta1000.gems).toBe(10 + 5); // bono de meta y el logro 'goal'
    expect(meta20.achievements['goal']).toBeDefined();
    expect(meta1000.achievements['goal']).toBeUndefined();
  });

  it('el bono de meta se paga una sola vez al día', () => {
    const una = foldEvents([lec('2026-10-27T10:00:00.000Z', 'u-saludos-l1')], ctx);
    const dos = applyEvent(una, lec('2026-10-27T11:00:00.000Z', 'u-saludos-l2'), ctx);
    expect(una.xpByDay[HOY]).toBe(120);
    expect(dos.xpByDay[HOY]).toBe(240);
    expect(dos.gems - una.gems).toBe(10); // solo el premio de la lección: sin segundo bono de meta
  });

  it('el día depende de la zona horaria del usuario', () => {
    const tarde = '2026-10-28T02:30:00.000Z'; // 27 a las 21:30 en Bogotá
    const bogota = foldEvents(
      [
        evento('settings_changed@1', { timeZone: 'America/Bogota' }, '2026-10-27T09:00:00.000Z'),
        lec(tarde),
      ],
      ctx,
    );
    expect(bogota.streak.lastDay).toBe('2026-10-27');
    const utc = foldEvents([lec(tarde)], ctx);
    expect(utc.streak.lastDay).toBe('2026-10-28');
  });

  it('el plan gratis desactiva el protector de racha', () => {
    const base = {
      ...initialProgress(),
      streak: { streak: 4, best: 4, lastDay: '2026-10-25', shieldMonth: '' },
    };
    const pro = foldEvents([lec('2026-10-27T10:00:00.000Z')], ctx, { initial: base });
    expect(pro.streak.streak).toBe(5);
    const gratis = foldEvents(
      [
        evento('settings_changed@1', { plan: 'free' }, '2026-10-27T09:00:00.000Z'),
        lec('2026-10-27T10:00:00.000Z'),
      ],
      ctx,
      { initial: base },
    );
    expect(gratis.streak.streak).toBe(1);
  });

  it('los bonos de logros pueden encadenar el siguiente logro en el mismo evento', () => {
    const casi = { ...initialProgress(), gems: 190 };
    const s = foldEvents([sesion({ mode: 'practice', correct: 10, wrong: 0, answered: 10 })], ctx, {
      initial: casi,
    });
    // 190 + 2 (práctica) + 5 (first) = 197; el logro 'goal' suma 5 más: 202 desbloquea 'gems200'
    expect(s.achievements['gems200']).toBeDefined();
  });

  it('un logro desbloqueado no se paga dos veces', () => {
    const s = foldEvents(
      [lec('2026-10-27T10:00:00.000Z'), lec('2026-10-27T11:00:00.000Z', 'u-saludos-l2')],
      ctx,
    );
    const claves = Object.keys(s.achievements);
    expect(new Set(claves).size).toBe(claves.length);
    expect(s.achievements['first']).toBe('2026-10-27T10:00:00.000Z');
  });
});

// ---------- Tienda de gemas ----------

describe('pliegue: tienda de gemas', () => {
  const comprar = (
    item: 'hearts' | 'streak_shield',
    costGems: number,
    at = '2026-10-27T12:00:00.000Z',
  ) => evento('purchase@1', { item, costGems }, at);
  const gratisSinVidas = (): ProgressState => ({
    ...initialProgress(),
    gems: 100,
    hearts: 1,
    heartsDay: HOY,
    settings: { ...initialProgress().settings, plan: 'free' },
  });

  it('recargar vidas cuesta 30 gemas y las deja en 5', () => {
    const s = foldEvents([comprar('hearts', PRICES.hearts)], ctx, { initial: gratisSinVidas() });
    expect(s.hearts).toBe(MAX_HEARTS);
    expect(s.gems).toBe(70);
  });

  it('no cobra si ya tiene todas las vidas, si faltan gemas o si el precio no coincide', () => {
    const llenas = { ...gratisSinVidas(), hearts: MAX_HEARTS };
    expect(foldEvents([comprar('hearts', 30)], ctx, { initial: llenas }).gems).toBe(100);
    const pobre = { ...gratisSinVidas(), gems: 10 };
    expect(foldEvents([comprar('hearts', 30)], ctx, { initial: pobre }).hearts).toBe(1);
    expect(foldEvents([comprar('hearts', 1)], ctx, { initial: gratisSinVidas() }).hearts).toBe(1);
  });

  it('el protector extra solo se repone si ya se usó este mes', () => {
    const usado = {
      ...initialProgress(),
      gems: 100,
      streak: { streak: 3, best: 3, lastDay: HOY, shieldMonth: '2026-10' },
    };
    const repuesto = foldEvents([comprar('streak_shield', PRICES.streak_shield)], ctx, {
      initial: usado,
    });
    expect(repuesto.streak.shieldMonth).toBe('');
    expect(repuesto.gems).toBe(40);
    const sinUsar = { ...usado, streak: { ...usado.streak, shieldMonth: '' } };
    expect(foldEvents([comprar('streak_shield', 60)], ctx, { initial: sinUsar }).gems).toBe(100);
    const mesAnterior = { ...usado, streak: { ...usado.streak, shieldMonth: '2026-09' } };
    expect(foldEvents([comprar('streak_shield', 60)], ctx, { initial: mesAnterior }).gems).toBe(
      100,
    );
  });

  it('comprar la misma vez dos veces (id repetido) cobra una sola', () => {
    const compra = comprar('hearts', 30);
    const s = foldEvents([compra, compra], ctx, { initial: gratisSinVidas() });
    expect(s.gems).toBe(70);
  });
});
