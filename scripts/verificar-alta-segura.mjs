// Comprueba que el alta y el acceso con correo de un proyecto de Supabase están protegidos (épica 11, 11.4).
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=sb_publishable_... pnpm verificar:alta
//   pnpm verificar:alta --limite 10 --rafaga 40
//
// Ninguna petición crea cuentas: van sin token de Turnstile o con uno falso, así que Auth las rechaza.
// Solo usa la clave anónima pública. Si el límite por IP llegara a cortar, la IP de quien lo corre quedaría
// sin altas ni accesos con correo unos 5 minutos. Es una herramienta de desarrollo.
const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !anonKey) {
  console.error('Faltan SUPABASE_URL (https://<proyecto>.supabase.co) y SUPABASE_ANON_KEY.');
  process.exit(2);
}
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};
/** `sign_in_sign_ups` configurado: peticiones de alta o acceso cada 5 minutos por IP. */
const limite = arg('limite', 10);
const rafaga = arg('rafaga', 40);

const headers = { apikey: anonKey, 'Content-Type': 'application/json' };
let enviadas = 0;

async function pedir(ruta, body) {
  enviadas += 1;
  const res = await fetch(`${url}${ruta}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return {
    status: res.status,
    code: json.error_code ?? json.code ?? '',
    msg: json.msg ?? json.message ?? '',
  };
}
const correo = () => `verif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const clave = 'Verif-prueba-1234';

const filas = [];
const anotar = (caso, r, esperado, detalle = '') =>
  filas.push({ caso, http: r.status, codigo: r.code, ok: esperado(r), detalle: detalle || r.msg });
const captchaRechazado = (r) => r.status === 400 && r.code === 'captcha_failed';

anotar(
  'alta sin token',
  await pedir('/auth/v1/signup', { email: correo(), password: clave }),
  captchaRechazado,
);
anotar(
  'alta con token falso',
  await pedir('/auth/v1/signup', {
    email: correo(),
    password: clave,
    gotrue_meta_security: { captcha_token: 'token-inventado' },
  }),
  captchaRechazado,
);
anotar(
  'acceso sin token',
  await pedir('/auth/v1/token?grant_type=password', { email: correo(), password: clave }),
  captchaRechazado,
);

// Ráfaga sin token: lo que se exige es que NINGUNA pase. Que el límite por IP llegue a cortar con 429 es
// solo un dato: Auth comprueba el captcha antes y, en staging, las peticiones rechazadas por captcha no
// gastan la cuota. El límite solo se ve con tokens válidos, que no se pueden generar sin el widget.
const estados = [];
for (let i = 0; i < rafaga; i += 1) {
  estados.push(await pedir('/auth/v1/signup', { email: correo(), password: clave }));
}
const primero429 = estados.findIndex((r) => r.status === 429);
const rechazadas = estados.filter((r) => captchaRechazado(r) || r.status === 429).length;
filas.push({
  caso: `ráfaga de ${rafaga} altas sin token`,
  http: primero429 === -1 ? '400 (sin 429)' : '400 y 429',
  codigo: 'captcha_failed',
  ok: rechazadas === estados.length,
  detalle:
    (rechazadas === estados.length
      ? `ninguna alta pasó (${rechazadas}/${estados.length} rechazadas)`
      : `PASARON ${estados.length - rechazadas} altas sin token`) +
    (primero429 === -1
      ? `; el límite por IP (${limite}) no llegó a cortar: el captcha rechaza antes y no gasta cuota`
      : `; el límite por IP cortó en la petición ${enviadas - estados.length + primero429 + 1} de esta IP`),
});

console.table(
  filas.map((f) => ({
    caso: f.caso,
    http: f.http,
    codigo: f.codigo,
    veredicto: f.ok ? 'OK' : 'FALLA',
    detalle: f.detalle,
  })),
);
process.exit(filas.every((f) => f.ok) ? 0 : 1);
