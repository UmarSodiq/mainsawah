import * as THREE from 'three';

const HIT_HEIGHT = 0.55; // raycast against mid-canopy height, not the soil

/**
 * Tracks the mouse / touch pointer:
 *  - `ndc`        normalised device coords (-1..1), smoothed, for camera parallax
 *  - `world`      smoothed hit point on the rice canopy plane
 *  - `sweep`      normalised sweep velocity (for the trail "brush" effect)
 *  - `radius`     influence radius in metres (grows with distance so it feels constant on screen)
 *  - `active`     0..1 fade of the interaction
 *  - `shockwave`  vec4(originX, originZ, currentRadius, strength) triggered on click
 */
export class Pointer {
  constructor(dom, { onFieldClick } = {}) {
    this.dom = dom;
    this.onFieldClick = onFieldClick;
    this.rawNdc = new THREE.Vector2(0, 0);
    this.ndc = new THREE.Vector2(0, 0);
    this.world = new THREE.Vector3(0, HIT_HEIGHT, -1000);
    this.sweep = new THREE.Vector2();
    this.radius = 2.0;
    this.active = 0;

    // Expanding radial wind wave on click: (x, z, radius, strength)
    this.shockwave = new THREE.Vector4(0, -1000, 0, 0);
    this._waveAge = 99;

    this.inside = false;
    this.hasMoved = false;
    this.idleTime = 0;
    this._pendingClick = false;

    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0.008).normalize(), -HIT_HEIGHT);
    this._hit = new THREE.Vector3();
    this._prevWorld = new THREE.Vector3();
    this._vel = new THREE.Vector2();
    this._tmp = new THREE.Vector2();

    this._onMove = this._onMove.bind(this);
    this._onDown = this._onDown.bind(this);
    this._onLeave = this._onLeave.bind(this);
    window.addEventListener('pointermove', this._onMove, { passive: true });
    dom.addEventListener('pointerdown', this._onDown, { passive: true });
    dom.addEventListener('pointerleave', this._onLeave);
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') this._onLeave();
    });
    document.addEventListener('mouseleave', this._onLeave);
    window.addEventListener('blur', this._onLeave);
  }

  _onMove(e) {
    const rect = this.dom.getBoundingClientRect();
    this.rawNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.inside = true;
    this.hasMoved = true;
    this.idleTime = 0;
  }

  _onDown(e) {
    this._onMove(e);
    this._pendingClick = true;
  }

  _onLeave() {
    this.inside = false;
  }

  /** Trigger a radial wind shockwave at (x, z). */
  triggerShockwave(x, z) {
    this.shockwave.set(x, z, 0.1, 1.0);
    this._waveAge = 0;
  }

  /** @param {THREE.PerspectiveCamera} camera */
  update(camera, dt) {
    dt = Math.min(dt, 0.1);
    this.idleTime += dt;

    // Smoothed NDC for parallax
    const kNdc = 1 - Math.exp(-dt * 6);
    this.ndc.lerp(this.rawNdc, kNdc);

    // Raycast the canopy plane using the *raw* pointer for a responsive brush
    this._raycaster.setFromCamera(this.rawNdc, camera);
    const ray = this._raycaster.ray;
    let targetActive = 0;
    let hitOk = false;
    if (this.inside && this.hasMoved && ray.direction.y < -0.004 && ray.intersectPlane(this._plane, this._hit)) {
      const dist = this._hit.distanceTo(camera.position);
      if (dist < 90) {
        hitOk = true;
        targetActive = 1 - THREE.MathUtils.smoothstep(dist, 58, 90);
      }
    }

    if (hitOk) {
      if (this.active < 0.02) {
        this.world.copy(this._hit);
        this._prevWorld.copy(this._hit);
        this._vel.set(0, 0);
      } else {
        this.world.lerp(this._hit, 1 - Math.exp(-dt * 22));
      }
      const dist = this.world.distanceTo(camera.position);
      this.radius = 1.35 + dist * 0.088;

      if (this._pendingClick) {
        this._pendingClick = false;
        this.triggerShockwave(this._hit.x, this._hit.z);
        if (this.onFieldClick) this.onFieldClick(this._hit);
      }
    } else {
      this._pendingClick = false;
    }

    // Advance expanding shockwave ring
    if (this._waveAge < 2.2) {
      this._waveAge += dt;
      const duration = 1.75;
      const p = Math.min(this._waveAge / duration, 1);
      this.shockwave.z = p * 26.0; // expands up to 26 m radius
      this.shockwave.w = Math.pow(1 - p, 1.5);
    } else {
      this.shockwave.w = 0;
    }

    // Fade activity in quickly, out slowly
    const rate = targetActive > this.active ? 12 : 2.5;
    this.active += (targetActive - this.active) * (1 - Math.exp(-dt * rate));

    // Sweep velocity (world units / s) normalised by radius
    if (dt > 0) {
      const vx = (this.world.x - this._prevWorld.x) / dt;
      const vz = (this.world.z - this._prevWorld.z) / dt;
      this._vel.lerp(this._tmp.set(vx, vz), 1 - Math.exp(-dt * 14));
    }
    this._prevWorld.copy(this.world);
    this.sweep.copy(this._vel).multiplyScalar(0.11 / this.radius);
    if (this.sweep.length() > 1.3) this.sweep.setLength(1.3);
  }
}
