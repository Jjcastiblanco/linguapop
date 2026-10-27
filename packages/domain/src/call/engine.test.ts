import { seedDialogues, type DialogueTopic } from '@linguapop/content';
import { describe, expect, it } from 'vitest';
import { completeEvent } from '../events';
import { foldEvents } from '../progress';
import { TEST_CONTEXT } from '../progress/test-support';
import { matchesTurn } from '../text';
import {
  AI_MAX_EXCHANGES,
  currentTurn,
  hintPhrase,
  startCall,
  stepCall,
  type CallEffect,
  type CallInput,
  type CallState,
} from './index';

const T0 = Date.UTC(2026, 9, 27, 12, 0, 0);
const presentarse = seedDialogues.find((d) => d.id === 't-presentarse')!;

/** Una respuesta que el turno acepta: la primera frase aceptada, con el comodín cambiado por "twenty". */
const valida = (turn: DialogueTopic['turns'][number]) => turn.accepted[0]!.replace(/\*/g, 'twenty');

type Resultado = { state: CallState; effects: CallEffect[] };

function conectar(topic = presentarse, ai = false): Resultado {
  const inicio = startCall(topic, { ai });
  const r = stepCall(inicio.state, { type: 'connected', nowMs: T0 });
  return { state: r.state, effects: [...inicio.effects, ...r.effects] };
}

/** Envía una entrada y acumula los efectos. */
function dar(r: Resultado, input: CallInput): Resultado {
  const paso = stepCall(r.state, input);
  return { state: paso.state, effects: [...r.effects, ...paso.effects] };
}
const dicho = (alts: string[], seg: number): CallInput => ({
  type: 'heard',
  alternatives: alts,
  nowMs: T0 + seg * 1000,
});
const decirTodo = (effects: CallEffect[]) =>
  effects.flatMap((e) => (e.kind === 'say' ? [e.text] : []));
const eventos = (effects: CallEffect[]) =>
  effects.flatMap((e) => (e.kind === 'record' ? [e.event] : []));

describe('respuestas válidas de los temas de la semilla', () => {
  it.each(seedDialogues.map((d) => [d.id, d] as const))(
    '%s: todos los turnos aceptan su respuesta de prueba',
    (_id, tema) => {
      for (const turno of tema.turns)
        expect(matchesTurn(valida(turno), turno), turno.nova).toBe(true);
    },
  );
});

describe('llamada perfecta', () => {
  const llamada = () => {
    let r = conectar();
    let seg = 5;
    for (const turno of presentarse.turns) r = dar(r, dicho([valida(turno)], (seg += 20)));
    return r;
  };

  it('suena, contesta, presenta el tema y hace la primera pregunta', () => {
    const inicio = startCall(presentarse);
    expect(inicio.state.phase).toBe('ringing');
    expect(inicio.effects).toEqual([{ kind: 'sound', sound: 'ring' }]);
    const r = conectar();
    expect(r.state.phase).toBe('active');
    expect(r.effects.slice(1)).toEqual([
      { kind: 'say', text: presentarse.intro, expression: 'surprised' },
      { kind: 'say', text: presentarse.turns[0]!.nova, expression: 'neutral' },
      { kind: 'listen' },
    ]);
  });

  it('cada acierto suena, Nova comenta con su sarcasmo y hace la siguiente pregunta', () => {
    const r = dar(conectar(), dicho(['My name is Ana'], 10));
    const nuevos = r.effects.slice(4);
    expect(nuevos).toEqual([
      { kind: 'sound', sound: 'ok' },
      { kind: 'say', text: presentarse.turns[0]!.comment, expression: 'smirk' },
      { kind: 'say', text: presentarse.turns[1]!.nova, expression: 'neutral' },
      { kind: 'listen' },
    ]);
    expect(r.state.turn).toBe(1);
  });

  it('termina completa con 8 aciertos a la primera: 140 XP y fluidez 100', () => {
    const { state } = llamada();
    expect(state.phase).toBe('ended');
    expect(state.summary).toMatchObject({
      completed: true,
      xp: 8 * 15 + 20,
      fluency: 100,
      label: 'excellent',
      counted: true,
      weakWords: [],
    });
    expect(state.summary!.phrases).toHaveLength(8);
    expect(state.summary!.phrases[0]).toBe('My name is twenty');
    expect(state.summary!.durationSec).toBe(165);
  });

  it('el último turno despide con el comentario y la despedida, y registra la llamada', () => {
    const { effects } = llamada();
    const ultimo = presentarse.turns.at(-1)!;
    expect(decirTodo(effects).at(-1)).toBe(`${ultimo.comment} ${presentarse.outro}`);
    expect(eventos(effects)).toEqual([
      {
        type: 'call_completed@1',
        payload: {
          topicId: 't-presentarse',
          durationSec: 165,
          completed: true,
          firstTry: 8,
          later: 0,
          gaveUp: 0,
          weakWords: [],
          aiExchanges: 0,
        },
      },
    ]);
    expect(
      effects
        .filter((e) => e.kind === 'sound')
        .map((e) => (e as { sound: string }).sound)
        .slice(-2),
    ).toEqual(['hangup', 'win']);
  });

  it('acepta cualquiera de las alternativas que entendió el reconocimiento de voz', () => {
    const r = dar(conectar(), dicho(['banana', 'my name is ana'], 10));
    expect(r.state.firstTry).toBe(1);
    expect(r.state.phrases).toEqual(['My name is ana']);
  });
});

