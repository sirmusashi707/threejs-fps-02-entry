// Transient visual effects: tracers, muzzle flashes, impact sparks, smoke
// clouds and the bomb explosion. Everything is pooled or short-lived, so a
// long firefight never leaks geometry.
import * as THREE from 'three';
import { softCircleTexture } from './textures.js';

export class Effects {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.tracers = [];
    this.sparks = [];
    this.smokes = [];
    this.flashes = [];
    this.softTex = softCircleTexture();
    this.muzzleLight = new THREE.PointLight(0xffc27a, 0, 9, 2);
    this.scene.add(this.muzzleLight);
  }

  tracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  // Impact puff: a few bright sparks plus a soft dust sprite.
  impact(point, headshot, wall = false) {
    const count = headshot ? 10 : 6;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3,
        (Math.random() - 0.5) * 4,
      ));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: wall ? 0xffc27a : 0xff5a4a, size: 0.09, transparent: true, opacity: 1,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.sparks.push({ pts, velocities, life: 0.35 });
    if (wall) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.softTex, color: 0x9a938a, transparent: true, opacity: 0.5, depthWrite: false,
      }));
      sprite.position.set(point.x, point.y, point.z);
      sprite.scale.setScalar(0.5);
      this.scene.add(sprite);
      this.sparks.push({ sprite, life: 0.4 });
    }
  }

  muzzleFlash(pos, dir) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.softTex, color: 0xffc27a, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    const p = pos.clone().addScaledVector(dir, 0.6);
    sprite.position.copy(p);
    sprite.scale.setScalar(0.55);
    this.scene.add(sprite);
    this.flashes.push({ sprite, life: 0.05 });
    this.muzzleLight.position.copy(p);
    this.muzzleLight.intensity = 26;
  }

  // Smoke cloud: a cluster of big soft sprites that also blocks bot sight
  // through world.smoke until it expires.
  smoke(pos, duration, now) {
    const group = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.softTex, color: 0xb9bec6, transparent: true, opacity: 0.55, depthWrite: false,
      }));
      sprite.position.set(
        pos.x + (Math.random() - 0.5) * 3.4,
        0.6 + Math.random() * 1.8,
        pos.z + (Math.random() - 0.5) * 3.4,
      );
      sprite.scale.setScalar(2.2 + Math.random() * 1.6);
      group.add(sprite);
    }
    this.scene.add(group);
    this.world.smoke.push({ x: pos.x, y: 1.4, z: pos.z, r: 3.4, until: now + duration });
    this.smokes.push({ group, until: now + duration });
  }

  explosion(pos) {
    // Fireball + shockwave ring + light, all fading fast.
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa63d, transparent: true, opacity: 0.95 }),
    );
    ball.position.copy(pos);
    ball.position.y = Math.max(1, pos.y);
    this.scene.add(ball);
    const light = new THREE.PointLight(0xff8a3d, 120, 40, 1.6);
    light.position.copy(ball.position);
    this.scene.add(light);
    this.flashes.push({ mesh: ball, light, life: 0.7, grow: true });
    for (let i = 0; i < 26; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.softTex, color: 0x555049, transparent: true, opacity: 0.7, depthWrite: false,
      }));
      sprite.position.set(
        pos.x + (Math.random() - 0.5) * 4,
        0.5 + Math.random() * 3,
        pos.z + (Math.random() - 0.5) * 4,
      );
      sprite.scale.setScalar(2 + Math.random() * 2.5);
      this.scene.add(sprite);
      this.sparks.push({ sprite, life: 1.6 });
    }
  }

  update(dt, now) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.pts) {
        const attr = s.pts.geometry.attributes.position;
        for (let j = 0; j < s.velocities.length; j++) {
          attr.array[j * 3] += s.velocities[j].x * dt;
          attr.array[j * 3 + 1] += s.velocities[j].y * dt;
          attr.array[j * 3 + 2] += s.velocities[j].z * dt;
          s.velocities[j].y -= 9 * dt;
        }
        attr.needsUpdate = true;
        s.pts.material.opacity = Math.max(0, s.life / 0.35);
      } else if (s.sprite) {
        s.sprite.material.opacity = Math.max(0, s.life / 1.6) * 0.6;
        s.sprite.scale.multiplyScalar(1 + dt * 0.6);
      }
      if (s.life <= 0) {
        if (s.pts) { this.scene.remove(s.pts); s.pts.geometry.dispose(); s.pts.material.dispose(); }
        if (s.sprite) { this.scene.remove(s.sprite); s.sprite.material.dispose(); }
        this.sparks.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.mesh) {
        f.mesh.scale.multiplyScalar(1 + dt * 14);
        f.mesh.material.opacity = Math.max(0, f.life / 0.7);
        if (f.light) f.light.intensity = Math.max(0, f.life / 0.7) * 120;
      } else if (f.sprite) {
        f.sprite.material.opacity = Math.max(0, f.life / 0.05);
      }
      if (f.life <= 0) {
        if (f.mesh) { this.scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
        if (f.light) this.scene.remove(f.light);
        if (f.sprite) { this.scene.remove(f.sprite); f.sprite.material.dispose(); }
        this.flashes.splice(i, 1);
      }
    }
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 500);
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      if (now > s.until) {
        this.scene.remove(s.group);
        s.group.children.forEach((c) => c.material.dispose());
        this.smokes.splice(i, 1);
      }
    }
    // Expired smoke stops blocking sight.
    this.world.smoke = this.world.smoke.filter((s) => now < s.until);
  }
}
