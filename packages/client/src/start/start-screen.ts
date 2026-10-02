// The start screen: type a seed (or roll one), pick the number of players and
// start. ?seed=N&players=N in the URL skips it.
import { MAX_PLAYERS, MAX_SEED, MIN_PLAYERS, parseSeed, randomSeed, startFromUrl, type StartOptions } from './seed.ts';

export function chooseStart(parent: HTMLElement): Promise<StartOptions> {
  const fromUrl = startFromUrl(location.search);
  if (fromUrl) return Promise.resolve(fromUrl);

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay start-overlay';
    const form = document.createElement('form');
    form.className = 'dialog start';
    form.noValidate = true;
    form.innerHTML = `
      <h1>Survive and Conquer</h1>
      <p class="tagline">Build by day, hold the walls by night.</p>
      <label class="field">
        <span>World seed</span>
        <span class="row">
          <input name="seed" inputmode="numeric" autocomplete="off" spellcheck="false" aria-describedby="seed-help" />
          <button type="button" name="random">Random</button>
        </span>
        <small id="seed-help">Any whole number from 0 to ${MAX_SEED.toLocaleString('en')}. The same seed makes the same world.</small>
        <small class="error" hidden></small>
      </label>
      <label class="field">
        <span>Players</span>
        <select name="players"></select>
        <small>Each player gets a start pocket; you are player 1.</small>
      </label>
      <button type="submit" class="primary start-btn">Start</button>`;
    overlay.append(form);
    parent.append(overlay);

    const seedInput = form.querySelector<HTMLInputElement>('input[name=seed]')!;
    const players = form.querySelector<HTMLSelectElement>('select[name=players]')!;
    const error = form.querySelector<HTMLElement>('.error')!;
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const o = document.createElement('option');
      o.value = String(n);
      o.textContent = n === 1 ? '1 (solo)' : String(n);
      players.append(o);
    }
    seedInput.value = String(randomSeed());
    form.querySelector<HTMLButtonElement>('button[name=random]')!.addEventListener('click', () => {
      seedInput.value = String(randomSeed());
      error.hidden = true;
    });
    seedInput.addEventListener('input', () => {
      error.hidden = true;
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const seed = parseSeed(seedInput.value);
      if (seed === null) {
        error.textContent = `The seed must be a whole number from 0 to ${MAX_SEED.toLocaleString('en')}.`;
        error.hidden = false;
        seedInput.focus();
        return;
      }
      overlay.remove();
      resolve({ seed, players: Number(players.value) });
    });
    seedInput.focus();
    seedInput.select();
  });
}
