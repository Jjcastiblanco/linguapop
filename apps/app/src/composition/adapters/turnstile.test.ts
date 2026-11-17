// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderTurnstile } from './turnstile';

afterEach(() => {
  delete window.turnstile;
  document.head.querySelectorAll('script').forEach((s) => s.remove());
});

const callbacks = () => ({ onToken: vi.fn(), onClear: vi.fn(), onError: vi.fn() });

describe('widget de Turnstile', () => {
  it('monta el widget con la clave y entrega el token', async () => {
    let opciones: Record<string, (...a: unknown[]) => void> = {};
    window.turnstile = {
      render: vi.fn((_el, o) => {
        opciones = o;
        return 'w1';
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    const cb = callbacks();
    const handle = await renderTurnstile(document.createElement('div'), '0xCLAVE', cb);
    expect(window.turnstile.render).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sitekey: '0xCLAVE' }),
    );
    opciones.callback?.('tok');
    expect(cb.onToken).toHaveBeenCalledWith('tok');
    opciones['expired-callback']?.();
    expect(cb.onClear).toHaveBeenCalledTimes(1);
    handle?.reset();
    expect(cb.onClear).toHaveBeenCalledTimes(2);
    expect(window.turnstile.reset).toHaveBeenCalledWith('w1');
  });

  it('un error del widget limpia el token y avisa', async () => {
    let opciones: Record<string, (...a: unknown[]) => void> = {};
    window.turnstile = {
      render: vi.fn((_el, o) => {
        opciones = o;
        return 'w1';
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    const cb = callbacks();
    await renderTurnstile(document.createElement('div'), '0xCLAVE', cb);
    opciones['error-callback']?.();
    expect(cb.onClear).toHaveBeenCalled();
    expect(cb.onError).toHaveBeenCalled();
  });

  it('si render lanza (clave o dominio inválidos) avisa y no monta nada', async () => {
    window.turnstile = {
      render: vi.fn(() => {
        throw new Error('invalid sitekey');
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    const cb = callbacks();
    expect(await renderTurnstile(document.createElement('div'), 'mala', cb)).toBeNull();
    expect(cb.onError).toHaveBeenCalledTimes(1);
  });

  it('si ya se canceló al terminar la carga no monta ni avisa', async () => {
    window.turnstile = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };
    const cb = callbacks();
    expect(
      await renderTurnstile(document.createElement('div'), '0xCLAVE', cb, () => true),
    ).toBeNull();
    expect(window.turnstile.render).not.toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('si el script falla tras cancelar no avisa', async () => {
    const cb = callbacks();
    let cancelado = false;
    const pendiente = renderTurnstile(
      document.createElement('div'),
      '0xCLAVE',
      cb,
      () => cancelado,
    );
    cancelado = true;
    document.head.querySelector('script')!.dispatchEvent(new Event('error'));
    expect(await pendiente).toBeNull();
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('si el script no carga avisa y no monta nada, y deja reintentar', async () => {
    const cb = callbacks();
    const pendiente = renderTurnstile(document.createElement('div'), '0xCLAVE', cb);
    document.head.querySelector('script')!.dispatchEvent(new Event('error'));
    expect(await pendiente).toBeNull();
    expect(cb.onError).toHaveBeenCalledTimes(1);
    // un segundo intento vuelve a inyectar el script
    const otra = renderTurnstile(document.createElement('div'), '0xCLAVE', callbacks());
    expect(document.head.querySelectorAll('script')).toHaveLength(2);
    document.head.querySelectorAll('script')[1]!.dispatchEvent(new Event('error'));
    await otra;
  });
});
