// Shooting and grenades, shared by the player and the bots.
// A shot is a ray from the shooter's eye through their aim direction plus a
// spread cone. It tests walls first, then every living actor's head and body
// spheres, and the nearest hit wins. Damage falls off with distance, and a
// headshot pays the weapon's multiplier — accuracy over volume of fire.
import * as THREE from 'three';
import { WEAPONS, GRENADES } from './config.js';
import { raySphere, clamp, rand } from './util.js';

// One holder of a weapon: the player or a bot. Anything that shoots provides:
//   eye (Vector3), yaw, pitch, weapon (WEAPONS entry), mag, reserve,
//   moving (bool), crouching (bool), ads (bool), team, alive, name
// and receives damage through takeDamage(amount, attacker, isHeadshot).

export function computeSpread(shooter) {
  const w = shooter.weapon;
  let spread = w.spread;
  if (shooter.moving) spread += w.moveSpread;
  if (shooter.crouching) spread *= 0.7;
  if (shooter.ads) spread *= w.adsMult;
  if (shooter.airborne) spread += 0.05;
  return spread;
}

// Aim direction with spread applied. `rng` lets bots use their own error.
export function aimDirection(shooter, spread) {
  const cp = Math.cos(shooter.pitch);
  const dir = new THREE.Vector3(
    -Math.sin(shooter.yaw) * cp,
    Math.sin(shooter.pitch),
    -Math.cos(shooter.yaw) * cp,
  );
  // Jitter inside a cone of `spread` radians.
  const a = rand(0, Math.PI * 2);
  const r = Math.sqrt(Math.random()) * spread;
  const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
  dir.addScaledVector(right, Math.cos(a) * r);
  dir.addScaledVector(upv, Math.sin(a) * r);
  return dir.normalize();
}

// Fire one trigger pull (all pellets). Returns a result object the caller
// uses for tracers, sounds, hitmarkers and kill credit.
// actors: every living shooter in the scene except the shooter themself.
export function fireShot(shooter, actors, world, effects) {
  const w = shooter.weapon;
  const spread = computeSpread(shooter);
  const origin = shooter.eye.clone();
  let hitAny = false;
  let killed = null;
  let headshot = false;
  let bestT = Infinity;
  let bestPoint = null;

  for (let p = 0; p < w.pellets; p++) {
    const dir = aimDirection(shooter, spread);
    const wall = world.rayWalls(origin, dir, w.range);
    const wallT = wall ? wall.t : w.range;
    let hitT = wallT;
    let hitActor = null;
    let hitHead = false;
    for (const a of actors) {
      if (a === shooter || !a.alive) continue;
      if (a.team === shooter.team) continue;
      // Head sphere, then body sphere.
      const headT = raySphere(origin, dir, a.eye.x, a.eye.y + 0.12, a.eye.z, 0.21);
      if (headT !== null && headT < hitT) {
        hitT = headT; hitActor = a; hitHead = true;
      }
      const bodyT = raySphere(origin, dir, a.pos.x, a.pos.y + 0.95, a.pos.z, 0.46);
      if (bodyT !== null && bodyT < hitT) {
        hitT = bodyT; hitActor = a; hitHead = false;
      }
    }
    const end = origin.clone().addScaledVector(dir, hitT);
    if (effects) effects.tracer(origin, end, w.tracer);
    if (hitActor) {
      hitAny = true;
      const falloff = clamp(1 - (hitT / w.range) * 0.45, 0.4, 1);
      const dmg = w.damage * (hitHead ? w.headshotMult : 1) * falloff;
      const died = hitActor.takeDamage(dmg, shooter, hitHead);
      if (effects) effects.impact(end, hitHead);
      if (died) { killed = hitActor; headshot = hitHead; }
      if (hitT < bestT) { bestT = hitT; bestPoint = end; }
    } else if (wall) {
      if (effects) effects.impact(wall.point, false, true);
      if (wall.t < bestT) { bestT = wall.t; bestPoint = new THREE.Vector3(wall.point.x, wall.point.y, wall.point.z); }
    }
  }
  return { hit: hitAny, killed, headshot, point: bestPoint };
}

// --- Grenades ---------------------------------------------------------------

export class Grenade {
  constructor(scene, world, owner, type, origin, dir) {
    this.world = world;
    this.owner = owner;
    this.def = GRENADES[type];
    this.type = type;
    this.pos = origin.clone();
    this.vel = dir.clone().multiplyScalar(13);
    this.vel.y += 3.2;
    this.fuse = this.def.fuse;
    this.done = false;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 8),
      new THREE.MeshStandardMaterial({ color: type === 'veil' ? 0x8a94a0 : 0x2c2f33, roughness: 0.5, metalness: 0.6 }),
    );
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
    this.scene = scene;
  }

  update(dt) {
    if (this.done) return null;
    this.vel.y -= 14 * dt;
    let nx = this.pos.x + this.vel.x * dt;
    let ny = this.pos.y + this.vel.y * dt;
    let nz = this.pos.z + this.vel.z * dt;
    // Bounce off the ground and walls, losing energy each time.
    if (ny < 0.11) { ny = 0.11; this.vel.y = Math.abs(this.vel.y) * 0.35; this.vel.x *= 0.7; this.vel.z *= 0.7; }
    const fixed = this.world.collideCircle(nx, nz, 0.11);
    if (fixed.x !== nx) this.vel.x *= -0.4;
    if (fixed.z !== nz) this.vel.z *= -0.4;
    this.pos.set(fixed.x, ny, fixed.z);
    this.mesh.position.copy(this.pos);
    this.fuse -= dt;
    if (this.fuse <= 0) {
      this.done = true;
      this.scene.remove(this.mesh);
      return { type: this.type, pos: this.pos.clone(), owner: this.owner, def: this.def };
    }
    return null;
  }
}