describe('cuando no se entiende', () => {
  it('primer fallo: Nova repite despacio (rate 0.6) y sigue escuchando', () => {
    const r = dar(conectar(), dicho(['banana'], 10));
    expect(r.effects.slice(4)).toEqual([
      { kind: 'say', text: 'Hmm, not quite. Let me say it slowly.', expression: 'think' },
      { kind: 'say', text: presentarse.turns[0]!.nova, expression: 'neutral', rate: 0.6 },
      { kind: 'listen' },
    ]);
    expect(r.state).toMatchObject({ retries: 1, turn: 0, hintVisible: false });
  });

  it('silencio: Nova bromea y repite despacio', () => {
    const r = dar(conectar(), { type: 'silence', nowMs: T0 + 11_000 });
    expect(decirTodo(r.effects)[2]).toBe("Hello? Did you fall asleep? I'll say it slowly.");
  });

  it('segundo fallo: muestra la pista y Nova la dice más despacio (rate 0.7)', () => {
    let r = dar(conectar(), dicho(['banana'], 10));
    r = dar(r, dicho(['banana'], 20));
    const nuevos = r.effects.slice(-3);
    expect(nuevos[0]).toEqual({ kind: 'show-hint', text: presentarse.turns[0]!.hint });
    expect(nuevos[1]).toEqual({
      kind: 'say',
      text: "Okay, here's a hint. Try saying: My name is",
      expression: 'smirk',
      rate: 0.7,
    });
    expect(nuevos[2]).toEqual({ kind: 'listen' });
    expect(r.state.hintVisible).toBe(true);
  });

  it('acertar tras la pista cuenta como acierto posterior (8 XP), oculta la pista y reinicia los intentos', () => {
    let r = dar(conectar(), dicho(['banana'], 10));
    r = dar(r, dicho(['banana'], 20));
    r = dar(r, dicho(['my name is ana'], 30));
    expect(r.state).toMatchObject({
      firstTry: 0,
      later: 1,
      retries: 0,
      hintVisible: false,
      turn: 1,
    });
    expect(r.effects).toContainEqual({ kind: 'hide-hint' });
  });

  it('tercer fallo: se rinde, anota las palabras que faltaron y sigue con la siguiente pregunta', () => {
    let r = conectar();
    r = dar(r, dicho(['hello'], 5)); // turno 1 mal... pasa al 2 con 3 fallos
    r = dar(r, dicho(['hello'], 6));
    r = dar(r, dicho(['hello'], 7));
    expect(r.state).toMatchObject({ gaveUp: 1, turn: 1, retries: 0 });
    expect(decirTodo(r.effects).slice(-2)).toEqual([
      "No worries, we'll practice that later. Next question!",
      presentarse.turns[1]!.nova,
    ]);
  });

  it('las palabras a mejorar son las de la pista que el estudiante no dijo, sin palabras comunes', () => {
    // Turno 2 ("How are you today?"): la pista es "I am fine, thank you".
    let r = conectar();
    r = dar(r, dicho(['my name is ana'], 5)); // acierta el turno 1
    for (const intento of ['banana', 'banana', 'banana']) r = dar(r, dicho([intento], 10));
    expect(r.state.weakWords).toEqual(['fine', 'thank']);
    const conPalabra = dar(
      dar(
        dar(dar(conectar(), dicho(['my name is ana'], 5)), dicho(['i am fine', 'x'], 6)),
        dicho(['quiero'], 7),
      ),
      dicho(['quiero'], 8),
    );
    expect(conPalabra.state.turn).toBe(2); // el segundo turno "i am fine" sí se aceptó
  });

  it('lo que sí dijo no se anota como palabra a mejorar', () => {
    let r = dar(conectar(), dicho(['my name is ana'], 5));
    r = dar(r, dicho(['thank'], 6));
    r = dar(r, dicho(['thank'], 7));
    r = dar(r, dicho(['thank'], 8));
    expect(r.state.weakWords).toEqual(['fine']);
  });

  it('rendirse en el último turno cierra la llamada como completada con la despedida', () => {
    let r = conectar();
    for (const turno of presentarse.turns.slice(0, 7)) r = dar(r, dicho([valida(turno)], 10));
    for (const t of [1, 2, 3]) r = dar(r, dicho(['banana'], 20 + t));
    expect(r.state.phase).toBe('ended');
    expect(r.state.summary).toMatchObject({
      completed: true,
      fluency: Math.round((100 * 7) / 8),
      xp: 7 * 15 + 20,
      label: 'excellent', // 88 de fluidez
    });
    expect(decirTodo(r.effects).at(-1)).toBe(
      "Okay, that's enough. We'll practice that later. " + presentarse.outro,
    );
  });

  it('una respuesta vacía no cuenta: se vuelve a escuchar', () => {
    const r = dar(conectar(), dicho(['', '   '], 10));
    expect(r.state.retries).toBe(0);
    expect(r.effects.at(-1)).toEqual({ kind: 'listen' });
  });
});

