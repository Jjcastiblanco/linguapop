// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import type { Account, Auth, LeagueRemote, LeagueStanding, PendingEvent } from '@linguapop/domain';
import { describe, expect, it, vi } from 'vitest';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

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

function ligaFalsa(
  respuesta: LeagueStanding[] | Error | Promise<LeagueStanding[]>,
  disponible = true,
): LeagueRemote & { open: ReturnType<typeof vi.fn> } {
  return {
    available: () => disponible,
    open: vi.fn(async () => {
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    }),
  };
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
    const liga: LeagueRemote = { available: () => true, open: vi.fn(() => respuestas.shift()!) };
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

  it('el aviso de conexión queda debajo de la tabla simulada', async () => {
    await abrirReal(authFalso(ANA).auth, ligaFalsa(new Error('sin red')));
    const aviso = await screen.findByText(/No hay conexión con la liga/);
    const tabla = screen.getByRole('list', { name: 'Clasificación semanal' });
    expect(tabla.compareDocumentPosition(aviso) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
});
