import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/chrome-for-testing/chrome-linux64/chrome',
  args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox','--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto('http://127.0.0.1:8901/?demo=1&lowfx=1', { waitUntil: 'load' });
await page.waitForTimeout(3000);
const res = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__sable.game;
  const orig = g.renderer.render.bind(g.renderer);
  let total = 0, n = 0;
  g.renderer.render = (s, c) => { const t0 = performance.now(); orig(s, c); total += performance.now() - t0; n++; };
  setTimeout(() => resolve({
    renderMsPerFrame: +(total / Math.max(1, n)).toFixed(1),
    frames: n,
    triangles: g.renderer.info.render.triangles,
    calls: g.renderer.info.render.calls,
    geometries: g.renderer.info.memory.geometries,
    textures: g.renderer.info.memory.textures,
    shadowMapEnabled: g.renderer.shadowMap.enabled,
    pixelRatio: g.renderer.getPixelRatio(),
  }), 5000);
}));
console.log(JSON.stringify(res, null, 1));
await browser.close();
