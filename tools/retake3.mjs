import { chromium } from 'playwright';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/chrome-for-testing/chrome-linux64/chrome',
  args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox','--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:8901/?demo=1&lowfx=1', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3000);
// Start a round, buy the rifle, deploy, then stand in mid facing east
// down the lane while the bots push toward the sites.
await page.evaluate(() => {
  const g = window.__sable;
  g.game.hud.hideOverlays();
  g.match.startMatch();
  g.game.player.money = 10000;
  g.match.tryBuy('weapon:vantage');
  g.game.deploy();
  g.game.player.pos.set(-8, 0, 0);
  g.game.player.yaw = -Math.PI / 2; // east, down mid
  g.game.player.pitch = 0;
});
await page.waitForTimeout(25000); // let the bots walk into the lane
const state = await page.evaluate(() => {
  const g = window.__sable;
  const vis = g.bots.filter((b) => b.team === 'ember' && b.alive).length;
  return { hp: Math.round(g.player.health), alive: g.player.alive, botsAlive: g.bots.filter((b) => b.alive).length, emberAlive: vis, timer: Math.round(g.match.timer) };
});
console.log('STATE', JSON.stringify(state));
await page.screenshot({ path: OUT + '3-combat.jpg', type: 'jpeg', quality: 82 });
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
