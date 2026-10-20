/** Quality presets. All desktop tiers keep a lush, full blade count so the field always looks dense. */
export const QUALITY_PRESETS = {
  high: { name: 'high', blades: 200000, segments: 5, dpr: 1.5, msaa: 2, godRaySamples: 48, fogSheets: 5, particles: 1500, treeTex: 4096 },
  medium: { name: 'medium', blades: 185000, segments: 4, dpr: 1.25, msaa: 2, godRaySamples: 38, fogSheets: 4, particles: 1200, treeTex: 4096 },
  low: { name: 'low', blades: 120000, segments: 3, dpr: 1.0, msaa: 0, godRaySamples: 28, fogSheets: 3, particles: 700, treeTex: 2048 },
};

function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    return '';
  }
}

/**
 * Choose a fixed quality tier once at startup (no mid-session canvas resize or blade thinning).
 * Can be overridden with `?q=low|medium|high`.
 * @param {import('three').WebGLRenderer} renderer
 */
export function detectQuality(renderer) {
  const params = new URLSearchParams(location.search);
  const forced = params.get('q');
  if (forced && QUALITY_PRESETS[forced]) return { ...QUALITY_PRESETS[forced], forced: true };

  const ua = navigator.userAgent;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (coarse && navigator.maxTouchPoints > 1);
  const gpu = gpuName(renderer).toLowerCase();

  if (isMobile) return { ...QUALITY_PRESETS.low, gpu };
  if (/intel|uhd|iris|mali|adreno|powervr|apple gpu/.test(gpu)) return { ...QUALITY_PRESETS.medium, gpu };
  return { ...QUALITY_PRESETS.high, gpu };
}
