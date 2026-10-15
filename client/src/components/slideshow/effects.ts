/**
 * Slideshow transition effects. Ids are stable: they are stored in the settings and name the i18n texts
 * and CSS classes. Directions are physical screen sides and do not mirror in right-to-left languages.
 */
export const SLIDESHOW_EFFECTS = [
  'fade', 'dipBlack', 'dipWhite',
  'slideLeft', 'slideRight', 'slideUp', 'slideDown',
  'pushLeft', 'pushRight', 'pushUp', 'pushDown',
  'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown',
  'zoomIn', 'zoomOut', 'iris', 'blinds', 'flip',
] as const;
export type EffectId = typeof SLIDESHOW_EFFECTS[number];

/** What the user chooses in Settings: no effect, a random one per move, or one effect. */
export type EffectChoice = 'none' | 'random' | EffectId;
export const EFFECT_CHOICES: readonly EffectChoice[] = ['none', 'random', ...SLIDESHOW_EFFECTS];

/** Seconds an effect takes. */
export const EFFECT_DURATIONS = [0.5, 1, 2] as const;
export type EffectDuration = typeof EFFECT_DURATIONS[number];

/** What a move actually plays: an effect, or `none` for an instant cut. */
export type PlayedEffect = 'none' | EffectId;

/** A number in [0, 1), like `Math.random`; injected so tests are deterministic. */
export type RandomSource = () => number;

/** The effect for the next move. Random never picks the effect played by the move just before. */
export function pickEffect(choice: EffectChoice, previous: PlayedEffect | null, random: RandomSource = Math.random): PlayedEffect {
  if (choice !== 'random') return choice;
  const pool = SLIDESHOW_EFFECTS.filter((effect) => effect !== previous);
  return pool[Math.min(Math.floor(random() * pool.length), pool.length - 1)];
}

const OPPOSITE = { Left: 'Right', Right: 'Left', Up: 'Down', Down: 'Up' } as const;

/** The same effect played back the other way, for Previous: slides, pushes and wipes swap direction. */
export function reverseOf(effect: PlayedEffect): PlayedEffect {
  const match = /^(slide|push|wipe)(Left|Right|Up|Down)$/.exec(effect);
  return match ? `${match[1]}${OPPOSITE[match[2] as keyof typeof OPPOSITE]}` as EffectId : effect;
}

/**
 * What is played on this device: with reduced motion every effect is a fade, and an effect the browser cannot
 * draw (`supported` false) is a fade too. No effect stays no effect.
 */
export function effectiveEffect(effect: PlayedEffect, reducedMotion: boolean, supported: (effect: EffectId) => boolean = () => true): PlayedEffect {
  if (effect === 'none') return 'none';
  if (reducedMotion || !supported(effect)) return 'fade';
  return effect;
}
