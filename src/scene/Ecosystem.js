import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import atmosphere from '../shaders/atmosphere.glsl?raw';
import { createRandom } from './fieldLayout.js';
import { atmosphereUniforms, shared } from './shared.js';

const ecoVert = /* glsl */ `
attribute vec3 aColor;
attribute float aSway;

uniform float uTime;
uniform float uWindStrength;
uniform vec2 uWindDir;

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vSway;

void main() {
  vColor = aColor;
  vSway = aSway;
  vec4 wp = modelMatrix * vec4(position, 1.0);

  // Wind sway for Bebegig tunic sleeves, straw fringe, and bird-scaring string tassels
  if (aSway > 0.01) {
    float w1 = sin(uTime * (4.2 + uWindStrength * 5.0) + wp.x * 2.3 + wp.z * 1.7);
    float w2 = cos(uTime * 7.5 + wp.y * 5.0) * 0.4;
    float gust = (0.06 + uWindStrength * 0.22) * aSway;
    wp.x += (uWindDir.x * (0.5 + 0.5 * w1) + w2 * 0.3) * gust;
    wp.z += (uWindDir.y * (0.5 + 0.5 * w1) - w2 * 0.3) * gust;
    wp.y -= abs(w1) * 0.025 * aSway;
  }

  vNormal = normalize(mat3(modelMatrix) * normal);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const ecoFrag = /* glsl */ `
uniform vec3 uAmbientColor;
uniform float uSunStrength;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLanternStrength;

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vSway;

