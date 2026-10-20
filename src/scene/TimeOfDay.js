import * as THREE from 'three';
import { shared } from './shared.js';

function dirFromAngles(azDeg, elDeg) {
  const az = THREE.MathUtils.degToRad(azDeg);
  const el = THREE.MathUtils.degToRad(elDeg);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

export const TIME_PRESETS = {
  pagi: {
    name: 'pagi',
    label: 'Pagi',
    sunDir: dirFromAngles(-34, 13.5),
    sunColor: new THREE.Color('#ffefc2'),
    fogColor: new THREE.Color('#e8c78e'),
    fogDensity: 0.0022,
    skyMid: new THREE.Color('#ecca93'),
    skyZenith: new THREE.Color('#d7b78d'),
    sunDiscColor: new THREE.Color().setRGB(5.0, 4.4, 3.4),
    riceRoot: new THREE.Color('#142b06'),
    riceMid: new THREE.Color('#3b6e10'),
    riceTip: new THREE.Color('#8ec429'),
    riceYellow: new THREE.Color('#e3d94c'),
    riceTrans: new THREE.Color('#ffe46b'),
    ambient: new THREE.Color('#7f8c54'),
    sunStrength: 1.35,
    transStrength: 1.15,
    soilColor: new THREE.Color('#142407'),
    dikeColor: new THREE.Color('#27420d'),
    canopyDark: new THREE.Color('#345e0e'),
    canopyLight: new THREE.Color('#95c82b'),
    treeColor: new THREE.Color('#232e18'),
    birdColor: new THREE.Color('#232818'),
    lanternStrength: 0.0,
    fireflyMode: 0.0,
    starStrength: 0.0,
    godRaysWeight: 0.38,
    bloomIntensity: 0.85,
  },
  senja: {
    name: 'senja',
    label: 'Senja',
    sunDir: dirFromAngles(-26, 9.5),
    sunColor: new THREE.Color('#ff9d5c'),
    fogColor: new THREE.Color('#cf7952'),
    fogDensity: 0.0025,
    skyMid: new THREE.Color('#b85d56'),
    skyZenith: new THREE.Color('#4a375e'),
    sunDiscColor: new THREE.Color().setRGB(5.5, 2.6, 1.1),
    riceRoot: new THREE.Color('#121f07'),
    riceMid: new THREE.Color('#2e520e'),
    riceTip: new THREE.Color('#7aa322'),
    riceYellow: new THREE.Color('#ebb144'),
    riceTrans: new THREE.Color('#ff9e42'),
    ambient: new THREE.Color('#7a5b58'),
    sunStrength: 1.3,
    transStrength: 1.25,
    soilColor: new THREE.Color('#141c08'),
    dikeColor: new THREE.Color('#24330d'),
    canopyDark: new THREE.Color('#29450c'),
    canopyLight: new THREE.Color('#829c28'),
    treeColor: new THREE.Color('#1d1b22'),
    birdColor: new THREE.Color('#1a151c'),
    lanternStrength: 1.65,
    fireflyMode: 0.3,
    starStrength: 0.16,
    godRaysWeight: 0.44,
    bloomIntensity: 1.05,
  },
  malam: {
    name: 'malam',
    label: 'Malam',
    sunDir: dirFromAngles(-28, 18.0), // Moon position
    sunColor: new THREE.Color('#8cb8ff'),
    fogColor: new THREE.Color('#102036'),
    fogDensity: 0.0026,
    skyMid: new THREE.Color('#0c182b'),
    skyZenith: new THREE.Color('#040914'),
    sunDiscColor: new THREE.Color().setRGB(2.4, 3.1, 4.5),
    riceRoot: new THREE.Color('#051208'),
    riceMid: new THREE.Color('#0e2e16'),
    riceTip: new THREE.Color('#23592c'),
    riceYellow: new THREE.Color('#3b7844'),
    riceTrans: new THREE.Color('#74a8ff'),
    ambient: new THREE.Color('#1a2d42'),
    sunStrength: 0.72,
    transStrength: 0.65,
    soilColor: new THREE.Color('#050d08'),
    dikeColor: new THREE.Color('#0b1c10'),
    canopyDark: new THREE.Color('#0b2412'),
    canopyLight: new THREE.Color('#1d4726'),
    treeColor: new THREE.Color('#060d17'),
    birdColor: new THREE.Color('#070d16'),
    lanternStrength: 3.4,
    fireflyMode: 1.0,
    starStrength: 1.0,
    godRaysWeight: 0.22,
    bloomIntensity: 1.35,
  },
};

const RAIN_TINTS = {
  pagi: {
    fog: new THREE.Color('#b8c2b4'),
    skyMid: new THREE.Color('#9eaba0'),
    skyZenith: new THREE.Color('#778884'),
  },
  senja: {
    fog: new THREE.Color('#8c625e'),
    skyMid: new THREE.Color('#6e4b59'),
    skyZenith: new THREE.Color('#352c47'),
  },
  malam: {
    fog: new THREE.Color('#0c1a2c'),
    skyMid: new THREE.Color('#091322'),
    skyZenith: new THREE.Color('#030710'),
  },
};

/**
 * Smoothly transitions all scene uniforms between Pagi, Senja, and Malam modes,
 * and blends dynamic Weather (Cerah vs. Hujan Rintik) on top of any time mode.
 */
export class TimeOfDay {
  constructor(ctx) {
    this.ctx = ctx;
    this.currentName = 'pagi';
    this.weather = 'cerah';
    this.target = TIME_PRESETS.pagi;
    this._tmpFog = new THREE.Color();
    this._tmpMid = new THREE.Color();
    this._tmpZen = new THREE.Color();
  }

  setMode(name) {
    if (!TIME_PRESETS[name]) return;
    this.currentName = name;
    this.target = TIME_PRESETS[name];
  }

  setWeather(weather) {
    this.weather = weather === 'hujan' ? 'hujan' : 'cerah';
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 2.6);
    const t = this.target;
    const rainTint = RAIN_TINTS[this.currentName] || RAIN_TINTS.pagi;
    const targetRain = this.weather === 'hujan' ? 1.0 : 0.0;
    const { sky, sun, rice, ground, trees, saung, villageProps, ecosystem, birds, particles, effects } = this.ctx;

    shared.uRainStrength.value += (targetRain - shared.uRainStrength.value) * k;
    const r = shared.uRainStrength.value;

    const targetWind = 0.36 + r * 0.24;
    shared.uWindStrength.value += (targetWind - shared.uWindStrength.value) * k;

    this._tmpFog.copy(t.fogColor).lerp(rainTint.fog, r * 0.42);
    this._tmpMid.copy(t.skyMid).lerp(rainTint.skyMid, r * 0.45);
    this._tmpZen.copy(t.skyZenith).lerp(rainTint.skyZenith, r * 0.45);

    shared.uSunDir.value.lerp(t.sunDir, k).normalize();
    shared.uSunColor.value.lerp(t.sunColor, k);
    shared.uFogColor.value.lerp(this._tmpFog, k);
    const targetFogDensity = t.fogDensity * (1.0 + r * 0.32);
    shared.uFogDensity.value += (targetFogDensity - shared.uFogDensity.value) * k;

    const skyU = sky.material.uniforms;
    skyU.uMidColor.value.lerp(this._tmpMid, k);
    skyU.uZenithColor.value.lerp(this._tmpZen, k);
    skyU.uStarStrength.value += (t.starStrength - skyU.uStarStrength.value) * k;
    sun.mesh.material.color.lerp(t.sunDiscColor, k);

    const sunFactor = 1.0 - r * 0.22;
    const targetLantern = Math.max(t.lanternStrength, r * 1.45);

    const ru = rice.material.uniforms;
    ru.uRootColor.value.lerp(t.riceRoot, k);
    ru.uMidColor.value.lerp(t.riceMid, k);
    ru.uTipColor.value.lerp(t.riceTip, k);
    ru.uYellowColor.value.lerp(t.riceYellow, k);
    ru.uTransColor.value.lerp(t.riceTrans, k);
    ru.uAmbientColor.value.lerp(t.ambient, k);
    ru.uSunStrength.value += (t.sunStrength * sunFactor - ru.uSunStrength.value) * k;
    ru.uTransStrength.value += (t.transStrength * sunFactor - ru.uTransStrength.value) * k;
    ru.uLanternStrength.value += (targetLantern - ru.uLanternStrength.value) * k;

    const gu = ground.material.uniforms;
    gu.uSoilColor.value.lerp(t.soilColor, k);
    gu.uDikeColor.value.lerp(t.dikeColor, k);
    gu.uCanopyDark.value.lerp(t.canopyDark, k);
    gu.uCanopyLight.value.lerp(t.canopyLight, k);
    gu.uTransColor.value.lerp(t.riceTrans, k);
    gu.uAmbientColor.value.lerp(t.ambient, k);
    gu.uSunStrength.value += (t.sunStrength * 0.92 * sunFactor - gu.uSunStrength.value) * k;
    gu.uLanternStrength.value = ru.uLanternStrength.value;

    for (const mesh of trees.group.children) {
      mesh.material.uniforms.uColor.value.lerp(t.treeColor, k);
    }

    saung.material.uniforms.uAmbientColor.value.lerp(t.ambient, k);
    saung.material.uniforms.uSunStrength.value = ru.uSunStrength.value;
    saung.setLantern(ru.uLanternStrength.value);

    if (villageProps) {
      const vu = villageProps.material.uniforms;
      vu.uAmbientColor.value.lerp(t.ambient, k);
      vu.uSunStrength.value = ru.uSunStrength.value;
      vu.uLanternStrength.value = ru.uLanternStrength.value;

      const pnu = villageProps.panicleMaterial.uniforms;
      pnu.uGrainColorA.value.lerp(t.riceTip, k);
      pnu.uGrainColorB.value.lerp(t.riceYellow, k);
      pnu.uAmbientColor.value.lerp(t.ambient, k);
      pnu.uSunStrength.value = ru.uSunStrength.value;
      pnu.uLanternStrength.value = ru.uLanternStrength.value;
    }

    if (ecosystem) {
      const eu = ecosystem.material.uniforms;
      eu.uAmbientColor.value.lerp(t.ambient, k);
      eu.uSunStrength.value = ru.uSunStrength.value;
      eu.uLanternStrength.value = ru.uLanternStrength.value;

      const du = ecosystem.dragonflyMaterial.uniforms;
      du.uAmbientColor.value.lerp(t.ambient, k);
      du.uSunStrength.value = ru.uSunStrength.value;
      const targetDayAct = (1.0 - t.fireflyMode * 0.96) * (1.0 - r * 0.72);
      du.uDayActivity.value += (targetDayAct - du.uDayActivity.value) * k;
    }

    birds.material.uniforms.uBirdColor.value.lerp(t.birdColor, k);

    const pu = particles.material.uniforms;
    pu.uFireflyMode.value += (t.fireflyMode - pu.uFireflyMode.value) * k;

    const gm = effects.godRays.godRaysMaterial;
    gm.weight += (t.godRaysWeight * (1.0 - r * 0.35) - gm.weight) * k;
    effects.bloom.intensity += (t.bloomIntensity - effects.bloom.intensity) * k;
  }
}
