import { describe, expect, it, vi } from 'vitest';
import { createWebInstall, type InstallPromptEvent } from './web-install';

function aviso(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as InstallPromptEvent;
  event.prompt = vi.fn(async () => undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

function entorno(standalone = false) {
  const target = new EventTarget();
  return { target, env: { target, standalone: () => standalone } };
}

describe('instalación como PWA', () => {
  it('sin aviso del navegador no hay nada que ofrecer', async () => {
    const { env } = entorno();
    const install = createWebInstall(env);
    expect(install.available()).toBe(false);
    expect(await install.prompt()).toBe('unavailable');
  });

  it('guarda el aviso, evita que el navegador lo muestre solo y avisa a quien escucha', () => {
    const { env, target } = entorno();
    const install = createWebInstall(env);
    const oyente = vi.fn();
    install.subscribe(oyente);
    const event = aviso();
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(install.available()).toBe(true);
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('al instalar lanza el aviso una sola vez y devuelve la elección', async () => {
    const { env, target } = entorno();
    const install = createWebInstall(env);
    const event = aviso('dismissed');
    target.dispatchEvent(event);
    expect(await install.prompt()).toBe('dismissed');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(install.available()).toBe(false);
    expect(await install.prompt()).toBe('unavailable');
  });

  it('si la app ya está instalada no se ofrece, y al instalarla se limpia', () => {
    const instalada = entorno(true);
    const a = createWebInstall(instalada.env);
    instalada.target.dispatchEvent(aviso());
    expect(a.available()).toBe(false);

    const nueva = entorno();
    const b = createWebInstall(nueva.env);
    nueva.target.dispatchEvent(aviso());
    expect(b.available()).toBe(true);
    nueva.target.dispatchEvent(new Event('appinstalled'));
    expect(b.available()).toBe(false);
  });

  it('un error al mostrar el aviso no rompe nada', async () => {
    const { env, target } = entorno();
    const install = createWebInstall(env);
    const event = aviso();
    event.prompt = vi.fn(async () => {
      throw new Error('no');
    });
    target.dispatchEvent(event);
    expect(await install.prompt()).toBe('unavailable');
  });

  it('sin navegador (sin window) funciona sin ofrecer nada', () => {
    const install = createWebInstall(null);
    expect(install.available()).toBe(false);
  });
});
