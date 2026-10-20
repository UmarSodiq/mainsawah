import * as THREE from 'three';
import atmosphere from '../shaders/atmosphere.glsl?raw';
import { atmosphereUniforms } from './shared.js';
import { createRandom } from './fieldLayout.js';

const GROUND_OFFSET = 3; // metres of plane below y = 0 (hidden by the ground)
const DEG = Math.PI / 180;

/* ------------------------------------------------------------------------ */
/*  Silhouette painters (canvas 2D, white on transparent – only alpha used)  */
/* ------------------------------------------------------------------------ */

function drawPalm(ctx, x, base, h, ppm, rnd) {
  const lean = (rnd() - 0.5) * 0.32 * h * ppm;
  const topX = x + lean;
  const topY = base - h * ppm;
  const tw = Math.max(0.22 * ppm, 0.7);

  // Trunk – slightly curved and tapered
  ctx.beginPath();
  ctx.moveTo(x - tw * 1.3, base);
  ctx.quadraticCurveTo(x + lean * 0.15 - tw, base - h * ppm * 0.55, topX - tw * 0.6, topY);
  ctx.lineTo(topX + tw * 0.6, topY);
  ctx.quadraticCurveTo(x + lean * 0.15 + tw, base - h * ppm * 0.55, x + tw * 1.3, base);
  ctx.closePath();
  ctx.fill();

  // Crown – drooping fronds with leaflets
  const fronds = 9 + Math.floor(rnd() * 5);
  const R = (2.6 + rnd() * 1.8) * ppm;
  ctx.lineCap = 'round';
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rnd() * 0.5;
    const dx = Math.cos(a);
    const dy = Math.sin(a) * 0.55; // flattened: crown seen from the side
    const len = R * (dy > 0 ? 0.75 : 1.0) * (0.8 + rnd() * 0.35);
    const droop = len * (0.35 + rnd() * 0.35);
    const cx = topX + dx * len * 0.55;
    const cy = topY + dy * len * 0.55 - len * 0.22;
    const ex = topX + dx * len;
    const ey = topY + dy * len + droop;

    ctx.lineWidth = Math.max(0.14 * ppm, 0.8);
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();

    if (ppm < 3.5) continue; // leaflets invisible at this scale
    ctx.lineWidth = Math.max(0.06 * ppm, 0.6);
    for (let t = 0.15; t <= 1.0; t += 0.075) {
      const it = 1 - t;
      const px = it * it * topX + 2 * it * t * cx + t * t * ex;
      const py = it * it * topY + 2 * it * t * cy + t * t * ey;
      const tx = 2 * it * (cx - topX) + 2 * t * (ex - cx);
      const ty = 2 * it * (cy - topY) + 2 * t * (ey - cy);
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl;
      const ny = tx / tl;
      const L = len * 0.24 * (1 - t * 0.55);
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + (nx * sgn * 0.7 + (tx / tl) * 0.35) * L, py + (ny * sgn * 0.7 + (ty / tl) * 0.35) * L + L * 0.55);
        ctx.stroke();
      }
    }
  }
}

