// SABLE PROTOCOL — entry point. Wires the renderer, the player, the bots,
// the match and the HUD together, and runs the frame loop. The game is
// static ES modules: no build step, no network, three.js from the import map.
import * as THREE from 'three';
import { World, SITES } from './world.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { Match } from './match.js';
import { HUD } from './hud.js';
import { Effects } from './effects.js';
import { SoundBank } from './audio.js';
import { WEAPONS, GRENADES, BOT, PLAYER } from './config.js';
import { fireShot, Grenade, computeSpread } from './weapons.js';
import { clamp, lerp, rand } from './util.js';

const DEMO = new URLSearchParams(location.search).has('demo');
// lowfx: no shadows, pixel ratio 1 — for software-rendered playtests, where
// SwiftShader would otherwise run at a few frames a second. The shipped
// game on a real GPU always runs with full effects.
const LOWFX = new URLSearchParams(location.search).has('lowfx');

class Game {
  constructor() {
    this.audio = new SoundBank();
    this.renderer = new THREE.WebGLRenderer({ antialias: !LOWFX, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(LOWFX ? 1 : Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = !LOWFX;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 260);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.world = new World(this.scene);
    this.effects = new Effects(this.scene, this.world);
    this.hud = new HUD();
    this.player = new Player(this.world);
    this.player.money = 800;
    this.bots = [];
    for (let i = 0; i < BOT.countPerTeam - 1; i++) {
      this.bots.push(new Bot(this.scene, this.world, 'sable', i, rand(0.45, 0.8)));
    }
    for (let i = 0; i < BOT.countPerTeam; i++) {
      this.bots.push(new Bot(this.scene, this.world, 'ember', i, rand(0.45, 0.85)));
    }
    this.match = new Match(this);

    this.weapon = WEAPONS.sparrow;
    this.player.weapon = this.weapon; // fireShot/computeSpread read it off the shooter
    this.mag = this.weapon.mag;
    this.reserve = this.weapon.reserve;
    this.ownedWeapons = ['sparrow'];
    this.grenades = { shard: 0, veil: 0, flare: 0 };
    this.grenadeSelected = 'shard';
    this.reloading = false;
    this.reloadEndsAt = 0;
    this.lastShotAt = 0;
    this.mouseHeld = false;
    this.adsHeld = false;
    this.adsAmount = 0;
    this.recoil = 0;
    this.walkCycle = 0;
    this.grenadeList = [];
    this.noises = [];
    this.flashAmount = 0;
    this.hurtAmount = 0;
    this.hurtDir = 0;
    this.time = 0;
    this.paused = false;
    this.spectateTarget = null;
    this.keys = {};
    this.dragging = false;

    this.buildViewmodel();
    this.bindInput();
    this.bindButtons();
    this.hud.bindBuy((item) => this.onBuy(item), () => this.deploy());
    this.match.phase = 'menu';
    this.hud.showOverlay('menu-overlay');
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);

    if (DEMO) {
      // Headless / screenshot mode: no pointer lock, drag to look, and the
      // match starts on its own so the scene can be driven and captured.
      this.startMatch();
    }
    // Debug hook for automated playtests. It only exposes state; the game
    // never reads it.
    window.__sable = {
      game: this, match: this.match, player: this.player, bots: this.bots,
      world: this.world,
    };
  }

  // --- setup ----------------------------------------------------------------------

  allActors() {
    return [this.player, ...this.bots];
  }

  setWeapon(id) {
    this.weapon = WEAPONS[id];
    this.player.weapon = this.weapon; // the shooter interface reads it here
    this.mag = this.weapon.mag;
    this.reserve = this.weapon.reserve;
    if (!this.ownedWeapons.includes(id)) this.ownedWeapons.push(id);
    this.reloading = false;
    this.buildViewmodel();
  }

  refillCurrentWeapon() {
    this.mag = this.weapon.mag;
    this.reserve = this.weapon.reserve;
    this.reloading = false;
  }

  buildViewmodel() {
    if (this.viewmodel) {
      this.camera.remove(this.viewmodel);
      this.viewmodel.traverse((m) => {
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
      });
    }
    const group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.45, metalness: 0.7 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x8a6d2f, roughness: 0.5, metalness: 0.6 });
    const long = this.weapon.kind === 'rifle' || this.weapon.kind === 'sniper';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, long ? 0.55 : 0.34), dark);
    group.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, long ? 0.34 : 0.16, 8), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -(long ? 0.42 : 0.24));
    group.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), accent);
    mag.position.set(0, -0.13, 0.02);
    mag.rotation.x = 0.15;
    group.add(mag);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), dark);
    sight.position.set(0, 0.095, -0.05);
    group.add(sight);
    if (this.weapon.scope) {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 10), dark);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.11, -0.02);
      group.add(scope);
    }
    group.position.set(0.26, -0.23, -0.5);
    this.viewmodel = group;
    this.viewmodelBase = group.position.clone();
    this.camera.add(group);
    // Muzzle tip, for the flash sprite.
    this.muzzleTip = new THREE.Object3D();
    this.muzzleTip.position.set(0, 0.02, -(long ? 0.6 : 0.34));
    group.add(this.muzzleTip);
  }

  // --- input ------------------------------------------------------------------------

  bindInput() {
    const canvas = this.renderer.domElement;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.audio.ensure();
      if (e.code === 'KeyB' && (this.match.phase === 'buy')) this.toggleBuy();
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'KeyG') this.throwGrenade();
      if (e.code === 'KeyX') this.cycleGrenade();
      if (e.code === 'KeyM') this.audio.toggleMute();
      if (e.code === 'KeyQ') this.cycleWeapon();
      if (e.code.startsWith('Digit')) {
        const idx = Number(e.code.slice(5)) - 1;
        if (idx >= 0 && idx < this.ownedWeapons.length) this.setWeapon(this.ownedWeapons[idx]);
      }
      if (e.code === 'Enter' && this.match.phase === 'menu') this.startMatch();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.mouseHeld = false; });

    canvas.addEventListener('mousedown', (e) => {
      this.audio.ensure();
      if (this.match.phase !== 'live' || this.paused) return;
      if (e.button === 0) {
        if (DEMO) { this.dragging = true; return; }
        if (document.pointerLockElement !== canvas) {
          canvas.requestPointerLock();
          return;
        }
        this.mouseHeld = true;
        this.tryFire();
      }
      if (e.button === 2) this.adsHeld = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.mouseHeld = false; this.dragging = false; }
      if (e.button === 2) this.adsHeld = false;
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.player.look(e.movementX, e.movementY, this.adsAmount > 0.5 ? 0.0013 : 0.0023);
      } else if (DEMO && this.dragging) {
        this.player.look(e.movementX, e.movementY, 0.0023);
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (!locked && this.match.phase === 'live' && !DEMO && this.player.alive) {
        this.paused = true;
        this.hud.showOverlay('pause-overlay');
      } else if (locked) {
        this.paused = false;
        this.hud.hideOverlays();
        this.hud.hideBuy();
      }
    });
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  bindButtons() {
    const $ = (id) => document.getElementById(id);
    $('play-btn').addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      this.startMatch();
    });
    $('resume-btn').addEventListener('click', () => {
      this.audio.click();
      this.paused = false;
      this.hud.hideOverlays();
      this.renderer.domElement.requestPointerLock();
    });
    $('restart-btn').addEventListener('click', () => {
      this.audio.click();
      this.hud.hideOverlays();
      this.startMatch();
    });
    $('quit-btn').addEventListener('click', () => {
      this.audio.click();
      this.match.phase = 'menu';
      this.hud.showOverlay('menu-overlay');
      document.exitPointerLock?.();
    });
  }

  startMatch() {
    this.hud.hideOverlays();
    this.match.startMatch();
    if (!DEMO) this.renderer.domElement.requestPointerLock();
  }

  deploy() {
    if (this.match.phase !== 'buy') return;
    this.match.endBuyPhase();
    if (!DEMO) this.renderer.domElement.requestPointerLock();
  }

  toggleBuy() {
    if (this.match.phase !== 'buy') return;
    const menu = document.getElementById('buy-menu');
    if (menu.hidden) {
      document.exitPointerLock?.();
      this.hud.showBuy(this.player.money);
    } else {
      this.hud.hideBuy();
      if (!DEMO) this.renderer.domElement.requestPointerLock();
    }
  }

  onBuy(item) {
    const res = this.match.tryBuy(item);
    if (!res.ok) {
      this.audio.denied();
      this.hud.hint(res.reason);
      return;
    }
    this.hud.showBuy(this.player.money);
    this.hud.markOwned(this.weapon.id, this.grenades);
  }

  cycleWeapon() {
    if (this.ownedWeapons.length < 2) return;
    const i = this.ownedWeapons.indexOf(this.weapon.id);
    this.setWeapon(this.ownedWeapons[(i + 1) % this.ownedWeapons.length]);
  }

  cycleGrenade() {
    const order = ['shard', 'veil', 'flare'];
    const i = order.indexOf(this.grenadeSelected);
    this.grenadeSelected = order[(i + 1) % order.length];
    this.hud.hint('Grenade: ' + GRENADES[this.grenadeSelected].name + ' (' + (this.grenades[this.grenadeSelected] || 0) + ' carried) — G to throw');
  }

  // --- combat -------------------------------------------------------------------------

  tryFire() {
    if (this.match.phase !== 'live' || !this.player.alive || this.paused) return;
    if (this.reloading) return;
    const now = this.time;
    if (now - this.lastShotAt < this.weapon.fireInterval) return;
    if (this.mag <= 0) {
      this.audio.dryFire();
      this.lastShotAt = now;
      this.startReload();
      return;
    }
    this.lastShotAt = now;
    this.mag--;
    const eye = this.player.eye;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.effects.muzzleFlash(this.muzzleTip.getWorldPosition(new THREE.Vector3()), dir);
    const result = fireShot(this.player, this.allActors(), this.world, this.effects);
    this.audio.shot(this.weapon.sound, 0);
    this.noises.push({ x: this.player.pos.x, z: this.player.pos.z, team: 'sable', until: now + 0.6 });
    // Recoil kicks the view up and the gun back.
    this.player.pitch = clamp(this.player.pitch + this.weapon.recoil * (this.adsAmount > 0.5 ? 0.65 : 1), -1.53, 1.53);
    this.player.yaw += rand(-1, 1) * this.weapon.recoil * 0.35;
    this.recoil = Math.min(0.09, this.recoil + 0.035);
    if (result.hit) {
      this.audio.hit();
      this.hud.hitmarker(false);
    }
    if (result.killed) {
      this.hud.hitmarker(true);
      this.match.onKill(result.killed, this.player, result.headshot);
    }
  }

  startReload() {
    if (this.reloading || this.mag >= this.weapon.mag || this.reserve <= 0) return;
    if (this.match.phase !== 'live') return;
    this.reloading = true;
    this.reloadEndsAt = this.time + this.weapon.reloadTime;
    this.audio.reload();
  }

  finishReload() {
    const need = this.weapon.mag - this.mag;
    const take = Math.min(need, this.reserve);
    this.mag += take;
    this.reserve -= take;
    this.reloading = false;
  }

  throwGrenade() {
    if (this.match.phase !== 'live' || !this.player.alive || this.paused) return;
    const type = this.grenadeSelected;
    if ((this.grenades[type] || 0) <= 0) {
      this.hud.hint('No ' + GRENADES[type].name + ' left — buy one in the next buy phase (B).');
      this.audio.denied();
      return;
    }
    this.grenades[type]--;
    const eye = this.player.eye;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = eye.clone().addScaledVector(dir, 0.6);
    this.grenadeList.push(new Grenade(this.scene, this.world, this.player, type, origin, dir));
    this.audio.grenadeThrow();
  }

  resolveGrenade(ev) {
    const { type, pos, owner, def } = ev;
    if (type === 'shard') {
      this.effects.explosion(pos);
      this.audio.explosion();
      this.noises.push({ x: pos.x, z: pos.z, team: owner.team, until: this.time + 0.8 });
      for (const a of this.allActors()) {
        if (!a.alive) continue;
        const d = Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z);
        const dy = Math.abs((a.pos.y + 1) - pos.y);
        if (d < def.radius && dy < 4) {
          const dmg = def.maxDamage * (1 - d / def.radius) + 10;
          const died = a.takeDamage(dmg, owner, false);
          if (died) this.match.onKill(a, owner, false);
          else if (a === this.player) this.hurt(0.5);
        }
      }
    } else if (type === 'veil') {
      this.effects.smoke(pos, def.duration, this.time);
    } else if (type === 'flare') {
      this.audio.flashPop();
      this.effects.muzzleFlash(pos, new THREE.Vector3(0, 1, 0));
      for (const a of this.allActors()) {
        if (!a.alive) continue;
        const d = Math.hypot(a.pos.x - pos.x, (a.pos.y + 1.5) - pos.y, a.pos.z - pos.z);
        if (d > def.radius) continue;
        const eye = a.eye;
        const los = this.world.hasLOS(pos.x, pos.y, pos.z, eye.x, eye.y, eye.z, this.time);
        if (!los) continue;
        // Facing the pop matters: looking away halves the blind.
        const dx = pos.x - a.pos.x;
        const dz = pos.z - a.pos.z;
        const facing = (-Math.sin(a.yaw) * dx + -Math.cos(a.yaw) * dz) / Math.max(0.01, Math.hypot(dx, dz));
        const amount = facing > -0.2 ? 1 : 0.4;
        const dur = def.blindTime * amount * clamp(1 - d / def.radius + 0.4, 0.3, 1);
        if (a === this.player) {
          this.flashAmount = 1;
          this.player.blindUntil = this.time + dur;
          this.player.blindAmount = 1;
        } else {
          a.blindUntil = this.time + dur;
        }
      }
    }
  }

  hurt(amount) {
    this.hurtAmount = Math.min(1, this.hurtAmount + amount);
  }

  // --- per-frame --------------------------------------------------------------------------

  inputState() {
    return {
      f: !!this.keys.KeyW || !!this.keys.ArrowUp,
      b: !!this.keys.KeyS || !!this.keys.ArrowDown,
      l: !!this.keys.KeyA || !!this.keys.ArrowLeft,
      r: !!this.keys.KeyD || !!this.keys.ArrowRight,
      jump: !!this.keys.Space,
      crouch: !!this.keys.ControlLeft || !!this.keys.KeyC,
      ads: this.adsHeld,
      sprint: !!this.keys.ShiftLeft,
    };
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const m = this.match;

    if (m.phase === 'menu') {
      // Slow orbit over the yard behind the menu.
      const t = this.time * 0.05;
      this.camera.position.set(Math.sin(t) * 26, 15, Math.cos(t) * 22);
      this.camera.lookAt(0, 1, 0);
      this.camera.fov = 60;
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const frozen = this.paused || m.phase === 'matchEnd';
    if (!frozen) {
      const live = m.phase === 'live';
      // The buy phase is freeze time: nobody moves or shoots until deploy.
      if (live) {
        // Player.
        const input = this.inputState();
        this.player.update(dt, input);
        if (this.player.moving && this.player.onGround) {
          this.audio.footstep(this.player.speed2D > 4);
          this.walkCycle += dt * this.player.speed2D * 1.6;
        }
        // Aim down sights: narrower FOV, steadier gun.
        const targetAds = this.adsHeld && !this.reloading ? 1 : 0;
        this.adsAmount = lerp(this.adsAmount, targetAds, dt * 10);
        const baseFov = 75;
        const adsFov = this.weapon.scope ? this.weapon.zoomFov : 55;
        this.camera.fov = lerp(baseFov, adsFov, this.adsAmount);
        this.camera.updateProjectionMatrix();
        // Auto fire while the trigger is held.
        if (this.mouseHeld && this.weapon.auto) this.tryFire();
        if (this.reloading && this.time >= this.reloadEndsAt) this.finishReload();
        // Planting.
        m.updatePlayerPlant(dt, !!this.keys.KeyE);
        // Bots.
        const actors = this.allActors();
        const ctx = {
          time: this.time, actors, player: this.player, noises: this.noises,
          match: m, effects: this.effects, audio: this.audio,
          onKill: (victim, attacker, hs) => this.match.onKill(victim, attacker, hs),
        };
        for (const b of this.bots) {
          if (b.alive) {
            const magBefore = b.mag;
            b.update(dt, ctx);
            // A bot that just fired makes a noise the others can hear.
            if (b.mag < magBefore) {
              this.noises.push({ x: b.pos.x, z: b.pos.z, team: b.team, until: this.time + 0.4 });
            }
          } else if ((performance.now() - (b.deathAt || 0)) / 1000 > 6) {
            b.setVisible(false);
          }
        }
        this.noises = this.noises.filter((n) => this.time < n.until);
        // Grenades.
        for (let i = this.grenadeList.length - 1; i >= 0; i--) {
          const ev = this.grenadeList[i].update(dt);
          if (ev) {
            this.resolveGrenade(ev);
            this.grenadeList.splice(i, 1);
          }
        }
      }
      // Match timers and round flow run in every phase except menu/matchEnd.
      m.update(dt);
      this.effects.update(dt, this.time);
      // Decay screen feedback.
      this.flashAmount = Math.max(0, this.flashAmount - dt * 0.45);
      if (this.time > this.player.blindUntil) this.player.blindAmount = 0;
      this.hurtAmount = Math.max(0, this.hurtAmount - dt * 0.5);
      this.recoil = Math.max(0, this.recoil - dt * 0.35);
    }

    // Camera follows the player — or a living teammate while spectating.
    if (this.player.alive) {
      if (this._spectated) { this._spectated.group.visible = true; this._spectated = null; }
      const eye = this.player.eye;
      this.camera.position.set(eye.x, eye.y, eye.z);
      this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);
      this.viewmodel.visible = true;
    } else {
      if (!this.spectateTarget || !this.spectateTarget.alive) {
        this.spectateTarget = this.bots.find((b) => b.team === 'sable' && b.alive) || null;
      }
      if (this.spectateTarget) {
        // Hide the body we are looking out of, or it fills the screen.
        if (this._spectated && this._spectated !== this.spectateTarget) this._spectated.group.visible = true;
        this._spectated = this.spectateTarget;
        this.spectateTarget.group.visible = false;
        const eye = this.spectateTarget.eye;
        this.camera.position.set(eye.x, eye.y, eye.z);
        this.camera.rotation.set(this.spectateTarget.pitch, this.spectateTarget.yaw, 0);
      }
      this.viewmodel.visible = false;
    }
    // Viewmodel motion: ADS centres the gun, walking bobs it, recoil kicks it.
    const vm = this.viewmodel.position;
    const adsPos = { x: 0, y: -0.185, z: -0.42 };
    vm.x = lerp(this.viewmodelBase.x, adsPos.x, this.adsAmount);
    vm.y = lerp(this.viewmodelBase.y, adsPos.y, this.adsAmount) + Math.sin(this.walkCycle * 2) * 0.006 * (this.player.moving ? 1 : 0);
    vm.z = lerp(this.viewmodelBase.z, adsPos.z, this.adsAmount) + this.recoil;
    this.viewmodel.rotation.x = this.recoil * 1.6;

    // HUD.
    const visibleEnemies = [];
    if (this.player.alive) {
      const eye = this.player.eye;
      for (const b of this.bots) {
        if (b.team !== 'ember' || !b.alive) continue;
        const be = b.eye;
        if (this.world.hasLOS(eye.x, eye.y, eye.z, be.x, be.y, be.z, this.time)) visibleEnemies.push(b);
      }
    }
    const spread = computeSpread(this.player) * 900;
    this.hud.update({
      player: this.player,
      weapon: this.weapon,
      mag: this.mag,
      reserve: this.reserve,
      score: m.score,
      round: Math.max(1, m.round),
      maxRounds: m.maxRounds,
      timer: m.phase === 'buy' ? m.timer : (m.phase === 'live' ? (m.bombPlanted ? m.bombTimer : m.timer) : m.timer),
      phase: m.phase,
      objectiveText: m.objectiveText,
      bombPlanted: m.bombPlanted,
      bombTimer: m.bombTimer,
      bombSiteName: m.bombSite ? ('SITE ' + m.bombSite + ' — ' + SITES[m.bombSite].name.toUpperCase()) : '',
      bombPos: m.bombPos,
      carrierIsPlayer: m.carrierIsPlayer,
      teammates: this.bots.filter((b) => b.team === 'sable'),
      visibleEnemies,
      world: this.world,
      worldSites: SITES,
      spreadPx: spread,
      scoped: this.weapon.scope && this.adsAmount > 0.7,
      flashAmount: Math.max(this.flashAmount, this.player.blindAmount),
      hurtAmount: this.hurtAmount,
      channel: m.channel,
      reloading: this.reloading,
    });
    // Grenade line under the weapon name.
    const gl = document.getElementById('grenade-line');
    if (gl) {
      const g = GRENADES[this.grenadeSelected];
      gl.textContent = 'G: ' + g.name + ' ×' + (this.grenades[this.grenadeSelected] || 0) + '  [X cycle]';
    }
    this.renderer.render(this.scene, this.camera);
  }
}

new Game();
