// Chat between players (Unit speech and the message panel): Enter, or a
// click on the text box at the bottom of the message panel, starts typing;
// Enter sends and Esc cancels. Game hotkeys are paused while the box has the
// keyboard (the input manager hands no keys to the game while a text field
// is focused). Player messages appear only in the panel, never as bubbles.
import { MAX_CHAT_LENGTH } from '@blockyrts/protocol';

export class ChatBox {
  constructor(
    private readonly input: HTMLInputElement,
    private readonly sendText: ((text: string) => void) | null,
  ) {
    input.maxLength = MAX_CHAT_LENGTH;
    input.disabled = sendText === null;
    input.placeholder = sendText ? 'Press Enter to chat' : 'Playing alone: nobody to chat with';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = input.value.trim();
        if (text) this.sendText?.(text);
        this.close();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
      // Every other key is the player's typing, not a game key.
      e.stopPropagation();
    });
    input.addEventListener('focus', () => {
      input.placeholder = 'Type a message: Enter sends, Esc cancels';
    });
    input.addEventListener('blur', () => {
      if (this.sendText) input.placeholder = 'Press Enter to chat';
    });
  }

  get enabled(): boolean {
    return this.sendText !== null;
  }

  get typing(): boolean {
    return document.activeElement === this.input;
  }

  open(): void {
    if (!this.sendText) return;
    this.input.focus();
  }

  close(): void {
    this.input.value = '';
    this.input.blur();
  }
}
