import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import atmosphere from '../shaders/atmosphere.glsl?raw';
import { DIKE_HALF_WIDTH, createRandom, fieldHalfWidth } from './fieldLayout.js';
import { atmosphereUniforms, shared } from './shared.js';

const propVert = /* glsl */ `
attribute vec3 aColor;
attribute float aFlutter;
uniform float uTime;
uniform float uWindStrength;
uniform vec2 uWindDir;

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vFlutter;

void main() {
  vColor = aColor;
  vFlutter = aFlutter;
  vec4 wp = modelMatrix * vec4(position, 1.0);

  // Cloth wave displacement for umbul-umbul banners (aFlutter > 0)
  if (aFlutter > 0.01) {
    float wave1 = sin(uTime * (5.5 + uWindStrength * 6.0) + wp.y * 4.2 + wp.x * 1.5);
    float wave2 = cos(uTime * 8.2 - wp.y * 6.5 + wp.z * 1.3) * 0.45;
    float gust = (0.12 + uWindStrength * 0.34) * aFlutter;
    wp.x += (uWindDir.x * (0.6 + 0.4 * wave1) + wave2 * 0.35) * gust;
    wp.z += (uWindDir.y * (0.6 + 0.4 * wave1) - wave2 * 0.35) * gust;
  }

  vNormal = normalize(mat3(modelMatrix) * normal);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const propFrag = /* glsl */ `
uniform vec3 uAmbientColor;
uniform float uSunStrength;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLanternStrength;

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vFlutter;

