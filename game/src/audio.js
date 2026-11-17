// Sound, synthesized live with WebAudio — no audio files, no network. The engine hums with
// speed, the siren wails while the law is close, and every shot, crash and payday is a
// short burst of oscillators and noise. Nothing starts until the player presses a key:
// browsers refuse audio before a gesture.

export function createAudio() {
  return {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenLfo: null,
    muted: false,
  };
}

/** Start the audio context after a user gesture; safe to call more than once. */
export function startAudio(audio) {
  if (audio.ctx !== null) {
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    return;
  }
  try {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    audio.ctx = ctx;
    audio.master = ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.5;
    audio.master.connect(ctx.destination);
    const engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 700;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(audio.master);
    engineOsc.start();
    audio.engineOsc = engineOsc;
    audio.engineGain = engineGain;
    const sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 700;
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.8;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain);
    sirenGain.connect(audio.master);
    sirenOsc.start();
    lfo.start();
    audio.sirenOsc = sirenOsc;
    audio.sirenGain = sirenGain;
    audio.sirenLfo = lfo;
  } catch {
    audio.ctx = null;
  }
}

/** The engine follows speed: faster means a higher, louder hum. */
export function setEngine(audio, speed) {
  if (audio.ctx === null || audio.engineOsc === null) return;
  const s = Math.abs(speed);
  audio.engineOsc.frequency.setTargetAtTime(55 + s * 0.35, audio.ctx.currentTime, 0.08);
  audio.engineGain.gain.setTargetAtTime(s > 5 ? 0.05 + Math.min(0.08, s * 0.0002) : 0, audio.ctx.currentTime, 0.1);
}

/** One gunshot: a short noise burst with a falling square blip under it. */
export function playShot(audio) {
  if (audio.ctx === null) return;
  const ctx = audio.ctx;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.09);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.4, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  src.connect(amp);
  amp.connect(audio.master);
  src.start();
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
  const oamp = ctx.createGain();
  oamp.gain.setValueAtTime(0.15, t);
  oamp.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc.connect(oamp);
  oamp.connect(audio.master);
  osc.start();
  osc.stop(t + 0.1);
}

/** A payday: two bright notes, cash-register style. */
export function playCash(audio) {
  if (audio.ctx === null) return;
  const ctx = audio.ctx;
  const t = ctx.currentTime;
  for (let i = 0; i < 2; i += 1) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = i === 0 ? 880 : 1318.5;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t + i * 0.09);
    amp.gain.exponentialRampToValueAtTime(0.2, t + i * 0.09 + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.25);
    osc.connect(amp);
    amp.connect(audio.master);
    osc.start(t + i * 0.09);
    osc.stop(t + i * 0.09 + 0.3);
  }
}

/** A pickup: one soft rising note. */
export function playPickup(audio) {
  if (audio.ctx === null) return;
  const ctx = audio.ctx;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(520, t);
  osc.frequency.exponentialRampToValueAtTime(780, t + 0.12);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  osc.connect(amp);
  amp.connect(audio.master);
  osc.start();
  osc.stop(t + 0.18);
}

/** A crash: low noise with a thud under it. */
export function playCrash(audio) {
  if (audio.ctx === null) return;
  const ctx = audio.ctx;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.22);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.7;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.5, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  src.connect(filter);
  filter.connect(amp);
  amp.connect(audio.master);
  src.start();
}

/** The siren: on while the law is close, off when the streets are quiet. */
export function setSiren(audio, on) {
  if (audio.ctx === null || audio.sirenGain === null) return;
  audio.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, audio.ctx.currentTime, 0.3);
}

/** Mute or unmute everything at once. */
export function setMuted(audio, muted) {
  audio.muted = muted;
  if (audio.ctx !== null && audio.master !== null) {
    audio.master.gain.setTargetAtTime(muted ? 0 : 0.5, audio.ctx.currentTime, 0.05);
  }
}
