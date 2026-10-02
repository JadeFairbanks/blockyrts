// Small vector, quaternion and matrix helpers for the model converter.
// Matrices are 4 x 4, column-major (the glTF and three.js layout).

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Mat4 = Float64Array;

const DEG = Math.PI / 180;

export function identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0);
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/**
 * Quaternion for Euler angles in radians applied in Blockbench's order: the
 * rotation matrix is Rz * Ry * Rx (three.js Euler order 'ZYX'), so a vector is
 * turned about X first, then Y, then Z.
 */
export function quatFromEulerZYX(x: number, y: number, z: number): Quat {
  const qx: Quat = [Math.sin(x / 2), 0, 0, Math.cos(x / 2)];
  const qy: Quat = [0, Math.sin(y / 2), 0, Math.cos(y / 2)];
  const qz: Quat = [0, 0, Math.sin(z / 2), Math.cos(z / 2)];
  return quatMultiply(quatMultiply(qz, qy), qx);
}

export function quatFromEulerDegZYX(r: readonly number[]): Quat {
  return quatFromEulerZYX((r[0] ?? 0) * DEG, (r[1] ?? 0) * DEG, (r[2] ?? 0) * DEG);
}

/** Translation * rotation * scale, as a matrix. */
export function compose(t: Vec3, q: Quat, s: Vec3 = [1, 1, 1]): Mat4 {
  const [x, y, z, w] = q;
  const m = new Float64Array(16);
  m[0] = (1 - 2 * (y * y + z * z)) * s[0];
  m[1] = 2 * (x * y + z * w) * s[0];
  m[2] = 2 * (x * z - y * w) * s[0];
  m[4] = 2 * (x * y - z * w) * s[1];
  m[5] = (1 - 2 * (x * x + z * z)) * s[1];
  m[6] = 2 * (y * z + x * w) * s[1];
  m[8] = 2 * (x * z + y * w) * s[2];
  m[9] = 2 * (y * z - x * w) * s[2];
  m[10] = (1 - 2 * (x * x + y * y)) * s[2];
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  m[15] = 1;
  return m;
}

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  const [x, y, z] = p;
  return [
    (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0),
    (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
    (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0),
  ];
}

/** Turns a direction by the matrix (no translation) and normalises it. */
export function transformDirection(m: Mat4, d: Vec3): Vec3 {
  const [x, y, z] = d;
  const v: Vec3 = [
    (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z,
    (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z,
    (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z,
  ];
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
