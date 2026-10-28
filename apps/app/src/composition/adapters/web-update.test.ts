import { describe, expect, it, vi } from 'vitest';
import { createWebUpdate } from './web-update';

describe('aviso de nueva versión', () => {
  it('sin oferta no hay nada que mostrar', () => {
    const update = createWebUpdate();
    expect(update.available()).toBe(false);
    expect(() => update.apply()).not.toThrow();
  });

  it('al ofrecerse una versión avisa a quien escucha', () => {
    const update = createWebUpdate();
    const oyente = vi.fn();
    update.subscribe(oyente);
    update.offer(() => undefined);
    expect(update.available()).toBe(true);
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('aplicar activa la versión una sola vez y oculta el aviso', () => {
    const update = createWebUpdate();
    const activar = vi.fn();
    update.offer(activar);
    update.apply();
    update.apply();
    expect(activar).toHaveBeenCalledTimes(1);
    expect(update.available()).toBe(false);
  });

  it('dejarlo para luego oculta el aviso sin activar nada', () => {
    const update = createWebUpdate();
    const activar = vi.fn();
    update.offer(activar);
    update.dismiss();
    expect(update.available()).toBe(false);
    expect(activar).not.toHaveBeenCalled();
  });

  it('una oferta posterior vuelve a mostrar el aviso', () => {
    const update = createWebUpdate();
    update.offer(() => undefined);
    update.dismiss();
    update.offer(() => undefined);
    expect(update.available()).toBe(true);
  });

  it('quien deja de escuchar ya no recibe avisos', () => {
    const update = createWebUpdate();
    const oyente = vi.fn();
    update.subscribe(oyente)();
    update.offer(() => undefined);
    expect(oyente).not.toHaveBeenCalled();
  });
});