void main() {
  vec3 n = normalize(vNormal);
  vec3 V = normalize(vWorldPos - cameraPosition);
  float wrap = clamp(dot(n, uSunDir) * 0.55 + 0.45, 0.0, 1.0);
  float rim = pow(1.0 - max(dot(-V, n), 0.0), 2.5) * 0.35;
  vec3 light = uAmbientColor * (0.5 + 0.5 * max(n.y, 0.0))
             + uSunColor * (wrap + rim) * uSunStrength;

  if (uLanternStrength > 0.01) {
    vec3 toL = uLanternPos - vWorldPos;
    float lDist = length(toL);
    light += uLanternColor * (uLanternStrength / (1.0 + lDist * lDist * 0.14));
  }

  vec3 col = vColor * light;
  col = applyFog(col, vWorldPos);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const dragonflyVert = /* glsl */ `
attribute vec3 aPart;       // x = wingSide (-1, 0, +1), y = wingSpan (0..1), z = colorMix (0=body, 1=wing)
attribute vec4 aHome;       // homeX, homeY, homeZ, phase
attribute vec3 aSeed;       // radius, speed, hue

uniform float uTime;
uniform float uDayActivity; // 1 in Pagi/Senja, fades to 0 in Malam
uniform vec3 uCursor;
uniform float uCursorActive;

varying vec3 vWorldPos;
varying float vIsWing;
varying float vHue;
varying float vVis;

void main() {
  vIsWing = aPart.z;
  vHue = aSeed.z;
  vVis = uDayActivity;

  float phase = aHome.w;
  float rate = aSeed.y;
  float rad = aSeed.x;

  // Hover-and-dart motion: smooth step between hover waypoints
  float tSlow = uTime * rate + phase;
  float seg = floor(tSlow);
  float frac = smoothstep(0.15, 0.85, fract(tSlow));

  vec2 p0 = vec2(
    sin(seg * 4.17 + phase) * cos(seg * 2.31),
    cos(seg * 3.13 + phase) * sin(seg * 5.07)
  ) * rad;
  vec2 p1 = vec2(
    sin((seg + 1.0) * 4.17 + phase) * cos((seg + 1.0) * 2.31),
    cos((seg + 1.0) * 3.13 + phase) * sin((seg + 1.0) * 5.07)
  ) * rad;

  vec2 offsetXZ = mix(p0, p1, frac);
  vec2 dirXZ = p1 - p0;
  float dirLen = length(dirXZ);
  vec2 heading = dirLen > 1e-3 ? dirXZ / dirLen : vec2(cos(phase), sin(phase));

  vec3 center = vec3(
    aHome.x + offsetXZ.x,
    aHome.y + sin(uTime * 3.8 + phase * 3.0) * 0.08,
    aHome.z + offsetXZ.y
  );

  // Dart away when the user's cursor sweeps close to the dragonfly
  vec2 toDragon = center.xz - uCursor.xz;
  float cDist = length(toDragon);
  float evade = (1.0 - smoothstep(0.0, 3.2, cDist)) * uCursorActive;
  if (evade > 0.001) {
    vec2 evadeDir = toDragon / max(cDist, 1e-3);
    center.xz += evadeDir * evade * 1.85;
    center.y += evade * 0.45;
    heading = normalize(mix(heading, evadeDir, evade * 0.85));
  }

  // Rapid 38 Hz iridescent wing beat
  vec3 loc = position * uDayActivity;
  if (abs(aPart.x) > 0.1) {
    float flap = sin(uTime * 190.0 + phase * 12.0) * 0.68;
    float s = sign(aPart.x);
    float c = cos(flap * s);
    float sn = sin(flap * s);
    float wx = loc.x;
    float wy = loc.y;
    loc.x = wx * c - wy * sn;
    loc.y = wx * sn + wy * c;
  }

  // Orient dragonfly along its heading
  vec3 fwd = vec3(heading.x, 0.0, heading.y);
  vec3 right = vec3(-heading.y, 0.0, heading.x);
  vec3 worldPos = center + right * loc.x + vec3(0.0, loc.y, 0.0) + fwd * loc.z;

  vWorldPos = worldPos;
  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}`;

const dragonflyFrag = /* glsl */ `
uniform vec3 uAmbientColor;
uniform float uSunStrength;

varying vec3 vWorldPos;
varying float vIsWing;
varying float vHue;
varying float vVis;

void main() {
  if (vVis < 0.02) discard;

  // Body alternates between vibrant scarlet-amber (Capung Merah) and golden-emerald (Capung Hijau)
  vec3 bodyCol = mix(vec3(0.86, 0.24, 0.11), vec3(0.32, 0.68, 0.16), step(0.5, vHue));
  // Translucent iridescent wings catch the sunlight
  vec3 wingCol = uSunColor * (1.2 + uSunStrength * 0.65) + uAmbientColor * 0.8;

  vec3 col = mix(bodyCol * (uAmbientColor + uSunColor * uSunStrength * 0.9), wingCol, vIsWing);
  col = applyFog(col, vWorldPos);
  float alpha = mix(1.0, 0.58, vIsWing) * vVis;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

function paintEco(geom, hexColor, sway = 0) {
  const g = geom.index ? geom.toNonIndexed() : geom.clone();
  const count = g.attributes.position.count;
  const col = new THREE.Color(hexColor);
  const colors = new Float32Array(count * 3);
  const sways = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
    sways[i] = typeof sway === 'function' ? sway(g.attributes.position, i) : sway;
  }
  g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('aSway', new THREE.BufferAttribute(sways, 1));
  return g;
}

function createDragonflyGeometry() {
  const positions = [];
  const partsAttr = [];

  function pushTri(ax, ay, az, bx, by, bz, cx, cy, cz, wingSide, wingSpan, isWing) {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let k = 0; k < 3; k++) partsAttr.push(wingSide, wingSpan, isWing);
  }

  // Slender thorax + abdomen along Z (-0.09 to +0.06)
  const hw = 0.009;
  pushTri(0, 0.008, 0.055, -hw, 0, 0.01, hw, 0, 0.01, 0, 0, 0);
  pushTri(-hw, 0, 0.01, 0, 0.004, -0.095, hw, 0, 0.01, 0, 0, 0);
  pushTri(0, 0.012, 0.01, 0, -0.006, 0.04, 0, 0.002, -0.095, 0, 0, 0);

  // 4 translucent wings (forewings & hindwings on -X and +X)
  const wingPairs = [
    { z0: 0.022, z1: 0.004, zTip: 0.018, span: 0.095 },
    { z0: 0.002, z1: -0.016, zTip: -0.008, span: 0.082 },
  ];
  for (const wp of wingPairs) {
    for (const sgn of [-1, 1]) {
      pushTri(
        0,
        0.005,
        wp.z0,
        sgn * wp.span,
        0.008,
        wp.zTip,
        sgn * wp.span * 0.82,
        0.005,
        wp.z1,
        sgn,
        1.0,
        1.0,
      );
      pushTri(0, 0.005, wp.z0, sgn * wp.span * 0.82, 0.005, wp.z1, 0, 0.004, wp.z1, sgn, 0.5, 1.0);
    }
  }

  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(partsAttr, 3));
  return g;
}

/**
 * Living Paddy Ecosystem & Nusantara Scarecrow:
 *  1. Bebegig Bercaping Bambu (traditional scarecrow with conical bamboo hat & bird-scaring tassel line)
 *  2. Burung Kuntul Putih (white paddy egrets wading in the flooded puddles and pecking for food)
 *  3. Capung Sawah (iridescent dragonflies hovering over water channels and evading the cursor)
 */
export class Ecosystem {
  constructor({ layout, lanternPos, dragonflyCount = 30 }) {
    this.group = new THREE.Group();
    this.group.name = 'Ecosystem';
    this.egrets = [];

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
      vertexShader: ecoVert,
      fragmentShader: atmosphere + ecoFrag,
      side: THREE.DoubleSide,
    });

    const staticParts = [];

    // -----------------------------------------------------------------------
    // 1. Bebegig Sawah Bercaping Bambu + Tali Rumbai Pengusir Burung
    // -----------------------------------------------------------------------
    const bx = -1.65;
    const bu = 13.6;
    const by = bu * 0.008;
    const bz = -bu;
    const bYaw = 0.22;

    const bebegigLocal = [];
    // Bamboo spine & crossbar arms
    const spine = new THREE.CylinderGeometry(0.032, 0.042, 1.85, 7);
    spine.translate(0, 0.92, 0);
    bebegigLocal.push(paintEco(spine, '#4f3c1e', 0));

    const crossbar = new THREE.CylinderGeometry(0.024, 0.024, 1.38, 6);
    crossbar.rotateZ(Math.PI / 2);
    crossbar.translate(0, 1.38, 0);
    bebegigLocal.push(paintEco(crossbar, '#5c4623', 0.15));

    // Woven straw head
    const head = new THREE.SphereGeometry(0.125, 9, 8);
    head.scale(0.92, 1.1, 0.92);
    head.translate(0, 1.62, 0);
    bebegigLocal.push(paintEco(head, '#b8944d', 0.12));

    // Conical woven bamboo hat (Caping Tani)
    const caping = new THREE.ConeGeometry(0.42, 0.23, 14, 1, true);
    caping.rotateX(-0.12);
    caping.rotateZ(0.06);
    caping.translate(0, 1.78, -0.02);
    bebegigLocal.push(paintEco(caping, '#a67f38', 0.15));

    const capingRim = new THREE.TorusGeometry(0.41, 0.014, 6, 14);
    capingRim.rotateX(Math.PI / 2 - 0.12);
    capingRim.rotateZ(0.06);
    capingRim.translate(0, 1.67, -0.01);
    bebegigLocal.push(paintEco(capingRim, '#4a3618', 0.15));

    // Draped traditional tunic shirt (Baju Kampret) & fluttering sleeves
    const torso = new THREE.CylinderGeometry(0.16, 0.28, 0.68, 8, 4, true);
    torso.scale(1.15, 1.0, 0.62);
    torso.translate(0, 1.12, 0);
    bebegigLocal.push(
      paintEco(torso, '#7a3b26', (pos, idx) => {
        const y = pos.getY(idx);
        return Math.max(0, (1.42 - y) / 0.65) * 0.65;
      }),
    );

    // Left & right tunic sleeves + straw wrist fringes
    for (const sgn of [-1, 1]) {
      const sleeve = new THREE.CylinderGeometry(0.075, 0.12, 0.46, 7, 3, true);
      sleeve.rotateZ((sgn * Math.PI) / 2);
      sleeve.translate(sgn * 0.38, 1.34, 0);
      bebegigLocal.push(paintEco(sleeve, '#6b3320', 0.55));

      const strawHand = new THREE.ConeGeometry(0.09, 0.28, 6);
      strawHand.rotateZ(sgn * 1.15);
      strawHand.translate(sgn * 0.66, 1.28, 0);
      bebegigLocal.push(paintEco(strawHand, '#c7a24e', 0.85));
    }

    // Woven sarong sash at the waist
    const sarong = new THREE.CylinderGeometry(0.24, 0.31, 0.42, 8, 3, true);
    sarong.scale(1.05, 1.0, 0.65);
    sarong.translate(0, 0.68, 0);
    bebegigLocal.push(paintEco(sarong, '#354839', 0.85));

    for (const g of bebegigLocal) {
      g.rotateY(bYaw);
      g.translate(bx, by, bz);
      staticParts.push(g);
    }

    // Catenary bird-scaring string (Tali Rumbai) from Bebegig right hand to the left Kolecer pole
    const pStart = new THREE.Vector3(bx - Math.cos(bYaw) * 0.65, by + 1.32, bz + Math.sin(bYaw) * 0.65);
    const ku = layout.dikeAt(2, -4.8);
    const pEnd = new THREE.Vector3(-4.8, ku * 0.008 + 1.85, -ku);
    const ropeSegs = 14;
    for (let s = 0; s < ropeSegs; s++) {
      const t0 = s / ropeSegs;
      const t1 = (s + 1) / ropeSegs;
      const tm = (t0 + t1) * 0.5;
      const sag0 = Math.sin(t0 * Math.PI) * 0.38;
      const sag1 = Math.sin(t1 * Math.PI) * 0.38;
      const sagM = Math.sin(tm * Math.PI) * 0.38;

      const a = new THREE.Vector3().lerpVectors(pStart, pEnd, t0);
      a.y -= sag0;
      const b = new THREE.Vector3().lerpVectors(pStart, pEnd, t1);
      b.y -= sag1;
      const mid = new THREE.Vector3().lerpVectors(pStart, pEnd, tm);
      mid.y -= sagM;

      const len = a.distanceTo(b);
      const cord = new THREE.CylinderGeometry(0.006, 0.006, len, 4);
      cord.rotateX(Math.PI / 2);
      const lookMat = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
      cord.applyMatrix4(lookMat);
      cord.translate(mid.x, mid.y, mid.z);
      const swayWeight = Math.sin(tm * Math.PI);
      staticParts.push(paintEco(cord, '#6e5730', swayWeight));

      // Hanging red/white/straw bird-scaring ribbons every 2 segments
      if (s % 2 === 1 && s < ropeSegs - 1) {
        const tassel = new THREE.PlaneGeometry(0.055, 0.24, 1, 3);
        tassel.translate(mid.x, mid.y - 0.12, mid.z);
        const tCol = s % 4 === 1 ? '#c94a29' : '#e6cf7e';
        staticParts.push(paintEco(tassel, tCol, swayWeight * 1.25));
      }
    }

    const staticMerged = mergeGeometries(staticParts, false);
    this.staticMesh = new THREE.Mesh(staticMerged, this.material);
    this.staticMesh.name = 'BebegigAndTassels';
    this.group.add(this.staticMesh);

    // -----------------------------------------------------------------------
    // 2. Burung Kuntul Putih (Wading White Paddy Egrets)
    // -----------------------------------------------------------------------
    const egretSpots = [
      { x: -3.85, u: 9.1, yaw: 0.65, phase: 0.0 },
      { x: -4.45, u: 10.1, yaw: -0.4, phase: 2.1 },
      { x: 6.4, u: 16.2, yaw: -0.85, phase: 4.3 },
      { x: 1.9, u: 11.2, yaw: 0.35, phase: 1.4 },
    ];

    for (const sp of egretSpots) {
      const ey = sp.u * 0.008;
      const ez = -sp.u;
      const egretGroup = new THREE.Group();
      egretGroup.position.set(sp.x, ey, ez);
      egretGroup.rotation.y = sp.yaw;

      // Long wading legs + plumed white body
      const bodyParts = [];
      for (const lx of [-0.045, 0.045]) {
        const leg = new THREE.CylinderGeometry(0.009, 0.007, 0.48, 5);
        leg.translate(lx, 0.24, 0);
        bodyParts.push(paintEco(leg, '#2b331f', 0));
      }

      const torso = new THREE.SphereGeometry(0.115, 10, 8);
      torso.scale(0.82, 0.88, 1.65);
      torso.rotateX(-0.18);
      torso.translate(0, 0.5, 0);
      bodyParts.push(paintEco(torso, '#f7f5ec', 0));

      const tail = new THREE.ConeGeometry(0.065, 0.18, 6);
      tail.rotateX(-1.25);
      tail.translate(0, 0.45, -0.19);
      bodyParts.push(paintEco(tail, '#ece9dc', 0));

      const bodyMesh = new THREE.Mesh(mergeGeometries(bodyParts, false), this.material);
      egretGroup.add(bodyMesh);

      // Articulated neck + head + yellow beak pivoted at the shoulder (0, 0.55, 0.14)
      const neckParts = [];
      const lowerNeck = new THREE.CylinderGeometry(0.022, 0.032, 0.24, 6);
      lowerNeck.rotateX(0.22);
      lowerNeck.translate(0, 0.11, 0.03);
      neckParts.push(paintEco(lowerNeck, '#faf8f0', 0));

      const upperNeck = new THREE.CylinderGeometry(0.018, 0.022, 0.18, 6);
      upperNeck.rotateX(-0.15);
      upperNeck.translate(0, 0.28, 0.04);
      neckParts.push(paintEco(upperNeck, '#ffffff', 0));

      const eHead = new THREE.SphereGeometry(0.034, 8, 6);
      eHead.scale(0.85, 0.9, 1.3);
      eHead.translate(0, 0.37, 0.05);
      neckParts.push(paintEco(eHead, '#ffffff', 0));

      const beak = new THREE.ConeGeometry(0.014, 0.13, 5);
      beak.rotateX(Math.PI / 2 + 0.08);
      beak.translate(0, 0.365, 0.14);
      neckParts.push(paintEco(beak, '#e8a829', 0));

      const neckMesh = new THREE.Mesh(mergeGeometries(neckParts, false), this.material);
      neckMesh.position.set(0, 0.54, 0.13);
      egretGroup.add(neckMesh);

      this.egrets.push({ group: egretGroup, neck: neckMesh, phase: sp.phase });
      this.group.add(egretGroup);
    }

    // -----------------------------------------------------------------------
    // 3. Capung Sawah (Hovering & Darting Iridescent Dragonflies)
    // -----------------------------------------------------------------------
    const dfGeom = createDragonflyGeometry();
    const rnd = createRandom(7373);
    const homes = new Float32Array(dragonflyCount * 4);
    const seeds = new Float32Array(dragonflyCount * 3);

    for (let i = 0; i < dragonflyCount; i++) {
      // Cluster dragonflies near foreground/midground puddles and pematang camera
      const u = 2.0 + 20.0 * Math.pow(rnd(), 1.35);
      const x = (rnd() * 2 - 1) * (4.2 + u * 0.45);
      const y = u * 0.008 + 0.72 + rnd() * 0.55;

      homes[i * 4] = x;
      homes[i * 4 + 1] = y;
      homes[i * 4 + 2] = -u;
      homes[i * 4 + 3] = rnd() * Math.PI * 2;

      seeds[i * 3] = 0.65 + rnd() * 0.95; // hover radius
      seeds[i * 3 + 1] = 0.45 + rnd() * 0.4; // dart frequency
      seeds[i * 3 + 2] = rnd(); // hue selector
    }

    dfGeom.setAttribute('aHome', new THREE.InstancedBufferAttribute(homes, 4));
    dfGeom.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
    dfGeom.instanceCount = dragonflyCount;

    this.dragonflyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...atmosphereUniforms(),
        uTime: shared.uTime,
        uDayActivity: { value: 1.0 },
        uCursor: { value: new THREE.Vector3(0, 0, -1000) },
        uCursorActive: { value: 0 },
        uAmbientColor: { value: new THREE.Color('#7f8c54') },
        uSunStrength: { value: 1.35 },
      },
      vertexShader: dragonflyVert,
      fragmentShader: atmosphere + dragonflyFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.dragonflyMesh = new THREE.Mesh(dfGeom, this.dragonflyMaterial);
    this.dragonflyMesh.frustumCulled = false;
    this.dragonflyMesh.name = 'Dragonflies';
    this.group.add(this.dragonflyMesh);
  }

  update(elapsed, pointer) {
    // Animate egret foraging head-dip and curious look-around motion
    for (const eg of this.egrets) {
      const cycle = (elapsed * 0.65 + eg.phase) % (Math.PI * 2);
      // Smooth periodic pecking dip into the paddy water when sin(cycle) peaks
      const dipPulse = Math.pow(Math.max(0, Math.sin(cycle) - 0.55) / 0.45, 2.0);
      eg.neck.rotation.x = dipPulse * 1.35 + Math.sin(elapsed * 1.4 + eg.phase) * 0.06;
      eg.neck.rotation.y = Math.sin(elapsed * 0.8 + eg.phase * 1.7) * 0.35 * (1 - dipPulse);
    }

    const du = this.dragonflyMaterial.uniforms;
    du.uCursor.value.copy(pointer.world);
    du.uCursorActive.value = pointer.active;
  }
}
