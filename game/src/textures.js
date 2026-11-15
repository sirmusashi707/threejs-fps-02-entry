// Procedural textures, painted on offscreen canvases at load time.
// No image files, no network: the whole look of Depot 7 is generated here.
import * as THREE from 'three';

function canvasTexture(size, painter, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  painter(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx, size, n, colors, alphaMin, alphaMax, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alphaMin + Math.random() * (alphaMax - alphaMin);
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    const r = rMin + Math.random() * (rMax - rMin);
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Weathered concrete yard floor with expansion joints and oil stains.
export function concreteTexture() {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#5d6066';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 2600, ['#6a6d72', '#54575c', '#787b80', '#4a4d52'], 0.15, 0.5, 1, 4);
    // Expansion joints.
    ctx.strokeStyle = 'rgba(30,32,36,0.85)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo((i * s) / 2, 0); ctx.lineTo((i * s) / 2, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (i * s) / 2); ctx.lineTo(s, (i * s) / 2); ctx.stroke();
    }
    // Oil stains.
    for (let i = 0; i < 7; i++) {
      ctx.globalAlpha = 0.10 + Math.random() * 0.12;
      ctx.fillStyle = '#22242a';
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 20 + Math.random() * 55, 14 + Math.random() * 30, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, 8, 6);
}

// Corrugated freight container side. `base` is the paint colour.
export function containerTexture(base, stripe) {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const ribs = 16;
    const w = s / ribs;
    for (let i = 0; i < ribs; i++) {
      const grad = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.35)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.10)');
      grad.addColorStop(0.65, 'rgba(0,0,0,0.05)');
      grad.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = grad;
      ctx.fillRect(i * w, 0, w, s);
    }
    // Rust streaks running down from the top edge.
    for (let i = 0; i < 26; i++) {
      ctx.globalAlpha = 0.08 + Math.random() * 0.16;
      ctx.fillStyle = '#3a2415';
      const x = Math.random() * s;
      ctx.fillRect(x, 0, 2 + Math.random() * 5, 30 + Math.random() * 140);
    }
    ctx.globalAlpha = 1;
    // Stencilled stripe + code, like a real container marking.
    ctx.fillStyle = stripe;
    ctx.fillRect(0, s - 46, s, 10);
    ctx.font = 'bold 34px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('DP7-' + (100 + Math.floor(Math.random() * 800)), 18, 64);
  }, 2, 1);
}

// Wooden crate planks with nailed edges.
export function crateTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#7a5c38';
    ctx.fillRect(0, 0, s, s);
    for (let p = 0; p < 4; p++) {
      const y = (p * s) / 4;
      ctx.fillStyle = p % 2 ? '#83653d' : '#6f5232';
      ctx.fillRect(0, y + 2, s, s / 4 - 4);
      ctx.strokeStyle = 'rgba(40,26,12,0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, y + 2, s - 2, s / 4 - 4);
      // Grain.
      ctx.strokeStyle = 'rgba(60,40,18,0.35)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 5; g++) {
        const gy = y + 8 + Math.random() * (s / 4 - 16);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(s * 0.3, gy + 4, s * 0.6, gy - 4, s, gy + 2);
        ctx.stroke();
      }
    }
    // Corner nails.
    ctx.fillStyle = '#2e2a24';
    for (const [x, y] of [[10, 10], [s - 10, 10], [10, s - 10], [s - 10, s - 10]]) {
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
  });
}

// Diagonal hazard stripes for the edges of a bomb site.
export function hazardTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#c8a028';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#1c1c1e';
    for (let i = -4; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 48, s);
      ctx.lineTo(i * 48 + 48, s);
      ctx.lineTo(i * 48 + 96, 0);
      ctx.lineTo(i * 48 + 48, 0);
      ctx.closePath();
      ctx.fill();
    }
  }, 4, 1);
}

// Painted site letter (A / B) on the ground, faded like yard paint.
export function siteLetterTexture(letter) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(232,196,64,0.9)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(232,196,64,0.9)';
  ctx.font = 'bold 150px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 134);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Soft round sprite for smoke puffs, muzzle glow and impact dust.
export function softCircleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
