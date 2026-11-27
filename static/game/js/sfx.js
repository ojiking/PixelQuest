// 합성 효과음 (외부 파일 없이 WebAudio로 생성)
let ctx = null, master = null, noiseBuf = null, sawNodes = null;
let muted = false;
try { muted = localStorage.getItem('pixelquest_mute') === '1'; } catch { /* 저장 불가 */ }
const lastPlay = {};

function init() {
  if (ctx) return true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  } catch { return false; }
}

// 브라우저 정책: 사용자 입력 후에만 소리가 남
export function unlockAudio() {
  if (!init()) return;
  if (ctx.state === 'suspended') ctx.resume();
}
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlockAudio, { passive: true });

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('pixelquest_mute', m ? '1' : '0'); } catch { /* 저장 불가 */ }
  if (master) master.gain.value = m ? 0 : 0.55;
  if (m) sawLoop(false);
}

function gainEnv(t, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(master);
  return g;
}

function noise(t, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, peak = 0.5, attack = 0.005 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const flt = ctx.createBiquadFilter();
  flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  src.connect(flt); flt.connect(gainEnv(t, peak, attack, dur));
  src.start(t, Math.random() * 0.5); src.stop(t + dur + attack + 0.05);
}

function tone(t, dur, { wave = 'sine', f0 = 440, f1 = f0, peak = 0.4, attack = 0.005 } = {}) {
  const o = ctx.createOscillator();
  o.type = wave;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  o.connect(gainEnv(t, peak, attack, dur));
  o.start(t); o.stop(t + dur + attack + 0.05);
}

