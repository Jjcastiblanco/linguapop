// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Account, Auth, AuthResult, GoogleSignInResult } from '@linguapop/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  const tokens: Array<string | undefined> = [];
  const resolver =
    (modo: string) => async (email: string, password: string, captchaToken?: string) => {
      llamadas.push([modo, email, password]);
      tokens.push(captchaToken);
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
  return { auth, llamadas, tokens, borrado, google };
}

async function abrir(auth?: Auth, captchaSiteKey?: string) {
  const services = await crearServicios({
    storage: memoria().storage,
    ...(auth ? { auth } : {}),
    ...(captchaSiteKey ? { captchaSiteKey } : {}),
  });
  renderApp(services, '/perfil');
  return services;
}

/** Un Turnstile falso: guarda los callbacks para que la prueba entregue o venza el token. */
function turnstileFalso() {
  let opciones: Record<string, (...a: unknown[]) => void> = {};
  const api = {
    render: vi.fn((_el: HTMLElement, o: Record<string, (...a: unknown[]) => void>) => {
      opciones = o;
      return 'w1';
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  window.turnstile = api;
  return {
    api,
    entregar: (token: string) => act(() => opciones.callback?.(token)),
    fallar: () => act(() => opciones['error-callback']?.()),
    vencer: () => act(() => opciones['expired-callback']?.()),
  };
}

describe('captcha en el alta y el acceso con correo', () => {
  afterEach(() => {
    delete window.turnstile;
  });

  async function abrirHoja(auth: Auth) {
    await abrir(auth, '0xCLAVE');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@prueba.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto1');
  }

  it('sin token el botón de correo está deshabilitado y con token manda el token', async () => {
    const ts = turnstileFalso();
    const { auth, tokens } = authFalso();
    await abrirHoja(auth);
    expect(await screen.findByTestId('captcha')).toBeInTheDocument();
    expect(ts.api.render).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sitekey: '0xCLAVE' }),
    );
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled();
    await ts.entregar('tok-1');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(tokens).toEqual(['tok-1']);
  });

  it('tras cada intento pide un token nuevo, también si falla', async () => {
    const ts = turnstileFalso();
    await abrirHoja(authFalso({ kind: 'failed', reason: 'invalid-credentials' }).auth);
    await screen.findByTestId('captcha');
    await ts.entregar('tok-1');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no son correctos');
    expect(ts.api.reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled();
  });

  it('si Turnstile no puede dibujar el widget avisa y deja Google', async () => {
    const ts = turnstileFalso();
    ts.api.render.mockImplementation(() => {
      throw new Error('invalid sitekey');
    });
    const { auth, google } = authFalso();
    google.disponible = true;
    await abrirHoja(auth);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la verificación');
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled();
  });

  it('cambiar entre crear cuenta e iniciar sesión pide un token nuevo', async () => {
    const ts = turnstileFalso();
    await abrirHoja(authFalso().auth);
    await screen.findByTestId('captcha');
    await ts.entregar('tok-1');
    await userEvent.click(screen.getByRole('button', { name: 'Ya tengo cuenta' }));
    expect(ts.api.reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeDisabled();
  });

  it('si el token vence el botón se deshabilita hasta tener otro', async () => {
    const ts = turnstileFalso();
    await abrirHoja(authFalso().auth);
    await screen.findByTestId('captcha');
    await ts.entregar('tok-1');
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeEnabled();
    await ts.vencer();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled();
    await ts.entregar('tok-2');
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeEnabled();
  });

  it('un fallo de captcha del servidor se explica', async () => {
    const ts = turnstileFalso();
    await abrirHoja(authFalso({ kind: 'failed', reason: 'captcha' }).auth);
    await screen.findByTestId('captcha');
    await ts.entregar('tok-1');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Comprueba que no eres un robot');
    expect(ts.api.reset).toHaveBeenCalled();
  });

  it('si el widget falla avisa, bloquea el correo y deja Google', async () => {
    const ts = turnstileFalso();
    const { auth, google } = authFalso();
    google.disponible = true;
    await abrirHoja(auth);
    await screen.findByTestId('captcha');
    await ts.fallar();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la verificación');
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled();
  });

  it('Google no manda token', async () => {
    turnstileFalso();
    const { auth, google, tokens } = authFalso();
    google.disponible = true;
    await abrirHoja(auth);
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }));
    expect(auth.signInWithGoogle).toHaveBeenCalledWith();
    expect(tokens).toEqual([]);
  });

  it('sin clave del sitio no hay widget y el envío no se bloquea', async () => {
    const { auth, tokens } = authFalso();
    await abrir(auth);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@prueba.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto1');
    expect(screen.queryByTestId('captcha')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(tokens).toEqual([undefined]);
  });

  it('al cerrar la hoja el token se descarta', async () => {
    const ts = turnstileFalso();
    await abrirHoja(authFalso().auth);
    await screen.findByTestId('captcha');
    await ts.entregar('tok-1');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@prueba.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto1');
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled();
  });
});

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

  describe('cerrar sesión con progreso sin guardar', () => {
    const cambio = {
      type: 'session_completed@1',
      payload: {
        mode: 'lesson',
        unitId: 'u-saludos',
        lessonId: 'u-saludos-l1',
        correct: 10,
        wrong: 0,
        answered: 10,
        durationSec: 60,
        outOfHearts: false,
      },
    } as const;

    async function sinRed() {
      const { auth } = authFalso();
      const servicios = await crearServicios({
        storage: memoria().storage,
        auth,
        progressRemote: {
          available: () => true,
          push: async () => {
            throw new Error('sin red');
          },
          pull: async () => {
            throw new Error('sin red');
          },
        },
      });
      renderApp(servicios, '/perfil');
      await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta o iniciar sesión' }));
      await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@prueba.test');
      await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto1');
      await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
      await screen.findByText('Sesión iniciada como ana@prueba.test');
      await servicios.progress.getState().record([cambio]);
      return servicios;
    }

    it('avisa, «Esperar» deja la sesión abierta y el progreso intacto', async () => {
      const servicios = await sinRed();
      const xp = servicios.progress.getState().progress.xp;
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
      expect(await screen.findByText('Tienes progreso sin guardar')).toBeInTheDocument();
      expect(screen.getByText(/se subirán solos cuando vuelva la red/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Esperar' }));
      expect(screen.queryByText('Tienes progreso sin guardar')).not.toBeInTheDocument();
      expect(screen.getByText('Sesión iniciada como ana@prueba.test')).toBeInTheDocument();
      expect(servicios.progress.getState().progress.xp).toBe(xp);
    });

    it('«Cerrar sesión y perderlo» cierra y reinicia el progreso', async () => {
      const servicios = await sinRed();
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
      await userEvent.click(
        await screen.findByRole('button', { name: 'Cerrar sesión y perderlo' }),
      );
      expect(await screen.findByText(/Estás como invitado/)).toBeInTheDocument();
      expect(servicios.progress.getState().progress.xp).toBe(0);
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
