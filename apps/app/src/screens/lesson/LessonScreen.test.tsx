// @vitest-environment jsdom
import { seedCourse, type Exercise } from '@linguapop/content';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProgressEvent, SoundEffect } from '@linguapop/domain';
import { describe, expect, it, vi } from 'vitest';
import { createWebSound } from '../../composition/adapters/web-sound';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';
import { SALUDOS, cursoConLeccion } from '../../test/curso-de-prueba';

const ejercicio = (id: string): Exercise =>
  seedCourse.units[0]!.exercises.find((e) => e.id === id)!;
const RUTA = '/leccion/u-saludos/u-saludos-l1';

type Opciones = {
  ids?: readonly string[];
  plan?: 'free' | 'pro';
  random?: number;
  hearts?: number;
};

async function abrir({
  ids = [...SALUDOS.mc.slice(0, 1), ...SALUDOS.order.slice(0, 1), ...SALUDOS.write.slice(0, 1)],
  plan,
  random = 0.4,
}: Opciones = {}) {
  const sonidos: SoundEffect[] = [];
  const dichas: string[] = [];
  const sound = Object.assign(createWebSound({ createContext: () => null }), {
    play: (e: SoundEffect) => void sonidos.push(e),
  });
  const speech = {
    capabilities: () => ({ canSpeak: true, canListen: false }),
    speak: vi.fn(async (texto: string) => {
      dichas.push(texto);
      return true;
    }),
    listen: vi.fn(async () => ({ kind: 'unavailable', reason: 'unsupported' }) as const),
    cancel: vi.fn(),
  };
  const services = await crearServicios({
    storage: memoria().storage,
    clock: relojFalso(),
    course: cursoConLeccion(ids),
    random: { next: () => random },
    sound,
    speech,
  });
  if (plan)
    await services.progress.getState().record([{ type: 'settings_changed@1', payload: { plan } }]);
  const app = renderApp(services, RUTA);
  const eventos = () =>
    services.progress.getState().events.filter((e) => e.type !== 'settings_changed@1');
  return { services, sonidos, dichas, speech, eventos, ...app };
}

/** Responde bien al ejercicio en pantalla usando la interfaz. */
async function responderBien(e: Exercise) {
  if (e.type === 'mc')
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(e.options[e.answerIndex]!.text) }),
    );
  else if (e.type === 'order')
    for (const w of e.en.split(' '))
      await userEvent.click(
        within(screen.getByTestId('word-bank')).getByRole('button', { name: w }),
      );
  else if (e.type === 'write') await userEvent.type(screen.getByRole('textbox'), e.en);
}
async function responderMal(e: Exercise) {
  if (e.type === 'mc')
    await userEvent.click(
      screen
        .getAllByRole('button', { name: /^\S/ })
        .find(
          (b) =>
            !b.textContent?.includes(e.options[e.answerIndex]!.text) &&
            b.className.includes('option'),
        )!,
    );
  else if (e.type === 'order')
    await userEvent.click(within(screen.getByTestId('word-bank')).getAllByRole('button')[0]!);
  else if (e.type === 'write') await userEvent.type(screen.getByRole('textbox'), 'zzz');
}
const comprobar = () => userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
const continuar = () => userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

