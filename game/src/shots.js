// Staged scenes for the screenshots: each one plays the real game forward for a couple of
// seconds from a set-up position, so every shot is a genuine render of the game's own code
// in a browser — never a mock, never a composite. The four shots: a police chase in
// Downtown, a drive toward the first job, a shootout at the docks, and the helicopter
// over the beach road. Each shows the city, the HUD, the minimap and a live mission at once.

import { CAMERA, STEP } from './config.js';
import { resetState, stepGame } from './main.js';
import { enterCar } from './player.js';
import { makeCar } from './traffic.js';
import { addHeat } from './police.js';
import { startMission } from './missions.js';
import { spawnPickup } from './combat.js';
import { randomRoadPoint } from './city.js';

/** A scripted driver: full throttle, a fixed steer, and optionally the trigger held. */
function scriptedInput(steer = 0, shooting = false) {
  return {
    throttle: () => 1,
    steer: () => steer,
    running: () => false,
    shooting: () => shooting,
    pointer: () => ({ x: 640, y: 360 }),
    takeActions: () => 0,
  };
}

/** A parked driver: standing still, and optionally firing. */
function standingInput(shooting = false) {
  return {
    throttle: () => 0,
    steer: () => 0,
    running: () => false,
    shooting: () => shooting,
    pointer: () => ({ x: 640, y: 360 }),
    takeActions: () => 0,
  };
}

/** Run the game forward n fixed steps. */
function runSteps(state, input, n) {
  for (let i = 0; i < n; i += 1) stepGame(state, input, STEP, 0);
}

/** Put Rae in a car at (x, y), facing `angle`. */
function giveCar(state, x, y, angle, kind) {
  const car = makeCar(kind, x, y, angle, 'parked', state.random);
  car.speed = 0;
  state.cars.push(car);
  enterCar(state, car);
  return car;
}

/** Park a patrol car in Rae's way: the chase AI takes it from there. */
function placePolice(state, x, y, angle, speed = 200) {
  const car = makeCar('police', x, y, angle, 'police', state.random);
  car.health = 500;
  car.speed = speed;
  state.cars.push(car);
  return car;
}

/**
 * Clear the lane ahead of Rae: any other car in the corridor she is about to drive
 * through is moved to a random road point, so the shot shows a drive, not a pile-up.
 * (Sustained contact wrecks a car in under a second — the sim is that punishing.)
 */
function clearLane(state, aheadDist) {
  const player = state.player;
  const fx = Math.cos(player.angle);
  const fy = Math.sin(player.angle);
  for (const car of state.cars) {
    if (car === player.car) continue;
    const dx = car.x - player.x;
    const dy = car.y - player.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (along > -60 && along < aheadDist && side < 50) {
      const spot = randomRoadPoint(state.random);
      car.x = spot.x;
      car.y = spot.y;
      car.angle = spot.angle;
      car.speed = car.cruise;
      car.target = null;
    }
  }
}

/** Snap the chase camera behind Rae, so the first painted frame is already the shot. */
function snapCamera(renderer, state) {
  const player = state.player;
  const inCar = player.car !== null;
  const dist = inCar ? CAMERA.carDistance : CAMERA.footDistance;
  renderer.camState.x = player.x - Math.cos(player.angle) * dist;
  renderer.camState.z = player.y - Math.sin(player.angle) * dist;
  renderer.camState.lookX = player.x + Math.cos(player.angle) * CAMERA.lookAhead;
  renderer.camState.lookZ = player.y + Math.sin(player.angle) * CAMERA.lookAhead;
}

/** The chase: three stars, two patrol cars ahead on the Downtown road, the convoy job live.
 * Sixty steps: far enough to be moving fast, short enough that the patrol cars ahead are
 * still ahead — the chase AI closes the gap fast. */
function stageChase(state) {
  giveCar(state, 1500, 1500, -Math.PI / 2, 'sport');
  startMission(state, 4);
  addHeat(state, 115);
  clearLane(state, 700);
  placePolice(state, 1500, 850, Math.PI / 2, 100);
  placePolice(state, 1440, 900, Math.PI / 2, 100);
  runSteps(state, scriptedInput(0), 60);
}

/** The drive: the first job, west along the Old Port road toward the depot marker.
 * A hundred and ten steps: close enough that the gold marker is right ahead, not yet passed. */
function stageDrive(state) {
  giveCar(state, 900, 1300, Math.PI, 'sedan');
  startMission(state, 0);
  clearLane(state, 800);
  runSteps(state, scriptedInput(0), 110);
}

/** The shootout: the Exchange at the docks, four rivals closing in, Rae firing back.
 * She starts on the marker so the job advances to the kill step and the crew spawns;
 * she fires in bursts, not a hose, so the wanted level stays readable. */
function stageMission(state) {
  startMission(state, 2);
  const player = state.player;
  player.x = 600;
  player.y = 1520;
  player.angle = -Math.PI / 2;
  spawnPickup(state, 640, 1460, 'health', 25);
  runSteps(state, standingInput(false), 15);
  for (let i = 0; i < 100; i += 1) stepGame(state, standingInput(i % 25 === 0), STEP, 0);
}

/** The helicopter: five stars over the beach road, both birds overhead, the air job live.
 * After the drive, both helicopters are placed ahead of Rae, in the camera's view, with
 * their searchlights on her — the orbit would otherwise leave them behind the camera. */
function stageHeli(state) {
  giveCar(state, 2700, 2300, Math.PI, 'sport');
  startMission(state, 7);
  addHeat(state, 110);
  clearLane(state, 900);
  runSteps(state, scriptedInput(0), 150);
  const player = state.player;
  const fx = Math.cos(player.angle);
  const fy = Math.sin(player.angle);
  const px = -fy;
  const py = fx;
  const h0 = state.police.helis[0];
  const h1 = state.police.helis[1];
  if (h0 && h0.active) {
    h0.x = player.x + fx * 350 + px * 40;
    h0.y = player.y + fy * 350 + py * 40;
  }
  if (h1 && h1.active) {
    h1.x = player.x + fx * 420 - px * 90;
    h1.y = player.y + fy * 420 - py * 90;
  }
}

/** Stage one named shot: chase, drive, mission, or heli. */
export function runShot(state, renderer, name, seed) {
  resetState(state, null, seed);
  if (name === 'chase') stageChase(state);
  else if (name === 'drive') stageDrive(state);
  else if (name === 'mission') stageMission(state);
  else if (name === 'heli') stageHeli(state);
  else throw new Error(`unknown shot: ${name}`);
  snapCamera(renderer, state);
}
