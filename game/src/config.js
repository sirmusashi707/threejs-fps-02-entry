// SABLE PROTOCOL — tuning, weapons and economy.
// Every number that shapes how the game feels lives here, so a balance pass
// touches one file. All names, prices and stats are original to this game.

export const TEAMS = {
  SABLE: 'sable', // attackers: the player's team, plants the charge
  EMBER: 'ember', // defenders: hold the two sites, defuse the charge
};

export const TEAM_INFO = {
  sable: { name: 'SABLE', color: 0x4f8ef7, css: '#5ea0ff', spawnYaw: -Math.PI / 2 },
  ember: { name: 'EMBER', color: 0xff5a2a, css: '#ff6b3d', spawnYaw: Math.PI / 2 },
};

// First team to this many round wins takes the match.
export const ROUNDS_TO_WIN = 8;
export const MAX_ROUNDS = 15;
// Buy / freeze time before a round goes live, in seconds.
export const BUY_TIME = 14;
export const ROUND_TIME = 100;
export const BOMB_TIMER = 35;
export const PLANT_TIME = 3.0;
export const DEFUSE_TIME = 5.0;

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  plantReward: 300,
  defuseReward: 300,
  winReward: 3250,
  lossReward: 1900,
  lossBonusStep: 500, // +$500 per consecutive loss, up to the cap
  lossBonusCap: 3400,
  maxMoney: 16000,
};

// Weapons. Accuracy is the skill: standing still and aiming down sights
// shrinks the spread cone a lot, sprinting and jumping blow it up, and every
// gun kicks the view up a little per shot.
export const WEAPONS = {
  sparrow: {
    id: 'sparrow', name: 'P9 Sparrow', kind: 'pistol', price: 0,
    damage: 34, headshotMult: 2.0, mag: 12, reserve: 48,
    fireInterval: 0.16, reloadTime: 1.4, auto: false,
    spread: 0.011, moveSpread: 0.030, adsMult: 0.45, recoil: 0.011,
    pellets: 1, range: 60, tracer: 0xffd27a, sound: 'pistol',
  },
  raptor: {
    id: 'raptor', name: 'VK-9 Raptor', kind: 'smg', price: 1500,
    damage: 26, headshotMult: 1.8, mag: 30, reserve: 120,
    fireInterval: 0.085, reloadTime: 1.9, auto: true,
    spread: 0.020, moveSpread: 0.045, adsMult: 0.5, recoil: 0.009,
    pellets: 1, range: 45, tracer: 0xffd27a, sound: 'smg',
  },
  vantage: {
    id: 'vantage', name: 'AR-7 Vantage', kind: 'rifle', price: 2700,
    damage: 33, headshotMult: 2.0, mag: 30, reserve: 90,
    fireInterval: 0.115, reloadTime: 2.3, auto: true,
    spread: 0.009, moveSpread: 0.035, adsMult: 0.35, recoil: 0.016,
    pellets: 1, range: 90, tracer: 0xffd27a, sound: 'rifle',
  },
  breacher: {
    id: 'breacher', name: 'SG-12 Breacher', kind: 'shotgun', price: 1700,
    damage: 11, headshotMult: 1.6, mag: 6, reserve: 24,
    fireInterval: 0.85, reloadTime: 2.8, auto: false,
    spread: 0.045, moveSpread: 0.06, adsMult: 0.7, recoil: 0.05,
    pellets: 8, range: 22, tracer: 0xff9a5a, sound: 'shotgun',
  },
  longshot: {
    id: 'longshot', name: 'LR-50 Longshot', kind: 'sniper', price: 4750,
    damage: 110, headshotMult: 2.0, mag: 5, reserve: 15,
    fireInterval: 1.25, reloadTime: 3.1, auto: false,
    spread: 0.0015, moveSpread: 0.09, adsMult: 0.25, recoil: 0.07,
    pellets: 1, range: 140, tracer: 0xbfe3ff, sound: 'sniper',
    zoomFov: 22, scope: true,
  },
};

export const GRENADES = {
  shard: {
    id: 'shard', name: 'Shard Grenade', price: 300,
    desc: 'Frag. 1.6s fuse, heavy damage in a 6 m blast.',
    fuse: 1.6, radius: 6, maxDamage: 95,
  },
  veil: {
    id: 'veil', name: 'Veil Grenade', price: 300,
    desc: 'Smoke. Blocks sight for 12 s. Throw it to cross a lane.',
    fuse: 1.2, radius: 0, duration: 12,
  },
  flare: {
    id: 'flare', name: 'Flare Grenade', price: 200,
    desc: 'Flash. Blinds anyone looking at the pop for up to 2.5 s.',
    fuse: 1.4, radius: 18, blindTime: 2.5,
  },
};

export const ARMOR_PRICE = 650;
export const ARMOR_ABSORB = 0.5; // half of incoming damage eats armor first

// Bot tuning. Skill is a 0..1 roll per bot: it bends reaction time, aim error
// and burst discipline, so a round never feels like shooting statues — or
// aimbots. Nothing here reads the player's position through walls: bots only
// ever know what they can see or hear.
export const BOT = {
  countPerTeam: 5, // includes the player on SABLE, so 4 friendly bots
  health: 100,
  walkSpeed: 3.4,
  runSpeed: 4.1,
  reactionMin: 0.35,
  reactionMax: 0.85,
  aimErrorBase: 0.020, // radians of aim error at 10 m
  aimErrorPerMetre: 0.0011,
  burstMin: 3,
  burstMax: 6,
  burstPauseMin: 0.45,
  burstPauseMax: 1.1,
  hearRadius: 26, // gunfire inside this radius pulls a bot to investigate
  fovCos: 0.25, // ~75 degrees half-angle of vision
  sightRange: 58,
};

export const PLAYER = {
  health: 100,
  eyeHeight: 1.62,
  crouchEyeHeight: 1.12,
  radius: 0.38,
  walkSpeed: 4.35,
  crouchSpeed: 2.1,
  adsSpeed: 2.6,
  jumpSpeed: 5.2,
  gravity: 14.5,
};
