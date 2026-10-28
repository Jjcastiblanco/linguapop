// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createWebUpdate } from '../composition/adapters/web-update';
import { crearServicios, memoria, renderApp } from '../test/helpers';

async function abrir(ruta = '/aprender') {
  const update = createWebUpdate();
  const services = await crearServicios({ storage: memoria().storage, update });
  const app = renderApp(services, ruta);
  return { update, services, ...app };
}

describe('aviso de nueva versión en pantalla', () => {
  it('no se ve mientras no haya versión nueva', async () => {
    await abrir();
    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();
  });

  it('aparece en las pantallas principales y Actualizar activa la versión nueva', async () => {
    const { update } = await abrir();
    const activar = vi.fn();
    act(() => update.offer(activar));
    expect(screen.getByText('Hay una versión nueva de LinguaPop')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(activar).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();
  });

  it('Luego lo oculta sin activar nada', async () => {
    const { update } = await abrir('/practicar');
    const activar = vi.fn();
    act(() => update.offer(activar));
    await userEvent.click(screen.getByRole('button', { name: 'Luego' }));
    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();
    expect(activar).not.toHaveBeenCalled();
  });

  it.each(['/leccion/u-saludos/u-saludos-l1', '/llamada'])(
    'nunca aparece sobre una pantalla a pantalla completa (%s)',
    async (ruta) => {
      const { update } = await abrir(ruta);
      act(() => update.offer(() => undefined));
      expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();
    },
  );
});
