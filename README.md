# SABLE PROTOCOL — a three.js tactical FPS

A round-based tactical first-person shooter in the style Counter-Strike made
famous — two teams, short rounds, money between rounds to buy weapons, and
gunfire where accuracy counts more than speed. Built for the make.fun
`threejs-fps-02` bounty. The map, art, sounds and names are all original.

## The game

**Depot 7**, a freight yard at dusk. SABLE (you + 4 bots) attacks; EMBER
(5 bots) defends two bomb sites — **Crane Yard (A)** and **Silo Row (B)**.

- **Rounds:** first to 8 round wins takes the match. A round is won by
  eliminating the other team, detonating the planted charge, defusing it, or
  holding the sites until the 100-second clock runs out.
- **The bomb:** you carry the charge. Hold **E** inside a site ring to plant
  (3 s). It detonates 35 s later unless an EMBER bot defuses it (5 s).
- **Economy:** $800 to start, +$300 per kill, +$300 for a plant,
  +$3,250 for a round win, +$1,900 (and growing) for a loss. Spend it in the
  buy phase (**B**) on five weapons, three grenades and a kevlar vest.
- **Weapons:** P9 Sparrow (pistol), VK-9 Raptor (SMG), AR-7 Vantage (rifle),
  SG-12 Breacher (shotgun), LR-50 Longshot (scoped sniper). Every gun has
  its own damage, spread, recoil and fire rate; moving, jumping and hip-fire
  all widen the spread cone, crouching and aiming down sights tighten it.
- **Grenades:** Shard (frag), Veil (smoke that blocks bot sight), Flare
  (flash that blinds anyone looking at the pop).
- **Bots:** waypoint navigation, three-lane pushes, site holds, reaction
  times and aim error scaled by skill, burst fire, investigation of gunshots
  they hear, bomb carrier plants, defenders rush to defuse.
- **HUD:** health + armour, ammo, credits, round timer, team score, kill
  feed, teammate status, a live minimap (enemies only show when you can
  actually see them), hitmarkers, and a dynamic crosshair that grows with
  your spread.

## Play it

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Open the page in desktop Chrome, click **DEPLOY**, and play. No build step,
no network requests: three.js 0.187.0 is vendored under
`game/vendor/three/`, and every sound is synthesized with WebAudio.

`?demo=1` starts a round immediately without pointer lock (drag to look) —
handy for a quick look or a screenshot.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look · Click to fire · Right-click to aim |
| R | Reload · Q cycle weapon · 1–5 select weapon |
| B | Buy menu (buy phase) |
| E (hold) | Plant the charge |
| G | Throw grenade · X cycle grenade type |
| Ctrl / C | Crouch · Space jump · M mute |

## Layout

```
main.ts                  submission program: copies game/ + screenshots/,
                         writes dossier.json with vendor/makefun-threejs.ts
serve.ts                 static dev server (localhost:8080)
game/
  index.html             HUD markup + CSS + the three.js import map
  vendor/three/          three.js 0.187.0 (npm build, byte-identical)
  src/
    main.js              bootstrap, input, viewmodel, frame loop
    config.js            weapons, grenades, economy, bot tuning
    world.js             Depot 7: map, colliders, waypoints, sites
    textures.js          procedural canvas textures (no image files)
    player.js            FPS controller, health, armour
    weapons.js           raycast shooting, spread, grenade physics
    bots.js              bot AI: patrol, engage, plant, defuse
    match.js             rounds, economy, bomb, win conditions
    effects.js           tracers, sparks, smoke, explosions
    hud.js               HUD, kill feed, minimap, buy menu
    audio.js             synthesized WebAudio sounds
    util.js              ray/box/sphere maths
screenshots/              3 real renders of the game
```

## Licence

MIT — see `LICENSE`.

## Verification (development tools)

`tools/` holds the headless Playwright playtests used to verify this entry
(a real round was driven end to end: buy, deploy, plant, detonation, round
2). They need Playwright and a Chromium with WebGL; on this machine they ran
against Chrome for Testing 159.0.8154.6 via `CHROME_PATH`. The game itself
needs none of that — it runs from static files in any desktop Chrome.
