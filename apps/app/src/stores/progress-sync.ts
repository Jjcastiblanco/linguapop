import {
  EVENT_TYPES,
  LEGACY_STORAGE_KEY,
  legacyEventId,
  legacyImportEvent,
} from '@linguapop/domain';
import type { DeleteAccountResult } from '@linguapop/domain';
import type { Composition } from '../composition';
import type { ProgressStore } from './progress-store';

export const SYNC_OWNER_KEY = 'linguapop:sync-owner:v1';
export const SYNCED_KEY = 'linguapop:synced-ids:v1';
/** Hora del servidor (`received_at`) hasta la que este dispositivo ya trajo los eventos de la cuenta. */
export const PULL_CURSOR_KEY = 'linguapop:pull-cursor:v1';

/**
 * El cursor lleva los tipos de evento que esta versión entiende: `pull` descarta los que no conoce y
 * el cursor pasa de largo, así que una versión que entienda más tipos debe volver a pedir todo.
 */
const CURSOR_TAG = EVENT_TYPES.join(',');

async function readCursor(c: Composition): Promise<string | null> {
  const raw = await c.store.get(PULL_CURSOR_KEY);
  const at = raw ? raw.lastIndexOf('|') : -1;
  if (!raw || at < 0 || raw.slice(0, at) !== CURSOR_TAG) return null;
  return raw.slice(at + 1) || null;
}

/** Espera tras un cambio de progreso antes de sincronizar, para juntar los eventos de una lección. */
export const SYNC_DELAY_MS = 2000;

/** Cada cuánto vuelve a mirar el servidor una pestaña visible, para ver lo hecho en otro dispositivo. */
export const SYNC_POLL_MS = 60_000;

/** Una vez por dispositivo: lo heredado de este navegador pertenece a la primera cuenta que entra. */
export const LEGACY_DONE_KEY = 'linguapop:legacy-imported:v1';

export type SyncResult = 'synced' | 'skipped' | 'offline';

async function readIds(c: Composition): Promise<Set<string>> {
  const raw = await c.store.get(SYNCED_KEY);
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Convierte una sola vez por dispositivo el progreso de `linguapop.html` guardado en este navegador en
 * un evento sintético (AD-15). El id depende de la cuenta: si otro dispositivo ya lo subió, llega
 * en el `pull` y aquí solo se anota; si no, se crea y sube con los demás eventos pendientes.
 */
async function importLegacy(c: Composition, accountId: string): Promise<void> {
  if (await c.store.get(LEGACY_DONE_KEY)) return;
  const id = legacyEventId(accountId);
  if ((await c.progressSink.readAll()).some((e) => e.id === id)) {
    await c.store.set(LEGACY_DONE_KEY, accountId);
    return;
  }
  const raw = await c.store.get(LEGACY_STORAGE_KEY);
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return; // datos heredados ilegibles: no hay nada que importar
  }
  const event = legacyImportEvent(parsed, {
    id,
    nowMs: c.clock.now(),
    contentVersion: c.contentVersion,
  });
  if (!event) return;
  await c.progressSink.append(event);
  await c.store.set(LEGACY_DONE_KEY, accountId);
}

/**
 * Trae lo que el servidor recibió desde el último cursor, lo anota y marca los rechazados que este
 * dispositivo tiene. El cursor solo avanza cuando todo quedó guardado: si falla a medias, la próxima
 * pasada repite desde el mismo punto. Sin progreso local no se confía en el cursor.
 */
async function pullNew(c: Composition, synced: Set<string>): Promise<void> {
  const local = await c.progressSink.readAll();
  const result = await c.progressRemote.pull(local.length > 0 ? await readCursor(c) : null);
  for (const e of result.events) {
    await c.progressSink.append(e);
    synced.add(e.id);
  }
  if (result.rejected.length > 0) {
    const held = new Set((await c.progressSink.readAll()).map((e) => e.id));
    await c.progressSink.reject(result.rejected.filter((id) => held.has(id)));
  }
  if (result.cursor !== null) await c.store.set(PULL_CURSOR_KEY, `${CURSOR_TAG}|${result.cursor}`);
}

