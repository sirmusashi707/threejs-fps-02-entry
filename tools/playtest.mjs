// Headless LOGIC playtest for SABLE PROTOCOL (no screenshots here).
// Runs at 480x270 + lowfx because SwiftShader on this VM renders the game
// at ~10 fps there (game time runs at ~half real time); waits are generous.
// It drives a real round: buy, deploy, walk, shoot, plant, and watches the
// bomb resolve the round. Usage: node tools/playtest.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/home/hatch/.cache/chrome-for-testing/chrome-linux64/chrome',
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader',
    '--disable-gpu-sandbox', '--no-sandbox',
  ],
});
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

await page.goto('http://127.0.0.1:8901/?demo=1&lowfx=1', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3000);

const snap = () => page.evaluate(() => {
  const g = window.__sable;
  return {
    phase: g.match.phase, round: g.match.round, timer: Math.round(g.match.timer),
    score: g.match.score, bombPlanted: g.match.bombPlanted,
    bombTimer: g.match.bombPlanted ? Math.round(g.match.bombTimer) : null,
    player: { hp: Math.round(g.player.health), alive: g.player.alive, mag: g.game.mag, money: g.player.money, weapon: g.game.weapon.id, pos: g.player.pos.toArray().map((v) => +v.toFixed(1)) },
    botsAlive: g.bots.filter((b) => b.alive).length,
    sableAlive: g.bots.filter((b) => b.team === 'sable' && b.alive).length,
    emberAlive: g.bots.filter((b) => b.team === 'ember' && b.alive).length,
    stats: g.match.stats,
    grenades: g.game.grenades,
    smoke: g.world.smoke.length,
  };
});

console.log('BOOT', JSON.stringify(await snap()));

// Buy through the real path.
console.log('BUY', JSON.stringify(await page.evaluate(() => {
  const g = window.__sable;
  g.game.player.money = 10000;
  return {
    vantage: g.match.tryBuy('weapon:vantage'),
    shard: g.match.tryBuy('grenade:shard'),
    veil: g.match.tryBuy('grenade:veil'),
    noCash: g.match.tryBuy('weapon:longshot'),
    moneyAfter: g.game.player.money,
  };
})));

// Deploy and immediately plant: defenders need ~5 game-seconds to reach the
// site, the plant takes 3, so an instant teleport plants before they arrive.
await page.evaluate(() => window.__sable.game.deploy());
await page.waitForTimeout(500);
const plant = await page.evaluate(async () => {
  const g = window.__sable;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  g.game.player.pos.set(24, 0, -17); // site A, Crane Yard
  g.game.player.yaw = Math.PI / 2; // face the site centre
  g.game.keys.KeyE = true;
  let progress = 0;
  for (let i = 0; i < 150; i++) {
    await sleep(200);
    if (g.match.channel) progress = Math.max(progress, g.match.channel.progress);
    if (g.match.bombPlanted) break;
    if (!g.game.player.alive) break;
  }
  g.game.keys.KeyE = false;
  return { bombPlanted: g.match.bombPlanted, site: g.match.bombSite, maxProgress: +progress.toFixed(2), playerAlive: g.game.player.alive };
});
console.log('PLANT', JSON.stringify(plant));
console.log('AFTER-PLANT', JSON.stringify(await snap()));

// Throw a smoke grenade and confirm the cloud exists in the world.
await page.evaluate(() => {
  const g = window.__sable;
  g.game.grenadeSelected = 'veil';
  g.game.throwGrenade();
});
await page.waitForTimeout(4000);
console.log('SMOKE-AFTER-THROW', JSON.stringify((await snap()).smoke));

// Walk and shoot for a while, then watch the round resolve (blast or defuse).
await page.keyboard.down('KeyW');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyW');
await page.evaluate(() => { window.__sable.game.mouseHeld = true; });
await page.waitForTimeout(2000);
await page.evaluate(() => { window.__sable.game.mouseHeld = false; });
console.log('MID', JSON.stringify(await snap()));

// Wait for the round to end (bomb 35 s game-time, then 4.5 s roundEnd).
let end = null;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(5000);
  const s = await snap();
  if (s.phase === 'roundEnd' || s.round > 1 || s.phase === 'matchEnd') { end = s; break; }
  if (i % 4 === 0) console.log('WAIT', JSON.stringify(s));
}
console.log('ROUND-END', JSON.stringify(end));

// Let round 2 start and confirm the match continues.
await page.waitForTimeout(15000);
console.log('ROUND2', JSON.stringify(await snap()));

console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await browser.close();
