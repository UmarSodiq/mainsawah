// #include atmosphere (prepended in JS)
uniform vec3 uMidColor;
uniform vec3 uZenithColor;
uniform float uSunIntensity;
uniform float uStarStrength;
uniform float uRainStrength;
uniform float uTime;

varying vec3 vDir;

float starHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 starLayer(vec2 uv, float scale, float density, float time) {
  vec2 gv = uv * scale;
  vec2 id = floor(gv);
  vec2 f = fract(gv);
  float rnd = starHash(id);
  if (rnd < 1.0 - density) return vec3(0.0);

  vec2 center = 0.2 + 0.6 * vec2(fract(rnd * 17.3), fract(rnd * 31.7));
  float d = length(f - center);
  float radius = 0.085 + 0.045 * fract(rnd * 43.1);
  float core = smoothstep(radius, 0.0, d);
  core *= core;

  float speed = 1.8 + fract(rnd * 11.3) * 3.6;
  float twinkle = 0.48 + 0.52 * sin(time * speed + rnd * 62.83);
  vec3 tint = mix(vec3(1.0, 0.9, 0.76), vec3(0.76, 0.88, 1.0), fract(rnd * 53.9));
  float bright = (0.7 + 1.9 * pow(fract(rnd * 71.2), 2.0)) * twinkle;
  return tint * core * bright;
}

vec3 shootingStar(vec2 skyUv, float time) {
  float period = 4.2;
  float cycle = floor(time / period);
  float phase = fract(time / period);
  // Active window during each cycle
  float activeWin = 0.42;
  if (phase > activeWin) return vec3(0.0);

  float p = phase / activeWin; // 0..1 along meteor flight
  float r1 = starHash(vec2(cycle, 13.7));
  float r2 = starHash(vec2(cycle, 29.3));

  // Place trajectory in the forward sky dome (-Z) above the mountain horizon
  vec2 start = vec2(-0.05 + (r1 - 0.5) * 0.45, -0.58 - r2 * 0.22);
  float angle = -2.45 + (r1 - 0.5) * 0.35;
  vec2 dir = vec2(cos(angle), sin(angle));

  float travel = 0.38;
  float tailLen = 0.13;
  vec2 head = start + dir * (p * travel);
  vec2 tail = head - dir * tailLen;

  vec2 seg = skyUv - tail;
  float proj = clamp(dot(seg, dir) / tailLen, 0.0, 1.0);
  float perp = length(seg - dir * (proj * tailLen));

  float line = smoothstep(0.0042, 0.0, perp) * pow(proj, 2.4);
  float headGlow = smoothstep(0.016, 0.0, length(skyUv - head)) * 1.4;
  float env = sin(p * 3.14159265);
  return vec3(2.2, 2.6, 3.4) * (line + headGlow) * env;
}

void main() {
  vec3 v = normalize(vDir);
  float h = v.y;
  float hp = max(h, 0.0);

  // Horizon uses exactly the fog tint so fogged geometry melts into the sky.
  vec3 horizon = fogTint(v);
  vec3 col = mix(horizon, uMidColor, smoothstep(0.0, 0.32, hp));
  col = mix(col, uZenithColor, smoothstep(0.25, 0.95, hp));

  // Sun / Moon glow – several lobes from a very wide warm wash to a tight halo.
  float s = max(dot(v, uSunDir), 0.0);
  col += uSunColor * (pow(s, 3.0) * 0.22 + pow(s, 18.0) * 0.55 + pow(s, 160.0) * 1.4 + pow(s, 1200.0) * 3.0);

  // Sun / Moon disc (HDR, picked up by bloom)
  col += vec3(1.0, 0.96, 0.86) * smoothstep(0.99945, 0.99975, s) * uSunIntensity;

  // Twinkling night stars & periodic shooting star (fades smoothly during rain overcast)
  float starVis = uStarStrength * (1.0 - uRainStrength * 0.82) * smoothstep(0.06, 0.24, h) * (1.0 - smoothstep(0.92, 0.996, s));
  if (starVis > 0.005) {
    // Conformal stereographic projection of upper hemisphere
    vec2 skyUv = v.xz / (1.0 + hp);
    vec3 stars = starLayer(skyUv, 62.0, 0.22, uTime) * 1.45
               + starLayer(skyUv + vec2(3.7, 8.1), 115.0, 0.28, uTime * 0.85) * 0.85;
    vec3 meteor = shootingStar(skyUv, uTime);
    col += (stars + meteor) * starVis;
  }

  // Very faint high haze streaks for life
  float streak = sin(v.x * 9.0 + v.y * 40.0 + uTime * 0.01) * 0.5 + 0.5;
  col *= 1.0 - 0.025 * streak * smoothstep(0.05, 0.4, hp);

  // Below the horizon: pure haze (normally hidden by the ground)
  col = mix(horizon, col, smoothstep(-0.03, 0.01, h));

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