const SOUNDS = {
  hit: t => { noise(t, .06, { f0: 1800, q: .8, peak: .35 }); tone(t, .08, { f0: 160, f1: 60, peak: .45 }); },
  heavy: t => { noise(t, .16, { type: 'lowpass', f0: 1200, f1: 200, peak: .6 }); tone(t, .2, { f0: 110, f1: 40, peak: .7 }); },
  cut: t => { noise(t, .09, { type: 'highpass', f0: 2500, f1: 6000, peak: .35 }); tone(t, .07, { wave: 'sawtooth', f0: 1400, f1: 500, peak: .12 }); noise(t + .02, .12, { type: 'lowpass', f0: 700, f1: 200, peak: .3 }); },
  splat: t => { noise(t, .22, { type: 'lowpass', f0: 900, f1: 120, peak: .55 }); for (let i = 0; i < 4; i++) noise(t + .03 + i * .035, .03, { f0: 500 + Math.random() * 900, q: 4, peak: .25 }); },
  crush: t => { noise(t, .28, { f0: 500, f1: 150, q: 1.4, peak: .7 }); tone(t, .22, { f0: 90, f1: 35, peak: .6 }); noise(t + .05, .1, { type: 'highpass', f0: 3000, peak: .2 }); },
  boom: t => { noise(t, .9, { type: 'lowpass', f0: 900, f1: 60, peak: .9, attack: .01 }); tone(t, .7, { f0: 70, f1: 25, peak: .8 }); },
  batswing: t => { noise(t, .22, { f0: 260, f1: 1600, q: 1.2, peak: .32, attack: .04 }); noise(t + .03, .14, { f0: 900, f1: 3000, q: 2, peak: .12, attack: .02 }); },   // 배트 풀스윙 '부웅'
  swing: t => noise(t, .13, { f0: 500, f1: 2400, q: 1.5, peak: .16, attack: .02 }),
  jump: t => tone(t, .09, { wave: 'square', f0: 280, f1: 560, peak: .08 }),
  land: t => tone(t, .1, { f0: 120, f1: 50, peak: .25 }),
  dash: t => noise(t, .16, { f0: 1600, f1: 350, q: 1.2, peak: .3, attack: .01 }),
  thud: t => { tone(t, .16, { f0: 120, f1: 45, peak: .6 }); noise(t, .1, { type: 'lowpass', f0: 800, f1: 150, peak: .4 }); },
  pickup: t => { tone(t, .05, { wave: 'square', f0: 660, peak: .08 }); tone(t + .06, .07, { wave: 'square', f0: 990, peak: .08 }); },
  coin: t => tone(t, .06, { wave: 'triangle', f0: 1320, f1: 1500, peak: .1 }),
  fall: t => { tone(t, .9, { wave: 'triangle', f0: 800, f1: 140, peak: .2, attack: .02 }); },
  death: t => { SOUNDS.boom(t); SOUNDS.splat(t + .05); tone(t + .1, 1.2, { wave: 'sawtooth', f0: 220, f1: 40, peak: .15 }); },
  ui: t => tone(t, .05, { wave: 'square', f0: 880, peak: .06 }),
  rage: t => { tone(t, .6, { wave: 'sawtooth', f0: 110, f1: 55, peak: .28, attack: .02 }); tone(t, .6, { wave: 'square', f0: 165, f1: 70, peak: .1, attack: .02 }); noise(t, .5, { type: 'lowpass', f0: 900, f1: 200, peak: .45 }); noise(t + .05, .35, { type: 'highpass', f0: 3000, peak: .12 }); },
  pump: t => { noise(t, .05, { type: 'highpass', f0: 2200, peak: .35 }); tone(t, .05, { wave: 'square', f0: 420, f1: 300, peak: .12 }); noise(t + .13, .06, { type: 'highpass', f0: 1800, peak: .4 }); tone(t + .13, .06, { wave: 'square', f0: 360, f1: 520, peak: .14 }); },
  clang: t => { tone(t, .25, { wave: 'square', f0: 1300, f1: 900, peak: .12 }); tone(t, .3, { wave: 'triangle', f0: 2600, f1: 2200, peak: .08 }); noise(t, .05, { type: 'highpass', f0: 3000, peak: .3 }); },
  shot: t => { noise(t, .4, { type: 'lowpass', f0: 4000, f1: 150, peak: 1, attack: .002 }); tone(t, .3, { f0: 140, f1: 35, peak: .9 }); noise(t + .28, .03, { f0: 2500, q: 3, peak: .3 }); noise(t + .36, .03, { f0: 1800, q: 3, peak: .3 }); },
  flame: t => noise(t, .14, { f0: 700, f1: 400, q: .6, peak: .2, attack: .01 }),
  engine: t => { tone(t, .7, { wave: 'sawtooth', f0: 70, f1: 210, peak: .22, attack: .03 }); tone(t, .7, { wave: 'square', f0: 35, f1: 105, peak: .1, attack: .03 }); noise(t, .6, { type: 'lowpass', f0: 400, f1: 1200, peak: .2 }); },
  alarm: t => { for (let i = 0; i < 4; i++) tone(t + i * .22, .2, { wave: 'square', f0: i % 2 ? 620 : 860, peak: .06 }); },
  hurt: t => { tone(t, .12, { wave: 'square', f0: 300, f1: 120, peak: .12 }); noise(t, .06, { f0: 1200, peak: .25 }); },
};

export function play(name) {
  if (muted || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
  const now = ctx.currentTime;
  if (lastPlay[name] && now - lastPlay[name] < 0.035) return; // 같은 소리 겹침 제한
  lastPlay[name] = now;
  SOUNDS[name](now);
}

// 전기톱 엔진 소리 (켜고 끄기)
export function sawLoop(on) {
  if (!ctx || ctx.state !== 'running') return;
  if (on && !sawNodes && !muted) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 85;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 22;
    const lfoG = ctx.createGain(); lfoG.gain.value = 25;
    lfo.connect(lfoG); lfoG.connect(o.frequency);
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1400;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.13, ctx.currentTime + 0.05);
    o.connect(flt); flt.connect(g); g.connect(master);
    o.start(); lfo.start();
    sawNodes = { o, lfo, g };
  } else if (!on && sawNodes) {
    const { o, lfo, g } = sawNodes;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    o.stop(ctx.currentTime + 0.1); lfo.stop(ctx.currentTime + 0.1);
    sawNodes = null;
  }
}
