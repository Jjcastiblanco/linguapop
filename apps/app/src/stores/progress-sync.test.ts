import { describe, expect, it } from 'vitest';
import type { Account, Auth, PendingEvent, ProgressEvent, ProgressRemote } from '@linguapop/domain';
import { createComposition } from '../composition';
import { createServices } from '../composition/context';
import { memoria, nuevoId, relojFalso } from '../test/helpers';
import { syncProgress } from './progress-sync';

const leccion = (n = 10): PendingEvent => ({
  type: 'session_completed@1',
  payload: {
    mode: 'lesson',
    unitId: 'u-saludos',
    lessonId: 'u-saludos-l1',
    correct: n,
    wrong: 0,
    answered: n,
    durationSec: 60,
    outOfHearts: false,
  },
});

/** El servidor: guarda los eventos de cada cuenta, ignora ids repetidos y puede rechazar o caerse. */
function servidorFalso() {
  const porCuenta = new Map<string, Map<string, ProgressEvent>>();
  const estado = { enLinea: true, rechazar: new Set<string>(), envios: 0 };
  const eventos = (id: string) => porCuenta.get(id) ?? porCuenta.set(id, new Map()).get(id)!;
  const remoto = (cuenta: () => Account | null): ProgressRemote => ({
    available: () => true,
    async push(lote) {
      if (!estado.enLinea) throw new Error('sin red');
      estado.envios += lote.length;
      const out = { accepted: [] as string[], rejected: [] as string[] };
      for (const e of lote) {
        if (estado.rechazar.has(e.id)) out.rejected.push(e.id);
        else {
          const mios = eventos(cuenta()!.id);
          if (!mios.has(e.id)) mios.set(e.id, e);
          out.accepted.push(e.id);
        }
      }
      return out;
    },
    async pull() {
      if (!estado.enLinea) throw new Error('sin red');
      return [...eventos(cuenta()!.id).values()];
    },
  });
  return { estado, eventos, remoto };
}

function authFalso(inicial: Account | null = null) {
  let actual = inicial;
  const oyentes = new Set<() => void>();
  const auth: Auth = {
    available: () => true,
    account: () => actual,
    subscribe: (l) => (oyentes.add(l), () => void oyentes.delete(l)),
    signUp: async () => ({ kind: 'failed', reason: 'error' }),
    signIn: async () => ({ kind: 'failed', reason: 'error' }),
    signOut: async () => void (actual = null),
  };
  return { auth, entrar: (a: Account | null) => (actual = a) };
}

const ana: Account = { id: 'ana', email: 'ana@prueba.test' };
const beto: Account = { id: 'beto', email: 'beto@prueba.test' };

/** Un dispositivo: su propio almacenamiento local y su sesión, hablando con el mismo servidor. */
async function dispositivo(
  servidor: ReturnType<typeof servidorFalso>,
  cuenta: Account | null = ana,
  m = memoria(),
) {
  const sesion = authFalso(cuenta);
  const services = createServices(
    createComposition({
      storage: m.storage,
      timeZone: 'UTC',
      newId: nuevoId,
      clock: relojFalso(),
      auth: sesion.auth,
      progressRemote: servidor.remoto(sesion.auth.account),
    }),
  );
  await services.progress.getState().load();
  const sync = () => syncProgress(services.composition, services.progress);
  return { ...services, ...sesion, sync, m };
}

const heredado = JSON.stringify({
  name: 'Lucía',
  xp: 340,
  gems: 120,
  done: { 0: 3, 1: 1 },
  streak: 4,
  best: 4,
  lastDay: '2026-10-27',
  stats: { lessons: 5, correct: 40, total: 50 },
});

