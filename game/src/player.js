// The human player: movement, looking, health and armour.
// Position is the feet on the ground plane; the camera sits at eye height.
import * as THREE from 'three';
import { PLAYER, ARMOR_ABSORB } from './config.js';
import { clamp } from './util.js';

export class Player {
  constructor(world) {
    this.world = world;
    this.team = 'sable'; // the player always fights for SABLE
    this.name = 'YOU';
    this.pos = new THREE.Vector3(-31, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = -Math.PI / 2; // facing east, down the yard
    this.pitch = 0;
    this.onGround = true;
    this.crouching = false;
    this.health = PLAYER.health;
    this.armor = 0;
    this.alive = true;
    this.money = 0;
    this.weapon = null; // set by the game when it picks a weapon
    this.ads = false;
    this.airborne = false;
    this.speed2D = 0; // horizontal speed, for spread + sound
    this.moving = false;
    this.blindUntil = 0; // flashbang
    this.blindAmount = 0;
  }

  get eyeHeight() {
    return this.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  // Forward on the ground plane, from the yaw.
  get forward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = PLAYER.health;
    this.alive = true;
    this.blindUntil = 0;
    this.blindAmount = 0;
  }

  look(dx, dy, sensitivity = 0.0023) {
    this.yaw -= dx * sensitivity;
    this.pitch = clamp(this.pitch - dy * sensitivity, -1.53, 1.53);
  }

  // input: {f, b, l, r, jump, crouch, ads, sprint}
  update(dt, input) {
    if (!this.alive) return;
    this.crouching = !!input.crouch;
    this.ads = !!input.ads;
    this.airborne = !this.onGround;
    const f = this.forward;
    // Right vector on the ground plane.
    const rx = -f.z;
    const rz = f.x;
    let mx = 0;
    let mz = 0;
    if (input.f) { mx += f.x; mz += f.z; }
    if (input.b) { mx -= f.x; mz -= f.z; }
    if (input.r) { mx += rx; mz += rz; }
    if (input.l) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    this.moving = len > 0;
    let speed = PLAYER.walkSpeed;
    if (this.crouching) speed = PLAYER.crouchSpeed;
    else if (input.ads) speed = PLAYER.adsSpeed;
    if (len > 0) {
      mx /= len;
      mz /= len;
      this.vel.x = mx * speed;
      this.vel.z = mz * speed;
    } else {
      this.vel.x = 0;
      this.vel.z = 0;
    }
    this.speed2D = Math.hypot(this.vel.x, this.vel.z);

    // Jump + gravity. The yard is flat, so landing is just y == 0.
    if (input.jump && this.onGround && !this.crouching) {
      this.vel.y = PLAYER.jumpSpeed;
      this.onGround = false;
    }
    this.vel.y -= PLAYER.gravity * dt;
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    let ny = this.pos.y + this.vel.y * dt;
    if (ny <= 0) {
      ny = 0;
      this.vel.y = 0;
      this.onGround = true;
    }
    const fixed = this.world.collideCircle(nx, nz, PLAYER.radius);
    this.pos.set(fixed.x, ny, fixed.z);
  }

  // Returns true when this hit killed the player (same contract as Bot).
  takeDamage(amount) {
    if (!this.alive) return false;
    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * ARMOR_ABSORB);
      this.armor -= absorbed;
      remaining = amount - absorbed;
    }
    this.health -= remaining;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  healFull() {
    this.health = PLAYER.health;
    this.alive = true;
  }
}
