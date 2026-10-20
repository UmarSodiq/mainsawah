// ---------------------------------------------------------------------------
// Shared atmosphere: sun-tinted exponential fog used by every custom material
// so that sky, ground, rice, trees and mist blend seamlessly.
// Requires: cameraPosition (provided by three.js ShaderMaterial)
// ---------------------------------------------------------------------------
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform float uFogDensity;

// Colour of the haze when looking along direction `v` (brighter toward the sun).
vec3 fogTint(vec3 v) {
  float s = max(dot(v, uSunDir), 0.0);
  return mix(uFogColor, uSunColor, pow(s, 5.0) * 0.9);
}

float fogAmount(float dist) {
  return 1.0 - exp(-dist * uFogDensity);
}

vec3 applyFog(vec3 col, vec3 worldPos) {
  vec3 d = worldPos - cameraPosition;
  float dist = length(d);
  vec3 v = d / max(dist, 1e-4);
  return mix(col, fogTint(v), clamp(fogAmount(dist), 0.0, 1.0));
}
