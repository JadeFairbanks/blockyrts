// Jade's Patch 3: everything in the middle (the title row and what is under
// it) grows to fill the section, as the action menu's buttons grow to fill the
// card, without stretching: one scale for all of it, the largest at which it
// still fits the section's height and width inside the margins. Where it does
// not fit even at its own size, the section first grows upward (desktop, as
// the card does), then the content shrinks a little (to MIDDLE_MIN_SCALE)
// rather than hide its last row; past that it scrolls, as before Patch 3.
// Pure, so the search can be tested.

/** The most the middle's content grows: three times its own size (s). */
export const MIDDLE_MAX_SCALE = 3;
/** The least it shrinks to before it scrolls (a phone's Barracks with its queue) (s). */
export const MIDDLE_MIN_SCALE = 0.75;
/** The scale moves in twentieths, so a word changing in a row does not nudge everything a hair. */
export const MIDDLE_SCALE_STEP = 1 / 20;
/** The margin round the content inside the section's frame (unscaled px), as the card keeps its buttons clear of its wood (s). */
export const MIDDLE_MARGIN = 6;

/**
 * The largest scale from `min` to `max`, in steps of `step` from `min`, at
 * which `fits(scale)` holds; `min` when none does. `fits` must hold up to
 * some scale and fail above it (content laid out narrower is never shorter),
 * which the middle's rows and wrapping pictures are.
 */
export function bestScale(fits: (scale: number) => boolean, min = MIDDLE_MIN_SCALE, max = MIDDLE_MAX_SCALE, step = MIDDLE_SCALE_STEP): number {
  const steps = Math.max(0, Math.floor((max - min) / step + 1e-9));
  const at = (n: number): number => Math.round((min + n * step) * 1000) / 1000;
  // lo fits (or is the least), hi does not (or is past the top).
  let lo = 0;
  let hi = steps + 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fits(at(mid))) lo = mid;
    else hi = mid;
  }
  return at(lo);
}
