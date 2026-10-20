import * as THREE from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  KernelSize,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';

/**
 * Post-processing chain: Render → (GodRays + Bloom + Vignette + ACES tone mapping) in one merged pass.
 * Anti-aliasing is done with MSAA on the composer's HDR buffer (best for thin rice blades).
 */
export function createEffects(renderer, scene, camera, sunMesh, quality) {
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: Math.min(quality.msaa, renderer.capabilities.maxSamples),
  });

  composer.addPass(new RenderPass(scene, camera));

  const godRays = new GodRaysEffect(camera, sunMesh, {
    samples: quality.godRaySamples,
    density: 0.97,
    decay: 0.94,
    weight: 0.38,
    exposure: 0.62,
    clampMax: 1.0,
    resolutionScale: 0.5,
    kernelSize: KernelSize.SMALL,
    blur: true,
  });

  const bloom = new BloomEffect({
    intensity: 0.85,
    luminanceThreshold: 0.82,
    luminanceSmoothing: 0.35,
    mipmapBlur: true,
    radius: 0.78,
  });

  const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });

  composer.addPass(new EffectPass(camera, godRays, bloom, vignette, toneMapping));

  return { composer, godRays, bloom, vignette, toneMapping };
}