describe('sincronizar el progreso', () => {
  it('dos dispositivos con la misma cuenta ven el mismo progreso', async () => {
    const s = servidorFalso();
    const a = await dispositivo(s);
    const b = await dispositivo(s);
    await a.progress.getState().record([leccion()]);
    expect(await a.sync()).toBe('synced');
    expect(await b.sync()).toBe('synced');
    expect(b.progress.getState().progress.xp).toBe(a.progress.getState().progress.xp);
    expect(b.progress.getState().progress.xp).toBeGreaterThan(0);
  });

  it('reenviar el mismo evento no duplica el XP', async () => {
    const s = servidorFalso();
    const a = await dispositivo(s);
    await a.progress.getState().record([leccion()]);
    await a.sync();
    const xp = a.progress.getState().progress.xp;
    // Se pierde la marca de enviados (por ejemplo, datos del navegador a medias) y se reenvía todo.
    a.m.data.delete('linguapop:synced-ids:v1');
    await a.sync();
    await a.sync();
    expect(a.progress.getState().progress.xp).toBe(xp);
    expect(s.eventos('ana').size).toBe(a.progress.getState().events.length);
  });

  it('lo hecho sin red se envía al volver y no se reenvía después', async () => {
    const s = servidorFalso();
    const a = await dispositivo(s);
    s.estado.enLinea = false;
    await a.progress.getState().record([leccion()]);
    expect(await a.sync()).toBe('offline');
    expect(s.eventos('ana').size).toBe(0);
    expect(a.progress.getState().progress.xp).toBeGreaterThan(0);
    s.estado.enLinea = true;
    expect(await a.sync()).toBe('synced');
    const enviados = s.estado.envios;
    await a.sync();
    expect(s.estado.envios).toBe(enviados);
    expect(s.eventos('ana').size).toBe(a.progress.getState().events.length);
  });

  it('un evento rechazado no cuenta, queda guardado y no se reintenta', async () => {
    const s = servidorFalso();
    const a = await dispositivo(s);
    await a.progress.getState().record([leccion()]);
    const malo = a.progress.getState().events.find((e) => e.type === 'session_completed@1')!;
    s.estado.rechazar.add(malo.id);
    await a.sync();
    expect(a.progress.getState().progress.xp).toBe(0);
    expect(a.progress.getState().events.some((e) => e.id === malo.id)).toBe(true);
    const enviados = s.estado.envios;
    await a.sync();
    expect(s.estado.envios).toBe(enviados);
    // Sigue sin contar tras recargar la app.
    const otra = await dispositivo(s, ana, a.m);
    expect(otra.progress.getState().progress.xp).toBe(0);
  });

  it('el invitado que inicia sesión sube su progreso local a la cuenta', async () => {
    const s = servidorFalso();
    const a = await dispositivo(s, null);
    await a.progress.getState().record([leccion()]);
    expect(await a.sync()).toBe('skipped');
    a.entrar(ana);
    await a.sync();
    const b = await dispositivo(s);
    await b.sync();
    expect(b.progress.getState().progress.xp).toBe(a.progress.getState().progress.xp);
  });

  it('sin sesión o sin servidor no hace nada', async () => {
    const s = servidorFalso();
    const a = await dispositivo(s, null);
    expect(await a.sync()).toBe('skipped');
    expect(s.estado.envios).toBe(0);
  });

  it('otra cuenta en el mismo dispositivo no recibe el progreso ya enviado de la anterior', async () => {
    const s = servidorFalso();
    const a = await dispositivo(s);
    await a.progress.getState().record([leccion()]);
    await a.sync();
    a.entrar(beto);
    await a.sync();
    expect(a.progress.getState().progress.xp).toBe(0);
    expect(s.eventos('beto').size).toBe(0);
  });

  describe('progreso heredado de linguapop.html', () => {
    const importados = (s: ReturnType<typeof servidorFalso>, cuenta: string) =>
      [...s.eventos(cuenta).values()].filter((e) => e.type === 'legacy_imported@1');

    it('al iniciar sesión se importa una vez y el XP coincide con el heredado', async () => {
      const s = servidorFalso();
      const a = await dispositivo(s, null);
      a.m.data.set('linguapop_v1', heredado);
      a.entrar(ana);
      expect(await a.sync()).toBe('synced');
      expect(a.progress.getState().progress.xp).toBe(340);
      expect(importados(s, 'ana')).toHaveLength(1);
      await a.sync();
      await a.sync();
      expect(a.progress.getState().progress.xp).toBe(340);
      expect(importados(s, 'ana')).toHaveLength(1);
    });

    it('otro dispositivo con el mismo dato no lo repite', async () => {
      const s = servidorFalso();
      const a = await dispositivo(s);
      a.m.data.set('linguapop_v1', heredado);
      await a.sync();
      const b = await dispositivo(s);
      b.m.data.set('linguapop_v1', heredado);
      await b.sync();
      expect(importados(s, 'ana')).toHaveLength(1);
      expect(b.progress.getState().progress.xp).toBe(340);
    });

    it('sin datos heredados o ilegibles no importa nada', async () => {
      const s = servidorFalso();
      const a = await dispositivo(s);
      await a.sync();
      a.m.data.set('linguapop_v1', '{no es json');
      await a.sync();
      expect(importados(s, 'ana')).toHaveLength(0);
    });
  });
});
