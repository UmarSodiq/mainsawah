import * as THREE from 'three';
import { Pointer } from './interaction/Pointer.js';
import { TrailMap } from './interaction/TrailMap.js';
import { createEffects } from './postprocessing/Effects.js';
import { Birds } from './scene/Birds.js';
import { Ecosystem } from './scene/Ecosystem.js';
import { createFieldLayout } from './scene/fieldLayout.js';
import { FogLayers } from './scene/FogLayers.js';
import { Ground } from './scene/Ground.js';
import { Particles } from './scene/Particles.js';
import { Rain } from './scene/Rain.js';
import { RiceField } from './scene/RiceField.js';
import { Saung } from './scene/Saung.js';
import { shared } from './scene/shared.js';
import { Sky } from './scene/Sky.js';
import { Sun } from './scene/Sun.js';
import { TimeOfDay } from './scene/TimeOfDay.js';
import { TreeLine } from './scene/TreeLine.js';
import { VillageProps } from './scene/VillageProps.js';
import { setupDebug } from './utils/debug.js';
import { detectQuality } from './utils/quality.js';

const canvas = document.getElementById('scene');
const loaderEl = document.getElementById('loader');
const overlayEl = document.getElementById('overlay');
const overlayAccentEl = document.getElementById('overlay-title-accent');
const overlayKickerEl = document.getElementById('overlay-kicker-text');
const overlayBtn = document.getElementById('overlay-toggle');
const timeBtns = document.querySelectorAll('.time-btn');
const weatherBtn = document.getElementById('weather-toggle');
const weatherLabelEl = document.getElementById('weather-label');
const camBtns = document.querySelectorAll('.cam-btn');

const renderer = new THREE.WebGLRenderer({
  canvas,
  powerPreference: 'high-performance',
  antialias: false,
  stencil: false,
  depth: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // ToneMappingEffect handles ACES Filmic at the end of the pipeline

const quality = detectQuality(renderer);
const getDpr = () => Math.min(window.devicePixelRatio || 1, quality.dpr);
renderer.setPixelRatio(getDpr());
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();

const BASE_CAM = new THREE.Vector3(0, 2.25, 0);
const lookTarget = new THREE.Vector3(0, 1.35, -100);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.12, 2000);
camera.position.copy(BASE_CAM);
camera.lookAt(lookTarget);

// ---------------------------------------------------------------------------
// Scene objects
// ---------------------------------------------------------------------------
const layout = createFieldLayout(7);
const saung = new Saung(layout);
const birds = new Birds({
  skyCount: quality.name === 'low' ? 20 : 36,
  scatterCount: quality.name === 'low' ? 14 : 24,
});

const trail = new TrailMap({
  resolution: quality.name === 'low' ? 256 : 512,
});

const villageProps = new VillageProps({
  layout,
  trail,
  saungPos: saung.position,
  lanternPos: saung.lanternWorldPos,
  countPanicles: quality.name === 'low' ? 1100 : 2200,
});

const ecosystem = new Ecosystem({
  layout,
  lanternPos: saung.lanternWorldPos,
  dragonflyCount: quality.name === 'low' ? 18 : 32,
});

const pointer = new Pointer(canvas, {
  onFieldClick(hitPos) {
    birds.scatterFrom(hitPos);
    villageProps.boostSpin();
  },
});

const sky = new Sky();
const sun = new Sun();
const ground = new Ground(layout, { lanternPos: saung.lanternWorldPos });
const trees = new TreeLine({
  maxTextureWidth: quality.treeTex,
  anisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()),
});
const rice = new RiceField({
  count: quality.blades,
  segments: quality.segments,
  layout,
  trail,
  saungPos: saung.position,
  lanternPos: saung.lanternWorldPos,
});
const rain = new Rain({
  count: quality.name === 'low' ? 1200 : 2400,
  saungPos: saung.position,
});
const fog = new FogLayers({ count: quality.fogSheets });
const particles = new Particles({
  count: quality.particles,
  pixelRatio: renderer.getPixelRatio(),
});

scene.add(
  sky.mesh,
  sun.group,
  ground.mesh,
  trees.group,
  saung.group,
  villageProps.group,
  ecosystem.group,
  rice.mesh,
  birds.mesh,
  rain.mesh,
  fog.group,
  particles.points,
);

const effects = createEffects(renderer, scene, camera, sun.mesh, quality);
effects.composer.setSize(window.innerWidth, window.innerHeight);

const timeOfDay = new TimeOfDay({
  sky,
  sun,
  rice,
  ground,
  trees,
  saung,
  villageProps,
  ecosystem,
  birds,
  particles,
  effects,
});

// ---------------------------------------------------------------------------
// Time-of-day, Weather & Camera viewpoint switchers + URL query support
// ---------------------------------------------------------------------------
const MODE_META = {
  pagi: { accent: 'Pagi', kicker: 'Fajar Nusantara', color: '#ffeeb8' },
  senja: { accent: 'Senja', kicker: 'Lembayung Sore', color: '#ffc98b' },
  malam: { accent: 'Malam', kicker: 'Cahaya Kunang-Kunang', color: '#c4dcff' },
};

const CAM_PRESETS = {
  hamparan: {
    pos: new THREE.Vector3(0, 2.25, 0),
    look: new THREE.Vector3(0, 1.35, -100),
    parallax: { x: 0.95, y: 0.34, lookX: 0.25, lookY: 0.12 },
  },
  saung: {
    pos: saung.terraceCamPos,
    look: saung.terraceLookAt,
    parallax: { x: 0.38, y: 0.16, lookX: 0.35, lookY: 0.14 },
  },
  pematang: {
    pos: new THREE.Vector3(-3.6, 1.15, -5.8),
    look: new THREE.Vector3(-1.5, 0.72, -36),
    parallax: { x: 0.55, y: 0.18, lookX: 0.24, lookY: 0.1 },
  },
};