function drawBroadleaf(ctx, x, base, h, ppm, rnd) {
  const crownW = h * (0.55 + rnd() * 0.45);
  const trunkH = h * (0.25 + rnd() * 0.15);
  const tw = Math.max(0.3 * ppm, 0.8);
  ctx.fillRect(x - tw, base - trunkH * ppm - 2, tw * 2, trunkH * ppm + 2);

  const blobs = 14 + Math.floor(h * 1.6);
  for (let i = 0; i < blobs; i++) {
    const v = rnd(); // 0 = crown bottom, 1 = crown top
    const spread = Math.sin(Math.PI * (0.15 + v * 0.8)) * crownW * 0.5;
    const r = crownW * (0.1 + rnd() * 0.12) * ppm;
    const bx = x + (rnd() * 2 - 1) * spread * ppm;
    const by = base - (trunkH + v * (h - trunkH)) * ppm + r * 0.6;
    ctx.beginPath();
    ctx.arc(bx, Math.max(by, base - h * ppm + r), r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Ragged leafy edge
  for (let i = 0; i < blobs * 1.5; i++) {
    const ang = rnd() * Math.PI * 2;
    const r = crownW * 0.04 * ppm * (0.6 + rnd());
    const rx = x + Math.cos(ang) * crownW * 0.5 * ppm * (0.8 + rnd() * 0.25);
    const ry = base - (trunkH + (h - trunkH) * 0.55) * ppm + Math.sin(ang) * (h - trunkH) * 0.5 * ppm;
    if (ry > base - trunkH * ppm) continue;
    ctx.beginPath();
    ctx.arc(rx, ry, Math.max(r, 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBush(ctx, x, base, h, ppm, rnd) {
  const w = h * (1.2 + rnd());
  const n = 6 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const r = h * (0.3 + rnd() * 0.3) * ppm;
    const bx = x + (rnd() - 0.5) * w * ppm;
    const by = base - r * (0.6 + rnd() * 0.8);
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(r, 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHedge(ctx, width, base, minH, maxH, ppm, rnd, from = 0, to = width) {
  let x = from;
  while (x < to) {
    const r = (minH + rnd() * (maxH - minH)) * ppm * 0.6;
    ctx.beginPath();
    ctx.arc(x, base - r * 0.5, Math.max(r, 0.8), 0, Math.PI * 2);
    ctx.fill();
    x += Math.max(r * (0.5 + rnd() * 0.6), 0.8);
  }
  ctx.fillRect(from, base - 1, to - from, GROUND_OFFSET * ppm + 2);
}

/**
 * Paints a natural Indonesian volcanic mountain silhouette (twin peaks + foothills)
 * with subtle crater saddle and organic ridge undulation.
 */
function drawMountain(ctx, peakX, base, peakH, spanW, craterDip, ppm, rnd) {
  const steps = 140;
  const startX = peakX - spanW * 0.52 * ppm;
  const endX = peakX + spanW * 0.48 * ppm;
  const seedA = rnd() * 10;
  const seedB = rnd() * 10;

  ctx.beginPath();
  ctx.moveTo(startX, base + GROUND_OFFSET * ppm + 2);
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * 2 - 1; // -1..1 across mountain span
    const absU = Math.abs(u);
    // Volcanic bell-curve profile: concave sweeping lower flanks, steeper upper cone
    let profile = Math.pow(Math.max(0, 1 - absU * absU), 1.85) * Math.exp(-absU * 1.15);
    // Subtle volcanic crater saddle right at the summit
    const crater = craterDip * Math.exp(-Math.pow((u - 0.02) / 0.085, 2));
    // Natural ridge undulation
    const ridgeNoise =
      (Math.sin(u * 13.0 + seedA) * 0.022 + Math.sin(u * 29.0 + seedB) * 0.011) * (1 - absU * 0.6);
    const h = Math.max(0, (profile - crater + ridgeNoise) * peakH * ppm);
    const x = startX + ((i / steps) * (endX - startX));
    ctx.lineTo(x, base - h);
  }
  ctx.lineTo(endX, base + GROUND_OFFSET * ppm + 2);
  ctx.closePath();
  ctx.fill();
}

/* ------------------------------------------------------------------------ */
/*  Layer definitions, composed to echo the reference photo                  */
/* ------------------------------------------------------------------------ */

const LAYERS = [
  {
    // Near: the big tree mass on the left (next to the sun) + small bushes on the field
    dist: 115,
    height: 40,
    fogScale: 0.34,
    extraHaze: 0.0,
    mist: 2.8,
    topSpan: 22.0,
    build(add, rnd) {
      for (let i = 0; i < 26; i++) add('broadleaf', -60 + rnd() * 24, 12 + rnd() * 14);
      for (let i = 0; i < 9; i++) add('palm', -58 + rnd() * 26, 17 + rnd() * 10);
      add('palm', -33, 15);
      add('palm', -31.5, 12);
      add('hedgeRange', -62, -30, 2, 5);
      // small shrubs / banana-like bushes along the far paddy bund
      add('bush', -11, 2.6);
      add('bush', -6.5, 2.2);
      add('bush', 2.5, 2.0);
      add('palm', 11.2, 4.8);
      add('bush', 11.5, 2.5);
      add('bush', 22.0, 3.0);
    },
  },
  {
    // Middle: pair of coconut palms on the left, tall tree + dense grove on the right
    dist: 205,
    height: 42,
    fogScale: 0.46,
    extraHaze: 0.04,
    mist: 3.8,
    topSpan: 22.0,
    build(add, rnd) {
      add('palm', -24.5, 19);
      add('palm', -22.2, 16.5);
      add('broadleaf', 16.5, 20);
      add('broadleaf', 17.8, 15.5);
      add('palm', 19.8, 13.5);
      add('palm', 21.5, 11.5);
      for (let i = 0; i < 20; i++) add('broadleaf', 25 + rnd() * 30, 9 + rnd() * 12);
      for (let i = 0; i < 14; i++) add('palm', 25 + rnd() * 30, 13 + rnd() * 10);
      for (let i = 0; i < 16; i++) add(rnd() < 0.5 ? 'palm' : 'broadleaf', -45 + rnd() * 70, 5 + rnd() * 6.5);
      add('hedgeRange', -60, 60, 1.2, 3.5);
    },
  },
  {
    // Far: continuous hazy tree line
    dist: 330,
    height: 32,
    fogScale: 0.66,
    extraHaze: 0.1,
    mist: 4.8,
    topSpan: 22.0,
    build(add, rnd) {
      for (let i = 0; i < 70; i++) add('broadleaf', -55 + rnd() * 110, 5 + rnd() * 8);
      for (let i = 0; i < 55; i++) add('palm', -55 + rnd() * 110, 8 + rnd() * 8);
      add('hedgeRange', -60, 60, 2, 5);
    },
  },
  {
    // Very far: faint silhouette band
    dist: 520,
    height: 34,
    fogScale: 0.82,
    extraHaze: 0.18,
    mist: 6.0,
    topSpan: 22.0,
    build(add, rnd) {
      for (let i = 0; i < 90; i++) add('broadleaf', -55 + rnd() * 110, 6 + rnd() * 10);
      for (let i = 0; i < 60; i++) add('palm', -55 + rnd() * 110, 10 + rnd() * 9);
      add('hedgeRange', -60, 60, 3, 7);
    },
  },
  {
    // Horizon: Twin Indonesian volcanic mountain range (Gunung Kembar) behind the morning mist
    dist: 820,
    height: 118,
    fogScale: 0.68,
    extraHaze: 0.26,
    mist: 24.0,
    topSpan: 95.0,
    build(add) {
      // Main tall volcano peak in center-right + companion twin peak + gentle foothill ridge
      add('mountain', 7.5, 96, 760, 0.045);
      add('mountain', 24.5, 76, 620, 0.025);
      add('mountain', -12.0, 46, 520, 0.01);
      add('mountain', -46.0, 52, 480, 0.015);
    },
  },
];

/* ------------------------------------------------------------------------ */

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
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uFogScale;
uniform float uExtraHaze;
uniform float uMist;
uniform float uBaseY;
uniform float uTopSpan;
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  float a = texture2D(uMap, vUv).a;
  float alpha = smoothstep(0.2, 0.75, a);
  if (alpha < 0.02) discard;

  vec3 d = vWorldPos - cameraPosition;
  float dist = length(d);
  vec3 V = d / dist;
  vec3 haze = fogTint(V);

  float localY = max(vWorldPos.y - uBaseY, 0.0);
  // Slight vertical gradient: canopies and mountain ridges are lighter on top (sky light)
  float top = smoothstep(0.0, uTopSpan, localY);
  vec3 col = uColor * (0.78 + 0.36 * top);

  float f = fogAmount(dist * uFogScale);
  f = 1.0 - (1.0 - f) * (1.0 - uExtraHaze);
  // Ground mist swallowing the base of the trees / mountain valleys
  float mist = 1.0 - smoothstep(0.0, uMist, localY);
  f = max(f, mist * mist * 0.82);
  // Glare bleed for trees right next to the sun on the left
  f = max(f, pow(max(dot(V, uSunDir), 0.0), 16.0) * 0.72);

  col = mix(col, haze, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

export class TreeLine {
  constructor({ maxTextureWidth = 4096, anisotropy = 4 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'TreeLine';
    const random = createRandom(2024);

    for (const layer of LAYERS) {
      const worldW = layer.dist * 2 * 1.25;
      const worldH = layer.height + GROUND_OFFSET;
      const canvasW = maxTextureWidth;
      const ppm = canvasW / worldW;
      const canvasH = Math.min(1024, Math.max(128, Math.ceil(worldH * ppm)));
      const ppmY = canvasH / worldH;
      const scale = Math.min(ppm, ppmY);

      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#fff';
      const base = canvasH - GROUND_OFFSET * ppmY;
      const azToX = (az) => (layer.dist * Math.tan(az * DEG) + worldW / 2) * ppm;

      const items = [];
      layer.build((type, a, b, c, d) => items.push({ type, a, b, c, d }), random);
      for (const it of items) {
        if (it.type === 'palm') drawPalm(ctx, azToX(it.a), base, it.b, scale, random);
        else if (it.type === 'broadleaf') drawBroadleaf(ctx, azToX(it.a), base, it.b, scale, random);
        else if (it.type === 'bush') drawBush(ctx, azToX(it.a), base, it.b, scale, random);
        else if (it.type === 'mountain') drawMountain(ctx, azToX(it.a), base, it.b, it.c, it.d, scale, random);
      }
      for (const it of items) {
        if (it.type === 'hedgeRange') {
          drawHedge(ctx, canvasW, base, it.c, it.d, scale, random, Math.max(azToX(it.a), 0), Math.min(azToX(it.b), canvasW));
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = anisotropy;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;

      const baseY = layer.dist * 0.008;
      const material = new THREE.ShaderMaterial({
        uniforms: {
          ...atmosphereUniforms(),
          uMap: { value: texture },
          uColor: { value: new THREE.Color('#232e18') },
          uFogScale: { value: layer.fogScale },
          uExtraHaze: { value: layer.extraHaze },
          uMist: { value: layer.mist },
          uBaseY: { value: baseY },
          uTopSpan: { value: layer.topSpan || 22.0 },
        },
        vertexShader: vert,
        fragmentShader: atmosphere + frag,
        transparent: true,
        depthWrite: true,
      });

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), material);
      mesh.position.set(0, baseY + worldH / 2 - GROUND_OFFSET, -layer.dist);
      mesh.name = `TreeLayer_${layer.dist}`;
      this.group.add(mesh);
    }
  }
}
