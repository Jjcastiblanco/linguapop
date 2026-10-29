// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cursoConLeccion, SALUDOS } from '../../test/curso-de-prueba';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

const RUTA = '/leccion/u-saludos/u-saludos-l1';
const TARJETAS = [
  { en: 'Hello', es: 'Hola', emoji: '👋' },
  { en: 'Good night', es: 'Buenas noches' },
  { en: 'Thank you', es: 'Gracias', emoji: '🙏' },
];

async function abrir({
  canSpeak = true,
  teach = TARJETAS,
}: { canSpeak?: boolean; teach?: typeof TARJETAS } = {}) {
  const speech = {
    capabilities: () => ({ canSpeak, canListen: false }),
    speak: vi.fn(async () => true),
    listen: vi.fn(async () => ({ kind: 'unavailable', reason: 'unsupported' }) as const),
    cancel: vi.fn(),
  };
  const services = await crearServicios({
    storage: memoria().storage,
    clock: relojFalso(),
    course: cursoConLeccion(SALUDOS.mc.slice(0, 1), teach),
    speech,
  });
  renderApp(services, RUTA);
  const eventos = () => services.progress.getState().events;
  return { services, speech, eventos };
}

const siguiente = () => userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
const empezar = () => userEvent.click(screen.getByRole('button', { name: 'Entendido, empezar' }));

describe('fase Palabras nuevas', () => {
  it('abre la lección con la primera tarjeta, antes de cualquier ejercicio', async () => {
    await abrir();
    expect(screen.getByRole('heading', { name: 'Palabras nuevas' })).toBeInTheDocument();
    expect(screen.getByText('Palabra 1 de 3')).toBeInTheDocument();
    expect(screen.getByTestId('teach-card')).toHaveTextContent('Hello');
    expect(screen.getByTestId('teach-card')).toHaveTextContent('Hola');
    expect(screen.queryByRole('button', { name: 'Comprobar' })).not.toBeInTheDocument();
  });

  it('recorre las tarjetas y Entendido pasa al primer ejercicio', async () => {
    await abrir();
    await siguiente();
    expect(screen.getByTestId('teach-card')).toHaveTextContent('Buenas noches');
    await siguiente();
    expect(screen.getByText('Palabra 3 de 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
    await empezar();
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Palabras nuevas' })).not.toBeInTheDocument();
  });

  it('Saltar deja ir directo al ejercicio', async () => {
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Saltar' }));
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeInTheDocument();
  });

  it('no da XP, no cuesta vidas y no registra eventos', async () => {
    const { services, eventos } = await abrir();
    const antes = eventos().length;
    const vidas = services.lesson.getState().lesson?.hearts;
    await siguiente();
    await siguiente();
    await empezar();
    expect(eventos()).toHaveLength(antes);
    expect(services.lesson.getState().lesson?.hearts).toBe(vidas);
    expect(services.lesson.getState().lesson?.index).toBe(0);
  });

  it('el botón de audio dice la palabra en inglés, normal y despacio', async () => {
    const { speech } = await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Escuchar la palabra' }));
    expect(speech.speak).toHaveBeenLastCalledWith('Hello', { rate: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Escuchar despacio' }));
    expect(speech.speak).toHaveBeenLastCalledWith('Hello', { rate: 0.6 });
  });

  it('sin voz no hay botón de audio y la tarjeta se lee igual', async () => {
    await abrir({ canSpeak: false });
    expect(screen.queryByRole('button', { name: 'Escuchar la palabra' })).not.toBeInTheDocument();
    expect(screen.getByTestId('teach-card')).toHaveTextContent('Hello');
  });

  it('cerrar durante las tarjetas vuelve a Aprender sin pedir confirmación', async () => {
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Salir de la lección' }));
    expect(screen.queryByText(/seguro/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Palabras nuevas' })).not.toBeInTheDocument();
  });
});
