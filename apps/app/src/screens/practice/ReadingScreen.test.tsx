// @vitest-environment jsdom
import { readingExercises, seedReadings } from '@linguapop/content';
import type { PendingEvent } from '@linguapop/domain';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

const leccion = (unitId: string, n: number): PendingEvent => ({
  type: 'session_completed@1',
  payload: {
    mode: 'lesson',
    unitId,
    lessonId: `${unitId}-l${n}`,
    correct: 10,
    wrong: 0,
    answered: 10,
    durationSec: 60,
    outOfHearts: false,
  },
});
const unidad = (unitId: string) => [1, 2, 3].map((n) => leccion(unitId, n));

const TEXTO = seedReadings.find((t) => t.id === 'read-saludos-1')!;
const PREGUNTAS = readingExercises(TEXTO);

async function abrir(eventos: PendingEvent[] = [], ruta = '/practicar/lectura') {
  const services = await crearServicios({ storage: memoria().storage, clock: relojFalso() });
  if (eventos.length) await services.progress.getState().record(eventos);
  const app = renderApp(services, ruta);
  return { services, ...app };
}

const opcion = (texto: string) => screen.getByRole('button', { name: texto });
const registros = (services: Awaited<ReturnType<typeof abrir>>['services']) =>
  services.progress
    .getState()
    .events.filter((e) => e.type === 'exercise_answered@1')
    .map((e) => e.payload as { exerciseId: string; correct: boolean; mode: string });

describe('Lectura corta', () => {
  it('desde Practicar hay una tarjeta que abre el módulo', async () => {
    await abrir([], '/practicar');
    await userEvent.click(screen.getByRole('button', { name: /Lectura corta/ }));
    expect(await screen.findByText('Elige un texto')).toBeInTheDocument();
  });

  it('sin ninguna unidad completa explica cuándo aparecen los textos', async () => {
    await abrir();
    expect(screen.getByTestId('read-empty')).toHaveTextContent('Completa tu primera unidad');
    expect(screen.queryByTestId(`read-${TEXTO.id}`)).toBeNull();
  });

  it('con la unidad completa ofrece sus textos y no los de unidades cerradas', async () => {
    await abrir(unidad('u-saludos'));
    expect(screen.getByTestId(`read-${TEXTO.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId('read-read-comida-1')).toBeNull();
  });

  it('muestra el texto con la línea de la pregunta marcada y registra cada respuesta', async () => {
    const { services } = await abrir(unidad('u-saludos'));
    await userEvent.click(screen.getByTestId(`read-${TEXTO.id}`));
    for (const line of TEXTO.lines) expect(screen.getByText(line)).toBeInTheDocument();
    for (let i = 0; i < TEXTO.questions.length; i++) {
      const q = TEXTO.questions[i]!;
      expect(
        screen.getByText(`Pregunta ${i + 1} de ${TEXTO.questions.length}`),
      ).toBeInTheDocument();
      expect(screen.getByText(q.prompt)).toBeInTheDocument();
      // acierto en la primera pregunta, error en las demás
      const buena = q.options[q.answerIndex]!;
      const mala = q.options.find((_, k) => k !== q.answerIndex)!;
      await userEvent.click(opcion(i === 0 ? buena : mala));
      if (i === 0) expect(screen.getByRole('status')).toHaveTextContent('¡Eso es!');
      else expect(screen.getByRole('status')).toHaveTextContent(`La respuesta era «${buena}»`);
      await userEvent.click(
        screen.getByRole('button', {
          name: i + 1 >= TEXTO.questions.length ? 'Ver resumen' : 'Siguiente',
        }),
      );
    }
    expect(screen.getByTestId('read-score')).toHaveTextContent(
      `Aciertos: 1 de ${TEXTO.questions.length}`,
    );
    expect(registros(services).map((r) => r.exerciseId)).toEqual(PREGUNTAS.map((p) => p.id));
    expect(registros(services).map((r) => r.correct)).toEqual(PREGUNTAS.map((_, i) => i === 0));
    expect(registros(services).every((r) => r.mode === 'practice')).toBe(true);
  });

  it('las respuestas entran al calendario de repaso, sin gastar vidas ni sumar errores', async () => {
    const { services } = await abrir(unidad('u-saludos'));
    const antes = services.progress.getState().progress;
    await userEvent.click(screen.getByTestId(`read-${TEXTO.id}`));
    for (const q of TEXTO.questions) {
      await userEvent.click(opcion(q.options.find((_, k) => k !== q.answerIndex)!));
      await userEvent.click(screen.getByRole('button', { name: /Siguiente|Ver resumen/ }));
    }
    const despues = services.progress.getState().progress;
    for (const p of PREGUNTAS) expect(despues.reviews[p.id]).toMatchObject({ stage: 0 });
    expect(despues.hearts).toBe(antes.hearts);
    expect(despues.errors).toEqual(antes.errors);
    // al volver a la lista el texto figura como leído
    await userEvent.click(screen.getByRole('button', { name: 'Volver a los textos' }));
    expect(within(screen.getByTestId(`read-${TEXTO.id}`)).getByText('Leído')).toBeInTheDocument();
  });
});
