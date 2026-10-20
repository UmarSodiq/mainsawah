import { shared } from '../scene/shared.js';

/**
 * Live tweak panel – only loaded when the URL contains `#debug`.
 * @param {object} ctx  references to scene parts
 */
export async function setupDebug(ctx) {
  const { default: GUI } = await import('lil-gui');
  const gui = new GUI({ title: 'Sawah Pagi — debug' });

  const info = { tier: ctx.getTier(), blades: 0, fps: 0 };
  const infoFolder = gui.addFolder('Info');
  infoFolder.add(info, 'tier').listen().disable();
  infoFolder.add(info, 'blades').listen().disable();
  infoFolder.add(info, 'fps').listen().disable();

  const wind = gui.addFolder('Angin');
  wind.add(shared.uWindStrength, 'value', 0, 1.2, 0.01).name('kekuatan');
  const windAngle = { deg: (Math.atan2(shared.uWindDir.value.y, shared.uWindDir.value.x) * 180) / Math.PI };
  wind
    .add(windAngle, 'deg', -180, 180, 1)
    .name('arah (°)')
    .onChange((d) => shared.uWindDir.value.set(Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)));

  const rice = gui.addFolder('Padi & kursor');
  const ru = ctx.rice.material.uniforms;
  rice.add(ru.uPushStrength, 'value', 0, 2, 0.01).name('dorongan kursor');
  rice.add(ctx.trail.material.uniforms.uRecover, 'value', 0.2, 5, 0.05).name('kecepatan tegak');
  rice.add(ru.uSunStrength, 'value', 0, 3, 0.01).name('cahaya matahari');
  rice.add(ru.uTransStrength, 'value', 0, 3, 0.01).name('tembus cahaya');
  rice.addColor(ru.uTipColor, 'value').name('warna ujung');
  rice.addColor(ru.uMidColor, 'value').name('warna tengah');

  const atmo = gui.addFolder('Atmosfer');
  atmo.add(shared.uFogDensity, 'value', 0, 0.015, 0.0001).name('kabut');
  atmo.addColor(shared.uFogColor, 'value').name('warna kabut');
  atmo.addColor(shared.uSunColor, 'value').name('warna matahari');

  const fx = gui.addFolder('Efek');
  const gm = ctx.effects.godRays.godRaysMaterial;
  fx.add(gm, 'weight', 0, 1, 0.01).name('god rays weight');
  fx.add(gm, 'exposure', 0, 1.5, 0.01).name('god rays exposure');
  fx.add(gm, 'decay', 0.8, 1, 0.001).name('god rays decay');
  fx.add(ctx.effects.bloom, 'intensity', 0, 3, 0.01).name('bloom');

  let frames = 0;
  let acc = 0;
  return (dt) => {
    frames++;
    acc += dt;
    if (acc > 0.5) {
      info.fps = Math.round(frames / acc);
      frames = 0;
      acc = 0;
    }
    info.tier = ctx.getTier();
    info.blades = ctx.rice.geometry.instanceCount;
  };
}
