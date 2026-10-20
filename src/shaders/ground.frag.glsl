// #include noise, atmosphere (prepended in JS)
// DIKE_COUNT, PLOT_SIZE are injected as defines
uniform float uTime;
uniform float uRainStrength;
uniform float uDikeBase[DIKE_COUNT];
uniform float uPlotTone[DIKE_COUNT];
uniform float uDikeHalf;
uniform float uShadowLen;
uniform float uFieldEnd;

uniform vec3 uSoilColor;
uniform vec3 uDikeColor;
uniform vec3 uCanopyDark;
uniform vec3 uCanopyLight;
uniform vec3 uTransColor;
uniform vec3 uAmbientColor;
uniform float uSunStrength;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLanternStrength;

varying vec3 vWorldPos;

// Must match fieldLayout.js → dikeAt()
float dikeAt(int k, float x) {
  return uDikeBase[k] + sin(x * 0.03 + float(k) * 1.9) * 0.45;
}

float fieldHalfWidth(float u) {
  return 3.2 + 1.15 * max(u, 0.0);
}

// Expanding concentric raindrop ripple rings on flooded paddy water
vec3 rainRipples(vec2 xz, float time) {
  vec2 grad = vec2(0.0);
  float ringCrest = 0.0;
  for (int layer = 0; layer < 2; layer++) {
    float scale = layer == 0 ? 2.6 : 3.9;
    vec2 uv = xz * scale + float(layer) * vec2(17.3, 11.7);
    vec2 cell = floor(uv);
    vec2 f = fract(uv);
    vec2 center = 0.22 + 0.56 * vec2(hash12(cell), hash12(cell + vec2(5.2, 1.3)));
    float phase = fract(time * (1.15 + 0.25 * float(layer)) + hash12(cell + vec2(9.1, 4.7)));
    vec2 d = f - center;
    float r = length(d);
    float rad = phase * 0.55;
    float env = exp(-abs(r - rad) * 15.0) * (1.0 - phase) * smoothstep(0.015, 0.07, r);
    float w = sin((r - rad) * 44.0) * env;
    grad += (d / max(r, 1e-3)) * w;
    ringCrest += max(w, 0.0);
  }
  return vec3(grad, ringCrest);
}

