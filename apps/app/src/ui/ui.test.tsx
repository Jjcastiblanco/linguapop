// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../composition/context';
import { crearServicios, memoria, relojFalso } from '../test/helpers';
import { CONFETTI_LIFETIME_MS, Confetti } from './Confetti';
import { Modal } from './Modal';

afterEach(() => vi.useRealTimers());

describe('diálogo', () => {
  it('es un diálogo modal con título, y mueve el foco al primer botón', () => {
    render(
      <Modal title="Aviso" onClose={() => undefined}>
        <button type="button">Aceptar</button>
      </Modal>,
    );
    const d = screen.getByRole('dialog', { name: 'Aviso' });
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Aceptar' })).toHaveFocus();
  });

  it('se cierra con Escape y tocando fuera, pero no tocando dentro', async () => {
    const cerrar = vi.fn();
    render(
      <Modal title="Aviso" onClose={cerrar}>
        <p>Contenido</p>
      </Modal>,
    );
    await userEvent.click(screen.getByText('Contenido'));
    expect(cerrar).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(cerrar).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByTestId('modal-backdrop'));
    expect(cerrar).toHaveBeenCalledTimes(2);
  });

  it('devuelve el foco al elemento anterior al cerrarse', () => {
    const { rerender } = render(<button type="button">Abrir</button>);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    abrir.focus();
    rerender(
      <>
        <button type="button">Abrir</button>
        <Modal title="Aviso" onClose={() => undefined}>
          <button type="button">Aceptar</button>
        </Modal>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Aceptar' })).toHaveFocus();
    rerender(<button type="button">Abrir</button>);
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus();
  });
});

describe('confeti', () => {
  async function dibujar(count?: number) {
    const services = await crearServicios({ storage: memoria().storage, clock: relojFalso() });
    return render(
      <AppProvider services={services}>
        <Confetti {...(count ? { count } : {})} />
      </AppProvider>,
    );
  }

  it('dibuja las piezas pedidas (50 por defecto), escondidas a los lectores de pantalla', async () => {
    const { container } = await dibujar();
    expect(screen.getByTestId('confetti')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('[data-testid="confetti"] > div')).toHaveLength(50);
    const otra = await dibujar(12);
    expect(otra.container.querySelectorAll('[data-testid="confetti"] > div')).toHaveLength(12);
  });

  it('desaparece solo pasados unos segundos', async () => {
    vi.useFakeTimers();
    await dibujar(5);
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(CONFETTI_LIFETIME_MS - 1));
    expect(screen.queryByTestId('confetti')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.queryByTestId('confetti')).toBeNull();
  });
});
