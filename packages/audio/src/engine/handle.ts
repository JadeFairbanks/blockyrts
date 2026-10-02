// Turns a render request into a response. Shared by the worker and the
// in-thread fallback.
import { soundDef } from '../manifest.ts';
import { renderMusic } from '../music/render.ts';
import { renderDef } from '../render.ts';
import type { RenderRequest, RenderResponse } from './protocol.ts';

export function handleRequest(req: RenderRequest): RenderResponse {
  try {
    if (req.kind === 'sound') {
      const def = soundDef(req.id);
      if (!def) throw new Error(`Unknown sound "${req.id}"`);
      const variants = Array.from({ length: def.variants }, (_, v) => renderDef(def, v, req.sr));
      return { job: req.job, kind: 'sound', id: req.id, sr: req.sr, variants };
    }
    const m = renderMusic(req.state, req.sr);
    return {
      job: req.job, kind: 'music', state: req.state, sr: m.sampleRate,
      channels: [m.stems.base.left, m.stems.base.right, m.stems.tension.left, m.stems.tension.right],
    };
  } catch (e) {
    return { job: req.job, kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export function transferables(res: RenderResponse): ArrayBuffer[] {
  if (res.kind === 'sound') return res.variants.map((v) => v.buffer as ArrayBuffer);
  if (res.kind === 'music') return res.channels.map((c) => c.buffer as ArrayBuffer);
  return [];
}
