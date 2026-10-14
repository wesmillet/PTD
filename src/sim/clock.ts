/**
 * Fixed-step clock. Game speed never changes the step length: 2x and 4x
 * run two and four 1/60 s steps per frame, so a level plays out identically
 * at every speed for the same seed and inputs.
 */
import { step, type LevelEvent, type LevelState } from './level';

export const SIM_STEP = 1 / 60;
/** Longest frame that is simulated in full (a tab switch does not fast-forward the level). */
export const MAX_FRAME_SECONDS = 0.25;

export interface Clock {
  /** Simulated time owed but not yet stepped, in seconds. */
  accumulator: number;
}

export function createClock(): Clock {
  return { accumulator: 0 };
}

/**
 * Advances the level by one rendered frame of `frameSeconds` at `gameSpeed`,
 * running whole fixed steps and keeping the remainder. `onStep` receives each
 * step's events as they happen and may return true to halt the rest of the
 * frame (a dialog opened). Returns every event of the frame in order.
 */
export function advance(clock: Clock, state: LevelState, frameSeconds: number, gameSpeed: number, onStep?: (events: LevelEvent[]) => boolean | void): LevelEvent[] {
  const all: LevelEvent[] = [];
  clock.accumulator += Math.min(Math.max(0, frameSeconds), MAX_FRAME_SECONDS) * gameSpeed;
  while (clock.accumulator >= SIM_STEP - 1e-12) {
    clock.accumulator -= SIM_STEP;
    const events = step(state, SIM_STEP);
    all.push(...events);
    if (onStep?.(events)) break;
  }
  return all;
}
