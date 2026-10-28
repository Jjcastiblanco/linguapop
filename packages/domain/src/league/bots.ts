/** Nombres de los jugadores simulados (los mismos de la versión heredada). */
export const BOT_NAMES = [
  'Lucía',
  'Mateo',
  'Sofía',
  'Diego',
  'Valentina',
  'Santi',
  'Camila',
  'Hugo',
  'Martina',
  'Leo',
  'Emma',
  'Nico',
  'Paula',
  'Alex',
  'Carla',
  'Dani',
  'Julia',
  'Pablo',
  'Noa',
  'Sergio',
  'Irene',
  'Marco',
  'Elena',
  'Bruno',
  'Ari',
  'Zoe',
  'Tomás',
  'Vera',
  'Oli',
] as const;

export const BOT_FACES = ['🐼', '🦊', '🐯', '🐸', '🦉', '🐙', '🐵', '🦄', '🐧', '🐨'] as const;

/** Hash FNV-1a de 32 bits: estable entre dispositivos, base de todo lo "aleatorio" de la liga. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
