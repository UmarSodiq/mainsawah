import * as THREE from 'three';
import noise from '../shaders/noise.glsl?raw';
import atmosphere from '../shaders/atmosphere.glsl?raw';
import { atmosphereUniforms, shared } from './shared.js';

const vert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uSeed;
uniform float uScale;
uniform float uSpeed;
uniform vec2 uWindDir;
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vec2 p = vec2(vWorldPos.x * uScale, vWorldPos.y * uScale * 2.4);
  p.x -= uTime * uSpeed * uWindDir.x;
  float n = fbm3(vec3(p, uTime * 0.03 + uSeed)) * 0.5 + 0.5;

  // Soft bottom & top so the mist floats naturally above the distant paddies
  float vertical = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.28, 1.0, vUv.y));
  float edges = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
  float a = smoothstep(0.36, 0.86, n) * vertical * edges * uOpacity;

  vec3 V = normalize(vWorldPos - cameraPosition);
  vec3 col = fogTint(V) * 1.04;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

const SHEETS = [
  { dist: 85, height: 6.5, opacity: 0.16, scale: 0.042, speed: 0.85 },
  { dist: 112, height: 9.0, opacity: 0.24, scale: 0.032, speed: 1.15 },
  { dist: 150, height: 11.5, opacity: 0.28, scale: 0.024, speed: 1.5 },
  { dist: 200, height: 14.0, opacity: 0.32, scale: 0.018, speed: 1.9 },
  { dist: 280, height: 18.0, opacity: 0.35, scale: 0.012, speed: 2.5 },
];

/** Vertical, softly-noised mist sheets drifting along the distant treeline. */
export class FogLayers {
  constructor({ count = SHEETS.length } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'FogLayers';
    const picked = count >= SHEETS.length ? SHEETS : SHEETS.filter((_, i) => i % 2 === 1 || i === SHEETS.length - 1).slice(0, count);

    picked.forEach((s, i) => {
      const width = s.dist * 2 * 1.35;
      const baseY = s.dist * 0.008;
      const material = new THREE.ShaderMaterial({
        uniforms: {
          ...atmosphereUniforms(),
          uTime: shared.uTime,
          uWindDir: shared.uWindDir,
          uOpacity: { value: s.opacity },
          uSeed: { value: i * 13.7 },
          uScale: { value: s.scale },
          uSpeed: { value: s.speed },
        },
        vertexShader: vert,
        fragmentShader: noise + atmosphere + frag,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, s.height), material);
      mesh.position.set(0, baseY + s.height / 2 - 0.4, -s.dist);
      mesh.name = `Fog_${s.dist}`;
      this.group.add(mesh);
    });
  }
}
