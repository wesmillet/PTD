/**
 * Stars for a finished level: one for clearing it, one for keeping every
 * life (free levels: at least three waves), one for a catch (defend levels
 * without a catch: no leaks). Pure; the summary screen draws them.
 */
import type { LevelSummary } from './level';

export function summaryStars(summary: Pick<LevelSummary, 'outcome' | 'wavesCleared' | 'lives' | 'maxLives' | 'caught' | 'leaks'>): number {
  let stars = 0;
  const cleared = summary.outcome === 'won' || (summary.outcome === 'left' && summary.wavesCleared >= 1);
  if (cleared) stars++;
  if (summary.maxLives !== undefined ? summary.lives === summary.maxLives : summary.wavesCleared >= 3) stars++;
  if (summary.caught.length > 0 || (summary.maxLives !== undefined && summary.leaks === 0 && cleared)) stars++;
  return stars;
}
