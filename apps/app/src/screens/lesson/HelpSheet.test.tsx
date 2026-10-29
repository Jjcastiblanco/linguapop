// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cursoConLeccion, SALUDOS } from '../../test/curso-de-prueba';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

const RUTA = '/leccion/u-saludos/u-saludos-l1';
const TARJETAS = [
  { en: 'Hello', es: 'Hola', emoji: '👋' },
  { en: 'Good night', es: 'Buenas noches', emoji: '🌙' },
  { en: 'Good morning', es: 'Buenos días' },
];

async function abrir(ids: readonly string[], teach: typeof TARJETAS | null = TARJETAS) {
  const speech = {
    capabilities: () => ({ canSpeak: true, canListen: false }),
    speak: vi.fn(async () => true),
    listen: vi.fn(async () => ({ kind: 'unavailable', reason: 'unsupported' }) as const),
    cancel: vi.fn(),
  };
  const services = await crearServicios({
    storage: memoria().storage,
    clock: relojFalso(),
    course: cursoConLeccion(ids, teach ?? undefined),
    speech,
  });
  renderApp(services, RUTA);
  if (teach) {
    const salir = screen.queryByRole('button', { name: 'Saltar' });
    await userEvent.click(salir ?? screen.getByRole('button', { name: 'Entendido, empezar' }));
  }
  return { services, speech };
}

const ayuda = () => screen.getByRole('button', { name: /¿Qué significa\?/ });

describe('ayuda ¿Qué significa?', () => {
  it('abre la lista de palabras enseñadas con su significado, sin la que pide el ejercicio', async () => {
    await abrir([SALUDOS.mc[0]]); // «¿Cómo se dice "Hola"?»: la respuesta es Hello
    await userEvent.click(ayuda());
    const hoja = screen.getByRole('dialog', { name: 'Palabras de la lección' });
    expect(within(hoja).getByText('Good night')).toBeInTheDocument();
    expect(within(hoja).getByText('Buenas noches')).toBeInTheDocument();
    expect(within(hoja).queryByText('Hello')).not.toBeInTheDocument();
  });

  it('en un ejercicio de escribir no aparece la respuesta esperada', async () => {
    await abrir([SALUDOS.write[0]]); // «Buenos días»: la respuesta es Good morning
    await userEvent.click(ayuda());
    const hoja = screen.getByRole('dialog');
    expect(within(hoja).queryByText('Good morning')).not.toBeInTheDocument();
    expect(within(hoja).queryByText('Buenos días')).not.toBeInTheDocument();
    expect(within(hoja).getByText('Hello')).toBeInTheDocument();
  });

  it('no cuesta vidas ni XP, no registra eventos y no cambia el ejercicio', async () => {
    const { services } = await abrir([SALUDOS.mc[0]]);
    const antes = services.progress.getState().events.length;
    const vidas = services.lesson.getState().lesson?.hearts;
    await userEvent.click(ayuda());
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(services.progress.getState().events).toHaveLength(antes);
    expect(services.lesson.getState().lesson?.hearts).toBe(vidas);
    expect(services.lesson.getState().lesson?.index).toBe(0);
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeInTheDocument();
  });

  it('cada palabra se puede escuchar', async () => {
    const { speech } = await abrir([SALUDOS.mc[0]]);
    await userEvent.click(ayuda());
    await userEvent.click(screen.getByRole('button', { name: 'Escuchar Good night' }));
    expect(speech.speak).toHaveBeenLastCalledWith('Good night', { rate: 1 });
  });

  it('si no queda nada que mostrar sin dar la respuesta, lo dice', async () => {
    await abrir([SALUDOS.mc[0]], [{ en: 'Hello', es: 'Hola' }]);
    await userEvent.click(ayuda());
    expect(screen.getByText(/sin darte la respuesta/)).toBeInTheDocument();
  });

  it('no se ofrece tras responder, cuando ya se ve el resultado', async () => {
    await abrir([SALUDOS.mc[0]]);
    await userEvent.click(screen.getByRole('button', { name: /Hello/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(screen.queryByRole('button', { name: /¿Qué significa\?/ })).not.toBeInTheDocument();
  });

  it('una lección sin palabras enseñadas no muestra la ayuda', async () => {
    await abrir([SALUDOS.mc[0]], null);
    expect(screen.queryByRole('button', { name: /¿Qué significa\?/ })).not.toBeInTheDocument();
  });
});
