uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform sampler2D uTrail;
uniform vec4 uTrailBounds; // minX, minZ, sizeX, sizeZ
uniform float uPushStrength;
uniform vec3 uCursor;      // live world cursor (x, y, z)
uniform vec2 uCursorVel;   // live sweep velocity
uniform float uCursorRadius;
uniform float uCursorActive;
uniform vec4 uShockwave;   // originX, originZ, radius, strength

attribute vec4 aOffset; // x, z, shade (0 = in shadow band), plot tone
attribute vec4 aShape;  // height, width, yaw, natural lean (fraction of height)
attribute vec4 aVar;    // colour variation, phase, lean direction (rad), yellow tint

varying float vT;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vShade;
varying float vColorVar;
varying float vTint;
varying float vTone;
varying float vBend;

// Fast organic multi-octave wind wave (replaces per-vertex 3D simplex noise for 5x faster vertex throughput)
float windWave(vec2 p, float t) {
  vec2 w = p * 0.11 - uWindDir * t * 1.35;
  float a = sin(w.x + sin(w.y * 0.8 + t * 0.4));
  float b = cos(w.y * 1.35 - w.x * 0.6 + t * 0.65);
  float c = sin((p.x + p.y) * 0.23 - t * 2.1);
  return (a * 0.5 + b * 0.35 + c * 0.15) * 0.5 + 0.5;
}

void main() {
  float t = position.y;           // 0 at the root .. 1 at the tip
  float h = aShape.x;
  float w = aShape.y;
  float yaw = aShape.z;
  vec2 base = aOffset.xy;

  float c = cos(yaw);
  float s = sin(yaw);
  vec3 side = vec3(c, 0.0, -s);   // blade's local +X after yaw
  vec3 face = vec3(s, 0.0, c);    // blade's local +Z (face normal)

  // ---------------------------------------------------------------- bending
  // Natural arch of the leaf
  vec2 leanDir = vec2(cos(aVar.z), sin(aVar.z));
  vec2 tip = leanDir * aShape.w;

  // Wind: large travelling gusts make visible "waves" across the paddies
  float gust01 = windWave(base, uTime);
  float flutter = sin(uTime * 2.8 + aVar.y * 6.2831 + base.x * 0.35) * 0.055;
  tip += uWindDir * (0.08 + gust01 * gust01 * 0.92) * uWindStrength;
  tip += vec2(-uWindDir.y, uWindDir.x) * flutter;

  // 1) Persistent wake from the GPU trail texture
  vec2 tuv = (base - uTrailBounds.xy) / uTrailBounds.zw;
  float inside = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);
  vec2 trailPush = texture2D(uTrail, clamp(tuv, 0.0, 1.0)).rg * inside;

  // 2) Instant, full-resolution radial parting + ripple around the live cursor
  vec2 toBlade = base - uCursor.xz;
  float dist = length(toBlade);
  float falloff = smoothstep(uCursorRadius, 0.0, dist) * uCursorActive;
  float ripple = sin(dist * (3.8 / max(uCursorRadius, 0.8)) - uTime * 7.5) * 0.18 * falloff;
  vec2 radialDir = toBlade / max(dist, 1e-3);
  vec2 directPush = (radialDir * (falloff * 1.15 + ripple) + uCursorVel * falloff * 0.65);

  // 3) Expanding circular wind shockwave when the user clicks on the field
  vec2 shockPush = vec2(0.0);
  if (uShockwave.w > 0.001) {
    vec2 sw = base - uShockwave.xy;
    float sDist = length(sw);
    float ring = exp(-pow((sDist - uShockwave.z) / 2.2, 2.0)) * uShockwave.w;
    shockPush = (sw / max(sDist, 1e-3)) * ring * 1.25;
  }

  vec2 totalPush = (trailPush * 0.85 + directPush * 0.75 + shockPush) * uPushStrength;
  tip += totalPush;
  vBend = clamp(length(totalPush), 0.0, 1.3);

  // Clamp so leaves never fold through the ground
  float tl = length(tip);
  tip *= min(tl, 0.94) / max(tl, 1e-4);
  tl = length(tip);

  // Quadratic bend: root fixed, tip moves the most. Lower the blade so its length is roughly kept.
  float k = t * t;
  vec2 disp = tip * k * h;
  float drop = (1.0 - sqrt(max(1.0 - tl * tl, 0.0))) * t * k * h;

  // ---------------------------------------------------------------- position
  // Slight terrace slope: distant paddies sit marginally higher so rows step cleanly
  float terraceY = max(-base.y, 0.0) * 0.008;
  vec3 local = side * (position.x * w) + vec3(0.0, t * h, 0.0);
  vec3 world = vec3(base.x, terraceY, base.y) + local + vec3(disp.x, -drop, disp.y);

  // Approximate normal: face normal rounded across the blade width, tilted upward as it bends
  vec3 n = normalize(face + side * position.x * 1.6 + vec3(0.0, 0.35 + tl * t * 1.4, 0.0));

  vT = t;
  vNormal = n;
  vWorldPos = world;
  vShade = aOffset.z;
  vColorVar = aVar.x;
  vTint = aVar.w;
  vTone = aOffset.w;

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
