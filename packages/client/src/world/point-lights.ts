// The building, flash and tavern lights are always in the scene, dark by day
// (intensity 0), so no shader is rebuilt when one comes on. three.js still
// worked each of the nine out for every pixel of every lit surface, all day,
// to add nothing. This patch skips a light whose colour is black (a check on
// the light itself, the same for every pixel, so it costs the graphics card
// nothing), and a pixel at or past a light's reach, where three.js's own
// falloff is exactly zero. The picture is the same.
import * as THREE from 'three';

const LOOP = '\tfor ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {\n\t\tpointLight = pointLights[ i ];\n';
const BODY_END = '\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n\t}';
// The loop is unrolled by pasting its body once per light, so the test declares nothing; the
// distance is three.js's own expression (getPointLightInfo), so the edge falls where its falloff ends.
const REACHES = '\t\tif ( pointLight.color != vec3( 0.0 ) && ( pointLight.distance <= 0.0 || length( pointLight.position - geometryPosition ) < pointLight.distance ) ) {\n';

/**
 * Patches three.js's light loop once, before the first shader is built.
 * Returns whether it applied (false if a three.js update changed the loop,
 * when the lights are worked out as before).
 */
export function skipUnlitPointLights(): boolean {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (chunk.includes(REACHES)) return true;
  const start = chunk.indexOf(LOOP);
  const end = start < 0 ? -1 : chunk.indexOf(BODY_END, start);
  if (end < 0) return false;
  const bodyEnd = end + BODY_END.length - 2;
  THREE.ShaderChunk.lights_fragment_begin = chunk.slice(0, start + LOOP.length) + REACHES + chunk.slice(start + LOOP.length, bodyEnd) + '\t\t}\n' + chunk.slice(bodyEnd);
  return true;
}
