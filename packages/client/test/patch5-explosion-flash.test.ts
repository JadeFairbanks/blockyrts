// An explosion's flash (Jade, Patch 5: "a rapid burst of light, like a real
// explosion at night"): a cannonball going off or a wall breaker's bomb lights
// up for a blink, bright in the dark and faint by day, then is gone.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FLASH, FLASH_LIGHTS, Flashes } from '../src/world/units-view.ts';

function lights(scene: THREE.Scene): THREE.PointLight[] {
  return scene.children.filter((c): c is THREE.PointLight => c instanceof THREE.PointLight);
}

function balls(scene: THREE.Scene): THREE.InstancedMesh {
  return scene.children.find((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh)!;
}

describe('explosion flashes', () => {
  it('a wall breaker going off at night lights up for a blink, then is dark again', () => {
    const scene = new THREE.Scene();
    const f = new Flashes(scene, FLASH_LIGHTS);
    expect(lights(scene)).toHaveLength(FLASH_LIGHTS);
    f.add(10, 2, 10, FLASH.bomb);
    f.update(0.01, 1);
    const lit = lights(scene).filter((l) => l.intensity > 0);
    expect(lit).toHaveLength(1);
    expect(lit[0]!.intensity).toBeGreaterThan(FLASH.bomb.peak * 0.8);
    expect(lit[0]!.distance).toBe(FLASH.bomb.reach);
    expect(balls(scene).count).toBe(1);
    f.update(FLASH.bomb.life, 1);
    expect(lights(scene).every((l) => l.intensity === 0)).toBe(true);
    expect(balls(scene).count).toBe(0);
  });

  it('is far fainter by day, and the newest flash takes the oldest light', () => {
    const scene = new THREE.Scene();
    const f = new Flashes(scene, FLASH_LIGHTS);
    f.add(0, 0, 0, FLASH.cannon);
    f.update(0.01, 0);
    const day = Math.max(...lights(scene).map((l) => l.intensity));
    expect(day).toBeGreaterThan(0);
    expect(day).toBeLessThan(FLASH.cannon.peak * 0.2);
    for (let k = 0; k < FLASH_LIGHTS + 1; k++) f.add(k * 5, 0, 0, FLASH.cannon);
    f.update(0.01, 1);
    expect(lights(scene).filter((l) => l.intensity > 0)).toHaveLength(FLASH_LIGHTS);
    expect(lights(scene).some((l) => l.position.x === FLASH_LIGHTS * 5)).toBe(true);
  });

  it('a view without flash lights adds none to its scene (a ghost or a portrait)', () => {
    const scene = new THREE.Scene();
    const f = new Flashes(scene, 0);
    f.add(0, 0, 0, FLASH.cannon);
    f.update(0.01, 1);
    expect(lights(scene)).toHaveLength(0);
    expect(balls(scene).count).toBe(1);
  });
});
