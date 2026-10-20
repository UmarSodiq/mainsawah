import * as THREE from 'three';
import atmosphere from '../shaders/atmosphere.glsl?raw';
import { atmosphereUniforms, shared } from './shared.js';
import { createRandom } from './fieldLayout.js';

const vert = /* glsl */ `
uniform float uTime;
attribute vec4 aFlight; // x, y, z, yaw
attribute vec4 aAnim;   // scale, flapPhase, flapSpeed, bank

varying vec3 vWorldPos;
varying float vWing;

void main() {
  vec3 p = position;
  float span = abs(p.x);
  vWing = span;

  // Articulated flapping: inner wing + lagging outer wingtip
  float phase = uTime * aAnim.z + aAnim.y;
  float flap = sin(phase) * (0.45 * span + 0.35 * span * span);
  p.y += flap;

  // Scale
  p *= aAnim.x;

  // Bank (roll) and Yaw
  float cb = cos(aAnim.w);
  float sb = sin(aAnim.w);
  p = vec3(p.x * cb - p.y * sb, p.x * sb + p.y * cb, p.z);

  float cy = cos(aFlight.w);
  float sy = sin(aFlight.w);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);

  vec3 world = aFlight.xyz + p;
  vWorldPos = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const frag = /* glsl */ `
uniform vec3 uBirdColor;
varying vec3 vWorldPos;
varying float vWing;

