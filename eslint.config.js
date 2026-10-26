import tseslint from 'typescript-eslint';

// Reglas de frontera de la arquitectura hexagonal (AD-1 y AD-2).

const DOM_GLOBALS = [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'alert',
  'Audio',
  'AudioContext',
  'speechSynthesis',
  'SpeechSynthesisUtterance',
  'SpeechRecognition',
  'webkitSpeechRecognition',
  'HTMLElement',
  'Element',
].map((name) => ({
  name,
  message: 'El dominio y el contenido no usan el DOM ni APIs del navegador: usa un puerto.',
}));

const FRONTERA_DEL_DOMINIO = [
  {
    group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    message: 'El dominio y el contenido no importan React (AD-1).',
  },
  {
    group: ['@capacitor/*', '@capacitor-community/*', '@capgo/*'],
    message: 'El dominio y el contenido no importan Capacitor: usa un puerto (AD-1).',
  },
  {
    group: ['@supabase/*'],
    message: 'El dominio y el contenido no importan Supabase: usa un puerto (AD-1).',
  },
  {
    group: ['@linguapop/app', '@linguapop/admin'],
    message: 'Los paquetes no importan apps (AD-2).',
  },
  {
    regex: '(^|/)apps(/|$)',
    message: 'Los paquetes no importan código de apps/ (AD-2).',
  },
];

// `no-restricted-imports` no ve los import() dinámicos: se cubren con selectores.
const IMPORT_DINAMICO = [
  {
    selector: 'ImportExpression[source.value=/^(react|react-dom)(\\/|$)/]',
    message: 'El dominio y el contenido no importan React (AD-1).',
  },
  {
    selector:
      'ImportExpression[source.value=/^@(capacitor|capacitor-community|capgo|supabase)\\//]',
    message: 'El dominio y el contenido no importan Capacitor ni Supabase: usa un puerto (AD-1).',
  },
  {
    selector: 'ImportExpression[source.value=/(^|\\/)apps(\\/|$)|^@linguapop\\/(app|admin)$/]',
    message: 'Los paquetes no importan apps (AD-2).',
  },
  {
    selector: "CallExpression[callee.name='require']",
    message: 'Usa import estático en vez de require.',
  },
];

const restringir = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

export default [
  tseslint.configs.base,
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '_bmad-output/**',
      'legacy/**',
      'linguapop.html',
      'sw.js',
    ],
  },
  {
    files: ['packages/domain/**/*.{ts,tsx,js}'],
    rules: {
      ...restringir(FRONTERA_DEL_DOMINIO),
      'no-restricted-syntax': ['error', ...IMPORT_DINAMICO],
      'no-restricted-globals': ['error', ...DOM_GLOBALS],
    },
  },
  {
    files: ['packages/content/**/*.{ts,tsx,js}'],
    rules: {
      ...restringir([
        ...FRONTERA_DEL_DOMINIO,
        {
          group: ['@linguapop/domain'],
          message: 'El contenido no depende del dominio (AD-2).',
        },
      ]),
      'no-restricted-syntax': ['error', ...IMPORT_DINAMICO],
      'no-restricted-globals': ['error', ...DOM_GLOBALS],
    },
  },
  {
    files: ['apps/app/**/*.{ts,tsx,js}'],
    rules: restringir([
      { group: ['@linguapop/admin'], message: 'Las apps no se importan entre sí (AD-2).' },
      { regex: '(^|/)apps/admin(/|$)', message: 'Las apps no se importan entre sí (AD-2).' },
      { regex: '^(\\.\\./)+admin(/|$)', message: 'Las apps no se importan entre sí (AD-2).' },
    ]),
  },
  {
    files: ['apps/admin/**/*.{ts,tsx,js}'],
    rules: restringir([
      { group: ['@linguapop/app'], message: 'Las apps no se importan entre sí (AD-2).' },
      { regex: '(^|/)apps/app(/|$)', message: 'Las apps no se importan entre sí (AD-2).' },
      { regex: '^(\\.\\./)+app(/|$)', message: 'Las apps no se importan entre sí (AD-2).' },
    ]),
  },
];
