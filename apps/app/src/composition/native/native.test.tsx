// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createServices } from '../context';
import { createComposition } from '..';
import { memoria, renderApp } from '../../test/helpers';
import { inertInstall, inertUpdate } from './inert';
import { createNativeComposition } from '.';

const nativa = () => createNativeComposition({ storage: memoria().storage, timeZone: 'UTC' });

describe('composición nativa', () => {
  it('es la misma composición que la web con instalar y actualizar inertes', () => {
    const native = nativa();
    const web = createComposition({ storage: memoria().storage, timeZone: 'UTC' });
    expect(Object.keys(native).sort()).toEqual(Object.keys(web).sort());
    expect(native.course).toBe(web.course);
    expect(native.install).toBe(inertInstall);
    expect(native.update).toBe(inertUpdate);
  });

  it('no ofrece instalar la app', async () => {
    expect(inertInstall.available()).toBe(false);
    expect(await inertInstall.prompt()).toBe('unavailable');
    const oyente = vi.fn();
    inertInstall.subscribe(oyente)();
    inertInstall.onInstalled(oyente)();
    expect(oyente).not.toHaveBeenCalled();
  });

  it('una versión nueva ofrecida desde fuera no activa nada ni se anuncia', () => {
    const activar = vi.fn();
    inertUpdate.offer(activar);
    expect(inertUpdate.available()).toBe(false);
    inertUpdate.apply();
    expect(activar).not.toHaveBeenCalled();
  });

  it('en pantalla no aparece el aviso de actualización ni la tarjeta de instalar', async () => {
    const services = createServices(nativa());
    await Promise.all([services.ui.getState().load(), services.progress.getState().load()]);
    renderApp(services, '/perfil');
    act(() => services.composition.update.offer(() => undefined));
    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();
    expect(screen.queryByText('Instalar LinguaPop')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Perfil' })).toBeInTheDocument();
  });
});