void main() {
  vec3 V = normalize(vWorldPos - cameraPosition);
  float sunRim = pow(max(dot(V, uSunDir), 0.0), 4.0);
  vec3 col = mix(uBirdColor, uSunColor, sunRim * (0.35 + 0.35 * vWing));
  col = applyFog(col, vWorldPos);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** Creates a low-poly bird mesh with 2-segment wings along X and body along Z. */
function createBirdGeometry() {
  // Vertices: (x, y, z), facing +Z
  const positions = new Float32Array([
    0.0, 0.0, 0.28,    // 0: beak/head
    0.0, 0.04, 0.0,    // 1: back center
    0.0, 0.0, -0.32,   // 2: tail tip
    -0.42, 0.03, 0.04, // 3: left mid-wing front
    -0.42, 0.01, -0.14,// 4: left mid-wing back
    -0.95, 0.0, -0.06, // 5: left wingtip
    0.42, 0.03, 0.04,  // 6: right mid-wing front
    0.42, 0.01, -0.14, // 7: right mid-wing back
    0.95, 0.0, -0.06,  // 8: right wingtip
  ]);
  const indices = [
    // Left inner wing + body
    0, 3, 1,
    1, 3, 4,
    1, 4, 2,
    // Left outer wingtip
    3, 5, 4,
    // Right inner wing + body
    0, 1, 6,
    1, 7, 6,
    1, 2, 7,
    // Right outer wingtip
    6, 7, 8,
  ];
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  return g;
}

/**
 * Flock of morning birds:
 *  - Cruising sky flock gliding across the golden horizon
 *  - Startled paddy birds that burst into flight from wherever the user clicks
 */
export class Birds {
  constructor({ skyCount = 36, scatterCount = 24 } = {}) {
    this.skyCount = skyCount;
    this.scatterCount = scatterCount;
    this.total = skyCount + scatterCount;

    const geom = createBirdGeometry();
    this.flightData = new Float32Array(this.total * 4);
    this.animData = new Float32Array(this.total * 4);

    this.flightAttr = new THREE.InstancedBufferAttribute(this.flightData, 4);
    this.flightAttr.setUsage(THREE.DynamicDrawUsage);
    this.animAttr = new THREE.InstancedBufferAttribute(this.animData, 4);
    this.animAttr.setUsage(THREE.DynamicDrawUsage);

    geom.setAttribute('aFlight', this.flightAttr);
    geom.setAttribute('aAnim', this.animAttr);
    geom.instanceCount = this.total;

    const rnd = createRandom(901);
    this.birds = [];

    // 1) Sky flocks (cruising across the horizon in loose V/wave groups)
    for (let i = 0; i < skyCount; i++) {
      const group = i % 3;
      const gx = -55 + group * 48 + (rnd() - 0.5) * 22;
      const gy = 11 + group * 5 + (rnd() - 0.5) * 4;
      const gz = -58 - group * 34 + (rnd() - 0.5) * 20;
      const dir = group === 1 ? -1 : 1;
      const speed = (4.2 + rnd() * 2.2) * dir;
      this.birds.push({
        mode: 'sky',
        x: gx,
        y: gy,
        z: gz,
        vx: speed,
        vy: 0,
        vz: (rnd() - 0.5) * 0.8,
        scale: 0.42 + rnd() * 0.22,
        phase: rnd() * Math.PI * 2,
        flapSpeed: 6.5 + rnd() * 2.5,
        seed: rnd() * 10,
      });
    }

    // 2) Scatter birds (hidden in the rice until triggered by a click, or periodically taking off)
    for (let i = 0; i < scatterCount; i++) {
      this.birds.push({
        mode: 'perched',
        x: 0,
        y: -10,
        z: -20,
        vx: 0,
        vy: 0,
        vz: 0,
        scale: 0.32 + rnd() * 0.16,
        phase: rnd() * Math.PI * 2,
        flapSpeed: 13 + rnd() * 4,
        seed: rnd() * 10,
        age: 99,
      });
    }

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...atmosphereUniforms(),
        uTime: shared.uTime,
        uBirdColor: { value: new THREE.Color('#232818') },
      },
      vertexShader: vert,
      fragmentShader: atmosphere + frag,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'Birds';
  }

  /** Burst a flock of startled birds from a world position on the rice field. */
  scatterFrom(worldPos) {
    let spawned = 0;
    for (let i = this.skyCount; i < this.total && spawned < 12; i++) {
      const b = this.birds[i];
      if (b.mode === 'scared' && b.age < 2.2) continue;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.4;
      b.mode = 'scared';
      b.age = 0;
      b.x = worldPos.x + Math.cos(angle) * r;
      b.z = worldPos.z + Math.sin(angle) * r;
      b.y = Math.max(0, -b.z * 0.008) + 0.35 + Math.random() * 0.3;

      const flyAngle = (Math.random() - 0.5) * 2.2;
      const speed = 5.5 + Math.random() * 3.8;
      b.vx = Math.sin(flyAngle) * speed;
      b.vz = -Math.cos(flyAngle) * speed - 2.0;
      b.vy = 3.2 + Math.random() * 2.4;
      spawned++;
    }
  }

  update(dt, elapsed) {
    for (let i = 0; i < this.total; i++) {
      const b = this.birds[i];
      const o = i * 4;

      if (b.mode === 'sky') {
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        const bob = Math.sin(elapsed * 0.9 + b.seed) * 0.45;
        const limit = Math.max(85, Math.abs(b.z) * 1.15);
        if (b.x > limit) b.x = -limit;
        if (b.x < -limit) b.x = limit;

        const yaw = Math.atan2(b.vx, b.vz);
        const bank = Math.sin(elapsed * 0.7 + b.seed) * 0.18;

        this.flightData[o] = b.x;
        this.flightData[o + 1] = b.y + bob;
        this.flightData[o + 2] = b.z;
        this.flightData[o + 3] = yaw;

        this.animData[o] = b.scale;
        this.animData[o + 1] = b.phase;
        this.animData[o + 2] = b.flapSpeed;
        this.animData[o + 3] = bank;
      } else if (b.mode === 'scared') {
        b.age += dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        // Level out climb as they gain altitude
        b.vy = Math.max(0.8, b.vy * (1 - dt * 0.45));
        // Gentle curving flight path
        const turn = Math.sin(b.age * 1.4 + b.seed) * 0.6 * dt;
        const cv = Math.cos(turn);
        const sv = Math.sin(turn);
        const nvx = b.vx * cv - b.vz * sv;
        const nvz = b.vx * sv + b.vz * cv;
        b.vx = nvx;
        b.vz = nvz;

        if (b.age > 9.0) {
          b.mode = 'perched';
          b.y = -10;
        }

        const yaw = Math.atan2(b.vx, b.vz);
        const bank = -turn * 4.0;

        this.flightData[o] = b.x;
        this.flightData[o + 1] = b.y;
        this.flightData[o + 2] = b.z;
        this.flightData[o + 3] = yaw;

        this.animData[o] = b.scale;
        this.animData[o + 1] = b.phase;
        this.animData[o + 2] = b.flapSpeed;
        this.animData[o + 3] = bank;
      } else {
        // Hidden below ground while perched
        this.flightData[o] = 0;
        this.flightData[o + 1] = -20;
        this.flightData[o + 2] = -20;
        this.flightData[o + 3] = 0;
        this.animData[o] = 0;
      }
    }
    this.flightAttr.needsUpdate = true;
    this.animAttr.needsUpdate = true;
  }
}
