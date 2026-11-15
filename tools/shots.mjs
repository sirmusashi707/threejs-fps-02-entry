// Screenshot pass for SABLE PROTOCOL: 960x540, lowfx, real renders of the
// game's own code. Takes 4 shots: menu, buy phase, combat, planted charge.
// Usage: node tools/shots.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = new URL('../screenshots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/home/hatch/.cache/chrome-for-testing/chrome-linux64/chrome',
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader',
    '--disable-gpu-sandbox', '--no-sandbox',
  ],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://127.0.0.1:8901/?demo=1&lowfx=1', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3000);

// 1 — main menu over the orbiting yard.
await page.evaluate(() => {
  const g = window.__sable;
  g.match.phase = 'menu';
  g.game.hud.showOverlay('menu-overlay');
});
await page.waitForTimeout(2000);
await page.screenshot({ path: OUT + '1-menu.jpg', type: 'jpeg', quality: 82 });

// 2 — buy phase with the shop open.
await page.evaluate(() => {
  const g = window.__sable;
  g.game.hud.hideOverlays();
  g.match.startMatch();
  g.game.player.money = 10000;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '2-buy.jpg', type: 'jpeg', quality: 82 });

// 3 — combat: deploy, buy the rifle, walk into mid and fire at the bots
// pushing down the lanes.
await page.evaluate(() => {
  const g = window.__sable;
  g.match.tryBuy('weapon:vantage');
  g.game.deploy();
});
await page.waitForTimeout(1000);
await page.keyboard.down('KeyW');
await page.waitForTimeout(6000);
await page.keyboard.up('KeyW');
await page.evaluate(() => { window.__sable.game.mouseHeld = true; });
await page.waitForTimeout(1200);
await page.evaluate(() => { window.__sable.game.mouseHeld = false; });
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '3-combat.jpg', type: 'jpeg', quality: 82 });
console.log('COMBAT', JSON.stringify(await page.evaluate(() => {
  const g = window.__sable;
  return { hp: Math.round(g.player.health), mag: g.game.mag, pos: g.player.pos.toArray().map((v) => +v.toFixed(1)), botsAlive: g.bots.filter((b) => b.alive).length };
})));

// 4 — the charge planted at site A: restart the round, plant fast, shoot the
// frame while the bomb timer runs.
await page.evaluate(() => {
  const g = window.__sable;
  g.match.startRound();
  g.game.player.money = 10000;
  g.match.tryBuy('weapon:vantage');
  g.game.deploy();
});
await page.waitForTimeout(800);
await page.evaluate(async () => {
  const g = window.__sable;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  g.game.player.pos.set(24, 0, -17);
  g.game.player.yaw = -Math.PI / 2; // look back down the lane at the defenders
  g.game.keys.KeyE = true;
  for (let i = 0; i < 150; i++) {
    await sleep(200);
    if (g.match.bombPlanted || !g.game.player.alive) break;
  }
  g.game.keys.KeyE = false;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '4-plant.jpg', type: 'jpeg', quality: 82 });
console.log('PLANT-SHOT', JSON.stringify(await page.evaluate(() => {
  const g = window.__sable;
  return { bombPlanted: g.match.bombPlanted, site: g.match.bombSite, bombTimer: Math.round(g.match.bombTimer || 0), hp: Math.round(g.player.health) };
})));

console.log('ERRORS:', errors.length ? errors : 'none');
for (const f of fs.readdirSync(OUT).sort()) {
  console.log('SHOT', f, fs.statSync(OUT + f).size, 'bytes');
}
await browser.close();
