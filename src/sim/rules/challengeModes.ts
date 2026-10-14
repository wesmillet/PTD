/** The lottery challenge modifiers (kept apart from the rule so the lottery can import them without the level sim). */
export const CHALLENGE_MODES = ['solo', 'monotype', 'no-catch', 'level-cap', 'reverse', 'speedrun'] as const;
export type ChallengeMode = (typeof CHALLENGE_MODES)[number];
