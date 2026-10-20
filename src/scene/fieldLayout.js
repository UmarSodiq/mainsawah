/**
 * Deterministic layout of the rice paddies (petak sawah).
 *
 * The field stretches along -Z (u = -z is the forward distance from the camera).
 * Paddies are separated by dikes (pematang) that run roughly left-right with a
 * gentle wobble, matching the horizontal bands in the reference photo.
 */

export const PLOT_SIZE = 9.5; // nominal paddy depth in metres
export const DIKE_COUNT = 54; // number of dike lines described (~510 m)
export const DIKE_HALF_WIDTH = 0.38; // half-width of a dike strip in metres
export const SHADOW_LENGTH = 3.6; // dark shadow band on the near side of each dike

/** Small seeded PRNG (mulberry32). */
export function createRandom(seed = 1) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Half-width (metres) of the field at forward distance `u` – covers ultra-wide screens + parallax. */
export function fieldHalfWidth(u) {
  return 3.2 + 1.15 * Math.max(u, 0);
}

export function createFieldLayout(seed = 7) {
  const random = createRandom(seed);

  const dikeBase = new Float32Array(DIKE_COUNT);
  const plotTone = new Float32Array(DIKE_COUNT); // brightness per paddy (0..1)
  const plotHeight = new Float32Array(DIKE_COUNT); // rice height multiplier per paddy

  // Place foreground dikes at distances that create the exact layered rhythm of the photo
  const fixedForeground = [-60, 6.2, 13.5, 22.0, 31.5, 42.5, 55.0];
  for (let k = 0; k < DIKE_COUNT; k++) {
    if (k < fixedForeground.length) {
      dikeBase[k] = fixedForeground[k];
    } else {
      const jitter = (random() - 0.5) * 2.8;
      dikeBase[k] = k * PLOT_SIZE + jitter - 2.0;
    }
  }
  for (let k = 0; k < DIKE_COUNT; k++) {
    // Alternate tones slightly so adjacent paddies contrast clearly
    plotTone[k] = (k % 2 === 0 ? 0.25 : 0.75) + (random() - 0.5) * 0.25;
    plotHeight[k] = 0.62 + (k % 2 === 0 ? 0.08 : 0.22) + random() * 0.14;
  }

  /** World u-position of dike `k` at lateral position `x` (must match ground.frag.glsl). */
  function dikeAt(k, x) {
    return dikeBase[k] + Math.sin(x * 0.03 + k * 1.9) * 0.45;
  }

  /** Which paddy contains (x, u), plus its near/far dike positions. */
  function plotAt(x, u) {
    let k = 0;
    while (k < DIKE_COUNT - 2 && u >= dikeAt(k + 1, x)) {
      k++;
    }
    return { k, near: dikeAt(k, x), far: dikeAt(k + 1, x) };
  }

  return { dikeBase, plotTone, plotHeight, dikeAt, plotAt };
}
