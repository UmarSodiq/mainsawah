import * as THREE from 'three';
import atmosphere from '../shaders/atmosphere.glsl?raw';
import vert from '../shaders/sky.vert.glsl?raw';
import frag from '../shaders/sky.frag.glsl?raw';
import { atmosphereUniforms, shared } from './shared.js';

export class Sky {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...atmosphereUniforms(),
        uTime: shared.uTime,
        uRainStrength: shared.uRainStrength,
        uMidColor: { value: new THREE.Color('#ecca93') },
        uZenithColor: { value: new THREE.Color('#d7b78d') },
        uSunIntensity: { value: 9.0 },
        uStarStrength: { value: 0.0 },
      },
      vertexShader: vert,
      fragmentShader: atmosphere + frag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), this.material);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'Sky';
  }

  update(camera) {
    this.mesh.position.copy(camera.position);
  }
}
