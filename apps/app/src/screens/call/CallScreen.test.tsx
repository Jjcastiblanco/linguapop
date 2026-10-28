// @vitest-environment jsdom
import { seedCourse, type Course, type DialogueTopic } from '@linguapop/content';
import type { ListenResult, PendingEvent, Speech } from '@linguapop/domain';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RING_MS } from '../../stores';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

const turno = (nova: string, accepted: string[], hint: string, comment: string) => ({
  nova,
  accepted,
  hint,
  comment,
});
const tema = (id: string, unitId: string, title: string): DialogueTopic => ({
  id,
  unitId,
  title,
  emoji: '🙋',
  intro: 'Hey, I am Nova.',
  outro: 'Bye!',
  turns: [
    turno("What's your name?", ['my name is *'], 'Di: "My name is…"', 'Nice.'),
    turno('How are you?', ['i am fine'], 'Di: "I am fine"', 'Good.'),
    turno('Where are you from?', ['i am from *'], 'Di: "I am from Spain"', 'Cool.'),
  ],
});
const [U1, U2, U3] = seedCourse.units.map((u) => u.id) as [string, string, string];
const curso: Course = {
  ...seedCourse,
  dialogues: [
    tema('t-uno', U1, 'Presentarse'),
    tema('t-dos', U2, 'Comer'),
    tema('t-tres', U3, 'Viajar'),
  ],
};

const leccion = (n: number): PendingEvent => ({
  type: 'session_completed@1',
  payload: {
    mode: 'lesson',
    unitId: U1,
    lessonId: `${U1}-l${n}`,
    correct: 10,
    wrong: 0,
    answered: 10,
    durationSec: 60,
    outOfHearts: false,
  },
});
const SALUDOS_HECHO = [leccion(1), leccion(2), leccion(3)];

const oyo = (...textos: string[]): ListenResult => ({ kind: 'heard', alternatives: textos });
const SILENCIO: ListenResult = { kind: 'silence' };

/** Voz falsa: Nova "habla" al instante y el estudiante responde lo que diga el guion. */
function vozFalsa(
  guion: ListenResult[],
  caps = { canSpeak: true, canListen: true },
  retener?: string,
) {
  const dichas: { text: string; rate: number | undefined }[] = [];
  let cancelaciones = 0;
  const speech: Speech = {
    capabilities: () => caps,
    speak: async (text, options) => {
      dichas.push({ text, rate: options?.rate });
      // Una frase retenida nunca termina de sonar (para probar qué pasa si se sale hablando).
      if (retener && text.includes(retener)) return new Promise<boolean>(() => undefined);
      return true;
    },
    listen: () => {
      const siguiente = guion.shift();
      return siguiente ? Promise.resolve(siguiente) : new Promise<ListenResult>(() => undefined);
    },
    cancel: () => void cancelaciones++,
  };
  return { speech, dichas, cancelaciones: () => cancelaciones };
}

async function abrir(opts: {
  antes?: PendingEvent[];
  plan?: 'free' | 'pro';
  guion?: ListenResult[];
  caps?: { canSpeak: boolean; canListen: boolean };
  retener?: string;
}) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  const voz = vozFalsa(opts.guion ?? [], opts.caps, opts.retener);
  const clock = relojFalso();
  const services = await crearServicios({
    storage: memoria().storage,
    clock,
    course: curso,
    speech: voz.speech,
  });
  const previos: PendingEvent[] = [
    ...(opts.plan ? [{ type: 'settings_changed@1', payload: { plan: opts.plan } } as const] : []),
    ...(opts.antes ?? []),
  ];
  if (previos.length) await services.progress.getState().record(previos);
  const app = renderApp(services, '/llamada');
  const user = userEvent.setup({ delay: null });
  return { services, clock, voz, user, ...app };
}

