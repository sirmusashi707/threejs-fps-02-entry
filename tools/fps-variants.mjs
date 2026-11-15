import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/chrome-for-testing/chrome-linux64/chrome',
  args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox','--no-sandbox'],
});
async function fpsFor(label, w, h, setup) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto('http://127.0.0.1:8901/?demo=1&lowfx=1', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  if (setup) await page.evaluate(setup);
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res((n / 3).toFixed(1)); };
    requestAnimationFrame(tick);
  }));
  console.log(label, w + 'x' + h, 'fps:', fps);
  await page.close();
}
await fpsFor('baseline', 960, 540, null);
await fpsFor('hud hidden', 960, 540, () => { document.getElementById('hud').style.display = 'none'; });
await fpsFor('small viewport', 480, 270, null);
await fpsFor('small + hud hidden', 480, 270, () => { document.getElementById('hud').style.display = 'none'; });
await browser.close();
