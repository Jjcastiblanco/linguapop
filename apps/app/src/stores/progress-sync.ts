import type { Composition } from '../composition';
import type { ProgressStore } from './progress-store';

export const SYNC_OWNER_KEY = 'linguapop:sync-owner:v1';
export const SYNCED_KEY = 'linguapop:synced-ids:v1';

/** Espera tras un cambio de progreso antes de sincronizar, para juntar los eventos de una lección. */
export const SYNC_DELAY_MS = 2000;

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
  }
  await c.store.set(SYNC_OWNER_KEY, account.id);

  let result: SyncResult = 'synced';
  try {
    for (const e of await c.progressRemote.pull()) {
      await c.progressSink.append(e);
      synced.add(e.id);
    }
    const rejected = await c.progressSink.rejectedIds();
    const pending = (await c.progressSink.readAll())
      .filter((e) => !synced.has(e.id) && !rejected.has(e.id))
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    if (pending.length > 0) {
      const outcome = await c.progressRemote.push(pending);
      outcome.accepted.forEach((id) => synced.add(id));
      await c.progressSink.reject(outcome.rejected);
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
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    stops.push(() => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }
  return () => {
    clearTimeout(timer);
    stops.forEach((stop) => stop());
  };
}
