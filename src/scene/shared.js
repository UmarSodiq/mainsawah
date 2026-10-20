import * as THREE from 'three';

/**
 * Global uniforms shared (by reference) between every custom material.
 * Updating `.value` here updates all materials at once.
 */

// Sun position taken from the reference photo: upper-left, low above the horizon.
const SUN_AZIMUTH = THREE.MathUtils.degToRad(-34); // negative = to the left of -Z
const SUN_ELEVATION = THREE.MathUtils.degToRad(13.5);

export const sunDirection = new THREE.Vector3(
  Math.sin(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
  Math.sin(SUN_ELEVATION),
  -Math.cos(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
).normalize();

export const shared = {
  uTime: { value: 0 },
  uSunDir: { value: sunDirection },
  uSunColor: { value: new THREE.Color('#ffefc2') },
  uFogColor: { value: new THREE.Color('#e8c78e') },
  uFogDensity: { value: 0.0022 },
  uWindDir: { value: new THREE.Vector2(0.86, 0.51).normalize() },
  uWindStrength: { value: 0.36 },
  uRainStrength: { value: 0.0 },
};

/** Pick a subset of the shared uniforms to merge into a material. */
export function pickShared(...names) {
  const out = {};
  for (const n of names) out[n] = shared[n];
  return out;
}

export const atmosphereUniforms = () => pickShared('uSunDir', 'uSunColor', 'uFogColor', 'uFogDensity');
