// #include atmosphere (prepended in JS)
uniform vec3 uRootColor;
uniform vec3 uMidColor;
uniform vec3 uTipColor;
uniform vec3 uYellowColor;
uniform vec3 uTransColor;
uniform vec3 uAmbientColor;
uniform float uSunStrength;
uniform float uTransStrength;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLanternStrength;

varying float vT;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vShade;
varying float vColorVar;
varying float vTint;
varying float vTone;
varying float vBend;

void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = vec3(-n.x, n.y, -n.z);

  vec3 toFrag = vWorldPos - cameraPosition;
  vec3 V = normalize(toFrag);

  // Horizontal sun alignment: left side of the field faces the low morning sun
  float sunAlign = clamp(dot(normalize(vec2(V.x, V.z)), normalize(uSunDir.xz)) * 0.5 + 0.5, 0.0, 1.0);
  float sunBeam = pow(sunAlign, 2.2);

  // ------------------------------------------------------------ albedo
  vec3 col = mix(uRootColor, uMidColor, smoothstep(0.0, 0.48, vT));
  col = mix(col, uTipColor, smoothstep(0.38, 1.0, vT));
  // Golden-chartreuse tips stronger on the sunlit left side, deeper green on the right
  float goldMix = (vTint * 0.45 + sunBeam * 0.55) * smoothstep(0.45, 1.0, vT);
  col = mix(col, uYellowColor, goldMix * 0.72);
  col *= 0.78 + vColorVar * 0.36;
  col *= 0.84 + vTone * 0.30;

  // ------------------------------------------------------------ lighting
  // Paddy shadow bands & dikes create the distinct horizontal stripes from the photo
  float rowShadow = mix(0.24, 1.0, vShade);
  float ao = mix(0.20, 1.0, smoothstep(0.0, 0.78, vT));

  float wrap = clamp(dot(n, uSunDir) * 0.55 + 0.45, 0.0, 1.0);
  vec3 light = uAmbientColor * (0.42 + 0.38 * n.y) * ao * mix(0.55, 1.0, vShade);
  light += uSunColor * wrap * uSunStrength * rowShadow * ao * (0.65 + 0.55 * sunBeam);

  // Warm glow from the Saung's hanging lantern at sunset / night
  if (uLanternStrength > 0.01) {
    vec3 toL = uLanternPos - vWorldPos;
    float lDist = length(toL);
    float lAtten = 1.0 / (1.0 + lDist * lDist * 0.065);
    light += uLanternColor * lAtten * uLanternStrength * (0.4 + 0.6 * vT);
  }

  // Backlit translucency – leaves glow warm gold when looking toward the sun or when bent by cursor/shockwave
  float back = pow(max(dot(V, uSunDir), 0.0), 2.6);
  float bendSheen = smoothstep(0.08, 0.85, vBend) * smoothstep(0.25, 1.0, vT);
  vec3 trans = uTransColor * (back * 1.15 + bendSheen * 0.65) * smoothstep(0.22, 1.0, vT) * rowShadow * uTransStrength;

  vec3 outCol = col * light + trans * col * 2.1;

  outCol = applyFog(outCol, vWorldPos);
  gl_FragColor = vec4(outCol, 1.0);
  #include <colorspace_fragment>
}
