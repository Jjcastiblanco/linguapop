// @vitest-environment jsdom
import { seedCourse, type Course, type Exercise } from '@linguapop/content';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SALUDOS, cursoConLeccion } from '../../test/curso-de-prueba';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';
import { formatDuration } from './LessonResult';

const ejercicio = (id: string): Exercise =>
  seedCourse.units[0]!.exercises.find((e) => e.id === id)!;
const RUTA = '/leccion/u-saludos/u-saludos-l1';

/** El curso de prueba con la unidad Saludos reducida a su primera lección, que pasa a ser la última. */
function cursoDeUnaLeccion(ids: readonly string[]): Course {
  const curso = cursoConLeccion(ids);
  return {
    ...curso,
    units: curso.units.map((u, i) => (i === 0 ? { ...u, lessons: u.lessons.slice(0, 1) } : u)),
  };
}

async function abrir(
  ids: readonly string[],
  { curso, plan, antes }: { curso?: Course; plan?: 'free' | 'pro'; antes?: object[] } = {},
) {
  const clock = relojFalso();
  const services = await crearServicios({
    storage: memoria().storage,
    clock,
    course: curso ?? cursoConLeccion(ids),
    random: { next: () => 0.4 },
  });
  const previos = [
    ...(plan ? [{ type: 'settings_changed@1' as const, payload: { plan } }] : []),
    ...(antes ?? []),
  ];
  if (previos.length) await services.progress.getState().record(previos as never);
  const app = renderApp(services, RUTA);
  return { services, clock, ...app };
}

const bien = async (e: Exercise) => {
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
};
const mal = async (e: Exercise) => {
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
  else if (e.type === 'write') await userEvent.type(screen.getByRole('textbox'), 'zzz');
  else if (e.type === 'order')
    await userEvent.click(within(screen.getByTestId('word-bank')).getAllByRole('button')[0]!);
};
const comprobar = () => userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
const continuar = () => userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

async function resolver(ids: readonly string[], fallar: readonly string[] = []) {
  for (const id of ids) {
    const e = ejercicio(id);
    await (fallar.includes(id) ? mal(e) : bien(e));
    await comprobar();
    await continuar();
  }
}

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [600, '10:00'],
    [59.6, '1:00'],
    [-3, '0:00'],
  ])('%s s se muestra como %s', (s, texto) => {
    expect(formatDuration(s)).toBe(texto);
  });
});

describe('pantalla final de lección', () => {
  const ids = [SALUDOS.mc[0], SALUDOS.order[0], SALUDOS.write[0]] as const;

  it('una lección perfecta muestra XP, precisión, tiempo y gemas, la insignia y el confeti', async () => {
    const { clock } = await abrir(ids);
    clock.avanzar(65_000);
    await resolver(ids);
    expect(
      await screen.findByRole('heading', { name: '¡Lección completada!' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('result-xp')).toHaveTextContent('50');
    expect(screen.getByTestId('result-accuracy')).toHaveTextContent('100%');
    expect(screen.getByTestId('result-gems')).toHaveTextContent('10');
    expect(screen.getByTestId('result-time')).toHaveTextContent('⏱ 1:05');
    expect(screen.getByText('¡Lección perfecta! 🌟')).toBeInTheDocument();
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
  });

  it('con un fallo no hay insignia, baja la precisión y se ganan menos gemas', async () => {
    await abrir(ids, { plan: 'pro' });
    await resolver(ids, [ids[2]]);
    expect(screen.getByTestId('result-xp')).toHaveTextContent('20');
    expect(screen.getByTestId('result-accuracy')).toHaveTextContent('67%');
    expect(screen.getByTestId('result-gems')).toHaveTextContent('5');
    expect(screen.queryByText('¡Lección perfecta! 🌟')).toBeNull();
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
  });

  it('muestra la racha del día tras completar la lección', async () => {
    await abrir(ids);
    await resolver(ids);
    await waitFor(() =>
      expect(screen.getByTestId('result-streak')).toHaveTextContent('Racha de 1 día'),
    );
  });

  it('no avisa de unidad completada si la lección no es la última de la unidad', async () => {
    await abrir(ids);
    await resolver(ids);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('al terminar la última lección de la unidad celebra la unidad y apunta al cofre', async () => {
    await abrir(ids, { curso: cursoDeUnaLeccion(ids) });
    await resolver(ids);
    expect(await screen.findByRole('status')).toHaveTextContent(
      '¡Completaste la unidad Saludos! Abre su cofre en Aprender.',
    );
  });

  it('repetir una lección ya hecha avisa de que da la mitad de XP y no celebra la unidad', async () => {
    const curso = cursoDeUnaLeccion(ids);
    await abrir(ids, {
      curso,
      antes: [
        {
          type: 'session_completed@1',
          payload: {
            mode: 'lesson',
            unitId: 'u-saludos',
            lessonId: 'u-saludos-l1',
            correct: 3,
            wrong: 0,
            answered: 3,
            durationSec: 30,
            outOfHearts: false,
          },
        },
      ],
    });
    await resolver(ids);
    expect(await screen.findByText('Repetición: ganas la mitad de XP.')).toBeInTheDocument();
    expect(screen.getByTestId('result-xp')).toHaveTextContent('25');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('sin vidas: cara triste, sin confeti, sin celebrar la unidad y con el consejo para seguir', async () => {
    const todos = [...SALUDOS.mc, ...SALUDOS.order, ...SALUDOS.write];
    await abrir(todos, { plan: 'free', curso: cursoDeUnaLeccion(todos) });
    await resolver(todos.slice(0, 5), todos.slice(0, 5));
    expect(
      await screen.findByRole('heading', { name: 'Te quedaste sin vidas' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Vuelve mañana, recarga con gemas/)).toBeInTheDocument();
    expect(screen.queryByTestId('confetti')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('¡Lección perfecta! 🌟')).toBeNull();
    expect(screen.getByTestId('result-gems')).toHaveTextContent('0');
  });

  it('Continuar vuelve a Aprender', async () => {
    const { router } = await abrir(ids);
    await resolver(ids);
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/aprender'));
  });
});
