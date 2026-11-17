// SOLMAR LIVE — Streets of Gold. The boot and the loop: one fixed 1/60s step, a chase
// camera, screens for title / play / paused / busted / over, and the ?shot= staging path
// the screenshots use. The simulation itself lives in the modules under src/; this file
// only assembles them and answers the keyboard.

import { STEP, WANTED } from './config.js';
import { createRandom } from './random.js';
import { buildCity } from './city.js';
import { createPlayer, resetPlayer, walkPlayer, enterCar, exitCar, drivePlayerCar, nearestStealableCar } from './player.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createPolice, updatePolice, clearPolice, addHeat } from './police.js';
import { updateCombat, shootPlayer } from './combat.js';
import { createMissions, updateMissions } from './missions.js';
import { createStream, updateStream } from './stream.js';
import { createRadio, updateRadio, setStation } from './radio.js';
import { createAudio, startAudio, setEngine, playShot, playCash, setSiren, setMuted } from './audio.js';
import { saveGame, loadGame, applySave, clearSave } from './save.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER, ACTION_SHOOT, ACTION_RADIO_1, ACTION_RADIO_2, ACTION_RADIO_3, ACTION_RADIO_NEXT, ACTION_MUTE } from './input.js';
import { createRenderer, draw, resetActors, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_BUSTED, SCREEN_OVER } from './render.js';
import { nearestShop, buyShop } from './shops.js';

/** A fresh game: the city, the traffic, Rae, the law, the jobs, the stream, the radio. */
export function createGameState(seed) {
  const random = createRandom(seed);
  const city = buildCity(random);
  const traffic = createTraffic(city, random);
  const state = {
    random,
    time: 0,
    seed,
    city,
    camera: { x: 1500, y: 2210 },
    player: createPlayer(),
    cars: traffic.cars,
    peds: traffic.peds,
    enemies: [],
    bullets: [],
    pickups: [],
    police: createPolice(),
    missions: createMissions(),
    stats: { missionsDone: 0, taxisDone: 0, deliveriesDone: 0, kills: 0, carsStolen: 0, shotsFired: 0 },
    stream: createStream(),
    radio: createRadio(),
    audio: createAudio(),
    saveSummary: null,
    muted: false,
  };
  const save = loadGame();
  if (save !== null) {
    applySave(state, save);
    state.saveSummary = { cash: save.cash, missionsDone: save.missionsDone };
  }
  return state;
}

/** A new game in the same state object: everything resets except the city and the audio. */
export function resetState(state, renderer, seed) {
  state.random = createRandom(seed);
  state.time = 0;
  state.camera.x = 1500;
  state.camera.y = 2210;
  resetPlayer(state.player);
  state.player._m = null;
  const traffic = createTraffic(state.city, state.random);
  state.cars = traffic.cars;
  state.peds = traffic.peds;
  state.enemies = [];
  state.bullets = [];
  state.pickups = [];
  state.police = createPolice();
  state.missions = createMissions();
  state.stats = { missionsDone: 0, taxisDone: 0, deliveriesDone: 0, kills: 0, carsStolen: 0, shotsFired: 0 };
  state.stream = createStream();
  state.radio = createRadio();
  state.saveSummary = null;
  if (renderer) resetActors(renderer);
}

/** One fixed step of the whole game: Rae, the streets, the law, the jobs, the stream.
 * `actions` are the one-shot presses for this step (the loop takes them once per frame and
 * hands them to the first step only, so a press is never counted twice). */
