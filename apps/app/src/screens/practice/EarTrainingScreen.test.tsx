// @vitest-environment jsdom
import type { MinimalPair } from '@linguapop/content';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

const PARES: MinimalPair[] = Array.from({ length: 12 }, (_, i) => ({
  id: `pair-w${i}-x${i}`,
  a: { en: `w${i}`, es: `uno${i}` },
  b: { en: `x${i}`, es: `dos${i}` },
  contrast: 'b-v',
}));

async function abrir(opts: { canSpeak?: boolean; hablaOk?: boolean; pares?: MinimalPair[] } = {}) {
  const dichas: string[] = [];
  const speech = {
    capabilities: () => ({ canSpeak: opts.canSpeak ?? true, canListen: false }),
    speak: vi.fn(async (texto: string) => {
      dichas.push(texto);
      return opts.hablaOk ?? true;
    }),
    listen: vi.fn(),
    cancel: vi.fn(),
  };
  const services = await crearServicios({
    storage: memoria().storage,
    clock: relojFalso(),
    random: { next: () => 0.2 },
    pairs: opts.pares ?? PARES,
    speech: speech as never,
  });
  renderApp(services, '/practicar/oido');
  return { services, dichas, speech };
}

const ultimaDicha = (d: string[]) => d[d.length - 1]!;
const tocar = (nombre: string) => userEvent.click(screen.getByRole('button', { name: nombre }));

describe('Entrena tu oído', () => {
  it('desde Practicar, el plan gratis entra sin candado PRO', async () => {
    const services = await crearServicios({ storage: memoria().storage, pairs: PARES });
    renderApp(services, '/practicar');
    await userEvent.click(screen.getByRole('button', { name: /Entrena tu oído/ }));
    expect(await screen.findByText('Intento 1 de 10')).toBeInTheDocument();
    expect(screen.queryByText('PRO', { selector: 'span' })).toBeNull();
  });

  it('hace 10 intentos, corrige sin culpa, registra cada respuesta y no gasta vidas', async () => {
    const { services, dichas } = await abrir();
    const antes = services.progress.getState().progress;
    for (let n = 1; n <= 10; n++) {
      expect(await screen.findByText(`Intento ${n} de 10`)).toBeInTheDocument();
      await waitFor(() => expect(dichas.length).toBe(n));
      const sono = ultimaDicha(dichas);
      const otra = sono.startsWith('w') ? sono.replace('w', 'x') : sono.replace('x', 'w');
      // Aciertos en los intentos impares; errores en los pares.
      if (n % 2 === 1) {
        await tocar(sono);
        expect(screen.getByText('¡Esa era!')).toBeInTheDocument();
      } else {
        await tocar(otra);
        const status = screen.getByText(/Sonó/);
        expect(status).toHaveTextContent(`Sonó «${sono}»`);
        expect(status.textContent).not.toMatch(/fall/i);
      }
      await userEvent.click(
        screen.getByRole('button', { name: n === 10 ? 'Ver resumen' : 'Siguiente' }),
      );
    }
    expect(screen.getByTestId('ear-score')).toHaveTextContent('5 aciertos de 10');
    const eventos = services.progress
      .getState()
      .events.filter((e) => e.type === 'exercise_answered@1');
    expect(eventos).toHaveLength(10);
    for (const e of eventos) {
      expect(e.payload).toMatchObject({ mode: 'practice' });
      expect((e.payload as { exerciseId: string }).exerciseId).toMatch(/^pair-/);
    }
    const despues = services.progress.getState().progress;
    expect(despues.hearts).toBe(antes.hearts);
    expect(despues.errors).toEqual(antes.errors);
    expect(despues.reviews).toEqual(antes.reviews);
    expect(despues.xp).toBe(antes.xp);
    await tocar('Volver a Practicar');
    expect(await screen.findByRole('button', { name: /Entrena tu oído/ })).toBeInTheDocument();
  });

  it('el botón de escuchar repite la misma palabra', async () => {
    const { dichas } = await abrir();
    await waitFor(() => expect(dichas.length).toBe(1));
    await tocar('Escuchar de nuevo');
    await waitFor(() => expect(dichas.length).toBe(2));
    expect(dichas[1]).toBe(dichas[0]);
  });

  it('sin audio avisa y permite saltar el intento', async () => {
    const { services } = await abrir({ canSpeak: false });
    expect(await screen.findByText(/No se pudo reproducir/)).toBeInTheDocument();
    await tocar('Saltar');
    expect(await screen.findByText('Intento 2 de 10')).toBeInTheDocument();
    const e = services.progress.getState().events.at(-1)!;
    expect(e.payload).toMatchObject({ skipped: true, mode: 'practice' });
  });

  it('si el audio falla aunque la app pueda hablar, avisa y permite saltar', async () => {
    await abrir({ hablaOk: false });
    expect(await screen.findByText(/No se pudo reproducir/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saltar' })).toBeInTheDocument();
  });

  it('un resultado tardío del intento anterior no muestra el aviso en el siguiente', async () => {
    let soltarPrimera!: (ok: boolean) => void;
    const dichas: string[] = [];
    const speech = {
      capabilities: () => ({ canSpeak: true, canListen: false }),
      speak: vi.fn((texto: string) => {
        dichas.push(texto);
        return dichas.length === 1
          ? new Promise<boolean>((resolve) => (soltarPrimera = resolve))
          : Promise.resolve(true);
      }),
      listen: vi.fn(),
      cancel: vi.fn(),
    };
    const services = await crearServicios({
      storage: memoria().storage,
      clock: relojFalso(),
      random: { next: () => 0.2 },
      pairs: PARES,
      speech: speech as never,
    });
    renderApp(services, '/practicar/oido');
    await waitFor(() => expect(dichas.length).toBe(1));
    await tocar(dichas[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(dichas.length).toBe(2));
    soltarPrimera(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/No se pudo reproducir/)).toBeNull();
  });

  it('con menos de 10 pares hace todos los que hay', async () => {
    await abrir({ pares: PARES.slice(0, 3) });
    expect(await screen.findByText('Intento 1 de 3')).toBeInTheDocument();
  });
});
