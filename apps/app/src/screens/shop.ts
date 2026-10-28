import { MAX_HEARTS, PRICES, currentHearts, dayKey, monthKey } from '@linguapop/domain';
import type { AppServices } from '../composition/context';

export type BuyOutcome = 'bought' | 'no-gems' | 'hearts-full' | 'shield-ready';

/**
 * Compra en la tienda de gemas. El dominio decide si la compra vale; aquí solo se comprueba antes
 * para poder avisar por qué no se hizo, y no se registra ningún evento cuando no vale.
 */
export async function buyItem(
  { composition, progress: store }: AppServices,
  item: keyof typeof PRICES,
): Promise<BuyOutcome> {
  const progress = store.getState().progress;
  const cost = PRICES[item];
  const today = dayKey(composition.clock.now(), progress.settings.timeZone);
  if (progress.gems < cost) return 'no-gems';
  if (item === 'hearts' && currentHearts(progress, today) >= MAX_HEARTS) return 'hearts-full';
  if (item === 'streak_shield' && progress.streak.shieldMonth !== monthKey(today)) {
    return 'shield-ready';
  }
  await store.getState().record([{ type: 'purchase@1', payload: { item, costGems: cost } }]);
  composition.sound.play('win');
  return 'bought';
}

/** Pasa al plan PRO. */
export async function activatePro({ progress: store }: AppServices): Promise<void> {
  await store.getState().record([{ type: 'settings_changed@1', payload: { plan: 'pro' } }]);
}