describe('colgar', () => {
  it('colgar antes de contestar no registra nada', () => {
    const inicio = startCall(presentarse);
    const r = stepCall(inicio.state, { type: 'hangup', nowMs: T0 });
    expect(r.state.phase).toBe('cancelled');
    expect(r.effects).toEqual([]);
  });

  it('colgar a mitad: sin el bono de completar, con resumen y evento', () => {
    let r = conectar();
    r = dar(r, dicho(['my name is ana'], 10));
    r = dar(r, dicho(['i am fine'], 20));
    r = dar(r, { type: 'hangup', nowMs: T0 + 60_000 });
    expect(r.state.summary).toMatchObject({
      completed: false,
      xp: 30,
      durationSec: 60,
      fluency: 100,
      counted: true,
    });
    expect(eventos(r.effects)).toHaveLength(1);
    expect(r.effects.some((e) => e.kind === 'sound' && e.sound === 'win')).toBe(false);
  });

  it('colgar sin haber respondido ni durar: no cuenta como llamada y la fluidez no tiene datos', () => {
    const r = dar(conectar(), { type: 'hangup', nowMs: T0 + 8_000 });
    expect(r.state.summary).toMatchObject({ xp: 0, fluency: 0, label: 'no-data', counted: false });
  });

  it('después de terminar todo se ignora', () => {
    const r = dar(conectar(), { type: 'hangup', nowMs: T0 + 8_000 });
    const despues = stepCall(r.state, dicho(['my name is ana'], 20));
    expect(despues).toEqual({ state: r.state, effects: [] });
    expect(stepCall(r.state, { type: 'connected', nowMs: T0 }).state).toBe(r.state);
  });

  it('el pliegue de eventos cuenta la llamada, el XP, las palabras y el logro de Nova', () => {
    let r = conectar();
    r = dar(r, dicho(['my name is ana'], 5));
    for (const t of [1, 2, 3]) r = dar(r, dicho(['banana'], 10 + t));
    r = dar(r, { type: 'hangup', nowMs: T0 + 90_000 });
    const [pendiente] = eventos(r.effects);
    const evento = completeEvent(pendiente!, {
      id: '00000000-0000-4000-8000-000000000001',
      nowMs: T0 + 90_000,
      contentVersion: 1,
    });
    const estado = foldEvents([evento], TEST_CONTEXT);
    expect(estado.xp).toBe(15);
    expect(estado.stats.calls).toBe(1);
    expect(estado.words).toEqual({ fine: 1, thank: 1 });
    expect(estado.achievements['nova']).toBeDefined();
  });
});

describe('entradas fuera de lugar', () => {
  it('no responde mientras Nova no está esperando y no lanza', () => {
    const inicio = startCall(presentarse);
    expect(stepCall(inicio.state, dicho(['x'], 1))).toEqual({ state: inicio.state, effects: [] });
    expect(stepCall(inicio.state, { type: 'silence', nowMs: 1 }).effects).toEqual([]);
    expect(stepCall(inicio.state, { type: 'agent-reply', text: 'x', nowMs: 1 }).effects).toEqual(
      [],
    );
  });

  it('el turno actual solo existe con la llamada activa y con guion', () => {
    expect(currentTurn(startCall(presentarse).state)).toBeUndefined();
    expect(currentTurn(conectar().state)).toBe(presentarse.turns[0]);
    expect(currentTurn(conectar(presentarse, true).state)).toBeUndefined();
  });

  it('no modifica el estado recibido y es determinista', () => {
    const { state } = conectar();
    const copia = JSON.parse(JSON.stringify(state));
    const a = stepCall(state, dicho(['my name is ana'], 10));
    const b = stepCall(state, dicho(['my name is ana'], 10));
    expect(JSON.parse(JSON.stringify(state))).toEqual(copia);
    expect(a).toEqual(b);
  });
});