let activeCamPreset = CAM_PRESETS.hamparan;
const camAnchor = activeCamPreset.pos.clone();
const lookAnchor = activeCamPreset.look.clone();

function updateKickerText() {
  const meta = MODE_META[timeOfDay.currentName] || MODE_META.pagi;
  const suffix = timeOfDay.weather === 'hujan' ? ' · Hujan Rintik' : '';
  if (overlayKickerEl) overlayKickerEl.textContent = meta.kicker + suffix;
}

function selectTimeMode(mode) {
  const meta = MODE_META[mode];
  if (!meta) return;
  timeOfDay.setMode(mode);
  updateKickerText();
  if (overlayAccentEl) {
    overlayAccentEl.classList.add('is-switching');
    setTimeout(() => {
      overlayAccentEl.textContent = meta.accent;
      overlayAccentEl.style.color = meta.color;
      overlayAccentEl.classList.remove('is-switching');
    }, 160);
  }
  timeBtns.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.time === mode);
  });
}

function selectWeather(weather) {
  const next = weather === 'hujan' ? 'hujan' : 'cerah';
  timeOfDay.setWeather(next);
  if (weatherBtn) {
    weatherBtn.dataset.weather = next;
    weatherBtn.classList.toggle('is-active', next === 'hujan');
  }
  if (weatherLabelEl) {
    weatherLabelEl.textContent = next === 'hujan' ? 'Hujan Aktif' : 'Hujan Rintik';
  }
  if ( next === 'hujan') villageProps.boostSpin();
  updateKickerText();
}

function selectCamPreset(name, instant = false) {
  const preset = CAM_PRESETS[name];
  if (!preset) return;
  activeCamPreset = preset;
  if (instant) {
    camAnchor.copy(preset.pos);
    lookAnchor.copy(preset.look);
    camera.position.copy(preset.pos);
    camera.lookAt(preset.look);
  }
  camBtns.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.cam === name);
  });
}

timeBtns.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectTimeMode(btn.dataset.time);
  });
});

if (weatherBtn) {
  weatherBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectWeather(timeOfDay.weather === 'hujan' ? 'cerah' : 'hujan');
  });
}

camBtns.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectCamPreset(btn.dataset.cam);
  });
});

const params = new URLSearchParams(location.search);
const initialTimeParam = params.get('time');
if (initialTimeParam && MODE_META[initialTimeParam]) {
  selectTimeMode(initialTimeParam);
}
const initialWeatherParam = params.get('weather');
if (initialWeatherParam) {
  selectWeather(initialWeatherParam);
}
const initialCamParam = params.get('cam');
if (initialCamParam && CAM_PRESETS[initialCamParam]) {
  selectCamPreset(initialCamParam, true);
}

// ---------------------------------------------------------------------------
// Window resize
// ---------------------------------------------------------------------------
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const dpr = getDpr();
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  effects.composer.setSize(w, h);
  particles.setPixelRatio(dpr);
}
window.addEventListener('resize', onResize);

// ---------------------------------------------------------------------------
// Overlay & optional #debug panel
// ---------------------------------------------------------------------------
if (overlayBtn && overlayEl) {
  overlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    overlayEl.classList.toggle('is-hidden');
  });
}

let updateDebug = null;
async function checkDebug() {
  if (location.hash.includes('debug') && !updateDebug) {
    updateDebug = await setupDebug({
      getTier: () => quality.name,
      rice,
      trail,
      effects,
      selectTimeMode,
    });
  }
}
checkDebug();
window.addEventListener('hashchange', checkDebug);

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const timer = new THREE.Timer();
let firstFrame = true;

function animate(timestamp) {
  requestAnimationFrame(animate);

  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.1);
  const elapsed = timer.getElapsed();
  shared.uTime.value = elapsed;

  timeOfDay.update(dt);
  pointer.update(camera, dt);
  trail.update(renderer, pointer, dt);
  rice.update(pointer);
  villageProps.update(dt, pointer);
  ecosystem.update(elapsed, pointer);
  birds.update(dt, elapsed);

  // Smooth camera anchor transition between presets + live cursor parallax
  const anchorLerp = 1 - Math.exp(-dt * 3.2);
  camAnchor.lerp(activeCamPreset.pos, anchorLerp);
  lookAnchor.lerp(activeCamPreset.look, anchorLerp);

  const px = activeCamPreset.parallax;
  const breathX = Math.sin(elapsed * 0.45) * 0.05;
  const breathY = Math.cos(elapsed * 0.35) * 0.025;
  const targetX = camAnchor.x + pointer.ndc.x * px.x + breathX;
  const targetY = camAnchor.y + pointer.ndc.y * px.y + breathY;
  const targetZ = camAnchor.z;
  const camLerp = 1 - Math.exp(-dt * 4.5);
  camera.position.x += (targetX - camera.position.x) * camLerp;
  camera.position.y += (targetY - camera.position.y) * camLerp;
  camera.position.z += (targetZ - camera.position.z) * camLerp;

  lookTarget.set(
    lookAnchor.x + pointer.ndc.x * px.lookX + breathX * 0.3,
    lookAnchor.y + pointer.ndc.y * px.lookY + breathY * 0.3,
    lookAnchor.z,
  );
  camera.lookAt(lookTarget);

  sky.update(camera);
  sun.update(camera);
  rain.update(camera);
  particles.update(pointer);

  effects.composer.render(dt);

  if (firstFrame) {
    firstFrame = false;
    loaderEl?.classList.add('is-hidden');
  }

  if (updateDebug) updateDebug(dt);
}

requestAnimationFrame(animate);
