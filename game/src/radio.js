// The radio: three stations, synthesized live with WebAudio — no audio files, no network.
// Each station is a small step sequencer: SOL FM plays sunset synthwave arpeggios, Barrio
// Beats plays street percussion over a low bass, and Gold Talk plays news jingles between
// its talk-show murmur. Keys 1, 2, 3 switch stations; R cycles them.

import { RADIO } from './config.js';

const STEP_SECONDS = 0.3;

/** One short synth note: an oscillator with a fast attack and a falling tail. */
function blip(ctx, dest, freq, dur, type, gain) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0.0001, ctx.currentTime);
  amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(amp);
  amp.connect(dest);
  osc.start();
  osc.stop(ctx.currentTime + dur + 0.05);
}

/** One drum hit: filtered noise for a hat, or a falling sine for a kick. */
function drum(ctx, dest, kind) {
  const t = ctx.currentTime;
  if (kind === 'kick') {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    amp.gain.setValueAtTime(0.5, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(amp);
    amp.connect(dest);
    osc.start();
    osc.stop(t + 0.2);
  } else {
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.18, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(dest);
    src.start();
  }
}

// SOL FM: A-minor synthwave arpeggio over a warm pad note.
const SOL_ARP = [110, 130.81, 164.81, 196, 220, 196, 164.81, 130.81];
// Barrio Beats: kick on 0 and 4, hats on the off-beats, bass bounces on 2 and 6.
const BARRIO_BASS = [0, 0, 82.41, 0, 0, 0, 98, 0];
// Gold Talk: a bright major jingle every eight steps.
const TALK_JINGLE = [523.25, 659.25, 783.99, 1046.5];

/** A fresh radio: tuned to SOL FM, silent until the audio context starts. */
export function createRadio() {
  return { station: 0, step: 0, nextIn: 0, gain: null };
}

/** The station's name for the HUD. */
export function stationName(radio) {
  return RADIO[radio.station].name;
}

/** Switch station: reset the sequencer so the new station starts on its first step. */
export function setStation(radio, index) {
  radio.station = ((index % RADIO.length) + RADIO.length) % RADIO.length;
  radio.step = 0;
  radio.nextIn = 0;
}

/** Step the sequencer forward: play this step's notes for the current station. */
export function updateRadio(radio, audio, dt) {
  if (audio === null || audio.ctx === null || audio.muted) return;
  if (radio.gain === null) {
    radio.gain = audio.ctx.createGain();
    radio.gain.gain.value = 0.16;
    radio.gain.connect(audio.master);
  }
  radio.nextIn -= dt;
  if (radio.nextIn > 0) return;
  radio.nextIn += STEP_SECONDS;
  const step = radio.step;
  radio.step = (radio.step + 1) % 8;
  const dest = radio.gain;
  if (radio.station === 0) {
    blip(audio.ctx, dest, SOL_ARP[step], 0.28, 'sawtooth', 0.12);
    if (step === 0) blip(audio.ctx, dest, 55, 1.1, 'triangle', 0.2);
    if (step === 4) blip(audio.ctx, dest, 65.41, 1.1, 'triangle', 0.18);
  } else if (radio.station === 1) {
    if (step === 0 || step === 4) drum(audio.ctx, dest, 'kick');
    if (step % 2 === 1) drum(audio.ctx, dest, 'hat');
    if (BARRIO_BASS[step] > 0) blip(audio.ctx, dest, BARRIO_BASS[step], 0.24, 'square', 0.14);
  } else {
    if (step === 0) {
      for (let i = 0; i < TALK_JINGLE.length; i += 1) {
        blip(audio.ctx, dest, TALK_JINGLE[i], 0.5, 'sine', 0.12);
      }
    }
    if (step === 2 || step === 6) blip(audio.ctx, dest, 220 + step * 8, 0.3, 'triangle', 0.05);
  }
}
