// @vitest-environment jsdom
import { seedCourse, type Course } from '@linguapop/content';
import type { PendingEvent } from '@linguapop/domain';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { cursoConLeccion } from '../../test/curso-de-prueba';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

const leccion = (n: number): PendingEvent => ({
  type: 'session_completed@1',
  payload: {
    mode: 'lesson',
    unitId: 'u-saludos',
    lessonId: `u-saludos-l${n}`,
    correct: 10,
    wrong: 0,
    answered: 10,
    durationSec: 60,
    outOfHearts: false,
  },
});

/** El curso con la primera lección de la unidad 2 solo con ejercicios de un tipo y sin tarjetas. */
function cursoUnidad2(type: 'mc' | 'write' | 'order' | 'listen' | 'speak' | 'match'): Course {
  const ids = seedCourse.units[1]!.exercises.filter((e) => e.type === type && !e.retired)
    .slice(0, 3)
    .map((e) => e.id);
  return {
    ...seedCourse,
    units: seedCourse.units.map((u, i) =>
      i !== 1
        ? u
        : {
            ...u,
            lessons: u.lessons.map((l, j) => {
              if (j !== 0) return l;
              const { teach: _t, ...sin } = l;
              return { ...sin, exerciseIds: ids };
            }),
          },
    ),
  };
}

async function abrir(course: Course, ruta: string) {
  const services = await crearServicios({
    storage: memoria().storage,
    clock: relojFalso(),
    course,
  });
  await services.progress.getState().record([1, 2, 3].map(leccion));
  return renderApp(services, ruta);
}

describe('instrucciones en inglés desde la unidad 2', () => {
  it('en la unidad 2 la instrucción sale en inglés y la traducción se ve a un toque', async () => {
    await abrir(cursoUnidad2('mc'), '/leccion/u-comida/u-comida-l1');
    expect(screen.getByTestId('bubble')).toHaveTextContent('Choose the correct translation');
    expect(screen.queryByTestId('instruction-es')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Ver la traducción en español' }));
    expect(screen.getByTestId('instruction-es')).toHaveTextContent('Elige la traducción correcta');
    await userEvent.click(screen.getByRole('button', { name: 'Ver la traducción en español' }));
    expect(screen.queryByTestId('instruction-es')).toBeNull();
  });

  it.each([
    ['listen', 'What does it say?', '¿Qué dice?'],
    ['speak', 'Repeat this sentence', 'Repite esta frase'],
    ['match', 'Match the pairs', 'Empareja los pares'],
    ['order', 'Tap the words in order', 'Toca las palabras en orden'],
  ] as const)(
    'en %s la instrucción sale en inglés con su traducción',
    async (type, ingles, español) => {
      await abrir(cursoUnidad2(type), '/leccion/u-comida/u-comida-l1');
      // El globo del zorro también lleva una instrucción: se mira solo la del propio ejercicio.
      const prompt = within(screen.getByText(ingles).parentElement!);
      await userEvent.click(prompt.getByRole('button', { name: 'Ver la traducción en español' }));
      expect(prompt.getByTestId('instruction-es')).toHaveTextContent(español);
    },
  );

  it('la retroalimentación y los botones siguen en español', async () => {
    await abrir(cursoUnidad2('write'), '/leccion/u-comida/u-comida-l1');
    expect(screen.getByTestId('bubble')).toHaveTextContent('Write in English');
    await userEvent.type(screen.getByRole('textbox'), 'zzz');
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(screen.getByTestId('bubble')).toHaveTextContent('¡No pasa nada, sigue!');
    expect(screen.getByText('Respuesta correcta:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver la traducción en español' })).toBeNull();
  });

  it.each([
    ['match', 'Match each word with its translation'],
    ['listen', 'Listen and write what you hear'],
    ['speak', 'Say the sentence out loud'],
  ] as const)('el globo de %s dice su propia instrucción y no «traduce»', async (type, ingles) => {
    await abrir(cursoUnidad2(type), '/leccion/u-comida/u-comida-l1');
    expect(screen.getByTestId('bubble')).toHaveTextContent(ingles);
    expect(screen.getByTestId('bubble')).not.toHaveTextContent('Translate');
  });

  it('en la unidad 1 las instrucciones siguen en español, sin botón de traducción', async () => {
    const ids = seedCourse.units[0]!.exercises.filter((e) => e.type === 'mc' && !e.retired)
      .slice(0, 2)
      .map((e) => e.id);
    await abrir(cursoConLeccion(ids), '/leccion/u-saludos/u-saludos-l1');
    expect(screen.getByTestId('bubble')).toHaveTextContent('Elige la traducción correcta');
    expect(screen.queryByRole('button', { name: 'Ver la traducción en español' })).toBeNull();
  });
});
