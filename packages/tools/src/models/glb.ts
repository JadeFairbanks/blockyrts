// A small writer for binary glTF 2.0 (.glb) files: collects buffer views and
// accessors in one binary buffer and packs the JSON and BIN chunks.

export const FLOAT = 5126;
export const UNSIGNED_SHORT = 5123;
export const UNSIGNED_INT = 5125;
export const ARRAY_BUFFER = 34962;
export const ELEMENT_ARRAY_BUFFER = 34963;
export const NEAREST = 9728;

export type AccessorType = 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4';
const COMPONENTS: Record<AccessorType, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

type Json = Record<string, unknown>;

export class GlbWriter {
  readonly json: Json & {
    accessors: Json[];
    bufferViews: Json[];
    buffers: Json[];
  };
  private readonly parts: Uint8Array[] = [];
  private length = 0;

  constructor() {
    this.json = {
      asset: { version: '2.0', generator: 'blockyrts model converter' },
      accessors: [],
      bufferViews: [],
      buffers: [],
    };
  }

  /** Appends bytes on a 4-byte boundary and returns the buffer view index. */
  addBufferView(bytes: Uint8Array, target?: number, byteStride?: number): number {
    const pad = (4 - (this.length % 4)) % 4;
    if (pad > 0) {
      this.parts.push(new Uint8Array(pad));
      this.length += pad;
    }
    const view: Json = { buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength };
    if (target !== undefined) view.target = target;
    if (byteStride !== undefined) view.byteStride = byteStride;
    this.parts.push(bytes);
    this.length += bytes.byteLength;
    this.json.bufferViews.push(view);
    return this.json.bufferViews.length - 1;
  }

  /** Adds a float accessor over its own buffer view, with min and max unless `bounds` is false. */
  addFloat(data: Float32Array, type: AccessorType, target?: number, bounds = true): number {
    const n = COMPONENTS[type];
    const min = new Array<number>(n).fill(Infinity);
    const max = new Array<number>(n).fill(-Infinity);
    for (let i = 0; i < data.length; i++) {
      const v = data[i] ?? 0;
      const c = i % n;
      if (v < (min[c] ?? 0)) min[c] = v;
      if (v > (max[c] ?? 0)) max[c] = v;
    }
    const view = this.addBufferView(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), target);
    const accessor: Json = { bufferView: view, componentType: FLOAT, count: data.length / n, type };
    if (bounds) Object.assign(accessor, { min, max });
    this.json.accessors.push(accessor);
    return this.json.accessors.length - 1;
  }

  /** Index accessor (unsigned short or int, whichever fits). */
  addIndices(indices: Uint32Array, vertexCount: number): number {
    const small = vertexCount <= 65535;
    const data = small ? Uint16Array.from(indices) : indices;
    const view = this.addBufferView(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), ELEMENT_ARRAY_BUFFER);
    this.json.accessors.push({ bufferView: view, componentType: small ? UNSIGNED_SHORT : UNSIGNED_INT, count: indices.length, type: 'SCALAR' });
    return this.json.accessors.length - 1;
  }

  /**
   * A per-vertex unsigned short scalar attribute. Stored with a byte stride of 4
   * because glTF requires vertex attribute elements on 4-byte boundaries.
   */
  addUshortAttribute(values: ArrayLike<number>): number {
    const data = new Uint16Array(values.length * 2);
    for (let i = 0; i < values.length; i++) data[i * 2] = values[i] ?? 0;
    const view = this.addBufferView(new Uint8Array(data.buffer), ARRAY_BUFFER, 4);
    this.json.accessors.push({ bufferView: view, componentType: UNSIGNED_SHORT, count: values.length, type: 'SCALAR' });
    return this.json.accessors.length - 1;
  }

  /** Packs the document into a .glb byte array. */
  toGlb(): Uint8Array {
    const binLength = this.length + ((4 - (this.length % 4)) % 4);
    this.json.buffers = [{ byteLength: binLength }];
    const jsonBytes = new TextEncoder().encode(JSON.stringify(this.json));
    const jsonLength = jsonBytes.length + ((4 - (jsonBytes.length % 4)) % 4);
    const total = 12 + 8 + jsonLength + 8 + binLength;
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    view.setUint32(0, 0x46546c67, true); // 'glTF'
    view.setUint32(4, 2, true);
    view.setUint32(8, total, true);
    view.setUint32(12, jsonLength, true);
    view.setUint32(16, 0x4e4f534a, true); // 'JSON'
    out.set(jsonBytes, 20);
    out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLength);
    let pos = 20 + jsonLength;
    view.setUint32(pos, binLength, true);
    view.setUint32(pos + 4, 0x004e4942, true); // 'BIN\0'
    pos += 8;
    for (const part of this.parts) {
      out.set(part, pos);
      pos += part.byteLength;
    }
    return out;
  }
}

/** Splits a .glb into its JSON document and binary chunk (used by the tests). */
export function readGlb(bytes: Uint8Array): { json: Record<string, unknown>; bin: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb file');
  if (view.getUint32(4, true) !== 2) throw new Error('not glTF 2.0');
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error('glb length mismatch');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) throw new Error('first chunk is not JSON');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Record<string, unknown>;
  const pos = 20 + jsonLength;
  const binLength = view.getUint32(pos, true);
  if (view.getUint32(pos + 4, true) !== 0x004e4942) throw new Error('second chunk is not BIN');
  return { json, bin: bytes.subarray(pos + 8, pos + 8 + binLength) };
}