/**
 * Una pasada de sincronización (AD-6): trae los eventos de la cuenta, envía los locales que el
 * servidor aún no tiene y marca los que rechaza. El estado resultante siempre es el pliegue de
 * todos los eventos, así dos dispositivos con la misma cuenta convergen al mismo progreso.
 */
export async function syncProgress(c: Composition, progress: ProgressStore): Promise<SyncResult> {
  const account = c.auth.account();
  if (!account || !c.progressRemote.available()) return 'skipped';

  let synced = await readIds(c);
  const owner = await c.store.get(SYNC_OWNER_KEY);
  if (owner && owner !== account.id) {
    // Otra cuenta usó este dispositivo: su progreso ya está en el servidor y no es de esta persona.
    // Solo se conserva lo que nunca se envió (lo hecho como invitado).
    const rejected = await c.progressSink.rejectedIds();
    const kept = (await c.progressSink.readAll()).filter(
      (e) => !synced.has(e.id) && !rejected.has(e.id),
    );
    await c.progressSink.clear();
    for (const e of kept) await c.progressSink.append(e);
    synced = new Set();
    await c.store.remove(SYNCED_KEY);
    await c.store.remove(PULL_CURSOR_KEY);
  }
  await c.store.set(SYNC_OWNER_KEY, account.id);

  let result: SyncResult = 'synced';
  try {
    await pullNew(c, synced);
    await importLegacy(c, account.id);
    const rejected = await c.progressSink.rejectedIds();
    const pending = (await c.progressSink.readAll())
      .filter((e) => !synced.has(e.id) && !rejected.has(e.id))
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    if (pending.length > 0) {
      const outcome = await c.progressRemote.push(pending);
      outcome.accepted.forEach((id) => synced.add(id));
      await c.progressSink.reject(outcome.rejected);
      // El servidor guarda como rechazados los eventos fuera de tope (AD-7), también los que acaba de
      // recibir: otra lectura corta los trae para marcarlos y que no cuenten.
      await pullNew(c, synced);
    }
  } catch {
    result = 'offline'; // sin red o servidor caído: lo pendiente se envía en la próxima pasada
  } finally {
    await c.store.set(SYNCED_KEY, JSON.stringify([...synced]));
  }
  // También tras un fallo parcial: lo ya traído o descartado debe verse en el progreso.
  await progress.getState().load();
  return result;
}

/** Eventos del dispositivo que el servidor aún no tiene (los que rechazó no cuentan). */
async function pendingEvents(c: Composition) {
  const synced = await readIds(c);
  const rejected = await c.progressSink.rejectedIds();
  return (await c.progressSink.readAll()).filter((e) => !synced.has(e.id) && !rejected.has(e.id));
}

/** Los eventos que dan XP a la liga (AD-7): el servidor suma solo estos tres y solo si traen `xp`. */
const XP_EVENT_TYPES = new Set(['session_completed@1', 'call_completed@1', 'chest_opened@1']);

/**
 * XP de lo hecho en este dispositivo que el servidor aún no tiene (7.5): sirve para mostrar el XP
 * propio de la liga sin esperar a la sincronización. Al llegar al servidor deja de ser pendiente, así
 * que el número se corrige solo y nunca se cuenta dos veces.
 */
export async function pendingXp(c: Composition): Promise<number> {
  let sum = 0;
  for (const e of await pendingEvents(c)) {
    if (!XP_EVENT_TYPES.has(e.type)) continue;
    const xp = (e.payload as { xp?: unknown }).xp;
    if (typeof xp === 'number' && Number.isInteger(xp) && xp > 0) sum += xp;
  }
  return sum;
}

