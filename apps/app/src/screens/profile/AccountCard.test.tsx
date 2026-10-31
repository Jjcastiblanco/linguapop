// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Account, Auth, AuthResult, GoogleSignInResult } from '@linguapop/domain';
import { describe, expect, it, vi } from 'vitest';
import { crearServicios, memoria, renderApp } from '../../test/helpers';

/** Un servicio de cuentas falso que se comporta como el real: guarda la sesión y avisa. */
function authFalso(
  respuesta: AuthResult | ((e: string) => AuthResult) = {
    kind: 'ok',
    account: { id: 'u1', email: 'ana@prueba.test' },
  },
) {
  let actual: Account | null = null;
  const borrado: { ok: boolean; reason: 'network' | 'error' } = { ok: true, reason: 'error' };
  const google: { disponible: boolean; resultado: GoogleSignInResult } = {
    disponible: false,
    resultado: { kind: 'redirecting' },
  };
  const oyentes = new Set<() => void>();
  const llamadas: Array<[string, string, string]> = [];
  const resolver = (modo: string) => async (email: string, password: string) => {
    llamadas.push([modo, email, password]);
    const r = typeof respuesta === 'function' ? respuesta(modo) : respuesta;
    if (r.kind === 'ok') {
      actual = r.account;
      oyentes.forEach((l) => l());
    }
    return r;
  };
  const auth: Auth = {
    available: () => true,
    account: () => actual,
    subscribe: (l) => {
      oyentes.add(l);
      return () => void oyentes.delete(l);
    },
    signUp: resolver('signUp'),
    signIn: resolver('signIn'),
    signOut: vi.fn(async () => {
      actual = null;
      oyentes.forEach((l) => l());
    }),
    googleAvailable: () => google.disponible,
    signInWithGoogle: vi.fn(async () => google.resultado),
    deleteAccount: vi.fn(async () => {
      if (!borrado.ok) return { kind: 'failed' as const, reason: borrado.reason };
      actual = null;
      oyentes.forEach((l) => l());
      return { kind: 'ok' as const };
    }),
  };
  return { auth, llamadas, borrado, google };
}

async function abrir(auth?: Auth) {
  const services = await crearServicios({ storage: memoria().storage, ...(auth ? { auth } : {}) });
  renderApp(services, '/perfil');
  return services;
}

