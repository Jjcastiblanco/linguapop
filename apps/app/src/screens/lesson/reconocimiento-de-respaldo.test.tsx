// @vitest-environment jsdom
import { seedCourse, type Exercise } from '@linguapop/content';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ListenResult, ModelPack, ModelPackState } from '@linguapop/domain';
import { describe, expect, it, vi } from 'vitest';
import { cursoConLeccion } from '../../test/curso-de-prueba';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

const RUTA = '/leccion/u-saludos/u-saludos-l1';
const SPEAK = 'u-saludos-e08';
const frase = (
  seedCourse.units[0]!.exercises.find((e) => e.id === SPEAK) as Extract<Exercise, { type: 'speak' }>
).en;

function modeloFalso() {
  let state: ModelPackState = 'idle';
  let progress = 0;
  let fallo: string | null = null;
  const oyentes = new Set<() => void>();
  const avisar = () => oyentes.forEach((l) => l());
  let terminar: (ok: boolean) => void = () => undefined;
  const pack: ModelPack = {
    sizeMb: 40,
    state: () => state,
    progress: () => progress,
    error: () => fallo,
    subscribe: (l) => (oyentes.add(l), () => void oyentes.delete(l)),
    download: vi.fn(() => {
      state = 'downloading';
      progress = 0;
      avisar();
      return new Promise<boolean>((resolve) => {
        terminar = (ok) => {
          state = ok ? 'ready' : 'failed';
          progress = ok ? 1 : 0;
          avisar();
          resolve(ok);
        };
      });
    }),
  };
  return {
    pack,
    terminar: (ok: boolean) => terminar(ok),
    avance: (f: number) => {
      progress = f;
      avisar();
    },
    fallar: (m: string | null) => {
      fallo = m;
      avisar();
    },
    listo: () => state === 'ready',
  };
}

async function abrir({
  nativo,
  oidos = [],
}: {
  /** Cómo responde el reconocimiento del navegador; `null` es que no existe (Firefox). */
  nativo: ListenResult | null;
  /** Respuestas del reconocimiento de respaldo, ya con el modelo descargado. */
  oidos?: ListenResult[];
}) {
  const modelo = modeloFalso();
  let navegadorPuede = nativo !== null;
  const respaldo = [...oidos];
  const speech = {
    capabilities: () => ({ canSpeak: true, canListen: navegadorPuede || modelo.listo() }),
    speak: vi.fn(async () => true),
    listen: vi.fn(async (): Promise<ListenResult> => {
      if (!navegadorPuede && modelo.listo()) return respaldo.shift() ?? { kind: 'silence' };
      const r = nativo ?? { kind: 'silence' };
      if (r.kind === 'unavailable') navegadorPuede = false;
      return r;
    }),
    cancel: vi.fn(),
    recognitionPack: modelo.pack,
  };
  const services = await crearServicios({
    storage: memoria().storage,
    clock: relojFalso(),
    course: cursoConLeccion([SPEAK]),
    speech,
  });
  renderApp(services, RUTA);
  return { ...modelo, speech };
}

describe('reconocimiento de voz de respaldo en «Repite esta frase»', () => {
  it('sin reconocimiento propio ofrece la descarga con su tamaño y no descarga sola', async () => {
    const { pack } = await abrir({ nativo: null });
    expect(screen.getByRole('note')).toHaveTextContent('no admite reconocimiento de voz');
    expect(screen.getByText(/unos 40 MB, una sola vez/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hablar' })).toBeNull();
    expect(pack.download).not.toHaveBeenCalled();
  });

  it('al aceptar muestra el avance y al terminar vuelve el micrófono y entiende lo dicho', async () => {
    const { pack, terminar, avance } = await abrir({
      nativo: null,
      oidos: [{ kind: 'heard', alternatives: [frase] }],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Descargar reconocimiento de voz' }));
    expect(pack.download).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Descargando reconocimiento de voz… 0 %')).toBeInTheDocument();
    act(() => avance(0.42));
    expect(
      screen.getByRole('progressbar', { name: 'Avance de la descarga del reconocimiento de voz' }),
    ).toHaveAttribute('aria-valuenow', '42');
    act(() => terminar(true));
    await userEvent.click(await screen.findByRole('button', { name: 'Hablar' }));
    expect(await screen.findByTestId('heard')).toHaveTextContent(`“${frase}”`);
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeEnabled();
  });

  it('Brave: el servicio del navegador falla, se ofrece el modelo y luego funciona', async () => {
    const { terminar } = await abrir({
      nativo: { kind: 'unavailable', reason: 'network' },
      oidos: [{ kind: 'heard', alternatives: [frase] }],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Hablar' }));
    expect(await screen.findByRole('note')).toHaveTextContent('no puede usar el servicio de voz');
    expect(
      screen.getByRole('button', { name: 'Descargar reconocimiento de voz' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar reconocimiento de voz' }));
    act(() => terminar(true));
    await userEvent.click(await screen.findByRole('button', { name: 'Hablar' }));
    expect(await screen.findByTestId('heard')).toHaveTextContent(`“${frase}”`);
  });

  it('si la descarga falla lo dice con el motivo y deja reintentar', async () => {
    const { pack, terminar, fallar } = await abrir({ nativo: null });
    await userEvent.click(screen.getByRole('button', { name: 'Descargar reconocimiento de voz' }));
    act(() => {
      fallar('sin red');
      terminar(false);
    });
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(screen.getByText(/No se pudo descargar el reconocimiento de voz/)).toBeInTheDocument();
    expect(screen.getByText('Problema con el reconocimiento de voz: sin red')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(pack.download).toHaveBeenCalledTimes(2);
  });

  it('un permiso de micrófono denegado no ofrece descargar nada', async () => {
    await abrir({ nativo: { kind: 'unavailable', reason: 'not-allowed' } });
    await userEvent.click(screen.getByRole('button', { name: 'Hablar' }));
    expect(await screen.findByRole('note')).toHaveTextContent('Permiso de micrófono denegado');
    expect(screen.queryByRole('button', { name: 'Descargar reconocimiento de voz' })).toBeNull();
  });

  it('si el reconocimiento de respaldo falla muestra el motivo', async () => {
    const { terminar, fallar } = await abrir({
      nativo: null,
      oidos: [{ kind: 'unavailable', reason: 'error' }],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Descargar reconocimiento de voz' }));
    act(() => terminar(true));
    await userEvent.click(await screen.findByRole('button', { name: 'Hablar' }));
    act(() => fallar('el reconocimiento sin respuesta tras 60 s'));
    expect(
      await screen.findByText(
        /Problema con el reconocimiento de voz: el reconocimiento sin respuesta/,
      ),
    ).toBeInTheDocument();
  });
});
