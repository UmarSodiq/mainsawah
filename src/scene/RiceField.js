import * as THREE from 'three';
import atmosphere from '../shaders/atmosphere.glsl?raw';
import vert from '../shaders/rice.vert.glsl?raw';
import frag from '../shaders/rice.frag.glsl?raw';
import { atmosphereUniforms, shared } from './shared.js';
import { DIKE_HALF_WIDTH, SHADOW_LENGTH, createRandom, fieldHalfWidth } from './fieldLayout.js';

const NEAR_U = 1.0; // closest blades (metres in front of the camera)
const FAR_U = 78; // beyond this the ground shader paints the canopy
const DEPTH_BIAS = 1.75; // >1 => denser near the camera

/** Tapered leaf strip: pairs of vertices per segment and a single tip vertex. y in [0,1], x in [-0.5,0.5]. */
function createBladeGeometry(segments) {
  const positions = [];
  const indices = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const w = 1.0 - Math.pow(t, 1.7) * 0.85;
    positions.push(-0.5 * w, t, 0, 0.5 * w, t, 0);
  }
  positions.push(0, 1, 0);
  const tip = segments * 2;
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const last = (segments - 1) * 2;
  indices.push(last, last + 1, tip);

  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  return g;
}

/**
 * Returns >0 inside shallow flooded water channels/puddles where rice is slightly sparser
 * so the shimmering water surface glimpses through between paddies without creating bald spots.
 */
function waterChannelFactor(x, u, dNear) {
  if (dNear > 0.42 && dNear < 1.15) {
    const wave = Math.sin(x * 0.35 + u * 0.2);
    if (wave > 0.35) return ((wave - 0.35) / 0.65) * 0.55;
  }
  const dLeft = Math.hypot((x + 3.8) * 0.85, (u - 9.2) * 1.6);
  const dRight = Math.hypot((x - 6.8) * 0.85, (u - 16.5) * 1.6);
  const puddle = Math.max(1 - dLeft / 1.9, 1 - dRight / 2.1, 0);
  return puddle * 0.65;
}