describe('cuenta en el perfil', () => {
  it('sin servicio de cuentas no se menciona', async () => {
    await abrir();
    expect(screen.queryByText('Tu cuenta')).not.toBeInTheDocument();
  });

  it('como invitado ofrece crear cuenta o iniciar sesión', async () => {
    await abrir(authFalso().auth);
    expect(screen.getByText(/Estás como invitado/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }),
    ).toBeInTheDocument();
  });

  it('crear cuenta abre la sesión, avisa y permite cerrarla', async () => {
    const { auth, llamadas } = authFalso();
    await abrir(auth);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
    const hoja = screen.getByRole('dialog', { name: 'Crear cuenta' });
    await userEvent.type(within(hoja).getByLabelText('Correo electrónico'), ' ana@prueba.test ');
    await userEvent.type(within(hoja).getByLabelText('Contraseña'), 'secreto1');
    await userEvent.click(within(hoja).getByRole('button', { name: 'Crear cuenta' }));
    expect(llamadas).toEqual([['signUp', 'ana@prueba.test', 'secreto1']]);
    expect(await screen.findByText('Sesión iniciada como ana@prueba.test')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByText(/Estás como invitado/)).toBeInTheDocument();
  });

  it('se puede cambiar a iniciar sesión', async () => {
    const { auth, llamadas } = authFalso();
    await abrir(auth);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ya tengo cuenta' }));
    const hoja = screen.getByRole('dialog', { name: 'Iniciar sesión' });
    await userEvent.type(within(hoja).getByLabelText('Correo electrónico'), 'ana@prueba.test');
    await userEvent.type(within(hoja).getByLabelText('Contraseña'), 'secreto1');
    await userEvent.click(within(hoja).getByRole('button', { name: 'Iniciar sesión' }));
    expect(llamadas[0]?.[0]).toBe('signIn');
  });

  it.each([
    ['invalid-credentials', 'El correo o la contraseña no son correctos.'],
    ['email-taken', 'Ese correo ya tiene una cuenta. Prueba iniciar sesión.'],
    ['weak-password', 'La contraseña es muy débil: usa al menos 6 caracteres.'],
    ['network', 'No hay conexión. Inténtalo de nuevo cuando vuelva la red.'],
  ] as const)('un fallo %s se explica y deja intentarlo de nuevo', async (reason, texto) => {
    await abrir(authFalso({ kind: 'failed', reason }).auth);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@prueba.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeEnabled();
  });

  it('no cambia el progreso: crear cuenta no registra eventos', async () => {
    const services = await abrir(authFalso().auth);
    const antes = services.progress.getState().events.length;
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@prueba.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto1');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await screen.findByText('Sesión iniciada como ana@prueba.test');
    expect(services.progress.getState().events).toHaveLength(antes);
  });

  describe('entrar con Google', () => {
    it('no se ofrece donde la plataforma no lo permite', async () => {
      await abrir(authFalso().auth);
      await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
      expect(
        screen.queryByRole('button', { name: 'Continuar con Google' }),
      ).not.toBeInTheDocument();
    });

    it('se ofrece en la web y lleva a Google sin cerrar la hoja', async () => {
      const { auth, google } = authFalso();
      google.disponible = true;
      await abrir(auth);
      await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
      await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }));
      expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);
      expect(await screen.findByRole('button', { name: 'Abriendo Google…' })).toBeDisabled();
    });

    it('si falla lo explica y deja volver a intentar', async () => {
      const { auth, google } = authFalso();
      google.disponible = true;
      google.resultado = { kind: 'failed', reason: 'network' };
      await abrir(auth);
      await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
      await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión');
      expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled();
    });
  });

  describe('entrar con Google en el APK', () => {
    const cuenta = { id: 'u1', email: 'ana@prueba.test' };

    it('si termina bien cierra la hoja y da la bienvenida', async () => {
      const { auth, google } = authFalso();
      google.disponible = true;
      google.resultado = { kind: 'ok', account: cuenta };
      await abrir(auth);
      await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
      await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }));
      expect(await screen.findByText('Sesión iniciada')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Continuar con Google' }),
      ).not.toBeInTheDocument();
    });

    it('si la persona cierra el selector no hay error y puede reintentar', async () => {
      const { auth, google } = authFalso();
      google.disponible = true;
      google.resultado = { kind: 'cancelled' };
      await abrir(auth);
      await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
      await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }));
      expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled();
    });
  });

  describe('borrar la cuenta', () => {
    async function conSesion(fake = authFalso()) {
      const services = await abrir(fake.auth);
      await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
      await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@prueba.test');
      await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto1');
      await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
      await screen.findByText('Sesión iniciada como ana@prueba.test');
      await userEvent.click(screen.getByRole('button', { name: 'Borrar cuenta' }));
      return { ...fake, services };
    }

    it('solo se ofrece con la sesión abierta', async () => {
      await abrir(authFalso().auth);
      expect(screen.queryByRole('button', { name: 'Borrar cuenta' })).not.toBeInTheDocument();
    });

    it('pide confirmación y cancelar no borra nada', async () => {
      const { auth } = await conSesion();
      const hoja = screen.getByRole('dialog', { name: '¿Borrar tu cuenta?' });
      expect(within(hoja).getByText(/no se puede deshacer/)).toBeInTheDocument();
      await userEvent.click(within(hoja).getByRole('button', { name: 'Cancelar' }));
      expect(auth.deleteAccount).not.toHaveBeenCalled();
      expect(screen.getByText('Sesión iniciada como ana@prueba.test')).toBeInTheDocument();
    });

    it('al confirmar borra la cuenta, vuelve a invitado y conserva el progreso del dispositivo', async () => {
      const { auth, services } = await conSesion();
      const eventos = services.progress.getState().events.length;
      await userEvent.click(screen.getByRole('button', { name: 'Sí, borrar mi cuenta' }));
      expect(await screen.findByText(/Estás como invitado/)).toBeInTheDocument();
      expect(auth.deleteAccount).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(services.progress.getState().events).toHaveLength(eventos);
    });

    it('si falla, lo explica, mantiene la sesión y deja reintentar', async () => {
      const fake = authFalso();
      fake.borrado.ok = false;
      fake.borrado.reason = 'network';
      await conSesion(fake);
      await userEvent.click(screen.getByRole('button', { name: 'Sí, borrar mi cuenta' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No hay conexión: tu cuenta no se borró',
      );
      expect(screen.getByRole('button', { name: 'Sí, borrar mi cuenta' })).toBeEnabled();
      fake.borrado.ok = true;
      await userEvent.click(screen.getByRole('button', { name: 'Sí, borrar mi cuenta' }));
      expect(await screen.findByText(/Estás como invitado/)).toBeInTheDocument();
    });
  });
});