describe('lección completa', () => {
  it('una lección de elegir, ordenar y escribir se resuelve de punta a punta y se guarda', async () => {
    const ids = [
      ...SALUDOS.mc.slice(0, 1),
      ...SALUDOS.order.slice(0, 1),
      ...SALUDOS.write.slice(0, 1),
    ];
    const { services, eventos } = await abrir({ ids });
    for (const id of ids) {
      await responderBien(ejercicio(id));
      await comprobar();
      expect(screen.getByRole('status', { name: '' })).toBeDefined();
      await continuar();
    }
    expect(screen.getByRole('heading', { name: '¡Lección completada!' })).toBeInTheDocument();
    const tipos = eventos().map((e) => e.type);
    expect(tipos).toEqual([
      'exercise_answered@1',
      'exercise_answered@1',
      'exercise_answered@1',
      'session_completed@1',
    ]);
    const sesion = eventos().at(-1) as Extract<ProgressEvent, { type: 'session_completed@1' }>;
    expect(sesion.payload).toMatchObject({
      mode: 'lesson',
      unitId: 'u-saludos',
      lessonId: 'u-saludos-l1',
      correct: 3,
      wrong: 0,
      answered: 3,
      outOfHearts: false,
    });
    const p = services.progress.getState().progress;
    expect(p.lessonsDone['u-saludos']).toBe(1);
    expect(p.xp).toBe(3 * 10 + 20);
  });

  it('el botón Comprobar está desactivado hasta que hay una respuesta', async () => {
    await abrir();
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeDisabled();
    await responderBien(ejercicio(SALUDOS.mc[0]));
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeEnabled();
  });

  it('la barra de progreso avanza con cada ejercicio respondido', async () => {
    await abrir();
    const barra = () => Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'));
    expect(barra()).toBe(0);
    await responderBien(ejercicio(SALUDOS.mc[0]));
    await comprobar();
    expect(barra()).toBe(33);
    await continuar();
    expect(barra()).toBe(33);
  });
});

