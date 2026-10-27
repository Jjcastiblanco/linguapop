/** Textos de la interfaz en español. Las pantallas piden claves con `t`, nunca escriben texto suelto. */
export const es = {
  'app.name': 'LinguaPop',
  'app.pro': 'PRO',
  'topbar.streak': 'Racha',
  'topbar.gems': 'Gemas',
  'topbar.hearts': 'Vidas',
  'topbar.theme': 'Cambiar tema',
  'topbar.unlimited': '∞',
  'nav.label': 'Navegación principal',
  'nav.learn': 'Aprender',
  'nav.practice': 'Practicar',
  'nav.leagues': 'Ligas',
  'nav.profile': 'Perfil',
  'screen.learn.title': 'Aprender',
  'screen.practice.title': 'Practicar',
  'screen.leagues.title': 'Ligas',
  'screen.profile.title': 'Perfil',
  'screen.underConstruction': 'En construcción.',
  'mascot.fox': 'Zorro de LinguaPop',
  'mascot.nova': 'Nova',
} as const;

export type TextKey = keyof typeof es;
