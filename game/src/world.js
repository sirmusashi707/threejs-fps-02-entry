// Depot 7 — the map. An original freight yard: two bomb sites (Crane Yard
// north-east, Silo Row south-east), three lanes between the spawns, and
// container rows that force real choices about which lane to take.
// Everything is axis-aligned boxes, which keeps collision, bullets and
// line-of-sight all on the same simple maths.
import * as THREE from 'three';
import { rayBox, segmentHitsBox2D } from './util.js';
import {
  concreteTexture, containerTexture, crateTexture,
  hazardTexture, siteLetterTexture, softCircleTexture,
} from './textures.js';

export const MAP = {
  minX: -36, maxX: 36,
  minZ: -26, maxZ: 26,
  wallHeight: 4,
};

// Every solid thing on the map. {x, z} is the centre, w/d the footprint,
// h the height, kind picks the look. Colliders and meshes come from this one
// list, so what you see is always what blocks you.
const OBSTACLES = [
  // Perimeter walls.
  { x: 0, z: -26.5, w: 74, d: 1, h: 4, kind: 'wall' },
  { x: 0, z: 26.5, w: 74, d: 1, h: 4, kind: 'wall' },
  { x: -36.5, z: 0, w: 1, d: 54, h: 4, kind: 'wall' },
  { x: 36.5, z: 0, w: 1, d: 54, h: 4, kind: 'wall' },
  // North container row — makes the north lane, with gaps to cross through.
  { x: -20, z: -12, w: 10, d: 2.6, h: 2.6, kind: 'container', color: '#8a3b2e' },
  { x: -6, z: -12, w: 10, d: 2.6, h: 2.6, kind: 'container', color: '#2e5d6b' },
  { x: 8, z: -12, w: 8, d: 2.6, h: 2.6, kind: 'container', color: '#7a6a2f' },
  // South container row, mirrored.
  { x: -20, z: 12, w: 10, d: 2.6, h: 2.6, kind: 'container', color: '#2e5d6b' },
  { x: -6, z: 12, w: 10, d: 2.6, h: 2.6, kind: 'container', color: '#8a3b2e' },
  { x: 8, z: 12, w: 8, d: 2.6, h: 2.6, kind: 'container', color: '#4a4f55' },
  // Double-stacked containers guarding the site approaches.
  { x: 16, z: -19, w: 6, d: 2.6, h: 5.2, kind: 'container', color: '#5d3a5e' },
  { x: 16, z: 19, w: 6, d: 2.6, h: 5.2, kind: 'container', color: '#7a6a2f' },
  // Mid: the conveyor platform you can shoot over but not walk through.
  { x: -2, z: 0, w: 10, d: 3, h: 1.1, kind: 'crate' },
  // Mid crates — the crossfire cover in the middle of the yard.
  { x: -14, z: 3, w: 2.4, d: 2.4, h: 2.2, kind: 'crate' },
  { x: -14, z: 3, w: 1.2, d: 1.2, h: 3.3, kind: 'crate', dy: 0 },
  { x: 12, z: -4, w: 2.4, d: 2.4, h: 2.2, kind: 'crate' },
  { x: 13, z: 5, w: 1.6, d: 1.6, h: 1.1, kind: 'crate' },
  { x: -26, z: -6, w: 2.4, d: 2.4, h: 1.1, kind: 'crate' },
  { x: -26, z: 7, w: 2.4, d: 2.4, h: 1.1, kind: 'crate' },
  // Site A cover: low crates inside Crane Yard.
  { x: 20, z: -20, w: 2.4, d: 1.2, h: 1.1, kind: 'crate' },
  { x: 28, z: -13, w: 1.6, d: 1.6, h: 1.1, kind: 'crate' },
  // Site B cover: crates around Silo Row.
  { x: 20, z: 20, w: 2.4, d: 1.2, h: 1.1, kind: 'crate' },
  { x: 28, z: 13, w: 1.6, d: 1.6, h: 1.1, kind: 'crate' },
  // The silo itself, the landmark of site B.
  { x: 24, z: 17, w: 5.4, d: 5.4, h: 7, kind: 'silo' },
  // Site screens: tall containers that stop the defenders seeing straight
  // into the sites from their own spawn. A site you can shoot from spawn
  // is not a site worth attacking.
  { x: 28, z: -9, w: 2.6, d: 8, h: 2.6, kind: 'container', color: '#4a4f55' },
  { x: 28, z: 9, w: 2.6, d: 8, h: 2.6, kind: 'container', color: '#2e5d6b' },
  // Spawn cover so nobody gets shot the second the round starts.
  { x: -28, z: -4, w: 2.4, d: 2.4, h: 2.2, kind: 'crate' },
  { x: -28, z: 4, w: 2.4, d: 2.4, h: 2.2, kind: 'crate' },
  { x: 28, z: -4, w: 2.4, d: 2.4, h: 2.2, kind: 'crate' },
  { x: 28, z: 4, w: 2.4, d: 2.4, h: 2.2, kind: 'crate' },
];

