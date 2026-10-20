import * as THREE from 'three';
import { pickShared } from './shared.js';

const vert = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
uniform float uFireflyMode;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform vec3 uCursor;
uniform float uCursorActive;
uniform vec3 uSunDir;
uniform vec2 uWindDir;
attribute vec3 aSeed;
varying float vAlpha;
varying float vGlow;
varying float vSeed;

void main() {
  vSeed = aSeed.x;
  vec3 p = position;
  // Drift with the wind + gentle figure-8 bobbing
  float driftSpeed = mix(0.22, 0.08, uFireflyMode);
  p.x += uTime * driftSpeed * uWindDir.x + sin(uTime * (0.35 + aSeed.x * 0.45) + aSeed.y * 6.2831) * (0.65 + uFireflyMode * 0.55);
  p.z += uTime * driftSpeed * uWindDir.y + cos(uTime * (0.28 + aSeed.z * 0.35) + aSeed.x * 6.2831) * (0.55 + uFireflyMode * 0.45);
  p.y += sin(uTime * (0.4 + aSeed.y * 0.5) + aSeed.z * 6.2831) * 0.38;
  p = uBoxMin + mod(p - uBoxMin, uBoxSize);

  // In firefly mode, keep particles hovering close to the rice tips
  p.y = mix(p.y, 0.55 + fract(aSeed.z + sin(uTime * 0.25 + aSeed.x * 6.28) * 0.25) * 1.85, uFireflyMode * 0.65);

  // Pushed aside by the cursor
  vec2 d = p.xz - uCursor.xz;
  float dist = length(d);
  p.xz += d / max(dist, 1e-3) * (1.0 - smoothstep(0.0, 2.8, dist)) * 1.1 * uCursorActive;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = -mv.z;
  float ffScale = 1.0 + uFireflyMode * 1.55;
  gl_PointSize = uSize * ffScale * (0.45 + aSeed.x * 0.85) * uPixelRatio * (8.5 / max(depth, 0.2));

  vec3 V = normalize(p - cameraPosition);
  vGlow = pow(max(dot(V, uSunDir), 0.0), 3.0);

  float dayTwinkle = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed.y * 2.2) + aSeed.x * 40.0);
  float ffPulse = pow(0.5 + 0.5 * sin(uTime * (1.4 + aSeed.y * 2.4) + aSeed.x * 25.0), 2.2);
  float twinkle = mix(dayTwinkle, 0.18 + 0.82 * ffPulse, uFireflyMode);

  vAlpha = smoothstep(0.8, 2.4, depth) * (1.0 - smoothstep(20.0, 34.0, depth)) * twinkle;
}`;

const frag = /* glsl */ `
uniform vec3 uSunColor;
uniform float uFireflyMode;
varying float vAlpha;
varying float vGlow;
varying float vSeed;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a *= a;

  vec3 dayCol = uSunColor * (0.45 + vGlow * 2.6);
  // Bioluminescent lime-gold firefly glow (HDR > 1 triggers bloom)
  vec3 ffColor = mix(vec3(0.72, 1.0, 0.22), vec3(1.0, 0.92, 0.32), vSeed);
  float core = 1.0 - smoothstep(0.0, 0.22, d);
  vec3 nightCol = (ffColor * 2.6 + vec3(1.0, 1.0, 0.85) * core * 2.4);

  vec3 col = mix(dayCol, nightCol, uFireflyMode);
  gl_FragColor = vec4(col, a * vAlpha * mix(0.85, 0.98, uFireflyMode));
  #include <colorspace_fragment>
}`;

/** Floating dust / pollen motes by day, transforming into glowing fireflies (kunang-kunang) at night. */
export class Particles {
  constructor({ count = 1500, pixelRatio = 1 } = {}) {
    const boxMin = new THREE.Vector3(-18, 0.35, -34);
    const boxSize = new THREE.Vector3(36, 4.2, 33);

    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = boxMin.x + Math.random() * boxSize.x;
      positions[i * 3 + 1] = boxMin.y + Math.pow(Math.random(), 1.5) * boxSize.y;
      positions[i * 3 + 2] = boxMin.z + Math.random() * boxSize.z;
      seeds[i * 3] = Math.random();
      seeds[i * 3 + 1] = Math.random();
      seeds[i * 3 + 2] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...pickShared('uTime', 'uSunDir', 'uSunColor', 'uWindDir'),
        uPixelRatio: { value: pixelRatio },
        uSize: { value: 5.2 },
        uFireflyMode: { value: 0.0 },
        uBoxMin: { value: boxMin },
        uBoxSize: { value: boxSize },
        uCursor: { value: new THREE.Vector3(0, 0, -1000) },
        uCursorActive: { value: 0 },
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.name = 'Particles';
  }

  update(pointer) {
    this.material.uniforms.uCursor.value.copy(pointer.world);
    this.material.uniforms.uCursorActive.value = pointer.active;
  }

  setPixelRatio(pr) {
    this.material.uniforms.uPixelRatio.value = pr;
  }
}
