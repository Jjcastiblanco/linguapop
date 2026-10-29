// @vitest-environment jsdom
import { seedCourse, type Exercise } from '@linguapop/content';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ListenOptions, ListenResult, ProgressEvent, SoundEffect } from '@linguapop/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebSound } from '../../composition/adapters/web-sound';
import { cursoConLeccion } from '../../test/curso-de-prueba';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';
import { WRONG_FLASH_MS } from './exercises/MatchExercise';
import { SLOW_RATE } from './exercises/ListenExercise';

const ejercicio = (id: string) => seedCourse.units[0]!.exercises.find((e) => e.id === id)!;
const RUTA = '/leccion/u-saludos/u-saludos-l1';
const MATCH = 'u-saludos-e06';
const LISTEN = 'u-saludos-e04';
const SPEAK = 'u-saludos-e08';

type Voz = {
  canSpeak?: boolean;
  canListen?: boolean;
  /** Respuestas sucesivas del reconocimiento. */
  oidos?: Array<ListenResult | ((o: ListenOptions) => Promise<ListenResult>)>;
  hablaOk?: boolean;
};

async function abrir(
  ids: readonly string[] | null,
  voz: Voz = {},
  extra: { random?: number } = {},
) {
  const sonidos: SoundEffect[] = [];
  const dichas: Array<{ texto: string; rate?: number }> = [];
  const respuestas = [...(voz.oidos ?? [])];
  const speech = {
    capabilities: () => ({ canSpeak: voz.canSpeak ?? true, canListen: voz.canListen ?? true }),
    speak: vi.fn(async (texto: string, o?: { rate?: number }) => {
      dichas.push({ texto, ...(o?.rate !== undefined ? { rate: o.rate } : {}) });
      return voz.hablaOk ?? true;
    }),
    listen: vi.fn(async (o?: ListenOptions) => {
      const siguiente = respuestas.shift() ?? ({ kind: 'silence' } as ListenResult);
      return typeof siguiente === 'function' ? siguiente(o ?? {}) : siguiente;
    }),
    cancel: vi.fn(),
  };
  const sound = Object.assign(createWebSound({ createContext: () => null }), {
    play: (e: SoundEffect) => void sonidos.push(e),
  });
  const services = await crearServicios({
    storage: memoria().storage,
    clock: relojFalso(),
    ...(ids ? { course: cursoConLeccion(ids) } : {}),
    random: { next: () => extra.random ?? 0.3 },
    sound,
    speech,
  });
  const app = renderApp(services, RUTA);
  const eventos = () => services.progress.getState().events;
  return { services, sonidos, dichas, speech, eventos, ...app };
}

const comprobar = () => userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
const continuar = () => userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
const columna = (nombre: string) => within(screen.getByLabelText(nombre));
const par = async (es: string, en: string) => {
  await userEvent.click(columna('Español').getByRole('button', { name: es }));
  await userEvent.click(columna('Inglés').getByRole('button', { name: en }));
};

afterEach(() => vi.useRealTimers());

