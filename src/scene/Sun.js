import * as THREE from 'three';
import { sunDirection } from './shared.js';

const SUN_DISTANCE = 1200;

/**
 * Emissive sun disc (also the light source for the god-rays effect)
 * plus a warm directional + hemisphere light for any standard materials.
 */
export class Sun {
  constructor() {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(5.0, 4.4, 3.4),
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(38, 48), material);
    this.mesh.position.copy(sunDirection).multiplyScalar(SUN_DISTANCE);
    this.mesh.lookAt(0, 0, 0);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -5;
    this.mesh.name = 'Sun';

    this.light = new THREE.DirectionalLight('#ffd9a0', 2.2);
    this.light.position.copy(sunDirection).multiplyScalar(100);
    this.hemi = new THREE.HemisphereLight('#f6e2b8', '#2f4416', 0.9);

    this.group = new THREE.Group();
    this.group.add(this.mesh, this.light, this.hemi);
  }

  /** Keep the disc at a fixed angular position relative to the (slightly moving) camera. */
  update(camera) {
    this.mesh.position.copy(sunDirection).multiplyScalar(SUN_DISTANCE).add(camera.position);
    this.mesh.lookAt(camera.position);
  }
}
