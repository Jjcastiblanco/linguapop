// SPIKE 11.2 (rama desechable, no se fusiona): comprueba Turnstile en el navegador y en el WebView.
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type Turnstile = {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const KEY = 'spike:sitekey';

function load(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('no cargó api.js de challenges.cloudflare.com'));
    document.head.appendChild(s);
  });
}

export function TurnstileSpike() {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [siteKey, setSiteKey] = useState(() => localStorage.getItem(KEY) ?? '');
  const [token, setToken] = useState('');
  const [email, setEmail] = useState(`spike-${Date.now()}@example.com`);
  const [password, setPassword] = useState('Spike-prueba-1234');
  const [log, setLog] = useState<string[]>([]);
  const add = (m: string) =>
    setLog((l) => [`${new Date().toISOString().slice(11, 19)} ${m}`, ...l]);
  const client = createClient(
    import.meta.env.VITE_SUPABASE_URL ?? '',
    import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    { auth: { persistSession: false } },
  );

  useEffect(() => {
    add(`origen: ${location.origin} | UA: ${navigator.userAgent.slice(0, 90)}`);
  }, []);

  const mount = async () => {
    localStorage.setItem(KEY, siteKey);
    try {
      await load();
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = window.turnstile!.render(box.current!, {
        sitekey: siteKey,
        callback: (t: string) => {
          setToken(t);
          add(`token recibido (${t.length} caracteres)`);
        },
        'error-callback': (c: unknown) => add(`widget error-callback: ${String(c)}`),
        'expired-callback': () => add('token vencido'),
        'timeout-callback': () => add('timeout del widget'),
      });
      add('widget montado');
    } catch (e) {
      add(`FALLO al cargar: ${String(e)}`);
    }
  };

  const run = async (
    name: string,
    useToken: boolean,
    fn: (c: {
      captchaToken?: string;
    }) => Promise<{ error: { message: string; status?: number; code?: string } | null }>,
  ) => {
    const { error } = await fn(useToken && token ? { captchaToken: token } : {});
    add(
      `${name} ${useToken ? 'con' : 'sin'} token: ${error ? `ERROR ${error.status ?? ''} ${error.code ?? ''} ${error.message}` : 'OK'}`,
    );
  };

  const up = (u: boolean) =>
    run('signUp', u, ({ captchaToken }) =>
      client.auth.signUp({ email, password, options: { captchaToken } }),
    );
  const inn = (u: boolean) =>
    run('signInWithPassword', u, ({ captchaToken }) =>
      client.auth.signInWithPassword({ email, password, options: { captchaToken } }),
    );

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif', display: 'grid', gap: 8 }}>
      <h1>Spike Turnstile</h1>
      <input
        placeholder="clave del sitio (0x...)"
        value={siteKey}
        onChange={(e) => setSiteKey(e.target.value)}
      />
      <button onClick={() => void mount()}>1. Montar widget</button>
      <div ref={box} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <input value={password} onChange={(e) => setPassword(e.target.value)} />
      <button onClick={() => void up(true)}>signUp con token</button>
      <button onClick={() => void inn(true)}>signIn con token (usa token nuevo)</button>
      <button onClick={() => void up(false)}>signUp SIN token</button>
      <button onClick={() => void inn(false)}>signIn SIN token</button>
      <button
        onClick={() => {
          window.turnstile?.reset(widget.current);
          setToken('');
          add('widget reiniciado');
        }}
      >
        Reiniciar widget (token nuevo)
      </button>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{log.join('\n')}</pre>
    </div>
  );
}