describe('emparejar', () => {
  const pares = (ejercicio(MATCH) as Extract<Exercise, { type: 'match' }>).pairs;

  it('muestra las palabras en español a la izquierda y las traducciones a la derecha', async () => {
    await abrir([MATCH]);
    expect(
      columna('Español')
        .getAllByRole('button')
        .map((b) => b.textContent)
        .sort(),
    ).toEqual(pares.map((p) => p.es).sort());
    expect(
      columna('Inglés')
        .getAllByRole('button')
        .map((b) => b.textContent)
        .sort(),
    ).toEqual(pares.map((p) => p.en).sort());
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeDisabled();
  });

  it('una pareja correcta se aparta, suena el acierto y dice la palabra en inglés', async () => {
    const { sonidos, dichas } = await abrir([MATCH]);
    const [p] = pares;
    await par(p!.es, p!.en);
    expect(columna('Español').getByRole('button', { name: p!.es })).toHaveAttribute(
      'data-state',
      'matched',
    );
    expect(columna('Inglés').getByRole('button', { name: p!.en })).toBeDisabled();
    expect(sonidos).toContain('ok');
    expect(dichas.map((d) => d.texto)).toContain(p!.en);
  });

  it('al emparejar todo se puede comprobar y sin fallos no hay aviso de intentos', async () => {
    await abrir([MATCH]);
    for (const p of pares) await par(p.es, p.en);
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeEnabled();
    await comprobar();
    expect(screen.getByTestId('bubble')).toHaveTextContent('¡Bien hecho!');
    expect(screen.queryByText(/intento fallido/)).toBeNull();
  });

  it('una pareja equivocada suena como error, se marca y se suelta sola', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { sonidos } = await abrir([MATCH]);
    await par(pares[0]!.es, pares[1]!.en);
    expect(sonidos).toContain('bad');
    expect(columna('Español').getByRole('button', { name: pares[0]!.es })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    await act(async () => void vi.advanceTimersByTime(WRONG_FLASH_MS));
    expect(columna('Español').getByRole('button', { name: pares[0]!.es })).toHaveAttribute(
      'data-state',
      'idle',
    );
  });

  it('con hasta 2 intentos fallidos acierta y avisa; con 3 falla y muestra la solución', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const dos = await abrir([MATCH]);
    for (let i = 0; i < 2; i++) {
      await par(pares[0]!.es, pares[1]!.en);
      await act(async () => void vi.advanceTimersByTime(WRONG_FLASH_MS));
    }
    for (const p of pares) await par(p.es, p.en);
    await comprobar();
    expect(screen.getByText('Tuviste 2 intentos fallidos')).toBeInTheDocument();
    expect(screen.getByTestId('bubble')).toHaveTextContent('¡Bien hecho!');
    dos.unmount();

    await abrir([MATCH]);
    for (let i = 0; i < 3; i++) {
      await par(pares[0]!.es, pares[1]!.en);
      await act(async () => void vi.advanceTimersByTime(WRONG_FLASH_MS));
    }
    for (const p of pares) await par(p.es, p.en);
    await comprobar();
    expect(screen.getByText('Respuesta correcta:')).toBeInTheDocument();
    expect(screen.getByText(pares.map((p) => `${p.es} = ${p.en}`).join(' · '))).toBeInTheDocument();
    expect(screen.getByText('Tuviste 3 intentos fallidos')).toBeInTheDocument();
  });

  it('un solo intento fallido se avisa en singular', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await abrir([MATCH]);
    await par(pares[0]!.es, pares[1]!.en);
    await act(async () => void vi.advanceTimersByTime(WRONG_FLASH_MS));
    for (const p of pares) await par(p.es, p.en);
    await comprobar();
    expect(screen.getByText('Tuviste 1 intento fallido')).toBeInTheDocument();
  });

  it('tocar otra palabra del mismo lado cambia la selección sin contar fallo', async () => {
    await abrir([MATCH]);
    const izq = columna('Español');
    await userEvent.click(izq.getByRole('button', { name: pares[0]!.es }));
    await userEvent.click(izq.getByRole('button', { name: pares[1]!.es }));
    expect(izq.getByRole('button', { name: pares[0]!.es })).toHaveAttribute('data-state', 'idle');
    expect(izq.getByRole('button', { name: pares[1]!.es })).toHaveAttribute(
      'data-state',
      'selected',
    );
  });

  it('tras comprobar no se puede seguir tocando', async () => {
    await abrir([MATCH]);
    for (const p of pares) await par(p.es, p.en);
    await comprobar();
    for (const b of within(
      screen.getByTestId('bubble').closest('div')!.parentElement!,
    ).queryAllByRole('button', { name: /^\S/ })) {
      void b;
    }
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
  });
});

