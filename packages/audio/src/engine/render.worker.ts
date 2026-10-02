// Renders sounds and music off the main thread so the game never stutters.
import { handleRequest, transferables } from './handle.ts';
import type { RenderRequest, RenderResponse } from './protocol.ts';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<RenderRequest>) => void) | null;
  postMessage(msg: RenderResponse, transfer: ArrayBuffer[]): void;
};

scope.onmessage = (e) => {
  const res = handleRequest(e.data);
  scope.postMessage(res, transferables(res));
};