describe('conversación libre con IA', () => {
  const conIa = () => conectar(presentarse, true);
  const responder = (r: Resultado, usuario: string, nova: string, seg: number): Resultado =>
    dar(dar(r, dicho([usuario], seg)), { type: 'agent-reply', text: nova, nowMs: T0 + seg * 1000 });

  it('abre invitando a hablar y espera la respuesta', () => {
    const r = conIa();
    expect(decirTodo(r.effects)).toEqual([presentarse.intro + ' So, tell me about yourself!']);
    expect(r.effects.at(-1)).toEqual({ kind: 'listen' });
  });

  it('cada respuesta se pasa al agente con el historial y Nova responde', () => {
    let r = dar(conIa(), dicho(['I like music'], 10));
    expect(r.effects.at(-1)).toEqual({
      kind: 'ask-agent',
      topicId: 't-presentarse',
      history: [],
      userText: 'I like music',
    });
    expect(r.state.awaiting).toBe('agent');
    r = dar(r, { type: 'agent-reply', text: 'Cool. What kind?', nowMs: T0 + 11_000 });
    expect(r.effects.slice(-2)).toEqual([
      { kind: 'say', text: 'Cool. What kind?', expression: 'smirk' },
      { kind: 'listen' },
    ]);
    r = dar(r, dicho(['Rock'], 20));
    expect(r.effects.at(-1)).toMatchObject({
      kind: 'ask-agent',
      userText: 'Rock',
      history: [
        { role: 'user', text: 'I like music' },
        { role: 'nova', text: 'Cool. What kind?' },
      ],
    });
  });

  it('se despide tras 10 intercambios: 12 de XP cada uno más 20 por completar', () => {
    let r = conIa();
    for (let i = 1; i <= AI_MAX_EXCHANGES; i++)
      r = responder(r, `answer ${i}`, `reply ${i}`, i * 10);
    expect(r.state.phase).toBe('ended');
    expect(r.state.summary).toMatchObject({ xp: 10 * 12 + 20, fluency: 100, completed: true });
    expect(decirTodo(r.effects).at(-1)).toBe('Okay, enough chatting for today. Bye!');
    expect(eventos(r.effects)[0]).toMatchObject({
      type: 'call_completed@1',
      payload: { aiExchanges: 10 },
    });
  });

  it('la fluidez crece 5 por intercambio desde 50 si se cuelga antes', () => {
    let r = conIa();
    for (let i = 1; i <= 4; i++) r = responder(r, `answer ${i}`, `reply ${i}`, i * 10);
    r = dar(r, { type: 'hangup', nowMs: T0 + 60_000 });
    expect(r.state.summary).toMatchObject({ fluency: 70, xp: 48, completed: false });
  });

  it('el silencio solo vuelve a escuchar, sin penalizar', () => {
    const r = dar(conIa(), { type: 'silence', nowMs: T0 + 11_000 });
    expect(r.effects.at(-1)).toEqual({ kind: 'listen' });
    expect(r.state.retries).toBe(0);
  });

  it('si el agente falla, avisa y sigue con el guion del tema desde el principio, sin perder lo que no es de IA', () => {
    let r = dar(conIa(), dicho(['I like music'], 10));
    r = dar(r, { type: 'agent-error', nowMs: T0 + 11_000 });
    expect(r.effects.slice(-3)).toEqual([
      { kind: 'notice', code: 'ai-unavailable' },
      { kind: 'say', text: presentarse.turns[0]!.nova, expression: 'neutral' },
      { kind: 'listen' },
    ]);
    expect(r.state).toMatchObject({
      aiExchanges: 0,
      firstTry: 0,
      phrases: [],
      turn: 0,
      ai: { enabled: true, failed: true },
    });
    const exito = dar(r, dicho(['my name is ana'], 20));
    expect(exito.state.firstTry).toBe(1);
    const fin = dar(exito, { type: 'hangup', nowMs: T0 + 40_000 });
    expect(eventos(fin.effects)[0]).toMatchObject({ payload: { aiExchanges: 0, firstTry: 1 } });
  });
});

describe('pista de un turno', () => {
  it('extrae la frase entre comillas sin puntos suspensivos ni paréntesis', () => {
    expect(hintPhrase('Di: "My name is…" (tu nombre)')).toBe('My name is');
    expect(hintPhrase('Di: "I am fine, thank you."')).toBe('I am fine, thank you.');
    expect(hintPhrase('Sin comillas')).toBe('');
  });
});
