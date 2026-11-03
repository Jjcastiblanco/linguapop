// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { VoicePack, VoicePackState } from '@linguapop/domain';
import { cursoConLeccion, SALUDOS } from '../../test/curso-de-prueba';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

const RUTA = '/leccion/u-saludos/u-saludos-l1';
const TARJETAS = [{ en: 'Hello', es: 'Hola' }];

function respaldoFalso() {
  let state: VoicePackState = 'idle';
  let progress = 0;
  let preferida = false;
  const listeners = new Set<() => void>();
  const cambiar = (s: VoicePackState, p = progress) => {
    state = s;
    progress = p;
    listeners.forEach((l) => l());
  };
  let terminar: (ok: boolean) => void = () => undefined;
  const pack: VoicePack = {
    sizeMb: 92,
    state: () => state,
    progress: () => progress,
    preferred: () => preferida,
    setPreferred: vi.fn((on: boolean) => {
      preferida = on;
      listeners.forEach((l) => l());
    }),
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    download: vi.fn(() => {
      cambiar('downloading', 0);
      return new Promise<boolean>((resolve) => {
        terminar = (ok) => {
          cambiar(ok ? 'ready' : 'failed', ok ? 1 : 0);
          resolve(ok);
        };
      });
    }),
  };
  return { pack, cambiar, terminar: (ok: boolean) => terminar(ok) };
}

async function abrir({ nativa = false }: { nativa?: boolean } = {}) {
  const r = respaldoFalso();
  const speech = {
    capabilities: () => ({ canSpeak: nativa || r.pack.state() === 'ready', canListen: false }),
    speak: vi.fn(async () => true),
    listen: vi.fn(async () => ({ kind: 'unavailable', reason: 'unsupported' }) as const),
    cancel: vi.fn(),
    voicePack: r.pack,
  };
  const services = await crearServicios({
    storage: memoria().storage,
    clock: relojFalso(),
    course: cursoConLeccion(SALUDOS.mc.slice(0, 1), TARJETAS),
    speech,
  });
  renderApp(services, RUTA);
  return { ...r, speech };
}

describe('oferta de la voz de respaldo', () => {
  it('ofrece la descarga con su tamaño y no descarga sola', async () => {
    const { pack } = await abrir();
    expect(screen.getByText(/unos 92 MB, una sola vez/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Escuchar la palabra' })).toBeNull();
    expect(pack.download).not.toHaveBeenCalled();
  });

  it('al aceptar muestra el avance y al terminar aparecen los botones de escuchar', async () => {
    const { pack, cambiar, terminar } = await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar voz' }));
    expect(pack.download).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Descargando voz… 0 %');
    act(() => cambiar('downloading', 0.37));
    expect(
      screen.getByRole('progressbar', { name: 'Avance de la descarga de la voz' }),
    ).toHaveAttribute('aria-valuenow', '37');
    act(() => terminar(true));
    expect(await screen.findByRole('button', { name: 'Escuchar la palabra' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar voz' })).toBeNull();
  });

  it('si la descarga falla lo dice y deja reintentar', async () => {
    const { pack, terminar } = await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar voz' }));
    act(() => terminar(false));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo descargar la voz');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(pack.download).toHaveBeenCalledTimes(2);
  });
});

describe('enlace «¿No se escucha?» cuando el navegador sí tiene voz', () => {
  it('muestra el enlace con el tamaño y no descarga sola', async () => {
    const { pack } = await abrir({ nativa: true });
    expect(
      screen.getByRole('button', {
        name: /¿No se escucha\? Usar otra voz \(descarga unos 92 MB\)/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escuchar la palabra' })).toBeInTheDocument();
    expect(pack.download).not.toHaveBeenCalled();
  });

  it('al tocarlo la elige y la descarga; al terminar ofrece volver a la del navegador', async () => {
    const { pack, terminar } = await abrir({ nativa: true });
    await userEvent.click(screen.getByRole('button', { name: /¿No se escucha\?/ }));
    expect(pack.setPreferred).toHaveBeenCalledWith(true);
    expect(pack.download).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Descargando voz');
    act(() => terminar(true));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Volver a la voz del navegador' }),
    );
    expect(pack.setPreferred).toHaveBeenLastCalledWith(false);
    expect(
      await screen.findByRole('button', { name: /¿No se escucha\? Usar otra voz$/ }),
    ).toBeInTheDocument();
  });

  it('si la descarga elegida falla lo dice y deja reintentar', async () => {
    const { terminar } = await abrir({ nativa: true });
    await userEvent.click(screen.getByRole('button', { name: /¿No se escucha\?/ }));
    act(() => terminar(false));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo descargar la voz');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