describe('escuchar', () => {
  const e = ejercicio(LISTEN) as Extract<Exercise, { type: 'listen' }>;

  it('el motor dice la frase al entrar y los botones la repiten normal y despacio', async () => {
    const { dichas } = await abrir([LISTEN]);
    await waitFor(() => expect(dichas.map((d) => d.texto)).toContain(e.en));
    const antes = dichas.length;
    await userEvent.click(screen.getByRole('button', { name: 'Escuchar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Escuchar despacio' }));
    expect(dichas.slice(antes)).toEqual([
      { texto: e.en, rate: 1 },
      { texto: e.en, rate: SLOW_RATE },
    ]);
  });

  it('comprueba lo escrito y siempre muestra la traducción', async () => {
    await abrir([LISTEN]);
    await userEvent.type(screen.getByRole('textbox'), e.en.toLowerCase());
    await comprobar();
    expect(screen.getByText(e.es)).toBeInTheDocument();
    expect(screen.getByTestId('bubble')).toHaveTextContent('¡Bien hecho!');
  });

  it('una errata tolerada acierta y una frase distinta falla con la respuesta y la traducción', async () => {
    const a = await abrir([LISTEN]);
    await userEvent.type(screen.getByRole('textbox'), 'Nice to meett you');
    await comprobar();
    expect(
      screen.getByText('Casi perfecto, cuida la ortografía: "Nice to meet you"'),
    ).toBeInTheDocument();
    a.unmount();
    await abrir([LISTEN]);
    await userEvent.type(screen.getByRole('textbox'), 'See you tomorrow');
    await comprobar();
    expect(screen.getByText('Respuesta correcta:')).toBeInTheDocument();
    expect(screen.getByText(e.en)).toBeInTheDocument();
    expect(screen.getByText(e.es)).toBeInTheDocument();
  });

  it('Enter comprueba', async () => {
    await abrir([LISTEN]);
    await userEvent.type(screen.getByRole('textbox'), `${e.en}{Enter}`);
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
  });

  it('si el dispositivo no puede hablar muestra la frase escrita para poder hacer el ejercicio', async () => {
    await abrir([LISTEN], { canSpeak: false });
    expect(screen.getByRole('note')).toHaveTextContent(
      `Este dispositivo no puede reproducir voz. La frase es: ${e.en}`,
    );
    await userEvent.type(screen.getByRole('textbox'), e.en);
    await comprobar();
    expect(screen.getByTestId('bubble')).toHaveTextContent('¡Bien hecho!');
  });

  it('con voz no muestra la frase escrita, y si la voz se avería al pulsar el botón, la muestra', async () => {
    const { speech } = await abrir([LISTEN]);
    expect(screen.queryByRole('note')).toBeNull();
    let averiada = false;
    speech.capabilities = () => ({ canSpeak: !averiada, canListen: true });
    speech.speak.mockImplementation(async () => {
      averiada = true;
      return false;
    });
    await userEvent.click(screen.getByRole('button', { name: 'Escuchar' }));
    expect(await screen.findByRole('note')).toHaveTextContent(e.en);
  });

  it('una voz cortada por otra (sin avería) no muestra la frase', async () => {
    const { speech } = await abrir([LISTEN]);
    speech.speak.mockImplementation(async () => false);
    await userEvent.click(screen.getByRole('button', { name: 'Escuchar' }));
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('hablar', () => {
  const e = ejercicio(SPEAK) as Extract<Exercise, { type: 'speak' }>;
  const oyo = (...alts: string[]): ListenResult => ({ kind: 'heard', alternatives: alts });

  it('muestra la frase y su traducción, y el botón de escucharla', async () => {
    const { dichas } = await abrir([SPEAK]);
    expect(screen.getByText(e.en)).toBeInTheDocument();
    expect(screen.getByText(e.es)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Escuchar/ }));
    expect(dichas.at(-1)?.texto).toBe(e.en);
    expect(screen.getByTestId('heard')).toHaveTextContent('Toca el micrófono y habla');
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeDisabled();
  });

  it('el micrófono escucha, muestra lo que entendió y permite comprobar con el porcentaje', async () => {
    const { speech } = await abrir([SPEAK], { oidos: [oyo(e.en.toLowerCase())] });
    await userEvent.click(screen.getByRole('button', { name: 'Hablar' }));
    await waitFor(() =>
      expect(screen.getByTestId('heard')).toHaveTextContent(`“${e.en.toLowerCase()}”`),
    );
    expect(speech.cancel).toHaveBeenCalled();
    await comprobar();
    expect(screen.getByText('Pronunciación: 100%')).toBeInTheDocument();
  });

  it('muestra lo que se va entendiendo mientras se habla', async () => {
    let soltar!: (r: ListenResult) => void;
    await abrir([SPEAK], {
      oidos: [
        (o) => {
          o.onInterim?.('i am');
          return new Promise<ListenResult>((r) => (soltar = r));
        },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Hablar' }));
    expect(screen.getByTestId('heard')).toHaveTextContent('“i am”');
    expect(screen.getByRole('button', { name: 'Dejar de escuchar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await act(async () => soltar(oyo(e.en)));
    expect(screen.getByRole('button', { name: 'Hablar' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('algo muy distinto falla y dice lo que se oyó', async () => {
    await abrir([SPEAK], { oidos: [oyo('banana split')] });
    await userEvent.click(screen.getByRole('button', { name: 'Hablar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Comprobar' })).toBeEnabled());
    await comprobar();
    expect(screen.getByText('Respuesta correcta:')).toBeInTheDocument();
    expect(screen.getByText('Escuché: “banana split”')).toBeInTheDocument();
  });

  it('el silencio avisa y deja intentarlo otra vez', async () => {
    await abrir([SPEAK], { oidos: [{ kind: 'silence' }, oyo(e.en)] });
    await userEvent.click(screen.getByRole('button', { name: 'Hablar' }));
    await waitFor(() =>
      expect(screen.getByTestId('heard')).toHaveTextContent('No te escuché, inténtalo otra vez.'),
    );
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Hablar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Comprobar' })).toBeEnabled());
  });

  it.each([
    ['not-allowed', 'Permiso de micrófono denegado.'],
    ['network', 'Este navegador no puede usar el servicio de voz.'],
    ['no-microphone', 'No se detecta ningún micrófono.'],
    ['unsupported', 'Este dispositivo no admite reconocimiento de voz.'],
    ['error', 'No se pudo iniciar el micrófono.'],
  ] as const)(
    'si el micrófono no está disponible (%s) lo explica y ofrece escribir la frase',
    async (reason, mensaje) => {
      await abrir([SPEAK], { oidos: [{ kind: 'unavailable', reason }] });
      await userEvent.click(screen.getByRole('button', { name: 'Hablar' }));
      expect(await screen.findByRole('note')).toHaveTextContent(mensaje);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Hablar' })).toBeNull();
    },
  );

  it('sin reconocimiento de voz desde el principio se escribe la frase, con el parecido exigido a lo escrito', async () => {
    await abrir([SPEAK], { canListen: false });
    expect(screen.getByRole('note')).toHaveTextContent(
      'Este dispositivo no admite reconocimiento de voz.',
    );
    await userEvent.type(screen.getByRole('textbox'), e.en);
    await comprobar();
    expect(screen.getByTestId('bubble')).toHaveTextContent('¡Bien hecho!');
  });

  it('escribir una frase incompleta falla', async () => {
    await abrir([SPEAK], { canListen: false });
    await userEvent.type(screen.getByRole('textbox'), 'I am fine');
    await comprobar();
    expect(screen.getByText('Respuesta correcta:')).toBeInTheDocument();
  });

  it('omitir siempre es posible: no suena, no cuenta fallo y se anota como omitido', async () => {
    const { sonidos, eventos } = await abrir([SPEAK]);
    await userEvent.click(screen.getByRole('button', { name: 'Omitir ejercicio' }));
    expect(screen.getByText('Omitido')).toBeInTheDocument();
    expect(sonidos).not.toContain('bad');
    expect(sonidos).not.toContain('ok');
    const respuesta = eventos().find((x) => x.type === 'exercise_answered@1') as Extract<
      ProgressEvent,
      { type: 'exercise_answered@1' }
    >;
    expect(respuesta.payload).toMatchObject({ exerciseId: SPEAK, skipped: true });
    await continuar();
    expect(
      await screen.findByRole('heading', { name: '¡Lección completada!' }),
    ).toBeInTheDocument();
  });

  it('se puede omitir también cuando no hay micrófono', async () => {
    await abrir([SPEAK], { canListen: false });
    await userEvent.click(screen.getByRole('button', { name: 'Omitir ejercicio' }));
    expect(screen.getByText('Omitido')).toBeInTheDocument();
  });

  it('al salir del ejercicio corta la voz y la escucha', async () => {
    const { speech } = await abrir([SPEAK]);
    speech.cancel.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Omitir ejercicio' }));
    await continuar();
    expect(speech.cancel).toHaveBeenCalled();
  });
});

describe('la primera lección real de Saludos', () => {
  it('se completa entera desde la interfaz con los seis tipos de ejercicio', async () => {
    const speak = ejercicio(SPEAK) as Extract<Exercise, { type: 'speak' }>;
    const { eventos } = await abrir(null, { oidos: [{ kind: 'heard', alternatives: [speak.en] }] });
    const leccion = seedCourse.units[0]!.lessons[0]!;
    // La lección real abre con sus «Palabras nuevas»: se recorren todas antes del primer ejercicio.
    for (let i = 1; i < leccion.teach!.length; i++)
      await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Entendido, empezar' }));
    for (const id of leccion.exerciseIds) {
      const e = ejercicio(id);
      if (e.type === 'mc') {
        await userEvent.click(
          screen.getByRole('button', { name: new RegExp(e.options[e.answerIndex]!.text) }),
        );
      } else if (e.type === 'order') {
        for (const w of e.en.split(' '))
          await userEvent.click(
            within(screen.getByTestId('word-bank')).getByRole('button', { name: w }),
          );
      } else if (e.type === 'write' || e.type === 'listen') {
        await userEvent.type(screen.getByRole('textbox'), e.en);
      } else if (e.type === 'match') {
        for (const p of e.pairs) await par(p.es, p.en);
      } else if (e.type === 'speak') {
        await userEvent.click(screen.getByRole('button', { name: 'Hablar' }));
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Comprobar' })).toBeEnabled(),
        );
      }
      await comprobar();
      expect(screen.getByTestId('bubble')).toHaveTextContent('¡Bien hecho!');
      await continuar();
    }
    expect(
      await screen.findByRole('heading', { name: '¡Lección completada!' }),
    ).toBeInTheDocument();
    const respuestas = eventos().filter((x) => x.type === 'exercise_answered@1');
    expect(respuestas).toHaveLength(10);
    expect(respuestas.every((x) => (x.payload as { correct: boolean }).correct)).toBe(true);
    expect(eventos().filter((x) => x.type === 'session_completed@1')).toHaveLength(1);
  });
});
