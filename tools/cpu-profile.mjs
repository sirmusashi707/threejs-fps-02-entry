import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/chrome-for-testing/chrome-linux64/chrome',
  args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox','--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto('http://127.0.0.1:8901/?demo=1&lowfx=1', { waitUntil: 'load' });
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.start');
await page.waitForTimeout(5000);
const { profile } = await cdp.send('Profiler.stop');
// Aggregate self-time by function name.
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
for (const n of profile.nodes) {
  const fn = n.callFrame.functionName || '(anonymous)';
  const url = n.callFrame.url.split('/').pop() + ':' + n.callFrame.lineNumber;
  const key = fn + ' @ ' + url;
  self.set(key, (self.get(key) || 0) + (n.hitCount || 0));
}
const sorted = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
const total = sorted.reduce((s, [, v]) => s + v, 0);
console.log('top self-time samples (of ' + total + ' in top 15):');
for (const [k, v] of sorted) console.log(String(v).padStart(6), k);
await browser.close();
