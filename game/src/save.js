// Saving: Rae's money, rank, missions and place in the world, kept in localStorage between
// visits. A save that cannot be read (or a browser that refuses storage) starts a new story
// instead of crashing the game.

import { SAVE_KEY } from './config.js';

/** The shape of a save: everything needed to pick up where Rae left off. */
export function saveGame(state) {
  const player = state.player;
  const data = {
    version: 2,
    cash: player.cash,
    earned: player.earned,
    health: player.health,
    armor: player.armor,
    ammo: player.ammo,
    x: player.x,
    y: player.y,
    missionIndex: state.missions.index,
    missionsDone: state.stats.missionsDone,
    taxisDone: state.stats.taxisDone,
    deliveriesDone: state.stats.deliveriesDone,
    kills: state.stats.kills,
    carsStolen: state.stats.carsStolen,
    savedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Read a save back, or null when there is none or it is broken. */
export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw === null) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || data.version !== 2) return null;
    return data;
  } catch {
    return null;
  }
}

/** Apply a save to a fresh state: money, health, position, and the mission book. */
export function applySave(state, data) {
  const player = state.player;
  player.cash = data.cash | 0;
  player.earned = data.earned | 0;
  player.health = Math.max(1, Math.min(100, data.health | 0));
  player.armor = Math.max(0, Math.min(100, data.armor | 0));
  player.ammo = Math.max(0, Math.min(120, data.ammo | 0));
  player.x = data.x;
  player.y = data.y;
  player.angle = -Math.PI / 2;
  state.missions.index = Math.max(0, Math.min(12, data.missionIndex | 0));
  state.stats.missionsDone = data.missionsDone | 0;
  state.stats.taxisDone = data.taxisDone | 0;
  state.stats.deliveriesDone = data.deliveriesDone | 0;
  state.stats.kills = data.kills | 0;
  state.stats.carsStolen = data.carsStolen | 0;
}

/** Forget the save entirely (a new story from the title screen). */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to forget.
  }
}
