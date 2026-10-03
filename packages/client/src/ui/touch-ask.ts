// The first-load question (patch notes 1): on a device with a touchscreen,
// a large box asks whether the game is being played by touch. Yes turns on
// tap controls (Settings > Camera > Touch controls), so everything is done by
// tapping, with no right click; No keeps the mouse and keyboard. Either way
// the answer is kept and the box never comes back; the setting can be
// changed later in Settings.
import { saveSettings, type Settings } from '../settings/settings.ts';
import { button, el, Screen } from './dom.ts';

/** Whether this device has a touchscreen at all (a phone, a tablet, a laptop with a touch panel). */
export function hasTouchScreen(): boolean {
  try {
    if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return true;
    return typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** Whether the question is due: a touchscreen, and never answered. */
export function touchQuestionDue(settings: Settings, touchScreen: boolean): boolean {
  return touchScreen && !settings.touchAsked;
}

/** Asks once; resolves when it is answered. */
export function askTouch(app: HTMLElement, settings: Settings): Promise<void> {
  const screen = new Screen(app, 'touch-ask');
  const box = screen.page('Playing on a touchscreen?', 'touch-ask');
  el('p', 'note lead', 'This device has a touchscreen. With touch controls everything is done by tapping:', box);
  const list = el('ul', 'touch-list', undefined, box);
  for (const line of [
    'Tap to select. With something of yours selected, tap the ground, an enemy or a resource to give the order a right click gives.',
    'Drag one finger to move the camera; pinch to zoom.',
    'Hold a finger on anything to look at it, or on a button to read what it does.',
    'The Box button draws a selection box with your next drag.',
  ]) {
    el('li', '', line, list);
  }
  el('p', 'note', 'You can change this any time in Settings.', box);
  return new Promise((resolve) => {
    const answer = (touch: boolean): void => {
      settings.touch = touch;
      settings.touchAsked = true;
      saveSettings(settings);
      screen.remove();
      resolve();
    };
    const row = el('div', 'touch-answers', undefined, box);
    button(row, 'Yes, touch controls', () => answer(true), 'primary big');
    button(row, 'No, mouse and keyboard', () => answer(false), 'big');
  });
}