// Waypoint nodes for the bots. Links are computed, not hand-written: two
// nodes link when they are close and no tall obstacle stands between them.
const WAYPOINTS = [
  [-31, 0], [-31, -9], [-31, 9],
  [-24, -18], [-24, 0], [-24, 18],
  [-14, -18], [-14, 0], [-14, 18],
  [-2, -18], [-2, -6], [-2, 6], [-2, 18],
  [10, -18], [10, 0], [10, 18],
  [18, -18], [18, 0], [18, 18],
  [24, -17], [24, 17],
  [31, -9], [31, 0], [31, 9],
  [-19, -18], [-19, 18], [29, -18], [29, 18],
];

export const SITES = {
  A: { id: 'A', name: 'Crane Yard', x: 24, z: -17, r: 5.5 },
  B: { id: 'B', name: 'Silo Row', x: 24, z: 17, r: 5.5 },
};

export const SPAWNS = {
  sable: [
    [-31, -3], [-31, 3], [-33, 0], [-29, -6], [-29, 6],
  ],
  ember: [
    [31, -3], [31, 3], [33, 0], [29, -6], [29, 6],
  ],
};

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {x0,z0,x1,z1,y0,y1} — 3D boxes
    this.footprints = []; // same boxes, for 2D tests
    this.smoke = []; // {x,y,z,r,until} — live smoke clouds block sight
    this.buildLights();
    this.buildGround();
    this.buildObstacles();
    this.buildSites();
    this.buildSky();
    this.buildWaypoints();
  }

  // --- construction -------------------------------------------------------

  buildLights() {
    const hemi = new THREE.HemisphereLight(0x8fa8cc, 0x3a3230, 1.05);
    this.scene.add(hemi);
    // Low dusk sun from the west, warm.
    const sun = new THREE.DirectionalLight(0xffc98a, 1.9);
    sun.position.set(-30, 26, -14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.scene.add(sun.target);
    // Two floodlights over the sites, the only point lights in the scene.
    for (const [x, z] of [[24, -17], [24, 17]]) {
      const lamp = new THREE.PointLight(0xffd9a0, 22, 26, 1.8);
      lamp.position.set(x, 6.5, z);
      this.scene.add(lamp);
    }
    this.scene.fog = new THREE.Fog(0x232c3d, 55, 130);
  }

  buildGround() {
    const geo = new THREE.PlaneGeometry(74, 54);
    const mat = new THREE.MeshStandardMaterial({
      map: concreteTexture(), roughness: 0.94, metalness: 0.02,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  buildObstacles() {
    const containerMats = {};
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.9, metalness: 0.25 });
    const siloMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.45, metalness: 0.75 });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    for (const o of OBSTACLES) {
      let mat = wallMat;
      let geo = boxGeo;
      let h = o.h;
      if (o.kind === 'container') {
        if (!containerMats[o.color]) {
          containerMats[o.color] = new THREE.MeshStandardMaterial({
            map: containerTexture(o.color, '#e8c440'), roughness: 0.7, metalness: 0.35,
          });
        }
        mat = containerMats[o.color];
      } else if (o.kind === 'crate') {
        mat = crateMat;
      } else if (o.kind === 'silo') {
        geo = new THREE.CylinderGeometry(2.7, 2.7, h, 20);
        mat = siloMat;
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(o.x, h / 2, o.z);
      if (o.kind !== 'silo') mesh.scale.set(o.w, h, o.d);
      mesh.castShadow = o.h > 1.5;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      const box = {
        x0: o.x - o.w / 2, x1: o.x + o.w / 2,
        z0: o.z - o.d / 2, z1: o.z + o.d / 2,
        y0: 0, y1: h,
      };
      this.colliders.push(box);
      this.footprints.push(box);
    }

    // Crane over site A — legs collide, the beam is decoration above play.
    const craneMat = new THREE.MeshStandardMaterial({ color: 0xc8a028, roughness: 0.6, metalness: 0.5 });
    for (const lx of [19, 29]) {
      const leg = new THREE.Mesh(boxGeo, craneMat);
      leg.scale.set(0.8, 9, 0.8);
      leg.position.set(lx, 4.5, -21);
      leg.castShadow = true;
      this.scene.add(leg);
      this.colliders.push({ x0: lx - 0.4, x1: lx + 0.4, z0: -21.4, z1: -20.6, y0: 0, y1: 9 });
    }
    const beam = new THREE.Mesh(boxGeo, craneMat);
    beam.scale.set(12, 0.8, 0.8);
    beam.position.set(24, 9, -21);
    this.scene.add(beam);
    // Hanging hook cable.
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 4.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
    );
    cable.position.set(24, 6.5, -21);
    this.scene.add(cable);

    // Floodlight poles at both sites (visual; the lamps are the point lights).
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.7, metalness: 0.6 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffc86a, emissiveIntensity: 2.2 });
    for (const [x, z] of [[24, -17], [24, 17]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 8), poleMat);
      pole.position.set(x + 5, 3.5, z);
      this.scene.add(pole);
      const head = new THREE.Mesh(boxGeo, lampMat);
      head.scale.set(0.9, 0.25, 0.4);
      head.position.set(x + 5, 7, z);
      this.scene.add(head);
    }
  }

  buildSites() {
    const hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.9, transparent: true });
    for (const site of Object.values(SITES)) {
      // Hazard ring on the ground marking the plant zone.
      const ring = new THREE.Mesh(new THREE.RingGeometry(site.r - 0.45, site.r, 40), hazard);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(site.x, 0.02, site.z);
      this.scene.add(ring);
      const letter = new THREE.Mesh(
        new THREE.PlaneGeometry(4.4, 4.4),
        new THREE.MeshBasicMaterial({ map: siteLetterTexture(site.id), transparent: true, depthWrite: false }),
      );
      letter.rotation.x = -Math.PI / 2;
      letter.position.set(site.x, 0.03, site.z);
      this.scene.add(letter);
      // Floating site label post at the edge of the zone.
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 2.4, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x2c2f33 }),
      );
      post.position.set(site.x - site.r - 0.4, 1.2, site.z);
      this.scene.add(post);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 0.9),
        new THREE.MeshBasicMaterial({ color: 0x1c1e22 }),
      );
      sign.position.set(site.x - site.r - 0.4, 2.6, site.z);
      sign.rotation.y = Math.PI / 4;
      this.scene.add(sign);
    }
  }

  buildSky() {
    // Dusk gradient dome: a big sphere, back side, canvas gradient.
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0e1626');
    grad.addColorStop(0.55, '#2c3d5c');
    grad.addColorStop(0.75, '#7a5a44');
    grad.addColorStop(1, '#3a3230');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(160, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
    );
    this.scene.add(dome);
    this.scene.background = new THREE.Color(0x1a2436);
  }

  buildWaypoints() {
    this.waypoints = WAYPOINTS.map(([x, z]) => ({ x, z, links: [] }));
    // Link pairs that are close with a clear walk between them. Tall
    // obstacles block a link; low crates (h <= 1.4) do not — bots walk around
    // those by steering, and the graph stays connected through the gaps.
    for (let i = 0; i < this.waypoints.length; i++) {
      for (let j = i + 1; j < this.waypoints.length; j++) {
        const a = this.waypoints[i];
        const b = this.waypoints[j];
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d > 13.5) continue;
        let blocked = false;
        for (const box of this.footprints) {
          if (box.y1 <= 1.4) continue;
          if (segmentHitsBox2D(a.x, a.z, b.x, b.z, box)) { blocked = true; break; }
        }
        if (!blocked) {
          a.links.push(j);
          b.links.push(i);
        }
      }
    }
  }

  // --- queries used by gameplay -------------------------------------------

  // Nearest waypoint index to (x, z).
  nearestWaypoint(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.waypoints.length; i++) {
      const w = this.waypoints[i];
      const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // BFS path of waypoint indices from node `from` to node `to`.
  findPath(from, to) {
    if (from === to) return [to];
    const prev = new Array(this.waypoints.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length) {
      const cur = queue.shift();
      for (const n of this.waypoints[cur].links) {
        if (prev[n] !== -1) continue;
        prev[n] = cur;
        if (n === to) {
          const path = [to];
          let c = to;
          while (c !== from) { c = prev[c]; path.unshift(c); }
          return path;
        }
        queue.push(n);
      }
    }
    return [to];
  }

  // Push a circle (x, z, radius) out of every collider it overlaps.
  // Returns the corrected position. Low crates (h <= 1.1) still block feet.
  collideCircle(x, z, radius) {
    for (const b of this.colliders) {
      const cx = Math.max(b.x0, Math.min(x, b.x1));
      const cz = Math.max(b.z0, Math.min(z, b.z1));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 < 1e-8) {
        // Centre inside the box: push out along the smallest penetration.
        const pl = x - b.x0, pr = b.x1 - x, pt = z - b.z0, pb = b.z1 - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.x0 - radius;
        else if (m === pr) x = b.x1 + radius;
        else if (m === pt) z = b.z0 - radius;
        else z = b.z1 + radius;
      } else {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      }
    }
    x = Math.max(MAP.minX + 0.5, Math.min(MAP.maxX - 0.5, x));
    z = Math.max(MAP.minZ + 0.5, Math.min(MAP.maxZ - 0.5, z));
    return { x, z };
  }

  // Nearest wall hit for a ray, up to maxDist. Returns {t, point} or null.
  rayWalls(o, d, maxDist) {
    let best = null;
    for (const b of this.colliders) {
      const t = rayBox(o, d, b);
      if (t !== null && t <= maxDist && (best === null || t < best.t)) {
        best = { t, point: { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t } };
      }
    }
    return best;
  }

  // Line of sight between two eye positions. Walls block; low crates block
  // only when the sight line dips below their top; live smoke blocks too.
  hasLOS(ax, ay, az, bx, by, bz, now) {
    const yAt = (t) => ay + (by - ay) * t;
    for (const b of this.footprints) {
      if (segmentHitsBox2D(ax, az, bx, bz, b, yAt)) return false;
    }
    for (const s of this.smoke) {
      if (now > s.until) continue;
      // Segment vs sphere in 3D, approximated by checking the closest
      // approach of the sight line to the cloud centre.
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const len2 = dx * dx + dy * dy + dz * dz;
      let t = 0;
      if (len2 > 0) {
        t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
      }
      const px = ax + dx * t - s.x;
      const py = ay + dy * t - s.y;
      const pz = az + dz * t - s.z;
      if (px * px + py * py + pz * pz < s.r * s.r) return false;
    }
    return true;
  }
}
