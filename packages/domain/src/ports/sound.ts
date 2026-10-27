export type SoundEffect = 'ok' | 'bad' | 'click' | 'win' | 'ring' | 'hangup';

export interface Sound {
  play(effect: SoundEffect): void;
}
