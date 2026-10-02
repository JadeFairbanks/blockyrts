// UTF-8 through the platform's TextEncoder and TextDecoder, typed structurally
// so this package compiles without the DOM or Node type libraries.

interface Encoder {
  encode(s: string): Uint8Array;
}
interface Decoder {
  decode(b: Uint8Array): string;
}

const g = globalThis as unknown as {
  TextEncoder: new () => Encoder;
  TextDecoder: new (label: string, opts?: { fatal: boolean }) => Decoder;
};

export const utf8Encoder: Encoder = new g.TextEncoder();
/** Throws on malformed UTF-8. */
export const utf8Decoder: Decoder = new g.TextDecoder('utf-8', { fatal: true });
