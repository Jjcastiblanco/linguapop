// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import type { Account, Auth, LeagueRemote, LeagueStanding, PendingEvent } from '@linguapop/domain';
import { describe, expect, it, vi } from 'vitest';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';
import { SYNCED_KEY } from '../../stores/progress-sync';
import { REFRESH_DELAY_MS, REFRESH_MAX_WAIT_MS } from './LeaguesScreen';

// 2026-10-28 12:00 UTC es miércoles: quedan 5 días de la semana.
const MIERCOLES = Date.UTC(2026, 9, 28, 12, 0, 0);

async function abrir(antes: PendingEvent[] = [], ms = MIERCOLES) {
  const services = await crearServicios({ storage: memoria().storage, clock: relojFalso(ms) });
  if (antes.length) await services.progress.getState().record(antes);
  return renderApp(services, '/ligas');
}

const sesion = (correct: number): PendingEvent => ({
  type: 'session_completed@1',
  payload: {
    mode: 'lesson',
    unitId: 'u-saludos',
    lessonId: 'u-saludos-l1',
    correct,
    wrong: 0,
    answered: correct,
    durationSec: 60,
    outOfHearts: false,
  },
});
const filas = () => screen.getAllByTestId(/^league-row-/);
const mia = () => filas().find((f) => f.getAttribute('data-me') === 'true')!;

describe('pantalla Ligas', () => {
  it('muestra la liga, los días restantes y 30 jugadores', async () => {
    await abrir();
    expect(screen.getByTestId('league-tier')).toHaveTextContent('Liga Bronce');
    expect(screen.getByTestId('league-days')).toHaveTextContent('Quedan 5 días');
    expect(filas()).toHaveLength(30);
    expect(screen.getByText('Clasificación simulada con jugadores bot.')).toBeInTheDocument();
  });

  it('abrirla dos veces el mismo día da la misma tabla', async () => {
    const a = await abrir();
    const antes = filas().map((f) => f.textContent);
    a.unmount();
    await abrir();
    expect(filas().map((f) => f.textContent)).toEqual(antes);
  });

  it('el estudiante sin XP queda al final, resaltado con "(tú)" y en zona de descenso', async () => {
    await abrir();
    expect(mia()).toHaveTextContent('Explorador (tú)');
    expect(mia()).toHaveAttribute('data-zone', 'demotion');
    expect(Number(within(mia()).getAllByText(/^\d+$/)[0]!.textContent)).toBeGreaterThanOrEqual(26);
  });

  it('el XP de la semana lo sube de puesto', async () => {
    await abrir([sesion(60)]);
    expect(mia()).toHaveAttribute('data-zone', 'promotion');
    expect(mia()).toHaveAttribute('data-testid', 'league-row-1');
  });

  it('marca las tres zonas con sus separadores', async () => {
    await abrir();
    expect(screen.getByText('▲ ZONA DE ASCENSO ▲')).toBeInTheDocument();
    expect(screen.getByText('— ZONA SEGURA —')).toBeInTheDocument();
    expect(screen.getByText('▼ ZONA DE DESCENSO ▼')).toBeInTheDocument();
    expect(screen.getByTestId('league-row-10')).toHaveAttribute('data-zone', 'promotion');
    expect(screen.getByTestId('league-row-26')).toHaveAttribute('data-zone', 'demotion');
  });

  it('con 500 XP totales la liga es Plata', async () => {
    await abrir([sesion(50)]);
    expect(screen.getByTestId('league-tier')).toHaveTextContent('Liga Plata');
  });

  it('el domingo queda 1 día', async () => {
    await abrir([], Date.UTC(2026, 10, 1, 12, 0, 0));
    expect(screen.getByTestId('league-days')).toHaveTextContent('Queda 1 día');
  });
});

// La liga real (7.4) ------------------------------------------------------------------------------

