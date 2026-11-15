// All sound is synthesized with WebAudio — no audio files, no network.
// A short noise buffer plus filtered oscillators covers gunshots, footsteps,
// beeps and the explosion. Everything is quiet by default and M toggles mute.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = false;
    this.lastStep = 0;
  }

  // Browsers only let audio start after a user gesture; call this from the
  // first click / keypress and everything after it just works.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // 1 s of white noise, reused by every percussive sound.
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  _noise({ dur = 0.1, freq = 2000, q = 1, gain = 0.4, type = 'lowpass', when = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  _tone({ freq = 440, freqEnd = null, dur = 0.1, gain = 0.2, type = 'sine', when = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // distance in metres: far shots get quieter and duller, never silent.
  _distanceGain(distance) {
    if (distance === undefined) return 1;
    return Math.max(0.08, 1 - distance / 70);
  }

  shot(kind, distance = 0) {
    const g = this._distanceGain(distance);
    switch (kind) {
      case 'pistol':
        this._noise({ dur: 0.09, freq: 2600, gain: 0.5 * g });
        this._tone({ freq: 190, freqEnd: 70, dur: 0.08, gain: 0.35 * g, type: 'square' });
        break;
      case 'smg':
        this._noise({ dur: 0.07, freq: 3200, gain: 0.38 * g });
        this._tone({ freq: 220, freqEnd: 90, dur: 0.06, gain: 0.25 * g, type: 'square' });
        break;
      case 'rifle':
        this._noise({ dur: 0.12, freq: 1800, gain: 0.55 * g });
        this._tone({ freq: 150, freqEnd: 55, dur: 0.11, gain: 0.4 * g, type: 'square' });
        break;
      case 'shotgun':
        this._noise({ dur: 0.22, freq: 1100, gain: 0.7 * g });
        this._tone({ freq: 120, freqEnd: 40, dur: 0.2, gain: 0.5 * g, type: 'square' });
        break;
      case 'sniper':
        this._noise({ dur: 0.25, freq: 2400, gain: 0.6 * g });
        this._tone({ freq: 110, freqEnd: 38, dur: 0.28, gain: 0.45 * g, type: 'sawtooth' });
        break;
      default:
        this._noise({ dur: 0.1, freq: 2000, gain: 0.4 * g });
    }
  }

  dryFire() {
    this._tone({ freq: 1400, dur: 0.03, gain: 0.15, type: 'square' });
  }

  reload() {
    this._tone({ freq: 900, dur: 0.04, gain: 0.18, type: 'square' });
    this._tone({ freq: 620, dur: 0.04, gain: 0.18, type: 'square', when: 0.28 });
    this._tone({ freq: 1100, dur: 0.05, gain: 0.22, type: 'square', when: 0.55 });
  }

  hit() {
    this._tone({ freq: 1900, dur: 0.05, gain: 0.25, type: 'sine' });
  }

  kill() {
    this._tone({ freq: 1400, dur: 0.06, gain: 0.25, type: 'sine' });
    this._tone({ freq: 2100, dur: 0.09, gain: 0.25, type: 'sine', when: 0.07 });
  }

  hurt() {
    this._noise({ dur: 0.12, freq: 500, gain: 0.35 });
    this._tone({ freq: 130, freqEnd: 70, dur: 0.14, gain: 0.3, type: 'sawtooth' });
  }

  footstep(run) {
    const now = performance.now();
    if (now - this.lastStep < (run ? 290 : 380)) return;
    this.lastStep = now;
    this._noise({ dur: 0.06, freq: 420, gain: 0.10 });
  }

  plantBeep() {
    this._tone({ freq: 1250, dur: 0.09, gain: 0.3, type: 'square' });
  }

  defuseBeep() {
    this._tone({ freq: 980, dur: 0.09, gain: 0.3, type: 'square' });
  }

  bombTick() {
    this._tone({ freq: 1500, dur: 0.05, gain: 0.22, type: 'square' });
  }

  explosion() {
    this._noise({ dur: 1.4, freq: 700, gain: 0.9 });
    this._tone({ freq: 90, freqEnd: 28, dur: 1.2, gain: 0.8, type: 'sine' });
    this._noise({ dur: 0.5, freq: 3000, gain: 0.4 });
  }

  grenadeThrow() {
    this._noise({ dur: 0.15, freq: 900, gain: 0.2, type: 'bandpass' });
  }

  flashPop() {
    this._noise({ dur: 0.3, freq: 4500, gain: 0.55, type: 'highpass' });
    this._tone({ freq: 2400, freqEnd: 300, dur: 0.25, gain: 0.2, type: 'sine' });
  }

  roundWin() {
    [523, 659, 784].forEach((f, i) => this._tone({ freq: f, dur: 0.22, gain: 0.22, when: i * 0.12 }));
  }

  roundLose() {
    [392, 330, 262].forEach((f, i) => this._tone({ freq: f, dur: 0.25, gain: 0.2, when: i * 0.13 }));
  }

  buy() {
    this._tone({ freq: 880, dur: 0.06, gain: 0.2, type: 'square' });
    this._tone({ freq: 1320, dur: 0.08, gain: 0.2, type: 'square', when: 0.07 });
  }

  click() {
    this._tone({ freq: 1000, dur: 0.04, gain: 0.15, type: 'square' });
  }

  denied() {
    this._tone({ freq: 220, dur: 0.12, gain: 0.2, type: 'square' });
  }
}
