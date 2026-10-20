import * as THREE from 'three';
import { createRandom } from './fieldLayout.js';
import { atmosphereUniforms, shared } from './shared.js';

const vert = /* glsl */ `
attribute vec4 aSeed; // rx, ry, rz in [0..1], w = speedScale

uniform float uTime;
uniform float uRainStrength;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform vec3 uCamPos;
uniform vec3 uSaungPos;

varying vec2 vUv;
varying float vAlpha;

void main() {
  vUv = uv;
  float speed = (14.5 + uWindStrength * 5.0) * aSeed.w;

  // Wrap raindrops inside a 44 x 16 x 44 m volume in front of / around the active camera
  vec3 boxSize = vec3(44.0, 16.0, 44.0);
  vec3 drift = vec3(
    uWindDir.x * uWindStrength * 4.2 * uTime,
    -speed * uTime,
    uWindDir.y * uWindStrength * 4.2 * uTime
  );
  vec3 center = uCamPos + vec3(0.0, 4.5, -14.0);
  vec3 cellPos = fract(aSeed.xyz + (drift - center) / boxSize) * boxSize - boxSize * 0.5 + center;

  // Slanted fall direction matching wind
  vec3 fallDir = normalize(vec3(uWindDir.x * uWindStrength * 0.42, -1.0, uWindDir.y * uWindStrength * 0.42));
  vec3 toCam = normalize(uCamPos - cellPos);
  vec3 side = normalize(cross(toCam, fallDir));

  float dropLen = (0.95 + 0.42 * aSeed.w) * (0.55 + 0.45 * uRainStrength);
  float dropWidth = 0.024;

  vec3 worldPos = cellPos + side * (position.x * dropWidth) + fallDir * (position.y * dropLen);

  // Keep the interior under the Saung bamboo roof dry when sitting on the terrace
  float underRoof = step(abs(worldPos.x - uSaungPos.x), 1.48)
                  * step(abs(worldPos.z - uSaungPos.z), 1.25)
                  * step(worldPos.y, uSaungPos.y + 2.55);

  float dist = length(worldPos - uCamPos);
  float distFade = (1.0 - smoothstep(18.0, 34.0, dist)) * smoothstep(0.5, 2.0, dist);
  vAlpha = uRainStrength * distFade * (1.0 - underRoof) * (0.55 + 0.45 * aSeed.w);

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}`;

const frag = /* glsl */ `
uniform vec3 uSunColor;
uniform vec3 uFogColor;

varying vec2 vUv;
varying float vAlpha;

void main() {
  if (vAlpha < 0.005) discard;
  // Soft tapered ends and crisp center core of each rain streak
  float core = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float ends = sin(vUv.y * 3.14159265);
  float a = core * ends * vAlpha * 0.68;
  if (a < 0.005) discard;

  vec3 col = mix(uFogColor, uSunColor, 0.55) * 1.35 + vec3(0.28, 0.34, 0.38);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

export class Rain {
  constructor({ count = 2400, saungPos } = {}) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('uv', base.getAttribute('uv'));
    geometry.setIndex(base.getIndex());

    const rnd = createRandom(4242);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = rnd();
      seeds[i * 4 + 1] = rnd();
      seeds[i * 4 + 2] = rnd();
      seeds[i * 4 + 3] = 0.8 + rnd() * 0.45;
    }
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geometry.instanceCount = count;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...atmosphereUniforms(),
        uTime: shared.uTime,
        uRainStrength: shared.uRainStrength,
        uWindDir: shared.uWindDir,
        uWindStrength: shared.uWindStrength,
        uCamPos: { value: new THREE.Vector3() },
        uSaungPos: { value: saungPos || new THREE.Vector3(10.8, 0.18, -22) },
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'Rain';
  }

  update(camera) {
    const r = shared.uRainStrength.value;
    this.mesh.visible = r > 0.005;
    if (this.mesh.visible) {
      this.material.uniforms.uCamPos.value.copy(camera.position);
    }
  }
}
