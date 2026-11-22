import { en } from './en';
import { es, type TextKey } from './es';

export type { TextKey };

export type Language = 'es' | 'en';

const catalogs: Record<Language, Record<TextKey, string>> = { es, en };

/** Idioma de la interfaz: español, o inglés con el modo inmersión. Lo fija la app al arrancar. */
let language: Language = 'es';

export function setInterfaceLanguage(next: Language): void {
  language = next;
}

export function interfaceLanguage(): Language {
  return language;
}

/**
 * Texto de la interfaz para una clave, en el idioma actual (o en el que se pida). Los marcadores
 * `{nombre}` se reemplazan con los parámetros; un marcador sin parámetro se deja tal cual para que
 * el error se note.
 */
export function t(
  key: TextKey,
  params: Record<string, string | number> = {},
  lang: Language = language,
): string {
  return catalogs[lang][key].replace(/\{(\w+)\}/g, (marcador, nombre: string) =>
    nombre in params ? String(params[nombre]) : marcador,
  );
}
