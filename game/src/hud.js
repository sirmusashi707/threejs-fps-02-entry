// The HUD: everything drawn over the 3D view — health, ammo, money, timer,
// score, kill feed, minimap, banners and the buy menu. All DOM, so it stays
// crisp at any resolution and costs the renderer nothing.
import { WEAPONS, GRENADES, ARMOR_PRICE, TEAM_INFO } from './config.js';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of [
      'crosshair', 'hitmarker', 'health-num', 'health-bar', 'armor-num',
      'ammo-mag', 'ammo-reserve', 'weapon-name', 'money', 'timer', 'timer-label',
      'score-sable', 'score-ember', 'killfeed', 'minimap', 'teamlist',
      'banner', 'banner-title', 'banner-sub', 'bomb-status', 'objective',
      'round-label', 'buy-menu', 'buy-grid', 'buy-grenades', 'buy-money',
      'menu-overlay', 'pause-overlay', 'end-overlay', 'end-title', 'end-sub',
      'end-stats', 'vignette', 'flash-overlay', 'reload-hint', 'hint',
      'scope-overlay', 'plant-progress', 'plant-fill', 'plant-label',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el.minimap.getContext('2d');
    this.hitTimer = 0;
    this.buildBuyMenu();
  }

  // --- buy menu ---------------------------------------------------------------

  buildBuyMenu() {
    const grid = this.el['buy-grid'];
    for (const w of Object.values(WEAPONS)) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'buy-card';
      card.dataset.buy = 'weapon:' + w.id;
      const bars = (v, max) => {
        const n = Math.round((v / max) * 5);
        return '▰'.repeat(n) + '▱'.repeat(5 - n);
      };
      card.innerHTML =
        '<span class="buy-name">' + w.name + '</span>' +
        '<span class="buy-price">' + (w.price === 0 ? 'OWNED' : '$' + w.price.toLocaleString()) + '</span>' +
        '<span class="buy-stats">DMG ' + bars(w.damage, 120) + '<br>' +
        'RPM ' + bars(60 / w.fireInterval, 800) + '<br>' +
        'ACC ' + bars(1 - w.spread * 12, 1) + '</span>';
      grid.appendChild(card);
    }
    const gren = this.el['buy-grenades'];
    for (const g of Object.values(GRENADES)) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'buy-card buy-grenade';
      card.dataset.buy = 'grenade:' + g.id;
      card.innerHTML =
        '<span class="buy-name">' + g.name + '</span>' +
        '<span class="buy-price">$' + g.price + '</span>' +
        '<span class="buy-stats">' + g.desc + '</span>';
      gren.appendChild(card);
    }
    const armor = document.createElement('button');
    armor.type = 'button';
    armor.className = 'buy-card buy-grenade';
    armor.dataset.buy = 'armor';
    armor.innerHTML =
      '<span class="buy-name">Kevlar Vest</span>' +
      '<span class="buy-price">$' + ARMOR_PRICE + '</span>' +
      '<span class="buy-stats">Absorbs half of incoming damage until it breaks.</span>';
    gren.appendChild(armor);
  }

  // onBuy('weapon:vantage' | 'grenade:shard' | 'armor') — returns true if bought.
  bindBuy(onBuy, onDeploy) {
    this.el['buy-menu'].addEventListener('click', (e) => {
      const card = e.target.closest('[data-buy]');
      if (card) onBuy(card.dataset.buy);
      if (e.target.id === 'deploy-btn') onDeploy();
    });
  }

  showBuy(money) {
    this.el['buy-money'].textContent = '$' + money.toLocaleString();
    this.el['buy-menu'].hidden = false;
  }

  hideBuy() {
    this.el['buy-menu'].hidden = true;
  }

  markOwned(weaponId, grenades) {
    for (const card of this.el['buy-menu'].querySelectorAll('[data-buy]')) {
      const [kind, id] = card.dataset.buy.split(':');
      let owned = false;
      if (kind === 'weapon' && id === weaponId) owned = true;
      if (kind === 'grenade' && (grenades[id] || 0) > 0) owned = true;
      if (kind === 'armor') owned = false;
      card.classList.toggle('owned', owned);
    }
  }

  // --- per-frame state ----------------------------------------------------------

  update(g) {
    // g: the game object (see main.js) — read-only here.
    const p = g.player;
    this.el['health-num'].textContent = Math.ceil(p.health);
    this.el['health-bar'].style.width = Math.max(0, p.health) + '%';
    this.el['health-bar'].classList.toggle('low', p.health <= 30);
    this.el['armor-num'].textContent = Math.ceil(p.armor);
    this.el['ammo-mag'].textContent = g.mag;
    this.el['ammo-reserve'].textContent = '/ ' + g.reserve;
    this.el['weapon-name'].textContent = g.weapon.name;
    this.el['ammo-mag'].parentElement.classList.toggle('empty', g.mag === 0);
    this.el['money'].textContent = '$' + p.money.toLocaleString();
    this.el['score-sable'].textContent = g.score.sable;
    this.el['score-ember'].textContent = g.score.ember;
    this.el['round-label'].textContent = 'ROUND ' + g.round + ' / ' + g.maxRounds;
    this.el['timer'].textContent = fmtTime(g.timer);
    this.el['timer'].classList.toggle('urgent', g.timer <= 10 && g.phase === 'live');
    this.el['objective'].textContent = g.objectiveText;
    this.el['reload-hint'].hidden = !(g.mag === 0 && g.reserve > 0) && !g.reloading;
    this.el['reload-hint'].textContent = g.reloading ? 'RELOADING…' : 'PRESS R TO RELOAD';

    // Bomb status line.
    if (g.bombPlanted) {
      this.el['bomb-status'].hidden = false;
      this.el['bomb-status'].textContent = 'CHARGE PLANTED — ' + fmtTime(g.bombTimer) + ' — ' + g.bombSiteName;
      this.el['bomb-status'].classList.add('danger');
    } else if (g.phase === 'live' && g.carrierIsPlayer) {
      this.el['bomb-status'].hidden = false;
      this.el['bomb-status'].textContent = 'YOU CARRY THE CHARGE — PLANT AT A OR B (HOLD E)';
      this.el['bomb-status'].classList.remove('danger');
    } else {
      this.el['bomb-status'].hidden = true;
    }

    // Plant / defuse progress bar.
    if (g.channel) {
      this.el['plant-progress'].hidden = false;
      this.el['plant-fill'].style.width = Math.round(g.channel.progress * 100) + '%';
      this.el['plant-label'].textContent = g.channel.label;
    } else {
      this.el['plant-progress'].hidden = true;
    }

    // Teammate list: who is still standing.
    let html = '';
    for (const mate of g.teammates) {
      html += '<div class="mate' + (mate.alive ? '' : ' dead') + '">' +
        '<span class="mate-dot" style="background:' + TEAM_INFO[mate.team].css + '"></span>' +
        mate.name + ' <span class="mate-hp">' + (mate.alive ? Math.ceil(mate.health) : '✕') + '</span></div>';
    }
    if (this._teamHtml !== html) { this.el.teamlist.innerHTML = html; this._teamHtml = html; }

    // Crosshair spread grows with the current spread cone.
    const gap = 4 + g.spreadPx;
    this.el.crosshair.style.setProperty('--gap', gap + 'px');
    this.el.crosshair.classList.toggle('hidden', g.scoped);
    this.el['scope-overlay'].hidden = !g.scoped;
    this.el['flash-overlay'].style.opacity = g.flashAmount.toFixed(2);
    this.el.vignette.style.opacity = g.hurtAmount.toFixed(2);
    if (this.hitTimer > 0) {
      this.hitTimer -= 1 / 60;
      if (this.hitTimer <= 0) this.el.hitmarker.classList.remove('on', 'kill');
    }
    this.drawMinimap(g);
  }

  hitmarker(kill) {
    this.el.hitmarker.classList.add('on');
    if (kill) this.el.hitmarker.classList.add('kill');
    this.hitTimer = 0.18;
  }

  killfeed(killer, victim, headshot, killerTeam) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    const color = TEAM_INFO[killerTeam].css;
    row.innerHTML =
      '<span style="color:' + color + '">' + killer + '</span>' +
      (headshot ? ' <span class="hs">◉</span> ' : ' ── ') +
      '<span>' + victim + '</span>';
    this.el.killfeed.prepend(row);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => row.remove(), 6000);
  }

  banner(title, sub, color) {
    this.el['banner-title'].textContent = title;
    this.el['banner-sub'].textContent = sub || '';
    this.el['banner-title'].style.color = color || '#e9e6df';
    this.el.banner.classList.add('show');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), 3200);
  }

  hint(text, ms = 3500) {
    this.el.hint.textContent = text;
    this.el.hint.hidden = false;
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => { this.el.hint.hidden = true; }, ms);
  }

  showOverlay(which) {
    for (const id of ['menu-overlay', 'pause-overlay', 'end-overlay']) {
      this.el[id].hidden = id !== which;
    }
    // The buy menu is an overlay too: never stack it under another one.
    this.hideBuy();
  }

  hideOverlays() {
    for (const id of ['menu-overlay', 'pause-overlay', 'end-overlay']) {
      this.el[id].hidden = true;
    }
  }

  showEnd(won, statsHtml) {
    this.el['end-title'].textContent = won ? 'SABLE TAKES DEPOT 7' : 'EMBER HOLDS DEPOT 7';
    this.el['end-title'].style.color = won ? '#5ea0ff' : '#ff6b3d';
    this.el['end-sub'].textContent = won
      ? 'The yard is yours. The charge did its work — or the last Ember fell.'
      : 'The defenders held. Re-group, re-buy, and take the next yard.';
    this.el['end-stats'].innerHTML = statsHtml;
    this.showOverlay('end-overlay');
  }

  // --- minimap -------------------------------------------------------------------

  drawMinimap(g) {
    const ctx = this.mapCtx;
    const W = 168;
    const H = 124;
    const sx = (x) => ((x + 37) / 74) * W;
    const sz = (z) => ((z + 27) / 54) * H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(12,14,18,0.72)';
    ctx.fillRect(0, 0, W, H);
    // Walls and containers.
    ctx.fillStyle = '#5a6068';
    for (const b of g.world.footprints) {
      ctx.fillRect(sx(b.x0), sz(b.z0), sx(b.x1) - sx(b.x0), sz(b.z1) - sz(b.z0));
    }
    // Sites.
    for (const site of Object.values(g.worldSites)) {
      ctx.strokeStyle = '#e8c440';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx(site.x), sz(site.z), (site.r / 74) * W, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#e8c440';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(site.id, sx(site.x), sz(site.z) + 4);
    }
    // Bomb.
    if (g.bombPlanted && g.bombPos) {
      ctx.fillStyle = '#ffcf3d';
      ctx.beginPath();
      ctx.arc(sx(g.bombPos.x), sz(g.bombPos.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Enemies the player can currently see.
    for (const e of g.visibleEnemies) {
      ctx.fillStyle = '#ff5a3c';
      ctx.beginPath();
      ctx.arc(sx(e.pos.x), sz(e.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Teammates.
    for (const mate of g.teammates) {
      if (!mate.alive) continue;
      ctx.fillStyle = '#5ea0ff';
      ctx.beginPath();
      ctx.arc(sx(mate.pos.x), sz(mate.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: an arrow showing facing.
    const px = sx(g.player.pos.x);
    const pz = sz(g.player.pos.z);
    ctx.save();
    ctx.translate(px, pz);
    // Minimap north is -z; yaw -PI/2 faces +x (east, right on the map).
    ctx.rotate(Math.atan2(-Math.cos(g.player.yaw), -Math.sin(g.player.yaw)) + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
