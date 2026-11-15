// Bots. Each one runs a small state machine — advance along the waypoint
// graph, hold an angle, engage what it can see, investigate what it hears —
// and only ever knows what its own eyes and ears give it: a line of sight
// inside its field of view, or a gunshot close enough to hear. No wallhacks,
// no perfect aim: reaction time and aim error scale with the bot's skill.
import * as THREE from 'three';
import { BOT, WEAPONS } from './config.js';
import { clamp, rand, randInt, choice, angleDiff, angleStep, dist2D } from './util.js';
import { fireShot } from './weapons.js';

const SABLE_NAMES = ['Vex', 'Heron', 'Moss', 'Kite'];
const EMBER_NAMES = ['Ash', 'Cinder', 'Flint', 'Slate', 'Rook'];
const EYE_HEIGHT = 1.5;

const LOADOUTS = {
  sable: ['vantage', 'vantage', 'raptor', 'breacher'],
  ember: ['vantage', 'vantage', 'longshot', 'raptor', 'breacher'],
};

export class Bot {
  constructor(scene, world, team, index, skill) {
    this.scene = scene;
    this.world = world;
    this.team = team;
    this.index = index;
    this.skill = skill; // 0..1
    this.name = (team === 'sable' ? SABLE_NAMES : EMBER_NAMES)[index % 5];
    this.pos = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.health = BOT.health;
    this.armor = 0;
    this.alive = true;
    this.weapon = WEAPONS[LOADOUTS[team][index % LOADOUTS[team].length]];
    this.mag = this.weapon.mag;
    this.reserve = this.weapon.reserve;
    this.moving = false;
    this.crouching = false;
    this.ads = false;
    this.airborne = false;
    this.state = 'advance';
    this.path = [];
    this.pathIdx = 0;
    this.target = null;
    this.reactUntil = 0;
    this.burstLeft = 0;
    this.nextShotAt = 0;
    this.pauseUntil = 0;
    this.holdUntil = 0;
    this.scanYaw = 0;
    this.scanDir = 1;
    this.investigate = null;
    this.lastSeen = null;
    this.lastSeenAt = -99;
    this.objectiveSite = null;
    this.objectiveNode = -1;
    this.isCarrier = false;
    this.channel = 0; // plant / defuse progress 0..1
    this.channelKind = null;
    this.blindUntil = 0;
    this.blindAmount = 0;
    this.deathAt = 0;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
    this.strafeDir = 1;
    this.strafeUntil = 0;
    this.buildMesh();
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE_HEIGHT, this.pos.z);
  }

  // --- visuals --------------------------------------------------------------

  buildMesh() {
    const teamColor = this.team === 'sable' ? 0x3f7de0 : 0xe0492a;
    const cloth = 0x2b2e33;
    const skin = 0xc9a184;
    this.group = new THREE.Group();
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.34), mat(teamColor));
    torso.position.y = 1.12;
    torso.castShadow = true;
    this.group.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 0.38), mat(0x1e2126));
    vest.position.y = 1.2;
    this.group.add(vest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), mat(skin));
    head.position.y = 1.62;
    head.castShadow = true;
    this.group.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), mat(teamColor));
    helmet.position.y = 1.64;
    this.group.add(helmet);
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), mat(cloth));
    this.legL.position.set(-0.14, 0.39, 0);
    this.group.add(this.legL);
    this.legR = this.legL.clone();
    this.legR.position.x = 0.14;
    this.group.add(this.legR);
    // The gun, held forward.
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.72), mat(0x14161a));
    this.gun.position.set(0.22, 1.32, 0.32);
    this.group.add(this.gun);
    this.scene.add(this.group);
  }

  setVisible(v) {
    this.group.visible = v;
  }

  // --- round setup ------------------------------------------------------------

  reset(x, z, yaw, objectiveSite, objectiveNode) {
    this.pos.set(x, 0, z);
    this.lastPos.copy(this.pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = BOT.health;
    this.armor = 0;
    this.alive = true;
    this.mag = this.weapon.mag;
    this.reserve = this.weapon.reserve;
    this.state = 'advance';
    this.path = [];
    this.pathIdx = 0;
    this.target = null;
    this.objectiveSite = objectiveSite;
    this.objectiveNode = objectiveNode;
    this.isCarrier = false;
    this.channel = 0;
    this.channelKind = null;
    this.blindUntil = 0;
    this.blindAmount = 0;
    this.group.visible = true;
    this.group.rotation.set(0, this.yaw, 0);
    this.group.position.copy(this.pos);
    this.group.traverse((m) => { if (m.material) m.material.transparent = false; });
  }

  // --- damage -----------------------------------------------------------------

  takeDamage(amount, attacker, isHeadshot) {
    if (!this.alive) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deathAt = performance.now();
      // Fall over.
      this.group.rotation.x = -Math.PI / 2;
      this.group.position.y = 0.25;
      return true;
    }
    return false;
  }

  // --- perception ---------------------------------------------------------------

  canSee(enemy, now, time) {
    if (!enemy.alive || this.blindAmount > 0.5) return false;
    const dx = enemy.pos.x - this.pos.x;
    const dz = enemy.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > BOT.sightRange) return false;
    // Field of view: the enemy must be in front of where the bot looks.
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    if ((dx * fx + dz * fz) / Math.max(dist, 0.001) < BOT.fovCos) return false;
    const eye = this.eye;
    const targetEye = enemy.eye;
    if (!this.world.hasLOS(eye.x, eye.y, eye.z, targetEye.x, targetEye.y, targetEye.z, time)) {
      // Try the chest: a low crate may hide the head but not the body.
      if (!this.world.hasLOS(eye.x, eye.y, eye.z, enemy.pos.x, enemy.pos.y + 0.95, enemy.pos.z, time)) return false;
    }
    return true;
  }

  hearNoise(noises) {
    for (const n of noises) {
      const d = dist2D(this.pos.x, this.pos.z, n.x, n.z);
      if (d < BOT.hearRadius && n.team !== this.team) {
        if (!this.investigate || d < dist2D(this.pos.x, this.pos.z, this.investigate.x, this.investigate.z)) {
          this.investigate = { x: n.x, z: n.z };
        }
      }
    }
  }

  // --- movement -------------------------------------------------------------------

  moveToward(tx, tz, dt, speed) {
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.15) return true;
    const vx = (dx / dist) * speed;
    const vz = (dz / dist) * speed;
    const nx = this.pos.x + vx * dt;
    const nz = this.pos.z + vz * dt;
    const fixed = this.world.collideCircle(nx, nz, 0.38);
    this.pos.x = fixed.x;
    this.pos.z = fixed.z;
    this.moving = true;
    // Face where we walk, unless we are aiming at someone.
    if (!this.target) {
      this.yaw = angleStep(this.yaw, Math.atan2(-vx, -vz), dt * 6);
    }
    return dist < 0.5;
  }

  followPath(dt, speed) {
    if (this.pathIdx >= this.path.length) return true;
    const node = this.world.waypoints[this.path[this.pathIdx]];
    const arrived = this.moveToward(node.x, node.z, dt, speed);
    if (arrived) this.pathIdx++;
    // Stuck detection: barely moved in a while while trying to walk.
    const moved = dist2D(this.pos.x, this.pos.z, this.lastPos.x, this.lastPos.z);
    if (this.moving && moved < 0.02) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.2) {
        this.stuckTimer = 0;
        this.pathIdx++; // skip the unreachable node
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastPos.copy(this.pos);
    return this.pathIdx >= this.path.length;
  }

  planPathTo(nodeIdx) {
    const from = this.world.nearestWaypoint(this.pos.x, this.pos.z);
    this.path = this.world.findPath(from, nodeIdx);
    this.pathIdx = 0;
  }

  // --- combat ---------------------------------------------------------------------

  // Aim at the target with this bot's error, then fire one shot.
  shootAt(target, actors, effects, audio, time) {
    const dx = target.pos.x - this.pos.x;
    const dz = target.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const aimErr = (BOT.aimErrorBase + dist * BOT.aimErrorPerMetre) * (1.7 - this.skill);
    const targetMoving = target.moving ? 1.4 : 1;
    const err = aimErr * targetMoving * rand(0.5, 1.5);
    const idealYaw = Math.atan2(-dx, -dz);
    const idealPitch = Math.atan2((target.pos.y + 1.1) - (this.pos.y + EYE_HEIGHT), dist);
    this.yaw = idealYaw + rand(-err, err);
    this.pitch = clamp(idealPitch + rand(-err, err), -1.2, 1.2);
    if (this.mag <= 0) {
      // Bots resupply between bursts; an empty reserve refills rather than
      // leaving the bot dry for the rest of the round.
      if (this.reserve <= 0) this.reserve = this.weapon.reserve;
      const take = Math.min(this.weapon.mag, this.reserve);
      this.mag = take;
      this.reserve -= take;
      return null;
    }
    this.mag--;
    const result = fireShot(this, actors, this.world, effects);
    if (audio) audio.shot(this.weapon.sound, dist);
    return result;
  }

  // --- the brain ----------------------------------------------------------------------

  update(dt, ctx) {
    // ctx: { time, actors, player, noises, match, effects, audio, onKill }
    if (!this.alive) return;
    const now = ctx.time;

    // Blindness is binary for a bot: it either can see or it cannot, and the
    // timer decides which. (The player gets a fading white overlay instead.)
    this.blindAmount = now < this.blindUntil ? 1 : 0;
    this.moving = false;

    // Spot the nearest visible enemy.
    let seen = null;
    let seenDist = Infinity;
    for (const a of ctx.actors) {
      if (a === this || a.team === this.team || !a.alive) continue;
      if (this.canSee(a, now, now)) {
        const d = dist2D(this.pos.x, this.pos.z, a.pos.x, a.pos.z);
        if (d < seenDist) { seenDist = d; seen = a; }
      }
    }
    if (seen) {
      this.lastSeen = { x: seen.pos.x, z: seen.pos.z };
      this.lastSeenAt = now;
      if (this.state !== 'engage') {
        this.state = 'engage';
        this.target = seen;
        const reaction = rand(BOT.reactionMin, BOT.reactionMax) * (1.4 - this.skill * 0.8);
        this.reactUntil = now + reaction;
        this.burstLeft = 0;
        this.pauseUntil = now + reaction;
      } else {
        this.target = seen;
      }
    } else if (this.state === 'engage') {
      if (now - this.lastSeenAt > 2.2) {
        this.target = null;
        this.state = 'advance';
        if (this.lastSeen) this.investigate = { ...this.lastSeen };
        this.planPathTo(this.objectiveNode);
      }
    }
    this.hearNoise(ctx.noises);

    switch (this.state) {
      case 'engage': {
        if (!this.target || !this.target.alive) { this.state = 'advance'; break; }
        // Face the target and strafe a little so we are not a still target.
        const dx = this.target.pos.x - this.pos.x;
        const dz = this.target.pos.z - this.pos.z;
        const dist = Math.hypot(dx, dz);
        const idealYaw = Math.atan2(-dx, -dz);
        this.yaw = angleStep(this.yaw, idealYaw, dt * 8);
        if (now > this.strafeUntil) {
          this.strafeDir = Math.random() < 0.5 ? -1 : 1;
          this.strafeUntil = now + rand(0.5, 1.2);
        }
        if (dist > 14) {
          this.moveToward(this.target.pos.x, this.target.pos.z, dt, BOT.walkSpeed * 0.7);
        } else if (dist < 4) {
          this.moveToward(this.pos.x - dx * 0.2, this.pos.z - dz * 0.2, dt, BOT.walkSpeed * 0.6);
        } else {
          // Strafe sideways.
          const sx = -dz / dist * this.strafeDir;
          const sz = dx / dist * this.strafeDir;
          const fixed = this.world.collideCircle(this.pos.x + sx * BOT.walkSpeed * 0.5 * dt, this.pos.z + sz * BOT.walkSpeed * 0.5 * dt, 0.38);
          this.pos.x = fixed.x;
          this.pos.z = fixed.z;
          this.moving = true;
        }
        if (now >= this.reactUntil && now >= this.pauseUntil) {
          if (this.burstLeft <= 0) {
            this.burstLeft = randInt(BOT.burstMin, BOT.burstMax);
          }
          if (now >= this.nextShotAt && this.burstLeft > 0) {
            const result = this.shootAt(this.target, ctx.actors, ctx.effects, ctx.audio, now);
            this.nextShotAt = now + this.weapon.fireInterval;
            this.burstLeft--;
            if (result && result.killed) ctx.onKill(result.killed, this, result.headshot);
            if (this.burstLeft <= 0) {
              this.pauseUntil = now + rand(BOT.burstPauseMin, BOT.burstPauseMax);
            }
          }
        }
        break;
      }
      case 'plant': {
        this.channel += dt / 3.0;
        if (this.channel >= 1) {
          this.channel = 0;
          this.channelKind = null;
          ctx.match.plantBomb(this);
        }
        break;
      }
      case 'defuse': {
        this.channel += dt / 5.0;
        if (this.channel >= 1) {
          this.channel = 0;
          this.channelKind = null;
          ctx.match.defuseBomb(this);
        }
        break;
      }
      case 'advance':
      default: {
        // The carrier plants when it reaches its site with nobody in sight.
        if (this.isCarrier && this.objectiveSite) {
          const site = ctx.match.sites[this.objectiveSite];
          if (dist2D(this.pos.x, this.pos.z, site.x, site.z) < site.r - 1 && !seen) {
            this.state = 'plant';
            this.channelKind = 'plant';
            this.channel = 0;
            break;
          }
        }
        // A defender with a planted bomb rushes the site to defuse.
        if (this.team === 'ember' && ctx.match.bombPlanted) {
          const site = ctx.match.sites[ctx.match.bombSite];
          const d = dist2D(this.pos.x, this.pos.z, site.x, site.z);
          if (d < 1.6) {
            this.state = 'defuse';
            this.channelKind = 'defuse';
            this.channel = 0;
            break;
          }
          if (this.objectiveNode !== ctx.match.siteNode(ctx.match.bombSite)) {
            this.objectiveNode = ctx.match.siteNode(ctx.match.bombSite);
            this.planPathTo(this.objectiveNode);
          }
        }
        if (this.investigate) {
          const done = this.moveToward(this.investigate.x, this.investigate.z, dt, BOT.runSpeed);
          if (done) {
            this.investigate = null;
            this.holdUntil = now + rand(1.5, 3);
            this.state = 'hold';
          }
          break;
        }
        const arrived = this.followPath(dt, BOT.runSpeed);
        if (arrived) {
          this.state = 'hold';
          this.holdUntil = now + rand(2, 5);
          this.scanYaw = this.yaw;
        }
        break;
      }
      case 'hold': {
        // Slow scan, watching the lane.
        this.scanYaw += this.scanDir * dt * 0.7;
        if (this.scanYaw > this.yaw + 1.1) this.scanDir = -1;
        if (this.scanYaw < this.yaw - 1.1) this.scanDir = 1;
        this.yaw = this.scanYaw;
        if (now > this.holdUntil) {
          this.state = 'advance';
          // Pick a fresh objective node: the site, or a nearby lane node.
          if (this.team === 'sable') {
            this.objectiveNode = this.objectiveSite === 'A'
              ? this.world.nearestWaypoint(24, -17)
              : this.world.nearestWaypoint(24, 17);
          } else {
            this.objectiveNode = this.world.nearestWaypoint(
              this.objectiveSite === 'A' ? 24 : 24,
              this.objectiveSite === 'A' ? -17 : 17,
            );
          }
          this.planPathTo(this.objectiveNode);
        }
        break;
      }
    }

    // Sync the mesh: position, facing, walk cycle.
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;
    if (this.moving) {
      const t = now * 9;
      this.legL.rotation.x = Math.sin(t) * 0.55;
      this.legR.rotation.x = -Math.sin(t) * 0.55;
    } else {
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
    }
    this.gun.rotation.x = -this.pitch;
  }
}