void main() {
  vec3 n = normalize(vNormal);
  float wrap = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  // Cloth banners have extra warm backlight translucency
  vec3 V = normalize(vWorldPos - cameraPosition);
  float back = pow(max(dot(V, uSunDir), 0.0), 3.0) * (0.25 + vFlutter * 0.85);
  vec3 light = uAmbientColor * (0.48 + 0.52 * max(n.y, 0.0))
             + uSunColor * (wrap + back) * uSunStrength;

  if (uLanternStrength > 0.01) {
    vec3 toL = uLanternPos - vWorldPos;
    float lDist = length(toL);
    light += uLanternColor * (uLanternStrength / (1.0 + lDist * lDist * 0.16));
  }

  vec3 col = vColor * light;
  col = applyFog(col, vWorldPos);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const panicleVert = /* glsl */ `
attribute vec4 aOffset; // x, z, height, yaw
attribute vec3 aPanicleVar; // phase, droop, tint

uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform sampler2D uTrail;
uniform vec4 uTrailBounds;
uniform float uPushStrength;
uniform vec3 uCursor;
uniform vec2 uCursorVel;
uniform float uCursorRadius;
uniform float uCursorActive;
uniform vec4 uShockwave;

varying vec3 vWorldPos;
varying float vTint;
varying float vLocalY;

float windWave(vec2 base, float t) {
  vec2 p1 = base * 0.11 - uWindDir * (t * 0.82);
  float w1 = sin(p1.x * 1.7 + cos(p1.y * 1.5 + t * 0.45)) * cos(p1.y * 1.3 - sin(p1.x * 1.2 - t * 0.35));
  vec2 p2 = base * 0.36 - uWindDir * (t * 1.65);
  float w2 = sin(p2.x + p2.y * 0.8 + t * 1.1) * cos(p2.y * 1.1 - p2.x * 0.7);
  return w1 * 0.7 + w2 * 0.3;
}

void main() {
  vec2 base = aOffset.xy;
  float stalkH = aOffset.z;
  float yaw = aOffset.w;
  float phase = aPanicleVar.x;
  float droop = aPanicleVar.y;
  vTint = aPanicleVar.z;
  vLocalY = clamp(position.y / 0.24, 0.0, 1.0);

  // Rotate local panicle geometry around Y
  float cy = cos(yaw);
  float sy = sin(yaw);
  vec3 loc = vec3(
    position.x * cy - position.z * sy,
    position.y,
    position.x * sy + position.z * cy
  );

  // Match the exact wind + cursor + trail + shockwave bend of RiceField at the top of the stalk (t = 0.95)
  float t = 0.92 + vLocalY * 0.14;
  float w = windWave(base, uTime);
  float flutter = sin(uTime * 3.4 + phase) * 0.06;
  vec2 windBend = uWindDir * ((w * 0.55 + 0.32) * uWindStrength + flutter);
  windBend += vec2(-uWindDir.y, uWindDir.x) * (w * 0.07);

  vec2 trailUv = (base - uTrailBounds.xy) / uTrailBounds.zw;
  vec2 trailPush = vec2(0.0);
  if (all(greaterThan(trailUv, vec2(0.0))) && all(lessThan(trailUv, vec2(1.0)))) {
    trailPush = texture2D(uTrail, trailUv).rg * uPushStrength;
  }

  vec2 toBlade = base - uCursor.xz;
  float cDist = length(toBlade);
  float cFall = (1.0 - smoothstep(0.0, uCursorRadius, cDist)) * uCursorActive;
  vec2 cDir = toBlade / max(cDist, 1e-3);
  float ripple = sin(cDist * 4.5 - uTime * 7.0) * 0.12 * cFall * (1.0 - cFall);
  vec2 livePush = (cDir * (0.95 * cFall * cFall + ripple) + uCursorVel * 0.55 * cFall) * uPushStrength;

  vec2 wavePush = vec2(0.0);
  if (uShockwave.w > 0.001) {
    vec2 sw = base - uShockwave.xy;
    float sDist = length(sw);
    float ring = exp(-pow((sDist - uShockwave.z) / 2.5, 2.0)) * uShockwave.w;
    float osc = cos((sDist - uShockwave.z) * 1.4) * ring;
    wavePush = (sw / max(sDist, 1e-3)) * osc * 1.05;
  }

  vec2 push = trailPush + livePush + wavePush;
  float pushMag = length(push);
  if (pushMag > 1.35) push *= 1.35 / pushMag;

  vec2 naturalDir = vec2(cy, sy) * droop;
  vec2 totalBend = naturalDir + windBend + push;
  float bendMag = min(length(totalBend), 1.45);
  vec2 bendDir = totalBend / max(length(totalBend), 1e-4);

  float bendCurve = t * t;
  vec2 xzShift = bendDir * bendMag * bendCurve * stalkH;
  float yDrop = stalkH * bendMag * bendMag * 0.28 * bendCurve;

  float terraceY = max(-base.y, 0.0) * 0.008;
  vec3 worldPos = vec3(
    base.x + loc.x + xzShift.x,
    terraceY + stalkH - yDrop + loc.y,
    base.y + loc.z + xzShift.y
  );

  vWorldPos = worldPos;
  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}`;

const panicleFrag = /* glsl */ `
uniform vec3 uGrainColorA;
uniform vec3 uGrainColorB;
uniform vec3 uAmbientColor;
uniform float uSunStrength;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLanternStrength;

varying vec3 vWorldPos;
varying float vTint;
varying float vLocalY;

void main() {
  vec3 albedo = mix(uGrainColorA, uGrainColorB, vTint) * (0.85 + 0.25 * vLocalY);
  vec3 V = normalize(vWorldPos - cameraPosition);
  float back = pow(max(dot(V, uSunDir), 0.0), 2.6);
  vec3 light = uAmbientColor * 0.85 + uSunColor * uSunStrength * (0.78 + back * 0.95);

  if (uLanternStrength > 0.01) {
    vec3 toL = uLanternPos - vWorldPos;
    float lDist = length(toL);
    light += uLanternColor * (uLanternStrength / (1.0 + lDist * lDist * 0.1));
  }

  vec3 col = albedo * light;
  col = applyFog(col, vWorldPos);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function paintGeom(geom, hexColor, flutterValue = 0) {
  const g = geom.index ? geom.toNonIndexed() : geom.clone();
  const count = g.attributes.position.count;
  const col = new THREE.Color(hexColor);
  const colors = new Float32Array(count * 3);
  const flutters = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
    flutters[i] = typeof flutterValue === 'function' ? flutterValue(g.attributes.position, i) : flutterValue;
  }
  g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('aFlutter', new THREE.BufferAttribute(flutters, 1));
  return g;
}

/**
 * Builds an arched, drooping ear of plump rice grains (Malai Bulir Padi)
 * rendered at the top of mature stalks in the foreground & mid-ground.
 */
function createPanicleClusterGeometry() {
  const parts = [];
  // Two graceful drooping panicle stems per cluster, each carrying 6 plump grains along a parabolic arc
  const stems = [
    { yaw: 0.0, reach: 0.14, arch: 0.055, drop: 0.09 },
    { yaw: 0.55, reach: 0.11, arch: 0.042, drop: 0.075 },
  ];
  for (const st of stems) {
    const cy = Math.cos(st.yaw);
    const sy = Math.sin(st.yaw);
    const numGrains = 6;
    for (let k = 0; k < numGrains; k++) {
      const s = (k + 0.5) / numGrains; // 0..1 along the drooping ear
      const r = s * st.reach;
      const y = Math.sin(s * Math.PI) * st.arch - s * s * st.drop;
      const pitch = -0.35 - s * 0.95; // tilts progressively downward toward the tip
      const sideJitter = (k % 2 === 0 ? 1 : -1) * 0.004;

      const grain = new THREE.OctahedronGeometry(0.0075, 1);
      grain.scale(0.68, 1.85, 0.68);
      grain.rotateZ(pitch);
      grain.rotateY(st.yaw);
      grain.translate(cy * r - sy * sideJitter, y, sy * r + cy * sideJitter);
      parts.push(grain.index ? grain.toNonIndexed() : grain);
    }
  }
  const merged = mergeGeometries(parts, false);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', merged.getAttribute('position'));
  return g;
}

/**
 * Nusantara Sawah Cultural & Botanical Props:
 *  1. Kincir Angin Bambu (Kolecer) that spin with the wind and accelerate on click/rain
 *  2. Umbul-Umbul (traditional curved bamboo pennant flags) that flutter in the wind
 *  3. Malai Bulir Padi (nodding golden rice panicles in the foreground & mid-ground)
 */
export class VillageProps {
  constructor({ layout, trail, saungPos, lanternPos, countPanicles = 2200 }) {
    this.group = new THREE.Group();
    this.group.name = 'VillageProps';
    this.rotors = [];
    this.spinBoost = 0;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...atmosphereUniforms(),
        uTime: shared.uTime,
        uWindDir: shared.uWindDir,
        uWindStrength: shared.uWindStrength,
        uAmbientColor: { value: new THREE.Color('#7f8c54') },
        uSunStrength: { value: 1.3 },
        uLanternPos: { value: lanternPos || new THREE.Vector3(10.8, 2, -22) },
        uLanternColor: { value: new THREE.Color('#ffaa3b') },
        uLanternStrength: { value: 0.0 },
      },
      vertexShader: propVert,
      fragmentShader: atmosphere + propFrag,
      side: THREE.DoubleSide,
    });

    const staticParts = [];

    // -----------------------------------------------------------------------
    // 1. Two Kincir Angin Bambu (Kolecer)
    // -----------------------------------------------------------------------
    const kolecerConfigs = [
      { x: 6.8, dikeIdx: 3, height: 3.45, yaw: -0.45, rate: 1.0 },
      { x: -4.8, dikeIdx: 2, height: 3.05, yaw: -0.35, rate: 1.18 },
    ];

    for (const kc of kolecerConfigs) {
      const u = layout.dikeAt(kc.dikeIdx, kc.x);
      const baseY = u * 0.008;
      const z = -u;

      // Vertical bamboo pole
      const pole = new THREE.CylinderGeometry(0.028, 0.044, kc.height, 7);
      pole.translate(kc.x, baseY + kc.height * 0.5, z);
      staticParts.push(paintGeom(pole, '#5b4624'));

      // Horizontal vane arm & woven bamboo tail fin at the top
      const topY = baseY + kc.height;
      const arm = new THREE.BoxGeometry(0.035, 0.035, 0.88);
      arm.rotateY(kc.yaw);
      arm.translate(kc.x, topY, z);
      staticParts.push(paintGeom(arm, '#423219'));

      const tail = new THREE.BoxGeometry(0.018, 0.24, 0.34);
      tail.translate(0, 0.06, -0.38);
      tail.rotateY(kc.yaw);
      tail.translate(kc.x, topY, z);
      staticParts.push(paintGeom(tail, '#7c5f30'));

      // Spinning 4-blade bamboo rotor hub
      const rotorParts = [];
      const hub = new THREE.CylinderGeometry(0.055, 0.055, 0.09, 8);
      hub.rotateX(Math.PI / 2);
      rotorParts.push(paintGeom(hub, '#3a2b14'));

      for (let b = 0; b < 4; b++) {
        const ang = (b * Math.PI) / 2;
        const blade = new THREE.BoxGeometry(0.11, 0.68, 0.016);
        // Pitch the blade so it catches the wind
        blade.rotateY(0.38);
        blade.translate(0, 0.38, 0);
        blade.rotateZ(ang);
        rotorParts.push(paintGeom(blade, b % 2 === 0 ? '#9c7a3c' : '#735829'));
      }

      const rotorGeom = mergeGeometries(rotorParts, false);
      const rotorMesh = new THREE.Mesh(rotorGeom, this.material);
      const hubOffset = new THREE.Vector3(0, 0, 0.44).applyAxisAngle(new THREE.Vector3(0, 1, 0), kc.yaw);
      rotorMesh.position.set(kc.x + hubOffset.x, topY, z + hubOffset.z);
      rotorMesh.rotation.y = kc.yaw;
      rotorMesh.userData.rate = kc.rate;
      this.rotors.push(rotorMesh);
      this.group.add(rotorMesh);
    }

    // -----------------------------------------------------------------------
    // 2. Three Traditional Umbul-Umbul Pennant Flags
    // -----------------------------------------------------------------------
    const umbulConfigs = [
      { x: 13.5, dikeIdx: 3, height: 4.3, color: '#d68a28', lean: 0.22 },
      { x: -8.6, dikeIdx: 4, height: 4.1, color: '#b84b29', lean: 0.25 },
      { x: 3.6, dikeIdx: 5, height: 4.4, color: '#dfc056', lean: 0.2 },
    ];

    for (const ub of umbulConfigs) {
      const u = layout.dikeAt(ub.dikeIdx, ub.x);
      const baseY = u * 0.008;
      const z = -u;

      // Slightly arched bamboo pole (8 vertical segments)
      const poleSegs = 8;
      for (let s = 0; s < poleSegs; s++) {
        const t0 = s / poleSegs;
        const t1 = (s + 1) / poleSegs;
        const tm = (t0 + t1) * 0.5;
        const segH = ub.height / poleSegs;
        const r0 = 0.032 * (1 - t0 * 0.65);
        const r1 = 0.032 * (1 - t1 * 0.65);
        const seg = new THREE.CylinderGeometry(r1, r0, segH * 1.04, 6);
        const bendX = Math.pow(tm, 2.2) * ub.lean * ub.height;
        const tilt = 2.2 * Math.pow(tm, 1.2) * ub.lean;
        seg.rotateZ(-tilt);
        seg.translate(ub.x + bendX, baseY + tm * ub.height, z);
        staticParts.push(paintGeom(seg, '#544020', 0));
      }

      // Tapered vertical cloth banner attached to the upper 72% of the pole
      const bannerH = ub.height * 0.72;
      const bannerW = 0.36;
      const banner = new THREE.PlaneGeometry(bannerW, bannerH, 4, 14);
      const posAttr = banner.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const lx = posAttr.getX(i); // -bannerW/2 .. +bannerW/2
        const ly = posAttr.getY(i); // -bannerH/2 .. +bannerH/2
        const vNorm = (ly + bannerH / 2) / bannerH; // 0 at bottom of banner, 1 at top tip
        const poleT = 0.26 + vNorm * 0.72;
        const poleCurveX = Math.pow(poleT, 2.2) * ub.lean * ub.height;
        // Banner tapers toward the top tip
        const taper = 1.0 - Math.pow(vNorm, 1.6) * 0.78;
        const edge01 = (lx + bannerW / 2) / bannerW; // 0 at pole edge, 1 at free fluttering edge
        posAttr.setXYZ(
          i,
          ub.x + poleCurveX + edge01 * bannerW * taper,
          baseY + poleT * ub.height,
          z + (edge01 - 0.5) * 0.04,
        );
      }
      banner.computeVertexNormals();
      staticParts.push(
        paintGeom(banner, ub.color, (pos, idx) => {
          // Normalize flutter weight: 0 on pole attachment, 1 on free edge
          const yVal = pos.getY(idx) - baseY;
          const poleT = Math.min(Math.max(yVal / ub.height, 0), 1);
          const poleX = ub.x + Math.pow(poleT, 2.2) * ub.lean * ub.height;
          const distFromPole = Math.max(0, pos.getX(idx) - poleX);
          return Math.min(1.0, distFromPole / 0.26);
        }),
      );
    }

    const staticMerged = mergeGeometries(staticParts, false);
    this.staticMesh = new THREE.Mesh(staticMerged, this.material);
    this.staticMesh.name = 'VillageStaticProps';
    this.group.add(this.staticMesh);

    // -----------------------------------------------------------------------
    // 3. Instanced Golden Rice Panicles (Malai Bulir Padi)
    // -----------------------------------------------------------------------
    const panicleGeom = createPanicleClusterGeometry();
    this.#fillPanicles(panicleGeom, countPanicles, layout, saungPos);

    this.panicleMaterial = new THREE.ShaderMaterial({
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
        uGrainColorA: { value: new THREE.Color('#d4ac2b') },
        uGrainColorB: { value: new THREE.Color('#f2da5e') },
        uAmbientColor: { value: new THREE.Color('#7f8c54') },
        uSunStrength: { value: 1.35 },
        uLanternPos: { value: lanternPos || new THREE.Vector3(10.8, 2, -22) },
        uLanternColor: { value: new THREE.Color('#ffaa3b') },
        uLanternStrength: { value: 0.0 },
      },
      vertexShader: panicleVert,
      fragmentShader: atmosphere + panicleFrag,
      side: THREE.DoubleSide,
    });

    this.paniclesMesh = new THREE.Mesh(panicleGeom, this.panicleMaterial);
    this.paniclesMesh.frustumCulled = false;
    this.paniclesMesh.name = 'GoldenRicePanicles';
    this.group.add(this.paniclesMesh);
  }

  #fillPanicles(geometry, count, layout, saungPos) {
    const rnd = createRandom(9091);
    const { plotAt, plotHeight } = layout;
    const sx = saungPos ? saungPos.x : 10.8;
    const su = saungPos ? -saungPos.z : 22.0;

    const offset = new Float32Array(count * 4);
    const panicleVar = new Float32Array(count * 3);

    let i = 0;
    let guard = 0;
    while (i < count && guard < count * 4) {
      guard++;
      // Concentrate panicles in foreground & mid-ground (u = 1.3 .. 30 m)
      const u = 1.3 + 28.5 * Math.pow(rnd(), 1.55);
      const half = Math.min(fieldHalfWidth(u), 24);
      const x = (rnd() * 2 - 1) * half;

      if (Math.abs(x - sx) < 1.5 && Math.abs(u - su) < 1.3) continue;

      const plot = plotAt(x, u);
      const dNear = u - plot.near;
      const dFar = plot.far - u;
      if (Math.min(dNear, dFar) < DIKE_HALF_WIDTH * 0.85) continue;

      const stalkH = plotHeight[plot.k] * (0.82 + rnd() * 0.26);
      const yaw = rnd() * Math.PI * 2;

      offset[i * 4] = x;
      offset[i * 4 + 1] = -u;
      offset[i * 4 + 2] = stalkH;
      offset[i * 4 + 3] = yaw;

      panicleVar[i * 3] = rnd() * Math.PI * 2;
      panicleVar[i * 3 + 1] = 0.22 + rnd() * 0.24;
      panicleVar[i * 3 + 2] = rnd();
      i++;
    }

    geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 4));
    geometry.setAttribute('aPanicleVar', new THREE.InstancedBufferAttribute(panicleVar, 3));
    geometry.instanceCount = i;
  }

  /** Trigger a temporary wind-gust spin burst on the bamboo kolecer propellers. */
  boostSpin() {
    this.spinBoost = 1.0;
  }

  update(dt, pointer) {
    this.spinBoost *= Math.exp(-dt * 1.4);
    const baseSpeed = 4.5 + shared.uWindStrength.value * 14.0 + this.spinBoost * 20.0;
    for (const rotor of this.rotors) {
      rotor.rotation.z -= dt * baseSpeed * rotor.userData.rate;
    }

    const pu = this.panicleMaterial.uniforms;
    pu.uCursor.value.copy(pointer.world);
    pu.uCursorVel.value.copy(pointer.sweep);
    pu.uCursorRadius.value = pointer.radius;
    pu.uCursorActive.value = pointer.active;
    pu.uShockwave.value.copy(pointer.shockwave);
  }
}