/**
 * Deja el progreso del dispositivo como el de una app recién instalada (R9): sin eventos, sin dueño
 * de la sincronización ni lo enviado. No toca los ajustes de la interfaz ni los datos de la versión
 * heredada, y conserva la marca de importación heredada: lo heredado pertenece a la primera cuenta
 * del dispositivo y otra cuenta en el mismo navegador no debe recibirlo.
 */
async function resetDeviceProgress(c: Composition, progress: ProgressStore): Promise<void> {
  await progress.getState().reset();
  await c.store.remove(SYNC_OWNER_KEY);
  await c.store.remove(SYNCED_KEY);
  await c.store.remove(PULL_CURSOR_KEY);
  await progress.getState().load();
}

export type SignOutResult =
  { kind: 'ok' } | { kind: 'unsynced'; pending: number } | { kind: 'failed' };

/**
 * Cierra la sesión y reinicia el progreso del dispositivo, que es de la cuenta y no de quien
 * venga después. Antes sube lo pendiente; si no se puede (sin red), no cierra y dice cuántos
 * eventos se perderían, salvo que la persona elija cerrar igual (`force`).
 */
export async function signOut(
  c: Composition,
  progress: ProgressStore,
  { force = false }: { force?: boolean } = {},
): Promise<SignOutResult> {
  if (c.auth.account() && c.progressRemote.available()) {
    await syncProgress(c, progress).catch(() => 'offline');
    if (!force) {
      const pending = await pendingEvents(c);
      if (pending.length > 0) return { kind: 'unsynced', pending: pending.length };
    }
  }
  await c.auth.signOut().catch(() => undefined);
  // Si la sesión sigue abierta, el cierre falló y no se borra nada.
  if (c.auth.account()) return { kind: 'failed' };
  await resetDeviceProgress(c, progress);
  return { kind: 'ok' };
}

/**
 * Borra la cuenta y sus datos en el servidor y reinicia el progreso del dispositivo, que era de esa
 * cuenta. Si el servidor falla, no cambia nada.
 */
export async function deleteAccount(
  c: Composition,
  progress: ProgressStore,
): Promise<DeleteAccountResult> {
  const result = await c.auth.deleteAccount();
  if (result.kind === 'ok') await resetDeviceProgress(c, progress);
  return result;
}

/**
 * Mantiene el progreso sincronizado mientras haya cuenta: al abrir sesión, al volver la red o la
 * pestaña, y poco después de cada cambio local. Una sola pasada a la vez; si algo cambia mientras
 * corre, se hace otra al terminar. Devuelve cómo detenerlo.
 */
export function startProgressSync(c: Composition, progress: ProgressStore): () => void {
  let running = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    if (!progress.getState().ready) return; // arranca solo cuando se leyó lo guardado
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await syncProgress(c, progress).catch(() => 'offline');
      } while (again);
    } finally {
      running = false;
    }
  };
  const schedule = (delay = SYNC_DELAY_MS) => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), delay);
  };

  const stops = [c.auth.subscribe(() => schedule(0))];
  let lastCount = progress.getState().events.length;
  let wasReady = progress.getState().ready;
  stops.push(
    progress.subscribe((s) => {
      const changed = s.events.length !== lastCount || s.ready !== wasReady;
      lastCount = s.events.length;
      wasReady = s.ready;
      if (changed && !running) schedule();
    }),
  );
  if (typeof window !== 'undefined') {
    const onOnline = () => schedule(0);
    const onVisible = () => document.visibilityState === 'visible' && schedule(0);
    // Pasar a otra ventana no oculta la pestaña (no hay `visibilitychange`): al volver, `focus` avisa.
    const onFocus = () => schedule(0);
    // Una pestaña que sigue abierta y a la vista tampoco se entera sola de lo que hizo otro dispositivo.
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') schedule(0);
    }, SYNC_POLL_MS);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    stops.push(() => {
      clearInterval(poll);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }
  return () => {
    clearTimeout(timer);
    stops.forEach((stop) => stop());
  };
}