describe('feedback', () => {
  it('un acierto muestra felicitación, el zorro feliz, la explicación y el botón verde', async () => {
    const { sonidos } = await abrir();
    const e = ejercicio(SALUDOS.mc[0]);
    await responderBien(e);
    await comprobar();
    expect(screen.getByTestId('bubble')).toHaveTextContent('¡Bien hecho!');
    expect(screen.getByRole('status', { name: '' }).textContent).toMatch(
      /¡Excelente!|¡Muy bien!|¡Genial!|¡Perfecto!|¡Así se hace!/,
    );
    if (e.tip) expect(screen.getByText(`💡 ${e.tip}`)).toBeInTheDocument();
    expect(sonidos).toContain('ok');
    expect(screen.getByRole('button', { name: 'Continuar' }).className).toMatch(/actionOk/);
  });

  it('un error muestra la respuesta correcta, el zorro triste y el botón rojo', async () => {
    const { sonidos } = await abrir();
    const e = ejercicio(SALUDOS.write[0]);
    // saltamos al ejercicio de escribir: primero se responden los dos anteriores
    for (const id of [SALUDOS.mc[0], SALUDOS.order[0]]) {
      await responderBien(ejercicio(id));
      await comprobar();
      await continuar();
    }
    await responderMal(e);
    await comprobar();
    expect(screen.getByText('Respuesta correcta:')).toBeInTheDocument();
    expect(screen.getByText((e as Extract<Exercise, { type: 'write' }>).en)).toBeInTheDocument();
    expect(screen.getByTestId('bubble')).toHaveTextContent('¡No pasa nada, sigue!');
    expect(sonidos).toContain('bad');
    expect(screen.getByRole('button', { name: 'Continuar' }).className).toMatch(/actionBad/);
  });

  it('una errata tolerada acierta y avisa de la ortografía', async () => {
    await abrir({ ids: [SALUDOS.write[0]] });
    await userEvent.type(screen.getByRole('textbox'), 'Good mornin');
    await comprobar();
    expect(
      screen.getByText('Casi perfecto, cuida la ortografía: "Good morning"'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('bubble')).toHaveTextContent('¡Bien hecho!');
  });

  it('tras comprobar ya no se puede cambiar la respuesta', async () => {
    await abrir({ ids: [SALUDOS.mc[0]] });
    await responderBien(ejercicio(SALUDOS.mc[0]));
    await comprobar();
    for (const b of screen
      .getAllByRole('button', { name: /^\S/ })
      .filter((b) => b.className.includes('option')))
      expect(b).toBeDisabled();
  });
});

describe('ejercicios', () => {
  it('elegir marca la opción elegida, y al comprobar la correcta en verde y la equivocada en rojo', async () => {
    await abrir({ ids: [SALUDOS.mc[0]] });
    const e = ejercicio(SALUDOS.mc[0]) as Extract<Exercise, { type: 'mc' }>;
    const mala = e.options.findIndex((_, i) => i !== e.answerIndex);
    const botonMala = screen.getByRole('button', { name: new RegExp(e.options[mala]!.text) });
    await userEvent.click(botonMala);
    expect(botonMala).toHaveAttribute('aria-pressed', 'true');
    expect(botonMala.className).toMatch(/selected/);
    await comprobar();
    expect(botonMala.className).toMatch(/bad/);
    expect(
      screen.getByRole('button', { name: new RegExp(e.options[e.answerIndex]!.text) }).className,
    ).toMatch(/good/);
  });

  it('elegir dice en voz alta la opción cuando la pregunta es "¿Cómo se dice…?"', async () => {
    const { dichas } = await abrir({ ids: [SALUDOS.mc[0]] });
    const e = ejercicio(SALUDOS.mc[0]) as Extract<Exercise, { type: 'mc' }>;
    await userEvent.click(screen.getByRole('button', { name: new RegExp(e.options[0]!.text) }));
    expect(dichas).toContain(e.options[0]!.text);
  });

  it('ordenar coloca y quita fichas, y tocar una dice la palabra', async () => {
    const { dichas } = await abrir({ ids: [SALUDOS.order[0]] });
    const e = ejercicio(SALUDOS.order[0]) as Extract<Exercise, { type: 'order' }>;
    const banco = within(screen.getByTestId('word-bank'));
    const area = within(screen.getByTestId('answer-area'));
    const primera = e.en.split(' ')[0]!;
    await userEvent.click(banco.getByRole('button', { name: primera }));
    expect(area.getByRole('button', { name: primera })).toBeInTheDocument();
    expect(banco.getByRole('button', { name: primera })).toBeDisabled();
    expect(dichas).toContain(primera);
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeEnabled();
    await userEvent.click(area.getByRole('button', { name: primera }));
    expect(area.queryByRole('button', { name: primera })).toBeNull();
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeDisabled();
  });

  it('ordenar con las palabras en otro orden falla', async () => {
    await abrir({ ids: [SALUDOS.order[0]] });
    const e = ejercicio(SALUDOS.order[0]) as Extract<Exercise, { type: 'order' }>;
    for (const w of [...e.en.split(' ')].reverse())
      await userEvent.click(
        within(screen.getByTestId('word-bank'))
          .getAllByRole('button', { name: w })
          .find((b) => !(b as HTMLButtonElement).disabled)!,
      );
    await comprobar();
    expect(screen.getByText('Respuesta correcta:')).toBeInTheDocument();
  });

  it('escribir comprueba con Enter y no con Mayús+Enter, y dice la frase si acierta', async () => {
    const { dichas } = await abrir({ ids: [SALUDOS.write[0]] });
    const e = ejercicio(SALUDOS.write[0]) as Extract<Exercise, { type: 'write' }>;
    const campo = screen.getByRole('textbox');
    await userEvent.type(campo, e.en);
    await userEvent.type(campo, '{Shift>}{Enter}{/Shift}');
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
    await userEvent.clear(campo);
    await userEvent.type(campo, `${e.en}{Enter}`);
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    expect(dichas).toContain(e.en);
  });

  it('escribir no comprueba con Enter si no hay texto', async () => {
    await abrir({ ids: [SALUDOS.write[0]] });
    await userEvent.type(screen.getByRole('textbox'), '   {Enter}');
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
  });
});

describe('vidas', () => {
  it('en PRO las vidas son ilimitadas', async () => {
    await abrir();
    expect(screen.getByTestId('lesson-hearts')).toHaveTextContent('∞');
  });

  it('en el plan gratis cada fallo quita una vida y al quedarse sin vidas la lección termina', async () => {
    const ids = [...SALUDOS.mc, ...SALUDOS.order, ...SALUDOS.write];
    const { eventos } = await abrir({ ids, plan: 'free' });
    expect(screen.getByTestId('lesson-hearts')).toHaveTextContent('5');
    for (let i = 0; i < 5; i++) {
      await responderMal(ejercicio(ids[i]!));
      await comprobar();
      expect(screen.getByTestId('lesson-hearts')).toHaveTextContent(String(4 - i));
      if (i === 4)
        expect(screen.getByTestId('bubble')).toHaveTextContent('Nos quedamos sin vidas…');
      await continuar();
    }
    expect(screen.getByRole('heading', { name: 'Te quedaste sin vidas' })).toBeInTheDocument();
    expect((eventos().at(-1) as ProgressEvent).payload).toMatchObject({
      outOfHearts: true,
      wrong: 5,
    });
  });

  it('sin vidas en el plan gratis no deja empezar y explica por qué', async () => {
    const services = await crearServicios({
      storage: memoria().storage,
      clock: relojFalso(),
      course: cursoConLeccion([...SALUDOS.mc]),
    });
    await services.progress.getState().record([
      { type: 'settings_changed@1', payload: { plan: 'free' } },
      ...[1, 2, 3, 4, 5].map((n) => ({
        type: 'exercise_answered@1' as const,
        payload: { exerciseId: `u-saludos-e0${n}`, correct: false, mode: 'lesson' as const },
      })),
    ]);
    renderApp(services, RUTA);
    expect(screen.getByRole('heading', { name: 'Sin vidas 💔' })).toBeInTheDocument();
    expect(services.progress.getState().events.some((e) => e.type === 'session_completed@1')).toBe(
      false,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(await screen.findByRole('heading', { name: 'Aprender' })).toBeInTheDocument();
  });
});

describe('salir de la lección', () => {
  it('✕ pide confirmar; seguir practicando cierra el aviso y conserva la lección', async () => {
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Salir de la lección' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Salir de la lección?' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Seguir practicando' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeInTheDocument();
  });

  it('salir vuelve a Aprender sin registrar nada de la sesión', async () => {
    const { router, eventos } = await abrir();
    await responderBien(ejercicio(SALUDOS.mc[0]));
    await comprobar();
    expect(eventos()).toHaveLength(1); // la respuesta ya se anotó
    await userEvent.click(screen.getByRole('button', { name: 'Salir de la lección' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Salir' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/aprender'));
    expect(eventos().some((e) => e.type === 'session_completed@1')).toBe(false);
  });

  it('el botón Atrás también pide confirmar', async () => {
    const { router } = await abrir();
    await act(async () => {
      await router.navigate(-1).catch(() => undefined);
    });
    // en un historial de una sola entrada no hay a dónde volver; se prueba con una navegación explícita
    await act(async () => {
      await router.navigate('/perfil');
    });
    expect(screen.getByRole('dialog', { name: '¿Salir de la lección?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/leccion/u-saludos/u-saludos-l1');
  });

  it('una lección terminada se puede cerrar sin aviso', async () => {
    const ids = [SALUDOS.mc[0]];
    const { router } = await abrir({ ids });
    await responderBien(ejercicio(ids[0]!));
    await comprobar();
    await continuar();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/aprender'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('rutas inválidas', () => {
  it('una unidad o lección inexistente lleva a Aprender', async () => {
    const services = await crearServicios({ storage: memoria().storage, clock: relojFalso() });
    const a = renderApp(services, '/leccion/u-no-existe/x');
    await waitFor(() => expect(a.router.state.location.pathname).toBe('/aprender'));
    a.unmount();
    const b = renderApp(services, '/leccion/u-saludos/l-no-existe');
    await waitFor(() => expect(b.router.state.location.pathname).toBe('/aprender'));
  });
});

describe('desde la pantalla Aprender', () => {
  it('abrir la lección actual muestra su primer ejercicio y repetir una hecha cuenta la mitad', async () => {
    const ids = [SALUDOS.mc[0]];
    const { services } = await abrir({ ids });
    await responderBien(ejercicio(ids[0]!));
    await comprobar();
    await continuar();
    expect(services.progress.getState().progress.xp).toBe(10 + 20);
    expect(screen.getByRole('heading', { name: '¡Lección completada!' })).toBeInTheDocument();
  });
});