export function stepGame(state, input, dt, actions = 0) {
  state.time += dt;
  const player = state.player;

  if (actions & ACTION_MUTE) {
    state.muted = !state.muted;
    setMuted(state.audio, state.muted);
  }
  if (actions & ACTION_RADIO_1) setStation(state.radio, 0);
  if (actions & ACTION_RADIO_2) setStation(state.radio, 1);
  if (actions & ACTION_RADIO_3) setStation(state.radio, 2);
  if (actions & ACTION_RADIO_NEXT) setStation(state.radio, (state.radio.station + 1) % 3);

  if (player.onFoot) walkPlayer(state, dt, input);
  else drivePlayerCar(state, dt, input);
  state.camera.x = player.x;
  state.camera.y = player.y;

  if (actions & ACTION_ENTER) {
    if (player.onFoot) {
      const shop = nearestShop(state);
      if (shop) {
        const before = state.player.cash;
        const result = buyShop(state, shop);
        if (result) {
          state.missions.banner = result;
          state.missions.bannerT = 3;
          if (state.player.cash < before) playCash(state.audio);
        }
      } else {
        const car = nearestStealableCar(state);
        if (car) {
          enterCar(state, car);
          addHeat(state, WANTED.crimeSteal);
        }
      }
    } else {
      exitCar(state);
    }
  }
  if ((actions & ACTION_SHOOT) || input.shooting()) {
    if (player.onFoot && shootPlayer(state, player.angle)) playShot(state.audio);
  }

  updateTraffic(state, dt);
  updatePolice(state, dt);
  updateCombat(state, dt);
  updateMissions(state, dt);
  updateStream(state, dt);
  updateRadio(state.radio, state.audio, dt);

  setEngine(state.audio, player.car !== null ? player.car.speed : player.speed);
  setSiren(state.audio, player.wanted > 0);
}

/** Boot: the renderer, the input, the screen state, and the frame loop. */
function boot() {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed') || 7);
  const shotName = params.get('shot');
  const state = createGameState(seed);
  const renderer = createRenderer(document.getElementById('game'));
  const input = createInput(document.getElementById('game'));

  let screen = SCREEN_TITLE;
  let lastCash = state.player.cash;
  let saveT = 0;
  let lastTime = performance.now();

  /** What SPACE / a click does on each screen. */
  function confirm() {
    startAudio(state.audio);
    if (screen === SCREEN_TITLE) {
      screen = SCREEN_PLAY;
    } else if (screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
    } else if (screen === SCREEN_BUSTED) {
      // Walk free: half the cash gone, the heat gone, the streets quiet again.
      state.player.cash = Math.floor(state.player.cash / 2);
      state.player.health = 100;
      state.player.busted = false;
      state.player.heat = 0;
      state.player.wanted = 0;
      resetPlayer(state.player);
      clearPolice(state);
      saveGame(state);
      screen = SCREEN_PLAY;
    } else if (screen === SCREEN_OVER) {
      clearSave();
      resetState(state, renderer, Date.now() % 2147483647);
      screen = SCREEN_TITLE;
    }
  }

  function frame(now) {
    const elapsed = Math.min(0.25, (now - lastTime) / 1000);
    lastTime = now;
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) confirm();
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if (screen === SCREEN_PLAY) {
      // Fixed steps, so the game plays the same on every machine. One-shot presses go to
      // the first step only; the rest run on the held keys.
      let steps = 0;
      let acc = elapsed;
      let first = true;
      while (acc >= STEP && steps < 5) {
        stepGame(state, input, STEP, first ? actions : 0);
        first = false;
        acc -= STEP;
        steps += 1;
      }
      if (state.player.cash > lastCash) playCash(state.audio);
      lastCash = state.player.cash;
      saveT += elapsed;
      if (saveT > 20) {
        saveT = 0;
        saveGame(state);
      }
      if (state.player.busted) {
        saveGame(state);
        screen = SCREEN_BUSTED;
      } else if (state.player.dead) {
        saveGame(state);
        screen = SCREEN_OVER;
      }
    }
    draw(renderer, state, screen);
    requestAnimationFrame(frame);
  }

  if (shotName) {
    // Screenshot mode: stage the scene, paint twice, then tell the driver it is ready.
    import('./shots.js').then(({ runShot }) => {
      runShot(state, renderer, shotName, seed);
      draw(renderer, state, SCREEN_PLAY);
      draw(renderer, state, SCREEN_PLAY);
      window.__shotReady = true;
    });
    return;
  }
  requestAnimationFrame(frame);
}

boot();
