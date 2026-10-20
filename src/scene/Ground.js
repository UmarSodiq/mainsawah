import * as THREE from 'three';
import noise from '../shaders/noise.glsl?raw';
import atmosphere from '../shaders/atmosphere.glsl?raw';
import vert from '../shaders/ground.vert.glsl?raw';
import frag from '../shaders/ground.frag.glsl?raw';
import { atmosphereUniforms, shared } from './shared.js';
import { DIKE_COUNT, DIKE_HALF_WIDTH, PLOT_SIZE, SHADOW_LENGTH } from './fieldLayout.js';

export class Ground {
  /** @param {ReturnType<import('./fieldLayout.js').createFieldLayout>} layout */
  constructor(layout, { fieldEnd = 78, lanternPos } = {}) {
    this.material = new THREE.ShaderMaterial({
      defines: {
        DIKE_COUNT,
        PLOT_SIZE: PLOT_SIZE.toFixed(1),
      },
      uniforms: {
        ...atmosphereUniforms(),
        uTime: shared.uTime,
        uRainStrength: shared.uRainStrength,
        uDikeBase: { value: Array.from(layout.dikeBase) },
        uPlotTone: { value: Array.from(layout.plotTone) },
        uDikeHalf: { value: DIKE_HALF_WIDTH },
        uShadowLen: { value: SHADOW_LENGTH },
        uFieldEnd: { value: fieldEnd },
        uSoilColor: { value: new THREE.Color('#142407') },
        uDikeColor: { value: new THREE.Color('#27420d') },
        uCanopyDark: { value: new THREE.Color('#345e0e') },
        uCanopyLight: { value: new THREE.Color('#95c82b') },
        uTransColor: { value: new THREE.Color('#ffe46b') },
        uAmbientColor: { value: new THREE.Color('#7f8c54') },
        uSunStrength: { value: 1.25 },
        uLanternPos: { value: lanternPos || new THREE.Vector3(10.8, 2, -22) },
        uLanternColor: { value: new THREE.Color('#ffaa3b') },
        uLanternStrength: { value: 0.0 },
      },
      vertexShader: vert,
      fragmentShader: noise + atmosphere + frag,
    });

    const geometry = new THREE.PlaneGeometry(1800, 1800, 1, 64);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.set(0, 0, -700);
    this.mesh.name = 'Ground';
  }
}