/** Avanza el tiempo (y el reloj) dejando que se resuelvan las promesas pendientes. */
const avanzar = async (clock: ReturnType<typeof relojFalso>, ms: number) => {
  clock.avanzar(ms);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const llamar = async (ctx: Awaited<ReturnType<typeof abrir>>) => {
  await ctx.user.click(screen.getByRole('button', { name: /Llamar$/ }));
  await avanzar(ctx.clock, RING_MS);
};
const progreso = (c: Awaited<ReturnType<typeof abrir>>) => c.services.progress.getState().progress;
const eventosLlamada = (c: Awaited<ReturnType<typeof abrir>>) =>
  c.services.progress.getState().events.filter((e) => e.type === 'call_completed@1');

// Testing Library detecta los temporizadores falsos por la forma de `jest`; con Vitest hay que darle esa forma.
(globalThis as unknown as { jest: unknown }).jest = { advanceTimersByTime: vi.advanceTimersByTime };

/** Espera a que algo aparezca avanzando los temporizadores falsos (findBy usa los reales). */
async function ver<T>(buscar: () => T): Promise<T> {
  for (let i = 0; i < 50; i++) {
    try {
      return buscar();
    } catch {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
    }
  }
  return buscar();
}

afterEach(() => vi.useRealTimers());

describe('puertas', () => {
  it('en el plan gratis pide activar PRO y al activarlo muestra el selector', async () => {
    const ctx = await abrir({ plan: 'free', antes: SALUDOS_HECHO });
    const dialogo = screen.getByRole('dialog', { name: '🔒 Llamadas con Nova' });
    await ctx.user.click(within(dialogo).getByRole('button', { name: 'Activar PRO' }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(progreso(ctx).settings.plan).toBe('pro');
    expect(
      await ver(() => screen.getByRole('heading', { name: /Llamar a Nova/ })),
    ).toBeInTheDocument();
  });

  it('con Saludos sin terminar Nova aún no contesta', async () => {
    await abrir({});
    expect(screen.getByRole('dialog', { name: '🔒 Nova aún no contesta' })).toBeInTheDocument();
    expect(screen.getByText(/Termina las 3 lecciones de la unidad/)).toBeInTheDocument();
  });
});

describe('selector de tema', () => {
  it('ofrece los temas hasta la unidad actual y dice si es voz o chat', async () => {
    await abrir({ antes: SALUDOS_HECHO });
    const temas = screen
      .getAllByRole('button', { pressed: undefined })
      .filter((b) => b.hasAttribute('aria-pressed'));
    expect(temas.map((b) => b.textContent)).toEqual(['🙋 Presentarse', '🙋 Comer']);
    expect(temas[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('call-mode')).toHaveTextContent('Videollamada con voz');
  });

  it('sin voz completa avisa que será por chat', async () => {
    await abrir({ antes: SALUDOS_HECHO, caps: { canSpeak: true, canListen: false } });
    expect(screen.getByTestId('call-mode')).toHaveTextContent('Modo chat por texto');
  });
});

describe('llamada con voz', () => {
  const guion = () => [
    oyo('my name is ana'), // 1.º turno: a la primera
    oyo('banana'), // 2.º: falla, Nova repite lento
    oyo('apple'), // falla otra vez: aparece la pista
    oyo('i am fine'), // acierta
    SILENCIO, // 3.º: silencio, silencio, silencio
    SILENCIO,
    SILENCIO,
  ];

  it('recorre un tema con aciertos, fallos, pista y silencio y presenta el resumen', async () => {
    const ctx = await abrir({ antes: SALUDOS_HECHO, guion: guion() });
    await ctx.user.click(screen.getByRole('button', { name: /Llamar$/ }));
    expect(screen.getByText('Llamando a Nova…')).toBeInTheDocument();
    await avanzar(ctx.clock, RING_MS);

    // Recorrió todo el guion y al final cuelga solo con el resumen.
    expect(
      await ver(() => screen.getByRole('heading', { name: 'Llamada terminada' })),
    ).toBeInTheDocument();
    const dichas = ctx.voz.dichas;
    expect(dichas[0]!.text).toBe('Hey, I am Nova.');
    expect(dichas.some((d) => d.text === "What's your name?")).toBe(true);
    // Tras el primer fallo, Nova repite la pregunta despacio.
    expect(dichas.some((d) => d.text === 'How are you?' && d.rate === 0.6)).toBe(true);
    expect(dichas.some((d) => d.text.startsWith("Okay, here's a hint."))).toBe(true);

    expect(screen.getByTestId('call-fluency')).toHaveTextContent('53');
    expect(screen.getByTestId('call-label')).toHaveTextContent('A practicar');
    expect(screen.getByText('My name is ana')).toBeInTheDocument();
    expect(screen.getByText('I am fine')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('call-weak'))
        .getAllByRole('listitem')
        .map((l) => l.textContent),
    ).toEqual(['from', 'spain']);
    expect(Number(screen.getByTestId('call-xp').textContent!.replace('⚡', ''))).toBeGreaterThan(0);
  });

  it('muestra la pista tras el segundo fallo', async () => {
    const ctx = await abrir({
      antes: SALUDOS_HECHO,
      guion: [oyo('x'), oyo('y')],
    });
    await llamar(ctx);
    expect(screen.getByTestId('call-hint')).toHaveTextContent('Di: "My name is…"');
  });

  it('registra una sola llamada con sus palabras a mejorar', async () => {
    const ctx = await abrir({ antes: SALUDOS_HECHO, guion: guion() });
    await llamar(ctx);
    await ver(() => screen.getByRole('heading', { name: 'Llamada terminada' }));
    expect(eventosLlamada(ctx)).toHaveLength(1);
    expect(progreso(ctx).stats.calls).toBe(1);
    expect(Object.keys(progreso(ctx).words).sort()).toEqual(['from', 'spain']);
  });

  it('colgar sonando vuelve al selector sin registrar nada', async () => {
    const ctx = await abrir({ antes: SALUDOS_HECHO, guion: guion() });
    await ctx.user.click(screen.getByRole('button', { name: /Llamar$/ }));
    await ctx.user.click(screen.getByRole('button', { name: 'Colgar' }));
    await avanzar(ctx.clock, RING_MS);
    expect(screen.getByRole('heading', { name: /Llamar a Nova/ })).toBeInTheDocument();
    expect(eventosLlamada(ctx)).toHaveLength(0);
    expect(ctx.voz.dichas).toHaveLength(0); // no llegó a contestar
  });

  it('colgar en curso corta la voz, muestra el resumen y registra la llamada sin completar', async () => {
    const ctx = await abrir({ antes: SALUDOS_HECHO, guion: [] });
    await llamar(ctx); // queda esperando respuesta
    await avanzar(ctx.clock, 5000);
    await ctx.user.click(screen.getByRole('button', { name: 'Colgar' }));
    expect(
      await ver(() => screen.getByRole('heading', { name: 'Llamada terminada' })),
    ).toBeInTheDocument();
    expect(ctx.voz.cancelaciones()).toBeGreaterThan(0);
    expect(screen.getByTestId('call-label')).toHaveTextContent('Sin datos');
    expect(screen.getByText('Aún no dijiste frases completas.')).toBeInTheDocument();
    const [evento] = eventosLlamada(ctx);
    expect(evento).toMatchObject({ payload: { topicId: 't-uno', completed: false } });
  });

  it('salir mientras Nova se despide no pierde la llamada completada', async () => {
    const ctx = await abrir({
      antes: SALUDOS_HECHO,
      guion: [oyo('my name is ana'), oyo('i am fine'), oyo('i am from spain')],
      retener: 'Bye!',
    });
    await llamar(ctx);
    expect(ctx.services.call.getState().call?.phase).toBe('ended');
    expect(ctx.services.call.getState().talking).toBe(true);
    ctx.unmount();
    expect(eventosLlamada(ctx)).toHaveLength(1);
    expect(eventosLlamada(ctx)[0]).toMatchObject({ payload: { completed: true, firstTry: 3 } });
  });

  it('Llamar otra vez vuelve al selector', async () => {
    const ctx = await abrir({ antes: SALUDOS_HECHO, guion: [] });
    await llamar(ctx);
    await ctx.user.click(screen.getByRole('button', { name: 'Colgar' }));
    await ctx.user.click(await ver(() => screen.getByRole('button', { name: 'Llamar otra vez' })));
    expect(screen.getByRole('heading', { name: /Llamar a Nova/ })).toBeInTheDocument();
  });

  it('el botón CC oculta los subtítulos y guarda la preferencia', async () => {
    const ctx = await abrir({ antes: SALUDOS_HECHO, guion: [] });
    await llamar(ctx);
    expect(screen.getByTestId('call-subs')).toHaveTextContent("What's your name?");
    await ctx.user.click(screen.getByRole('button', { name: 'Subtítulos' }));
    expect(ctx.services.ui.getState().subtitles).toBe(false);
    expect(screen.getByTestId('call-subs')).toBeEmptyDOMElement();
  });
});

describe('sin voz', () => {
  it('en modo chat se contesta escribiendo y el registro muestra los mensajes', async () => {
    const ctx = await abrir({
      antes: SALUDOS_HECHO,
      caps: { canSpeak: false, canListen: false },
    });
    await llamar(ctx);
    const chat = screen.getByTestId('call-chat');
    expect(within(chat).getByText("What's your name?")).toBeInTheDocument();
    const campo = screen.getByRole('textbox', { name: 'Escribe tu respuesta en inglés…' });
    await ctx.user.type(campo, 'my name is Ana');
    await ctx.user.click(screen.getByRole('button', { name: 'Enviar' }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(within(chat).getByText('my name is Ana')).toBeInTheDocument();
    expect(within(chat).getByText('Nice.')).toBeInTheDocument();
    expect(within(chat).getByText('How are you?')).toBeInTheDocument();
  });

  it('si el micrófono falla, la llamada sigue y se contesta escribiendo', async () => {
    const ctx = await abrir({
      antes: SALUDOS_HECHO,
      guion: [{ kind: 'unavailable', reason: 'not-allowed' }],
    });
    await llamar(ctx);
    expect(await ver(() => screen.getByText(/No pude usar el micrófono/))).toBeInTheDocument();
    await ctx.user.type(
      screen.getByRole('textbox', { name: 'Escribe tu respuesta en inglés…' }),
      'my name is Ana{Enter}',
    );
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(ctx.services.call.getState().call?.phrases).toEqual(['My name is Ana']);
  });
});