void main() {
  float x = vWorldPos.x;
  float u = -vWorldPos.z;

  // ------------------------------------------------------------ paddy lookup
  int k = 0;
  for (int i = 0; i < DIKE_COUNT - 2; i++) {
    if (u >= dikeAt(i + 1, x)) k = i + 1;
  }

  float dNear = u - dikeAt(k, x);
  float dFar = dikeAt(k + 1, x) - u;
  float tone = uPlotTone[k];

  // Anti-aliasing: far away, stripes become sub-pixel → fade to their average
  float fw = max(fwidth(u), 1e-4);
  float detail = 1.0 - smoothstep(0.35, 2.2, fw);

  float dEdge = min(dNear, dFar);
  float dike = 1.0 - smoothstep(uDikeHalf - fw, uDikeHalf + fw, dEdge);
  dike = mix(0.08, dike, detail);

  float shade = min(smoothstep(0.0, uShadowLen, dFar), smoothstep(0.0, 1.4, dNear + 0.25));
  shade = mix(0.75, shade, detail);
  tone = mix(0.5, tone, detail);

  // ------------------------------------------------------------ canopy vs. soil & water
  float canopy = max(smoothstep(uFieldEnd - 22.0, uFieldEnd - 4.0, u),
                     smoothstep(-1.0, 3.0, abs(x) - fieldHalfWidth(u)));

  float n = snoise(vec3(vWorldPos.xz * vec2(0.08, 0.16), 0.0)) * 0.5 + 0.5;
  float n2 = hash12(floor(vWorldPos.xz * 6.0));
  float variation = mix(0.5, n, detail) * 0.6 + mix(0.5, n2, detail * detail) * 0.4;

  // Flooded paddy water mask (puddles + flooded channels along paddy bunds)
  float channel = smoothstep(0.38, 0.65, dNear) * (1.0 - smoothstep(1.15, 1.55, dNear))
                * smoothstep(0.1, 0.85, sin(x * 0.35 + u * 0.2));
  float dLeft = length(vec2((x + 3.8) * 0.7, (u - 9.2) * 1.3));
  float dRight = length(vec2((x - 6.8) * 0.75, (u - 16.5) * 1.3));
  float puddle = max(1.0 - smoothstep(1.2, 2.7, dLeft), 1.0 - smoothstep(1.3, 2.9, dRight));
  float rainWet = uRainStrength * 0.24;
  float waterMask = clamp((channel * 0.85 + puddle + 0.35 + rainWet) * (1.0 - dike * (1.0 - uRainStrength * 0.35)) * (1.0 - canopy), 0.0, 1.0);

  vec3 canopyCol = mix(uCanopyDark, uCanopyLight, clamp(shade * 0.72 + tone * 0.22 + variation * 0.2 - 0.1, 0.0, 1.0));
  vec3 soilCol = uSoilColor * (0.7 + variation * 0.5);
  vec3 albedo = mix(soilCol, canopyCol, canopy);
  albedo = mix(albedo, uDikeColor * (0.75 + variation * 0.35), dike);

  // ------------------------------------------------------------ lighting & water shimmer
  vec3 V = normalize(vWorldPos - cameraPosition);
  float lit = mix(0.22, 1.0, shade) * mix(0.5, 1.0, canopy);
  vec3 light = uAmbientColor * mix(0.4, 0.9, canopy) + uSunColor * uSunStrength * lit * mix(0.25, 1.0, canopy);

  if (uLanternStrength > 0.01) {
    vec3 toL = uLanternPos - vWorldPos;
    float lDist = length(toL);
    light += uLanternColor * (uLanternStrength / (1.0 + lDist * lDist * 0.08));
  }

  float back = pow(max(dot(V, uSunDir), 0.0), 3.0);
  vec3 col = albedo * light + albedo * uTransColor * back * lit * canopy * (1.0 - dike) * 1.4;

  // Rippled water surface reflection in flooded paddy soil
  if (waterMask > 0.01) {
    float ripple1 = snoise(vec3(vWorldPos.xz * vec2(2.2, 4.5) - vec2(uTime * 0.85, uTime * 0.45), uTime * 0.4));
    float ripple2 = snoise(vec3(vWorldPos.xz * vec2(5.5, 9.0) + vec2(uTime * 1.1, -uTime * 0.7), uTime * 0.6));
    vec2 nPerturb = vec2((ripple1 + ripple2 * 0.5) * 0.14, (ripple1 - ripple2 * 0.5) * 0.18);
    float ringHighlight = 0.0;
    if (uRainStrength > 0.01 && u < 45.0) {
      vec3 rr = rainRipples(vWorldPos.xz, uTime) * (1.0 - smoothstep(22.0, 45.0, u)) * uRainStrength;
      nPerturb += rr.xy * 0.32;
      ringHighlight = rr.z * 0.26;
    }
    vec3 wn = normalize(vec3(nPerturb.x, 1.0, nPerturb.y));
    vec3 R = reflect(V, wn);
    float fresnel = 0.25 + 0.75 * pow(1.0 - max(dot(-V, wn), 0.0), 3.0);
    vec3 skyRefl = fogTint(vec3(R.x, abs(R.y), R.z)) * 0.88;
    float sunGlint = pow(max(dot(R, uSunDir), 0.0), 42.0) * 2.8 + pow(max(dot(R, uSunDir), 0.0), 8.0) * 0.55;
    vec3 waterCol = skyRefl * fresnel + uSunColor * sunGlint * uSunStrength + (skyRefl + uSunColor * 0.4) * ringHighlight;
    col = mix(col, waterCol, waterMask * (0.78 + uRainStrength * 0.12));
  }

  col = applyFog(col, vWorldPos);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
