/**
 * The Platinum trainer art index (public/assets/trainers/index.json): which
 * files exist per trainer id, with the display name and class.
 */
import index from '../../public/assets/trainers/index.json';

export interface TrainerArt {
  /** 1 = standing only, 2 = standing and throwing pose. */
  poses: number;
  mugshot: boolean;
  banner: boolean;
  /** Overworld sheet stem under trainers/overworld/, if any. */
  overworld?: string | null;
  name: string;
  class: string;
  /** Generic ids ("youngster-tristan") share another id's art. */
  alias_of?: string;
}

export const TRAINER_ART = index as unknown as Record<string, TrainerArt>;

export function trainerArt(id: string): TrainerArt | undefined {
  return TRAINER_ART[id];
}

/** The id whose files to load: the alias target when the index names one. */
export function trainerArtId(id: string): string {
  return TRAINER_ART[id]?.alias_of ?? id;
}
