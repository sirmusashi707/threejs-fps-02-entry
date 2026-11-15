import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/chrome-for-testing/chrome-linux64/chrome',
  args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox','--no-sandbox'],
});
async function probe(name, w, h, setup) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<canvas id="c" width="${w}" height="${h}"></canvas>`);
  await page.evaluate(setup);
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res((n / 3).toFixed(1)); };
    requestAnimationFrame(tick);
  }));
  console.log(name, w + 'x' + h, 'rAF fps:', fps);
  await page.close();
}
await probe('empty rAF', 960, 540, () => {});
await probe('webgl clear', 960, 540, () => {
  const gl = document.getElementById('c').getContext('webgl2');
  const loop = () => { gl.clearColor(0.2,0.3,0.4,1); gl.clear(gl.COLOR_BUFFER_BIT); requestAnimationFrame(loop); };
  loop();
});
await probe('webgl clear small', 480, 270, () => {
  const gl = document.getElementById('c').getContext('webgl2');
  const loop = () => { gl.clearColor(0.2,0.3,0.4,1); gl.clear(gl.COLOR_BUFFER_BIT); requestAnimationFrame(loop); };
  loop();
});
await browser.close();
