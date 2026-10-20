import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import atmosphere from '../shaders/atmosphere.glsl?raw';
import { atmosphereUniforms, shared } from './shared.js';

const vert = /* glsl */ `
attribute vec3 aColor;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vColor = aColor;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
uniform vec3 uAmbientColor;
uniform float uSunStrength;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLanternStrength;

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vec3 n = normalize(vNormal);
  float wrap = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  vec3 light = uAmbientColor * (0.45 + 0.55 * max(n.y, 0.0)) + uSunColor * wrap * uSunStrength;

  // Warm hanging lantern light (active at dusk / night)
  vec3 toLantern = uLanternPos - vWorldPos;
  float lDist = length(toLantern);
  vec3 lDir = toLantern / max(lDist, 1e-3);
  float lAtten = 1.0 / (1.0 + lDist * lDist * 0.35);
  float lDiff = clamp(dot(n, lDir) * 0.6 + 0.4, 0.0, 1.0);
  light += uLanternColor * lAtten * lDiff * uLanternStrength;

  vec3 col = vColor * light;
  col = applyFog(col, vWorldPos);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function paintGeometry(geom, hexColor) {
  const g = geom.index ? geom.toNonIndexed() : geom.clone();
  const count = g.attributes.position.count;
  const col = new THREE.Color(hexColor);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * Traditional Indonesian bamboo paddy hut (Saung Sawah) with thatched roof
 * and a hanging lantern that lights up in Senja / Malam modes.
 */
export class Saung {
  constructor(layout) {
    // Place the saung on the 4th dike bund on the right-center of the field
    const x = 10.8;
    const u = layout.dikeAt(3, x); // ~22 m in front of the camera
    const baseY = u * 0.008;
    this.position = new THREE.Vector3(x, baseY, -u);

    const parts = [];
    const bambooDark = '#3a2d18';
    const bambooMid = '#584424';
    const thatchMain = '#49381d';
    const thatchEdge = '#634d28';

    // 4 main corner bamboo stilts
    const postCoords = [
      [-1.15, -0.95],
      [1.15, -0.95],
      [-1.15, 0.95],
      [1.15, 0.95],
    ];
    for (const [px, pz] of postCoords) {
      const post = new THREE.CylinderGeometry(0.065, 0.075, 2.35, 8);
      post.translate(px, 1.1, pz);
      parts.push(paintGeometry(post, bambooDark));
    }

    // Raised sitting platform (bale-bale)
    const deck = new THREE.BoxGeometry(2.55, 0.12, 2.15);
    deck.translate(0, 0.72, 0);
    parts.push(paintGeometry(deck, bambooMid));

    // Back & side low bamboo railings
    const backRail = new THREE.BoxGeometry(2.4, 0.06, 0.06);
    backRail.translate(0, 1.08, -0.95);
    parts.push(paintGeometry(backRail, bambooMid));

    for (const sx of [-1.15, 1.15]) {
      const sideRail = new THREE.BoxGeometry(0.06, 0.06, 1.9);
      sideRail.translate(sx, 1.08, 0);
      parts.push(paintGeometry(sideRail, bambooMid));
    }

    // Small bamboo steps at the front-left
    for (let s = 0; s < 3; s++) {
      const rung = new THREE.BoxGeometry(0.55, 0.045, 0.08);
      rung.translate(-0.55, 0.2 + s * 0.2, 1.02 + (2 - s) * 0.12);
      parts.push(paintGeometry(rung, bambooMid));
    }

    // Pitched thatched roof (atap ijuk/rumbia) — two sloped slabs + ridge cap
    const slopeAngle = 0.52;
    const roofW = 3.25;
    const slopeLen = 1.65;

    const frontSlope = new THREE.BoxGeometry(roofW, 0.11, slopeLen);
    frontSlope.rotateX(slopeAngle);
    frontSlope.translate(0, 2.55, 0.66);
    parts.push(paintGeometry(frontSlope, thatchMain));

    const backSlope = new THREE.BoxGeometry(roofW, 0.11, slopeLen);
    backSlope.rotateX(-slopeAngle);
    backSlope.translate(0, 2.55, -0.66);
    parts.push(paintGeometry(backSlope, thatchMain));

    const ridge = new THREE.BoxGeometry(roofW + 0.18, 0.14, 0.26);
    ridge.translate(0, 2.95, 0);
    parts.push(paintGeometry(ridge, thatchEdge));

    // Gable crossbeams
    for (const gz of [-0.95, 0.95]) {
      const beam = new THREE.BoxGeometry(2.5, 0.07, 0.07);
      beam.translate(0, 2.22, gz);
      parts.push(paintGeometry(beam, bambooDark));
    }

    // Hanging lantern cord & woven cap near the horizon-facing eaves
    const cord = new THREE.CylinderGeometry(0.01, 0.01, 0.42, 6);
    cord.translate(-0.48, 2.08, -0.52);
    parts.push(paintGeometry(cord, bambooDark));

    const cap = new THREE.ConeGeometry(0.15, 0.09, 8);
    cap.translate(-0.48, 1.91, -0.52);
    parts.push(paintGeometry(cap, thatchEdge));

    const merged = mergeGeometries(parts, false);

    // Slight rotation so the saung faces slightly toward the sunrise
    const yaw = -0.28;
    const yAxis = new THREE.Vector3(0, 1, 0);
    const lanternLocal = new THREE.Vector3(-0.48, 1.82, -0.52).applyAxisAngle(yAxis, yaw);
    this.lanternWorldPos = this.position.clone().add(lanternLocal);

    // Camera viewpoint when sitting on the Saung bale-bale terrace looking out over the field
    const camLocal = new THREE.Vector3(0.24, 1.48, 0.65).applyAxisAngle(yAxis, yaw);
    this.terraceCamPos = this.position.clone().add(camLocal);
    this.terraceLookAt = new THREE.Vector3(-8.5, 1.85, -105);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...atmosphereUniforms(),
        uAmbientColor: { value: new THREE.Color('#7f8c54') },
        uSunStrength: { value: 1.25 },
        uLanternPos: { value: this.lanternWorldPos },
        uLanternColor: { value: new THREE.Color('#ffaa3b') },
        uLanternStrength: { value: 0.0 },
      },
      vertexShader: vert,
      fragmentShader: atmosphere + frag,
    });

    this.mesh = new THREE.Mesh(merged, this.material);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = yaw;
    this.mesh.name = 'Saung';

    // Hanging lantern bulb mesh (glows with bloom at dusk & night)
    this.lanternMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#2a2015'),
      toneMapped: false,
    });
    this.lanternMesh = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), this.lanternMat);
    this.lanternMesh.position.copy(this.lanternWorldPos);

    this.group = new THREE.Group();
    this.group.add(this.mesh, this.lanternMesh);
  }

  /** @param {number} lanternIntensity 0 in morning, ~1.2 at sunset, ~2.8 at night */
  setLantern(lanternIntensity) {
    this.material.uniforms.uLanternStrength.value = lanternIntensity;
    if (lanternIntensity > 0.05) {
      this.lanternMat.color.setRGB(2.4 * lanternIntensity, 1.5 * lanternIntensity, 0.45 * lanternIntensity);
    } else {
      this.lanternMat.color.set('#332618');
    }
  }
}