/** Un servicio de cuentas falso con la sesión que se le diga; `abrirSesion` la abre y avisa. */
function authFalso(inicial: Account | null, disponible = true) {
  let actual = inicial;
  const oyentes = new Set<() => void>();
  const auth: Auth = {
    available: () => disponible,
    account: () => actual,
    subscribe: (l) => {
      oyentes.add(l);
      return () => void oyentes.delete(l);
    },
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    googleAvailable: () => false,
    signInWithGoogle: vi.fn(),
    deleteAccount: vi.fn(),
  };
  const abrirSesion = (cuenta: Account) => {
    actual = cuenta;
    oyentes.forEach((l) => l());
  };
  return { auth, abrirSesion };
}
const ANA: Account = { id: 'u1', email: 'ana@prueba.test' };

const fila = (rank: number, extra: Partial<LeagueStanding> = {}): LeagueStanding => ({
  rank,
  name: `Jugador ${rank}`,
  xp: 300 - rank * 5,
  isBot: false,
  isMe: false,
  ...extra,
});
const tablaDe30 = () =>
  Array.from({ length: 30 }, (_, i) => fila(i + 1, { isBot: i % 2 === 1, isMe: i === 3 }));

type Respuesta = LeagueStanding[] | Error | Promise<LeagueStanding[]>;

/** Un servidor de liga falso: `cambiar` fija lo que lee `refresh` y `avisar` simula el aviso en vivo. */
function ligaFalsa(respuesta: Respuesta, disponible = true) {
  let actual: Respuesta = respuesta;
  const oyentes = new Set<() => void>();
  const leer = async () => {
    const r = await actual;
    if (r instanceof Error) throw r;
    return r;
  };
  const parados = vi.fn();
  const liga = {
    available: () => disponible,
    open: vi.fn(leer),
    refresh: vi.fn(leer),
    watch: vi.fn((cb: () => void) => {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
        parados();
      };
    }),
    cambiar: (nueva: Respuesta) => {
      actual = nueva;
    },
    avisar: () => oyentes.forEach((cb) => cb()),
    oyentes: () => oyentes.size,
    parados,
  };
  return liga satisfies LeagueRemote;
}

async function abrirReal(
  auth: Auth,
  leagueRemote: LeagueRemote,
  antes: PendingEvent[] = [],
  ms = MIERCOLES,
) {
  const services = await crearServicios({
    storage: memoria().storage,
    clock: relojFalso(ms),
    auth,
    leagueRemote,
  });
  if (antes.length) await services.progress.getState().record(antes);
  return renderApp(services, '/ligas');
}

