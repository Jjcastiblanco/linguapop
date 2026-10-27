import { describe, expect, it } from 'vitest';
import type { Course } from '@linguapop/content';
import type { ProgressEvent } from '../events';
import type {
  Clock,
  ContentSource,
  DialogueAgent,
  ListenResult,
  LocalStore,
  ProgressSink,
  Random,
  Sound,
  Speech,
} from './index';

// Implementaciones mínimas en memoria: si un puerto cambia de forma, esta prueba deja de compilar.

const reloj: Clock = { now: () => Date.UTC(2026, 9, 27, 12, 0, 0) };
const azar: Random = { next: () => 0.5 };
const sonidos: string[] = [];
const sonido: Sound = { play: (efecto) => void sonidos.push(efecto) };

const voz: Speech = {
  capabilities: () => ({ canSpeak: true, canListen: false }),
  speak: async () => true,
  listen: async (): Promise<ListenResult> => ({ kind: 'unavailable', reason: 'unsupported' }),
  cancel: () => undefined,
};

function almacenEnMemoria(): LocalStore {
  const datos = new Map<string, string>();
  return {
    get: async (k) => datos.get(k) ?? null,
    set: async (k, v) => void datos.set(k, v),
    remove: async (k) => void datos.delete(k),
  };
}

function registroEnMemoria(): ProgressSink {
  const eventos = new Map<string, ProgressEvent>();
  return {
    append: async (e) => void eventos.set(e.id, e),
    readAll: async () => [...eventos.values()],
  };
}

const contenido: ContentSource = {
  load: async () =>
    ({
      schemaVersion: 1,
      from: 'es',
      to: 'en',
      level: 'A1-A2',
      units: [],
      dialogues: [],
      achievements: [],
    }) as unknown as Course,
};
const agente: DialogueAgent = { reply: async () => ({ text: 'Hello!' }) };

describe('puertos del dominio', () => {
  it('el reloj y el azar son inyectables', () => {
    expect(reloj.now()).toBe(Date.UTC(2026, 9, 27, 12));
    expect(azar.next()).toBe(0.5);
  });

  it('la voz declara sus capacidades y degrada sin reconocimiento', async () => {
    expect(voz.capabilities()).toEqual({ canSpeak: true, canListen: false });
    expect(await voz.listen()).toEqual({ kind: 'unavailable', reason: 'unsupported' });
  });

  it('el almacenamiento guarda, lee y borra', async () => {
    const a = almacenEnMemoria();
    await a.set('k', 'v');
    expect(await a.get('k')).toBe('v');
    await a.remove('k');
    expect(await a.get('k')).toBeNull();
  });

  it('el registro de progreso es idempotente por id', async () => {
    const r = registroEnMemoria();
    const e: ProgressEvent = {
      id: '3f2b8c4e-9a1d-4e6f-8b7a-1c2d3e4f5a6b',
      type: 'purchase@1',
      occurredAt: '2026-10-27T15:30:00.000Z',
      contentVersion: 1,
      payload: { item: 'hearts', costGems: 30 },
    };
    await r.append(e);
    await r.append(e);
    expect(await r.readAll()).toHaveLength(1);
  });

  it('el sonido, el contenido y el agente de diálogo cumplen su forma', async () => {
    sonido.play('ok');
    expect(sonidos).toEqual(['ok']);
    expect((await contenido.load()).from).toBe('es');
    expect((await agente.reply({ topicId: 't', history: [], userText: 'hi' })).text).toBe('Hello!');
  });
});
