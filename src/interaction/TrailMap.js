import * as THREE from 'three';

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Each texel stores the push vector (in "blade height" units) of the rice at that spot.
// The cursor writes a radial push (+ a sweep along its velocity), and clicks emit an
// expanding circular shockwave ring; everything decays back to zero so the rice stands up again.
const frag = /* glsl */ `
uniform sampler2D uPrev;
uniform vec4 uBounds;     // minX, minZ, sizeX, sizeZ
uniform vec2 uCursor;     // world xz
uniform vec2 uVel;        // normalised sweep velocity
uniform float uRadius;
uniform float uActive;
uniform vec4 uShockwave;  // originX, originZ, radius, strength
uniform float uDt;
uniform float uRecover;
varying vec2 vUv;

void main() {
  vec2 prev = texture2D(uPrev, vUv).rg;
  vec2 world = uBounds.xy + vUv * uBounds.zw;

  vec2 d = world - uCursor;
  float dist = length(d);
  float f = (1.0 - smoothstep(uRadius * 0.1, uRadius, dist)) * uActive;
  vec2 dir = d / max(dist, 1e-3);
  vec2 target = dir * (0.55 + 0.45 * f) * f + uVel * f;

  // Slow recovery (rice stands back up) ...
  prev *= exp(-uDt * uRecover);
  // ... and fast response where the cursor is
  float rate = 1.0 - exp(-uDt * 14.0);
  vec2 res = mix(prev, target, clamp(f * rate * 1.5, 0.0, 1.0));

  // Expanding radial wind shockwave on click
  if (uShockwave.w > 0.001) {
    vec2 sw = world - uShockwave.xy;
    float sDist = length(sw);
    float ringWidth = 2.6;
    float ring = exp(-pow((sDist - uShockwave.z) / ringWidth, 2.0)) * uShockwave.w;
    vec2 sDir = sw / max(sDist, 1e-3);
    res += sDir * ring * 0.85 * (1.0 - exp(-uDt * 18.0));
  }

  float l = length(res);
  res *= min(l, 1.45) / max(l, 1e-4);

  gl_FragColor = vec4(res, 0.0, 1.0);
}`;

/**
 * Ping-pong render target holding the rice "trail" left by the cursor and click shockwaves.
 */
export class TrailMap {
  constructor({ minX = -84, minZ = -82, sizeX = 168, sizeZ = 86, resolution = 512 } = {}) {
    this.bounds = new THREE.Vector4(minX, minZ, sizeX, sizeZ);
    const w = resolution;
    const h = Math.round((resolution * sizeZ) / sizeX);
    const opts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.read = new THREE.WebGLRenderTarget(w, h, opts);
    this.write = new THREE.WebGLRenderTarget(w, h, opts);

    this.uniform = { value: this.read.texture };

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: this.read.texture },
        uBounds: { value: this.bounds },
        uCursor: { value: new THREE.Vector2(0, -1000) },
        uVel: { value: new THREE.Vector2() },
        uRadius: { value: 1 },
        uActive: { value: 0 },
        uShockwave: { value: new THREE.Vector4(0, -1000, 0, 0) },
        uDt: { value: 0.016 },
        uRecover: { value: 1.3 },
      },
      vertexShader: vert,
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.cleared = false;
  }

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {import('./Pointer.js').Pointer} pointer
   */
  update(renderer, pointer, dt) {
    const u = this.material.uniforms;
    if (!this.cleared) {
      const prevColor = renderer.getClearColor(new THREE.Color());
      const prevAlpha = renderer.getClearAlpha();
      renderer.setClearColor(0x000000, 0);
      for (const rt of [this.read, this.write]) {
        renderer.setRenderTarget(rt);
        renderer.clear(true, false, false);
      }
      renderer.setClearColor(prevColor, prevAlpha);
      this.cleared = true;
    }

    u.uPrev.value = this.read.texture;
    u.uCursor.value.set(pointer.world.x, pointer.world.z);
    u.uVel.value.copy(pointer.sweep);
    u.uRadius.value = pointer.radius;
    u.uActive.value = pointer.active;
    u.uShockwave.value.copy(pointer.shockwave);
    u.uDt.value = Math.min(dt, 0.1);

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.write);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prevTarget);

    const tmp = this.read;
    this.read = this.write;
    this.write = tmp;
    this.uniform.value = this.read.texture;
  }

  dispose() {
    this.read.dispose();
    this.write.dispose();
    this.material.dispose();
  }
}