describe('pantalla Ligas con la tabla real', () => {
  it('con sesión muestra la tabla del servidor en su orden, con los bots marcados', async () => {
    const liga = ligaFalsa(tablaDe30());
    await abrirReal(authFalso(ANA).auth, liga);
    expect(await screen.findByTestId('league-row-1')).toHaveTextContent('Jugador 1');
    expect(filas()).toHaveLength(30);
    expect(liga.open).toHaveBeenCalledTimes(1);
    expect(mia()).toHaveTextContent('Jugador 4 (tú)');
    expect(filas()[1]).toHaveAttribute('data-bot', 'true');
    expect(within(filas()[1]!).getByText('bot')).toBeInTheDocument();
    expect(within(filas()[0]!).queryByText('bot')).not.toBeInTheDocument();
    expect(screen.queryByText('Clasificación simulada con jugadores bot.')).not.toBeInTheDocument();
    expect(screen.getByText(/Clasificación semanal real/)).toBeInTheDocument();
  });

  it('no cuenta los días: la semana es del servidor', async () => {
    await abrirReal(authFalso(ANA).auth, ligaFalsa(tablaDe30()));
    expect(await screen.findByTestId('league-days')).toHaveTextContent(
      'Clasificación de esta semana',
    );
    expect(screen.queryByText(/Quedan/)).not.toBeInTheDocument();
  });

  it('las zonas salen del puesto y el nivel del XP total', async () => {
    await abrirReal(authFalso(ANA).auth, ligaFalsa(tablaDe30()), [sesion(50)]);
    expect(await screen.findByTestId('league-row-10')).toHaveAttribute('data-zone', 'promotion');
    expect(screen.getByTestId('league-row-11')).toHaveAttribute('data-zone', 'safe');
    expect(screen.getByTestId('league-row-26')).toHaveAttribute('data-zone', 'demotion');
    expect(screen.getByTestId('league-tier')).toHaveTextContent('Liga Plata');
  });

  it('muestra los puestos que da el servidor, aunque haya empates', async () => {
    await abrirReal(
      authFalso(ANA).auth,
      ligaFalsa([fila(1, { xp: 50 }), fila(1, { xp: 50, isMe: true }), fila(3, { xp: 10 })]),
    );
    await screen.findByTestId('league-row-1');
    expect(filas().map((f) => within(f).getAllByText(/^\d+$/)[0]!.textContent)).toEqual([
      '1',
      '1',
      '3',
    ]);
  });

  it('mientras carga no muestra ninguna tabla', async () => {
    const liga = ligaFalsa(new Promise<LeagueStanding[]>(() => undefined));
    await abrirReal(authFalso(ANA).auth, liga);
    expect(await screen.findByText('Cargando la liga…')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^league-row-/)).toHaveLength(0);
  });

  it('como invitado ofrece iniciar sesión y deja la liga simulada, sin llamar al servidor', async () => {
    const liga = ligaFalsa(tablaDe30());
    await abrirReal(authFalso(null).auth, liga);
    expect(screen.getByTestId('league-signin')).toHaveTextContent('Inicia sesión para competir');
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/perfil');
    expect(filas()).toHaveLength(30);
    expect(screen.getByText('Clasificación simulada con jugadores bot.')).toBeInTheDocument();
    expect(liga.open).not.toHaveBeenCalled();
  });

  it('sin servicio de cuentas no pide iniciar sesión y queda la simulada', async () => {
    await abrirReal(authFalso(null, false).auth, ligaFalsa(tablaDe30(), false));
    expect(screen.queryByTestId('league-signin')).not.toBeInTheDocument();
    expect(screen.getByText('Clasificación simulada con jugadores bot.')).toBeInTheDocument();
  });

  it('con el servidor caído queda la simulada con el aviso de conexión', async () => {
    await abrirReal(authFalso(ANA).auth, ligaFalsa(new Error('sin red')));
    expect(await screen.findByText(/No hay conexión con la liga/)).toBeInTheDocument();
    expect(filas()).toHaveLength(30);
    expect(screen.getByText('Clasificación simulada con jugadores bot.')).toBeInTheDocument();
    expect(screen.getByTestId('league-days')).toHaveTextContent('Quedan 5 días');
  });

  it('una tabla vacía cuenta como sin respuesta', async () => {
    await abrirReal(authFalso(ANA).auth, ligaFalsa([]));
    expect(await screen.findByText(/No hay conexión con la liga/)).toBeInTheDocument();
  });

  it('el nombre se ve como texto y solo is_bot pone la marca', async () => {
    await abrirReal(
      authFalso(ANA).auth,
      ligaFalsa([
        fila(1, { name: '<b>Negrita</b>' }),
        fila(2, { name: 'Robi', isBot: false }),
        fila(3, { name: 'Ana', isBot: true }),
        fila(4, { isMe: true }),
      ]),
    );
    expect(await screen.findByText('<b>Negrita</b>')).toBeInTheDocument();
    expect(filas()[0]!.querySelector('b')).toBeNull();
    expect(within(filas()[1]!).queryByText('bot')).not.toBeInTheDocument();
    expect(within(filas()[2]!).getByText('bot')).toBeInTheDocument();
  });

  it('al iniciar sesión con la pantalla abierta pasa a la tabla real', async () => {
    const { auth, abrirSesion } = authFalso(null);
    const liga = ligaFalsa(tablaDe30());
    await abrirReal(auth, liga);
    expect(screen.getByTestId('league-signin')).toBeInTheDocument();
    abrirSesion(ANA);
    await waitFor(() => expect(screen.getByText(/Clasificación semanal real/)).toBeInTheDocument());
    expect(screen.queryByTestId('league-signin')).not.toBeInTheDocument();
    expect(liga.open).toHaveBeenCalledTimes(1);
  });

  it('al cambiar de cuenta nunca pinta la tabla de la anterior', async () => {
    const { auth, abrirSesion } = authFalso(ANA);
    const respuestas = [
      Promise.resolve(tablaDe30()),
      new Promise<LeagueStanding[]>(() => undefined),
    ];
    const liga: LeagueRemote = {
      ...ligaFalsa([]),
      open: vi.fn(() => respuestas.shift()!),
    };
    await abrirReal(auth, liga);
    expect(await screen.findByTestId('league-row-1')).toBeInTheDocument();
    abrirSesion({ id: 'u2', email: 'bea@prueba.test' });
    await screen.findByText('Cargando la liga…');
    expect(screen.queryAllByTestId(/^league-row-/)).toHaveLength(0);
  });

  it('al cerrar la sesión vuelve al aviso con la liga simulada', async () => {
    const { auth, abrirSesion } = authFalso(ANA);
    await abrirReal(auth, ligaFalsa(tablaDe30()));
    await screen.findByText(/Clasificación semanal real/);
    abrirSesion(null as unknown as Account);
    await screen.findByTestId('league-signin');
    expect(screen.getByText('Clasificación simulada con jugadores bot.')).toBeInTheDocument();
  });

  it('una tabla sin la fila de la persona cuenta como sin respuesta', async () => {
    await abrirReal(authFalso(ANA).auth, ligaFalsa([fila(1), fila(2)]));
    expect(await screen.findByText(/No hay conexión con la liga/)).toBeInTheDocument();
  });

  it('el aviso de conexión queda encima de la tabla simulada', async () => {
    await abrirReal(authFalso(ANA).auth, ligaFalsa(new Error('sin red')));
    const aviso = await screen.findByText(/No hay conexión con la liga/);
    const tabla = screen.getByRole('list', { name: 'Clasificación semanal' });
    expect(tabla.compareDocumentPosition(aviso) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('si el servidor no contesta en 10 segundos queda la simulada', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await abrirReal(
        authFalso(ANA).auth,
        ligaFalsa(new Promise<LeagueStanding[]>(() => undefined)),
      );
      expect(await screen.findByText('Cargando la liga…')).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await screen.findByText(/No hay conexión con la liga/)).toBeInTheDocument();
      expect(filas()).toHaveLength(30);
    } finally {
      vi.useRealTimers();
    }
  });

  it('una respuesta que llega después de salir de la pantalla no rompe nada', async () => {
    let responder!: (r: LeagueStanding[]) => void;
    const liga = ligaFalsa(new Promise<LeagueStanding[]>((ok) => (responder = ok)));
    const { unmount } = await abrirReal(authFalso(ANA).auth, liga);
    unmount();
    expect(() => responder(tablaDe30())).not.toThrow();
  });

  describe('en vivo', () => {
    const conXp = (xp: number): PendingEvent =>
      ({ ...sesion(10), payload: { ...sesion(10).payload, xp } }) as PendingEvent;
    const nombres = () => filas().map((f) => f.textContent);
    /** La tabla se pinta antes de que el efecto empiece a escuchar: se espera a que escuche. */
    const escuchando = (liga: { oyentes: () => number }) =>
      waitFor(() => expect(liga.oyentes()).toBe(1));

    async function conRelojFalso<T>(prueba: () => Promise<T>) {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        return await prueba();
      } finally {
        vi.useRealTimers();
      }
    }

    it('un aviso actualiza la tabla sin recargar', async () => {
      await conRelojFalso(async () => {
        const liga = ligaFalsa(tablaDe30());
        await abrirReal(authFalso(ANA).auth, liga);
        await screen.findByTestId('league-row-1');
        await escuchando(liga);
        liga.cambiar(
          tablaDe30().map((f, i) => (i === 0 ? { ...f, name: 'Recién llegada', xp: 999 } : f)),
        );
        liga.avisar();
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
        await waitFor(() =>
          expect(screen.getByTestId('league-row-1')).toHaveTextContent('Recién llegada'),
        );
        expect(liga.open).toHaveBeenCalledTimes(1);
        expect(liga.refresh).toHaveBeenCalledTimes(1);
      });
    });

    it('una ráfaga de avisos hace una sola lectura', async () => {
      await conRelojFalso(async () => {
        const liga = ligaFalsa(tablaDe30());
        await abrirReal(authFalso(ANA).auth, liga);
        await screen.findByTestId('league-row-1');
        await escuchando(liga);
        liga.avisar();
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS / 2);
        liga.avisar();
        liga.avisar();
        expect(liga.refresh).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
        expect(liga.refresh).toHaveBeenCalledTimes(1);
      });
    });

    it('si la lectura del aviso falla, la tabla se queda como estaba', async () => {
      await conRelojFalso(async () => {
        const liga = ligaFalsa(tablaDe30());
        await abrirReal(authFalso(ANA).auth, liga);
        await screen.findByTestId('league-row-1');
        const antes = nombres();
        await escuchando(liga);
        liga.cambiar(new Error('sin red'));
        liga.avisar();
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
        expect(liga.refresh).toHaveBeenCalledTimes(1);
        expect(nombres()).toEqual(antes);
        expect(screen.queryByText(/No hay conexión con la liga/)).not.toBeInTheDocument();
      });
    });

    it('una lectura sin la fila propia no sustituye la tabla', async () => {
      await conRelojFalso(async () => {
        const liga = ligaFalsa(tablaDe30());
        await abrirReal(authFalso(ANA).auth, liga);
        await screen.findByTestId('league-row-1');
        const antes = nombres();
        await escuchando(liga);
        liga.cambiar([fila(1), fila(2)]);
        liga.avisar();
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
        expect(nombres()).toEqual(antes);
      });
    });

    it('al salir de la pantalla deja de escuchar y cancela la lectura pendiente', async () => {
      await conRelojFalso(async () => {
        const liga = ligaFalsa(tablaDe30());
        const { unmount } = await abrirReal(authFalso(ANA).auth, liga);
        await screen.findByTestId('league-row-1');
        await escuchando(liga);
        liga.avisar();
        unmount();
        expect(liga.parados).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS * 2);
        expect(liga.refresh).not.toHaveBeenCalled();
      });
    });

    it('no escucha mientras carga, como invitado ni sin servidor', async () => {
      const cargando = ligaFalsa(new Promise<LeagueStanding[]>(() => undefined));
      await abrirReal(authFalso(ANA).auth, cargando);
      await screen.findByText('Cargando la liga…');
      expect(cargando.watch).not.toHaveBeenCalled();
      const invitado = ligaFalsa(tablaDe30());
      await abrirReal(authFalso(null).auth, invitado);
      expect(invitado.watch).not.toHaveBeenCalled();
      const sinServidor = ligaFalsa(tablaDe30(), false);
      await abrirReal(authFalso(ANA).auth, sinServidor);
      expect(sinServidor.watch).not.toHaveBeenCalled();
      expect(sinServidor.open).not.toHaveBeenCalled();
    });

    it('el XP propio suma lo que el servidor aún no tiene y no toca las demás filas', async () => {
      await abrirReal(authFalso(ANA).auth, ligaFalsa(tablaDe30()), [conXp(30)]);
      const propia = await screen.findByTestId('league-row-4');
      // El servidor dice 300 - 4 × 5 = 280; se suman los 30 pendientes.
      await waitFor(() => expect(propia).toHaveTextContent('310 XP'));
      expect(screen.getByTestId('league-row-5')).toHaveTextContent('275 XP');
      expect(screen.getByTestId('league-row-3')).toHaveTextContent('285 XP');
      expect(filas().map((f) => f.getAttribute('data-testid'))).toHaveLength(30);
    });

    it('sin XP pendiente muestra el del servidor tal cual', async () => {
      await abrirReal(authFalso(ANA).auth, ligaFalsa(tablaDe30()));
      expect(await screen.findByTestId('league-row-4')).toHaveTextContent('280 XP');
    });

    it('con avisos sin pausa la tabla se actualiza igual, sin esperar al final', async () => {
      await conRelojFalso(async () => {
        const liga = ligaFalsa(tablaDe30());
        await abrirReal(authFalso(ANA).auth, liga);
        await screen.findByTestId('league-row-1');
        await escuchando(liga);
        for (let ms = 0; ms < REFRESH_MAX_WAIT_MS + 1_000; ms += 1_000) {
          liga.avisar();
          await vi.advanceTimersByTimeAsync(1_000);
        }
        expect(liga.refresh).toHaveBeenCalled();
      });
    });

    it('una lectura lenta no pisa a una más nueva', async () => {
      await conRelojFalso(async () => {
        const liga = ligaFalsa(tablaDe30());
        await abrirReal(authFalso(ANA).auth, liga);
        await screen.findByTestId('league-row-1');
        await escuchando(liga);
        let soltarLenta!: (r: LeagueStanding[]) => void;
        const vieja = tablaDe30().map((f, i) => (i === 0 ? { ...f, name: 'Vieja' } : f));
        const nueva = tablaDe30().map((f, i) => (i === 0 ? { ...f, name: 'Nueva' } : f));
        liga.refresh
          .mockImplementationOnce(() => new Promise<LeagueStanding[]>((ok) => (soltarLenta = ok)))
          .mockImplementationOnce(async () => nueva);
        liga.avisar();
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
        liga.avisar();
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
        await waitFor(() => expect(screen.getByTestId('league-row-1')).toHaveTextContent('Nueva'));
        soltarLenta(vieja);
        await vi.advanceTimersByTimeAsync(10);
        expect(screen.getByTestId('league-row-1')).toHaveTextContent('Nueva');
      });
    });

    it('lo que ya llegó al servidor deja de contarse como pendiente al volver a leer', async () => {
      await conRelojFalso(async () => {
        const liga = ligaFalsa(tablaDe30());
        const services = await crearServicios({
          storage: memoria().storage,
          clock: relojFalso(MIERCOLES),
          auth: authFalso(ANA).auth,
          leagueRemote: liga,
        });
        await services.progress.getState().record([conXp(30)]);
        renderApp(services, '/ligas');
        // El servidor dice 280 y hay 30 sin enviar.
        await waitFor(() => expect(screen.getByTestId('league-row-4')).toHaveTextContent('310 XP'));
        await escuchando(liga);
        // El envío termina: el servidor ya lo tiene, pero el progreso local no cambia.
        const ids = (await services.composition.progressSink.readAll()).map((e) => e.id);
        await services.composition.store.set(SYNCED_KEY, JSON.stringify(ids));
        liga.cambiar(tablaDe30().map((f, i) => (i === 3 ? { ...f, xp: 310 } : f)));
        liga.avisar();
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
        await waitFor(() => expect(screen.getByTestId('league-row-4')).toHaveTextContent('310 XP'));
        expect(screen.getByTestId('league-row-4')).not.toHaveTextContent('340 XP');
      });
    });
  });
});