export class RiceField {
  /**
   * @param {object} opts
   * @param {number} opts.count     number of blades
   * @param {number} opts.segments  segments per blade
   * @param {ReturnType<import('./fieldLayout.js').createFieldLayout>} opts.layout
   * @param {import('../interaction/TrailMap.js').TrailMap} opts.trail
   * @param {THREE.Vector3} [opts.saungPos]
   * @param {THREE.Vector3} [opts.lanternPos]
   */
  constructor({ count, segments, layout, trail, saungPos, lanternPos }) {
    this.maxCount = count;
    this.layout = layout;
    this.saungPos = saungPos || new THREE.Vector3(10.8, 0, -22);

    const geometry = createBladeGeometry(segments);
    this.#fillInstances(geometry, count);
    this.geometry = geometry;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...atmosphereUniforms(),
        uTime: shared.uTime,
        uWindDir: shared.uWindDir,
        uWindStrength: shared.uWindStrength,
        uTrail: trail.uniform,
        uTrailBounds: { value: trail.bounds },
        uPushStrength: { value: 1.15 },
        uCursor: { value: new THREE.Vector3(0, 0, -1000) },
        uCursorVel: { value: new THREE.Vector2() },
        uCursorRadius: { value: 2.0 },
        uCursorActive: { value: 0 },
        uShockwave: { value: new THREE.Vector4(0, -1000, 0, 0) },
        uRootColor: { value: new THREE.Color('#142b06') },
        uMidColor: { value: new THREE.Color('#3b6e10') },
        uTipColor: { value: new THREE.Color('#8ec429') },
        uYellowColor: { value: new THREE.Color('#e3d94c') },
        uTransColor: { value: new THREE.Color('#ffe46b') },
        uAmbientColor: { value: new THREE.Color('#7f8c54') },
        uSunStrength: { value: 1.35 },
        uTransStrength: { value: 1.15 },
        uLanternPos: { value: lanternPos || new THREE.Vector3(10.8, 2, -22) },
        uLanternColor: { value: new THREE.Color('#ffaa3b') },
        uLanternStrength: { value: 0.0 },
      },
      vertexShader: vert,
      fragmentShader: atmosphere + frag,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false; // vertices are displaced on the GPU
    this.mesh.name = 'RiceField';
  }

  /** Update live cursor + shockwave uniforms for immediate elastic response. */
  update(pointer) {
    const u = this.material.uniforms;
    u.uCursor.value.copy(pointer.world);
    u.uCursorVel.value.copy(pointer.sweep);
    u.uCursorRadius.value = pointer.radius;
    u.uCursorActive.value = pointer.active;
    u.uShockwave.value.copy(pointer.shockwave);
  }

  /** Fraction of blades to draw (used by adaptive quality). */
  setDensity(fraction) {
    this.geometry.instanceCount = Math.max(1000, Math.floor(this.maxCount * fraction));
  }

  #fillInstances(geometry, count) {
    const random = createRandom(1337);
    const { plotAt, plotHeight, plotTone } = this.layout;
    const sx = this.saungPos.x;
    const su = -this.saungPos.z;

    const offset = new Float32Array(count * 4);
    const shape = new Float32Array(count * 4);
    const variation = new Float32Array(count * 4);

    let i = 0;
    let guard = 0;
    while (i < count && guard < count * 4) {
      guard++;
      const u = NEAR_U + (FAR_U - NEAR_U) * Math.pow(random(), DEPTH_BIAS);
      const half = fieldHalfWidth(u);
      const x = (random() * 2 - 1) * half;

      // Leave a footprint under the bamboo Saung hut & foreground wading egrets
      if (Math.abs(x - sx) < 1.45 && Math.abs(u - su) < 1.25) continue;
      if (Math.hypot(x + 3.85, u - 9.1) < 0.55 || Math.hypot(x + 4.45, u - 10.1) < 0.5) continue;

      const plot = plotAt(x, u);
      const dNear = u - plot.near;
      const dFar = plot.far - u;
      const onDike = Math.min(dNear, dFar) < DIKE_HALF_WIDTH;

      // Slightly thinner blades in flooded water channels so shimmering water glimpses through
      const water = waterChannelFactor(x, u, dNear);
      if (water > 0.2 && random() < water * 0.6) continue;

      let height;
      let shade;
      let tint = random();
      if (onDike) {
        if (random() > 0.72) continue;
        height = 0.24 + random() * 0.24;
        shade = 0.12 + random() * 0.16;
        tint = 0.15 + random() * 0.25;
      } else {
        const edge = Math.min(dNear, dFar);
        const edgeFactor = edge < 0.85 ? 0.76 + (edge / 0.85) * 0.24 : 1.0;
        height = plotHeight[plot.k] * (0.72 + random() * 0.36) * edgeFactor * (1 - water * 0.25);
        const shFar = Math.min(Math.max(dFar / SHADOW_LENGTH, 0), 1);
        const shNear = Math.min(Math.max((dNear + 0.25) / 1.4, 0), 1);
        const sh = Math.min(shFar, shNear);
        shade = sh * sh * (3 - 2 * sh) * (0.85 + random() * 0.15);
      }

      const width = (0.027 + random() * 0.024) * (1 + Math.max(u - 6, 0) * 0.034);

      const o = i * 4;
      offset[o] = x;
      offset[o + 1] = -u;
      offset[o + 2] = shade;
      offset[o + 3] = plotTone[plot.k];

      shape[o] = height;
      shape[o + 1] = width;
      shape[o + 2] = random() * Math.PI * 2;
      shape[o + 3] = 0.14 + random() * 0.36;

      variation[o] = random();
      variation[o + 1] = random();
      variation[o + 2] = random() * Math.PI * 2;
      variation[o + 3] = tint * tint;
      i++;
    }

    this.maxCount = i;
    geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 4));
    geometry.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 4));
    geometry.setAttribute('aVar', new THREE.InstancedBufferAttribute(variation, 4));
    geometry.instanceCount = i;
  }
}
