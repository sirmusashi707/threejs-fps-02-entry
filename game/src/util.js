// Small math helpers shared by the whole game. No dependencies.

// Clamp a number into [lo, hi].
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(lo = 0, hi = 1) {
  return lo + Math.random() * (hi - lo);
}

export function randInt(lo, hi) {
  return Math.floor(rand(lo, hi + 1));
}

export function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Shortest signed angular difference, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Move `a` toward `b` by at most `step` radians, wrapping correctly.
export function angleStep(a, b, step) {
  const d = angleDiff(a, b);
  if (Math.abs(d) <= step) return b;
  return a + Math.sign(d) * step;
}

// 2D distance on the ground plane.
export function dist2D(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

// Ray vs axis-aligned box (3D). The ray is o + t*d, t >= 0.
// Returns the smallest t >= 0 where the ray enters the box, or null.
// `box` is { x0, z0, x1, z1, y0, y1 }.
export function rayBox(o, d, box) {
  let tmin = 0;
  let tmax = Infinity;
  const axes = [
    [o.x, d.x, box.x0, box.x1],
    [o.y, d.y, box.y0, box.y1],
    [o.z, d.z, box.z0, box.z1],
  ];
  for (const [origin, dir, lo, hi] of axes) {
    if (Math.abs(dir) < 1e-9) {
      if (origin < lo || origin > hi) return null;
    } else {
      let t1 = (lo - origin) / dir;
      let t2 = (hi - origin) / dir;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

// Ray vs sphere. Returns the smallest t >= 0, or null.
export function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx;
  const oy = o.y - cy;
  const oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

// Does the 2D segment (ax,az)-(bx,bz) cross the footprint of `box`?
// Used for line-of-sight tests on the ground plane; `top` lets a low crate
// block sight only when the sight line passes below its top.
export function segmentHitsBox2D(ax, az, bx, bz, box, yAt) {
  const dx = bx - ax;
  const dz = bz - az;
  let tmin = 0;
  let tmax = 1;
  const axes = [
    [ax, dx, box.x0, box.x1],
    [az, dz, box.z0, box.z1],
  ];
  for (const [origin, dir, lo, hi] of axes) {
    if (Math.abs(dir) < 1e-9) {
      if (origin < lo || origin > hi) return false;
    } else {
      let t1 = (lo - origin) / dir;
      let t2 = (hi - origin) / dir;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  // If the sight line is above the box's top where it crosses, it clears it.
  if (yAt !== undefined && yAt(tmin) > box.y1) return false;
  return tmin <= 1 && tmax >= 0;
}

// Does the 3D segment p0->p1 pass within `r` of the point c?
export function segmentHitsSphere(p0, p1, c, r) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = p1.z - p0.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (len2 > 0) {
    t = ((c.x - p0.x) * dx + (c.y - p0.y) * dy + (c.z - p0.z) * dz) / len2;
    t = clamp(t, 0, 1);
  }
  const px = p0.x + dx * t - c.x;
  const py = p0.y + dy * t - c.y;
  const pz = p0.z + dz * t - c.z;
  return px * px + py * py + pz * pz <= r * r;
}
