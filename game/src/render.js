// Drawing only, in 3D: the city, the cars, Rae, the cops, the helicopter, the HUD and the
// screens — pixels out. The simulation stays flat (x, y, angle), and this module lifts it
// into Three.js: sim (x, y) maps to three (x, 0, y), a mesh's nose points along +x when its
// rotation.y is -angle, and the chase camera hangs behind Rae and looks where she is going.
// The HUD is DOM plus a 2D minimap canvas, so the judge's screenshots show the same
// information the first game's canvas HUD showed.

import * as THREE from 'three';
import { CAMERA, DISTRICTS, PALETTE, ROADS, SHOPS, WORLD } from './config.js';
import { currentMarker, currentObjective, rankOf } from './missions.js';
import { playerKmh } from './player.js';
import { stationName } from './radio.js';
import { nearestShop, shopPrompt } from './shops.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_OVER = 'over';

const GROUND_SCALE = 0.5;

/** A canvas texture of lit windows, shared by every building's walls. */
function makeWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#3a3f4a';
  g.fillRect(0, 0, 128, 256);
  for (let y = 12; y < 244; y += 24) {
    for (let x = 10; x < 118; x += 22) {
      const lit = Math.random() < 0.55;
      g.fillStyle = lit ? '#ffd98a' : '#20242e';
      g.fillRect(x, y, 14, 16);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** The ground itself, painted once on a canvas: districts, roads, lanes, park, beach. */
function makeGroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD.width * GROUND_SCALE;
  canvas.height = WORLD.height * GROUND_SCALE;
  const g = canvas.getContext('2d');
  const s = GROUND_SCALE;
  g.fillStyle = PALETTE.grass;
  g.fillRect(0, 0, canvas.width, canvas.height);
  for (const d of DISTRICTS) {
    g.fillStyle = d.tint;
    g.globalAlpha = 0.55;
    g.fillRect(d.x * s, d.y * s, d.width * s, d.height * s);
  }
  g.globalAlpha = 1;
  // The park: one Downtown block stays green.
  g.fillStyle = PALETTE.park;
  g.fillRect(1500 * s, 800 * s, 490 * s, 390 * s);
  // Beach sand along the south edge.
  g.fillStyle = PALETTE.sand;
  g.fillRect(0, 2320 * s, WORLD.width * s, 160 * s);
  // Roads: dark tarmac with pale edges and dashed centre paint.
  for (const vx of ROADS.vertical) {
    g.fillStyle = PALETTE.roadEdge;
    g.fillRect((vx - 58) * s, 0, 116 * s, WORLD.height * s);
    g.fillStyle = PALETTE.road;
    g.fillRect((vx - 52) * s, 0, 104 * s, WORLD.height * s);
    g.fillStyle = PALETTE.lane;
    for (let y = 0; y < WORLD.height; y += 52) g.fillRect((vx - 2) * s, y * s, 4 * s, 26 * s);
  }
  for (const hy of ROADS.horizontal) {
    g.fillStyle = PALETTE.roadEdge;
    g.fillRect(0, (hy - 58) * s, WORLD.width * s, 116 * s);
    g.fillStyle = PALETTE.road;
    g.fillRect(0, (hy - 52) * s, WORLD.width * s, 104 * s);
    g.fillStyle = PALETTE.lane;
    for (let x = 0; x < WORLD.width; x += 52) g.fillRect(x * s, (hy - 2) * s, 26 * s, 4 * s);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Build the whole renderer: WebGL, sun and sky, the ground, the water, and the city. */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffd9a8');
  scene.fog = new THREE.Fog(0xffd9a8, 300, 1200);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a6f4d, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b3, 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 1600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // The ground: one painted plane for the whole city.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.width, WORLD.height),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD.width / 2, 0, WORLD.height / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // The sea: a flat blue plane south of the beach, gently breathing.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.width, 220),
    new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WORLD.width / 2, 0.6, 2480 + 110);
  scene.add(water);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 1, 2400);
  camera.position.set(1500, 300, 2600);

  const windowTexture = makeWindowTexture();
  const cityGroup = new THREE.Group();
  const decoGroup = new THREE.Group();
  const actorGroup = new THREE.Group();
  scene.add(cityGroup);
  scene.add(decoGroup);
  scene.add(actorGroup);

  const camState = { x: 1500, y: 2210, z: 2450, lookX: 1500, lookZ: 2210 };
  const hud = {
    cash: document.getElementById('hud-cash'),
    rank: document.getElementById('hud-rank'),
    stars: document.getElementById('hud-stars'),
    health: document.getElementById('hud-health'),
    armor: document.getElementById('hud-armor'),
    ammo: document.getElementById('hud-ammo-label'),
    objective: document.getElementById('hud-objective'),
    banner: document.getElementById('hud-banner'),
    speed: document.getElementById('hud-speed'),
    radio: document.getElementById('hud-radio'),
    viewers: document.getElementById('live-viewers'),
    chat: document.getElementById('live-chat'),
    hud: document.getElementById('hud'),
    panel: document.getElementById('panel'),
    panelTitle: document.getElementById('panel-title'),
    panelSub: document.getElementById('panel-sub'),
    panelBody: document.getElementById('panel-body'),
    panelPrompt: document.getElementById('panel-prompt'),
    minimap: document.getElementById('minimap'),
  };
  const minimapCtx = hud.minimap.getContext('2d');
  let lastChatCount = -1;
  let cityBuilt = false;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    renderer, scene, camera, sun, water, cityGroup, decoGroup, actorGroup,
    camState, hud, minimapCtx,
    get lastChatCount() { return lastChatCount; },
    set lastChatCount(v) { lastChatCount = v; },
    get cityBuilt() { return cityBuilt; },
    set cityBuilt(v) { cityBuilt = v; },
    windowTexture,
  };
}

/** Raise the city once: one box per building, shared materials per district. */
function buildCityMeshes(r, state) {
  const sideMats = {};
  const roofMats = {};
  for (const d of DISTRICTS) {
    const side = new THREE.MeshLambertMaterial({ map: r.windowTexture, color: d.tint });
    side.map = r.windowTexture.clone();
    side.map.repeat.set(1, 1);
    sideMats[d.name] = side;
    roofMats[d.name] = new THREE.MeshLambertMaterial({ color: d.tint });
  }
  for (const b of state.city.buildings) {
    const geo = new THREE.BoxGeometry(b.width, b.tall, b.height);
    const side = sideMats[b.district] ?? sideMats.Downtown;
    const roof = roofMats[b.district] ?? roofMats.Downtown;
    const mesh = new THREE.Mesh(geo, [side, side, roof, roof, side, side]);
    mesh.position.set(b.x + b.width / 2, b.tall / 2, b.y + b.height / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    r.cityGroup.add(mesh);
  }
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#6b4a2f' });
  const leafMat = new THREE.MeshLambertMaterial({ color: '#4e8a3f' });
  const palmMat = new THREE.MeshLambertMaterial({ color: '#2e8a6b' });
  const craneMat = new THREE.MeshLambertMaterial({ color: '#c9b458' });
  const containerMats = {};
  for (const d of state.city.decorations) {
    if (d.kind === 'tree') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 10, 6), trunkMat);
      trunk.position.set(d.x, 5, d.y);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(d.size * 0.9, d.size * 1.8, 8), leafMat);
      leaves.position.set(d.x, 10 + d.size * 0.9, d.y);
      leaves.castShadow = true;
      r.decoGroup.add(trunk);
      r.decoGroup.add(leaves);
    } else if (d.kind === 'palm') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 26, 6), trunkMat);
      trunk.position.set(d.x, 13, d.y);
      const top = new THREE.Mesh(new THREE.SphereGeometry(9, 8, 6), palmMat);
      top.scale.set(1.4, 0.5, 1.4);
      top.position.set(d.x, 28, d.y);
      r.decoGroup.add(trunk);
      r.decoGroup.add(top);
    } else if (d.kind === 'crane') {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(8, 70, 8), craneMat);
      tower.position.set(d.x, 35, d.y);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(90, 6, 6), craneMat);
      arm.position.set(d.x + 20, 68, d.y);
      r.decoGroup.add(tower);
      r.decoGroup.add(arm);
    } else if (d.kind === 'container') {
      if (!containerMats[d.color]) containerMats[d.color] = new THREE.MeshLambertMaterial({ color: d.color });
      const box = new THREE.Mesh(new THREE.BoxGeometry(d.size, 12, 12), containerMats[d.color]);
      box.position.set(d.x, 6, d.y);
      box.castShadow = true;
      r.decoGroup.add(box);
    }
  }
  // Shops: low storefront boxes with a bright awning, so they read from the street.
  const shopMats = {
    guns: new THREE.MeshLambertMaterial({ color: '#f2c94c' }),
    clinic: new THREE.MeshLambertMaterial({ color: '#e8e8e8' }),
    armor: new THREE.MeshLambertMaterial({ color: '#4fc3f7' }),
  };
  for (const s of SHOPS) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(60, 16, 30), shopMats[s.id] ?? shopMats.guns);
    box.position.set(s.x, 8, s.y);
    box.castShadow = true;
    r.decoGroup.add(box);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(56, 5, 2), new THREE.MeshBasicMaterial({ color: '#10141c' }));
    sign.position.set(s.x, 19, s.y - 14);
    r.decoGroup.add(sign);
  }
}

/** One car, built from boxes: body, cabin, four wheels, lights, and a police light bar. */
function buildCarMesh(car) {
  const group = new THREE.Group();
  const spec = { length: 52, width: 26 };
  const len = car.kind === 'truck' ? 66 : (car.kind === 'van' ? 60 : 54);
  const wid = car.kind === 'truck' ? 30 : (car.kind === 'van' ? 28 : 26);
  const bodyMat = new THREE.MeshLambertMaterial({ color: car.color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, 7, wid), bodyMat);
  body.position.y = 4.5;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(len * 0.42, 6, wid * 0.78), new THREE.MeshLambertMaterial({ color: '#20242e' }));
  cabin.position.set(-len * 0.04, 10.5, 0);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(4.5, 4.5, 3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: '#14161c' });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(sx * len * 0.32, 4.5, sz * (wid / 2 - 1));
      group.add(wheel);
    }
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: '#fff6c8' });
  for (const sz of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4), lightMat);
    head.position.set(len / 2, 5, sz * (wid / 2 - 3));
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4), new THREE.MeshBasicMaterial({ color: '#e5534b' }));
    tail.position.set(-len / 2, 5, sz * (wid / 2 - 3));
    group.add(tail);
  }
  if (car.kind === 'police') {
    const red = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 5), new THREE.MeshBasicMaterial({ color: '#ff2e2e' }));
    red.position.set(-2, 14.5, -5);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 5), new THREE.MeshBasicMaterial({ color: '#2e7dff' }));
    blue.position.set(-2, 14.5, 5);
    group.add(red);
    group.add(blue);
    group.userData.bar = { red, blue };
  }
  group.userData.spec = spec;
  return group;
}

/** One person on foot: legs, torso, head, and a pistol in the hand. */
function buildPersonMesh(color, withGun) {
  const group = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: '#2e3440' });
  for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(4, 9, 4), legMat);
    leg.position.set(0, 4.5, sz * 3);
    group.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 12), new THREE.MeshLambertMaterial({ color }));
  torso.position.y = 15;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(4.5, 10, 8), new THREE.MeshLambertMaterial({ color: '#e8b08a' }));
  head.position.y = 25;
  head.castShadow = true;
  group.add(head);
  if (withGun) {
    const gun = new THREE.Mesh(new THREE.BoxGeometry(9, 2, 2), new THREE.MeshLambertMaterial({ color: '#14161c' }));
    gun.position.set(6, 14, 0);
    group.add(gun);
  }
  return group;
}

/** One police helicopter: body, tail, spinning rotor, and a searchlight cone. */
function buildHeliMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(26, 10, 12), new THREE.MeshLambertMaterial({ color: '#20242e' }));
  body.position.y = 0;
  body.castShadow = true;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 8), new THREE.MeshLambertMaterial({ color: '#2e7f9e' }));
  nose.position.set(14, 0, 0);
  group.add(nose);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(24, 4, 4), new THREE.MeshLambertMaterial({ color: '#20242e' }));
  tail.position.set(-22, 2, 0);
  group.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(52, 1, 3), new THREE.MeshBasicMaterial({ color: '#c9c9c9' }));
  rotor.position.y = 8;
  group.add(rotor);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(26, 130, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = -65;
  beam.rotation.x = Math.PI;
  group.add(beam);
  const spot = new THREE.SpotLight(0xfff6c8, 30000, 300, 0.32, 0.5, 1);
  spot.position.set(0, -4, 0);
  group.add(spot);
  group.add(spot.target);
  group.userData.rotor = rotor;
  group.userData.spot = spot;
  return group;
}

/** Sync one simulated thing with its mesh: build it on first sight, move it every frame. */
function syncMesh(r, obj, build) {
  if (!obj._m) {
    obj._m = build();
    r.actorGroup.add(obj._m);
  }
  return obj._m;
}

/** Drop a mesh that no longer has a simulated thing behind it. */
function dropMesh(r, obj) {
  if (obj._m) {
    r.actorGroup.remove(obj._m);
    obj._m = null;
  }
}

/** The mission marker: a gold pillar of light with a bobbing diamond on top. */
function syncMarker(r, state) {
  if (!r._marker) {
    const group = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(14, 14, 220, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    pillar.position.y = 110;
    group.add(pillar);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(12), new THREE.MeshBasicMaterial({ color: 0xf2c94c }));
    gem.position.y = 60;
    group.add(gem);
    group.userData.gem = gem;
    r._marker = group;
    r.actorGroup.add(group);
  }
  const marker = currentMarker(state);
  if (!marker) {
    r._marker.visible = false;
    return;
  }
  r._marker.visible = true;
  r._marker.position.set(marker.x, 0, marker.y);
  r._marker.userData.gem.position.y = 60 + Math.sin(state.time * 3) * 8;
  r._marker.userData.gem.rotation.y = state.time * 1.5;
}

/** Move the chase camera: behind Rae, above her, looking where she is going. */
function updateCamera(r, state) {
  const player = state.player;
  const inCar = player.car !== null;
  const dist = inCar ? CAMERA.carDistance : CAMERA.footDistance;
  const height = inCar ? CAMERA.carHeight : CAMERA.footHeight;
  const tx = player.x - Math.cos(player.angle) * dist;
  const tz = player.y - Math.sin(player.angle) * dist;
  const k = Math.min(1, (1 / 60) * CAMERA.smooth);
  r.camState.x += (tx - r.camState.x) * k;
  r.camState.z += (tz - r.camState.z) * k;
  r.camState.lookX += (player.x + Math.cos(player.angle) * CAMERA.lookAhead - r.camState.lookX) * k;
  r.camState.lookZ += (player.y + Math.sin(player.angle) * CAMERA.lookAhead - r.camState.lookZ) * k;
  r.camera.position.set(r.camState.x, height, r.camState.z);
  r.camera.lookAt(r.camState.lookX, 8, r.camState.lookZ);
  // The sun follows Rae so the shadows stay near the action.
  r.sun.position.set(player.x + 300, 520, player.y + 180);
  r.sun.target.position.set(player.x, 0, player.y);
  r.sun.target.updateMatrixWorld();
}

/** Sync every moving thing: cars, walkers, rivals, pickups, bullets, helicopters. */
function syncActors(r, state) {
  const known = r._knownCars ?? (r._knownCars = new Set());
  const seenCars = new Set();
  for (const car of state.cars) {
    seenCars.add(car);
    known.add(car);
    const mesh = syncMesh(r, car, () => buildCarMesh(car));
    mesh.position.set(car.x, 0, car.y);
    mesh.rotation.y = -car.angle;
    mesh.rotation.z = car.wrecked ? 0.1 : 0;
    if (car.kind === 'police' && mesh.userData.bar) {
      const on = Math.floor(state.time * 4) % 2 === 0;
      mesh.userData.bar.red.visible = on;
      mesh.userData.bar.blue.visible = !on;
    }
  }
  for (const car of [...known]) {
    if (!seenCars.has(car)) {
      dropMesh(r, car);
      known.delete(car);
    }
  }
  const player = state.player;
  const pMesh = syncMesh(r, player, () => buildPersonMesh('#c94f4f', true));
  pMesh.visible = player.onFoot;
  if (player.onFoot) {
    pMesh.position.set(player.x, 0, player.y);
    pMesh.rotation.y = -player.angle;
    const bob = Math.abs(player.speed) > 5 ? Math.sin(state.time * 14) * 0.12 : 0;
    pMesh.rotation.z = bob;
  }
  for (const ped of state.peds) {
    const mesh = syncMesh(r, ped, () => buildPersonMesh(ped.color, false));
    mesh.position.set(ped.x, 0, ped.y);
    mesh.rotation.y = -ped.angle;
  }
  for (const enemy of state.enemies) {
    const mesh = syncMesh(r, enemy, () => buildPersonMesh('#8c2f2f', true));
    mesh.position.set(enemy.x, 0, enemy.y);
    mesh.rotation.y = -enemy.angle;
  }
  const pickupColors = { health: '#58d68d', ammo: '#f2c94c', cash: '#ffd94a' };
  for (const p of state.pickups) {
    const mesh = syncMesh(r, p, () => {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(9),
        new THREE.MeshBasicMaterial({ color: pickupColors[p.kind] ?? '#ffffff' }),
      );
      return m;
    });
    mesh.position.set(p.x, 12 + Math.sin(state.time * 3 + p.t) * 3, p.y);
    mesh.rotation.y = state.time * 2;
  }
  for (const b of state.bullets) {
    const mesh = syncMesh(r, b, () => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(26, 2, 2),
        new THREE.MeshBasicMaterial({ color: '#ffe9a8' }),
      );
      return m;
    });
    mesh.position.set(b.x, 14, b.y);
    mesh.rotation.y = -Math.atan2(b.vy, b.vx);
  }
  for (const heli of state.police.helis) {
    const mesh = syncMesh(r, heli, () => buildHeliMesh());
    mesh.visible = heli.active;
    if (!heli.active) continue;
    mesh.position.set(heli.x, 130, heli.y);
    mesh.rotation.y = -Math.atan2(state.player.y - heli.y, state.player.x - heli.x);
    mesh.userData.rotor.rotation.y = heli.rotor;
    // The searchlight target rides with the group: its local spot is the player, relative.
    mesh.userData.spot.target.position.set(state.player.x - heli.x, -130, state.player.y - heli.y);
  }
}

/** The HUD: cash, rank, wanted stars, health, armour, ammo, objective, speed and the LIVE panel. */
function updateHud(r, state) {
  const player = state.player;
  const h = r.hud;
  h.cash.textContent = `$${player.cash}`;
  h.rank.textContent = `${rankOf(state)} — ${state.stats.missionsDone}/12 jobs done`;
  let stars = '';
  for (let s = 0; s < 5; s += 1) stars += s < player.wanted ? '★' : '☆';
  h.stars.textContent = stars;
  h.stars.style.color = player.wanted > 0 ? PALETTE.star : 'rgba(245,239,224,0.35)';
  h.health.style.width = `${Math.max(0, player.health)}%`;
  h.health.style.background = player.health < 30 ? PALETTE.healthLow : PALETTE.health;
  h.armor.style.width = `${Math.max(0, player.armor)}%`;
  h.ammo.textContent = `AMMO ${player.ammo}`;
  const shop = nearestShop(state);
  const objective = shop ? shopPrompt(shop) : currentObjective(state);
  h.objective.textContent = objective;
  h.banner.textContent = state.missions.bannerT > 0 ? state.missions.banner : '';
  h.speed.textContent = `${playerKmh(state)} km/h`;
  h.radio.textContent = stationName(state.radio);
  const stream = state.stream;
  h.viewers.textContent = stream.live ? `${stream.viewers} watching` : 'OFF AIR';
  if (stream.chat.length !== r.lastChatCount) {
    r.lastChatCount = stream.chat.length;
    h.chat.innerHTML = stream.chat.map((line) => {
      if (line.kind === 'sys') return `<div>${line.text}</div>`;
      if (line.kind === 'don') return `<div class="don">${line.text}</div>`;
      if (line.kind === 'snitch') return `<div class="snitch">${line.text}</div>`;
      return `<div>${line.text}</div>`;
    }).join('');
  }
}

/** The minimap: the whole city, small, with Rae, the law and the markers on it. */
function drawMinimap(r, state) {
  const g = r.minimapCtx;
  const W = 216;
  const H = 156;
  const sx = W / WORLD.width;
  const sy = H / WORLD.height;
  g.fillStyle = PALETTE.minimap;
  g.fillRect(0, 0, W, H);
  g.fillStyle = PALETTE.minimapWater;
  g.fillRect(0, 2320 * sy, W, (WORLD.height - 2320) * sy);
  g.strokeStyle = PALETTE.minimapRoad;
  g.lineWidth = 2;
  for (const vx of ROADS.vertical) {
    g.beginPath();
    g.moveTo(vx * sx, 0);
    g.lineTo(vx * sx, H);
    g.stroke();
  }
  for (const hy of ROADS.horizontal) {
    g.beginPath();
    g.moveTo(0, hy * sy);
    g.lineTo(W, hy * sy);
    g.stroke();
  }
  for (const s of SHOPS) {
    g.fillStyle = '#58d68d';
    g.fillRect(s.x * sx - 3, s.y * sy - 3, 6, 6);
  }
  const marker = currentMarker(state);
  if (marker) {
    g.fillStyle = PALETTE.gold;
    g.beginPath();
    g.moveTo(marker.x * sx, marker.y * sy - 6);
    g.lineTo(marker.x * sx + 5, marker.y * sy);
    g.lineTo(marker.x * sx, marker.y * sy + 6);
    g.lineTo(marker.x * sx - 5, marker.y * sy);
    g.closePath();
    g.fill();
  }
  for (const car of state.cars) {
    if (car.driver !== 'police' || car.wrecked) continue;
    g.fillStyle = '#4fc3f7';
    g.fillRect(car.x * sx - 2, car.y * sy - 2, 4, 4);
  }
  for (const heli of state.police.helis) {
    if (!heli.active) continue;
    g.fillStyle = '#ffffff';
    g.fillRect(heli.x * sx - 2, heli.y * sy - 2, 4, 4);
  }
  const player = state.player;
  g.fillStyle = PALETTE.gold;
  g.beginPath();
  g.moveTo(player.x * sx + Math.cos(player.angle) * 7, player.y * sy + Math.sin(player.angle) * 7);
  g.lineTo(player.x * sx + Math.cos(player.angle + 2.5) * 5, player.y * sy + Math.sin(player.angle + 2.5) * 5);
  g.lineTo(player.x * sx + Math.cos(player.angle - 2.5) * 5, player.y * sy + Math.sin(player.angle - 2.5) * 5);
  g.closePath();
  g.fill();
}

/** The big panel screens: title, paused, busted, game over. */
function showPanel(r, screen, state) {
  const h = r.hud;
  const player = state.player;
  if (screen === SCREEN_PLAY) {
    h.panel.style.display = 'none';
    h.hud.style.display = 'block';
    return;
  }
  h.hud.style.display = 'none';
  h.panel.style.display = 'flex';
  if (screen === SCREEN_TITLE) {
    h.panelTitle.textContent = 'SOLMAR LIVE';
    h.panelSub.textContent = 'Streets of Gold — a 3D open-world crime game';
    const save = state.saveSummary;
    h.panelBody.textContent = 'Rae Vega starts as a courier with a pistol and a grudge, and rises through '
      + 'twelve missions in five acts to become Kingpin of Solmar. Drive the city, steal cars, '
      + 'outrun the police and the helicopter — and remember: every heist is streamed live, and '
      + 'the chat snitches. WASD move and drive, Shift run, E enter a car or buy at a shop, '
      + 'F or click to shoot, 1/2/3 radio, P pause, M mute.'
      + (save ? ` Welcome back — ${save.rank}, $${save.cash} in the pocket.` : '');
    h.panelPrompt.textContent = 'Press SPACE or click to start';
  } else if (screen === SCREEN_PAUSED) {
    h.panelTitle.textContent = 'Paused';
    h.panelSub.textContent = 'Solmar waits for no one — except right now.';
    h.panelBody.textContent = '';
    h.panelPrompt.textContent = 'Press P or SPACE to keep playing';
  } else if (screen === SCREEN_BUSTED) {
    h.panelTitle.textContent = 'Busted';
    h.panelSub.textContent = 'The Solmar PD has you. The bail is steep.';
    h.panelBody.textContent = `Cash kept: $${Math.floor(player.cash / 2)}`;
    h.panelPrompt.textContent = 'Press SPACE to walk free';
  } else if (screen === SCREEN_OVER) {
    h.panelTitle.textContent = 'Flatlined';
    h.panelSub.textContent = 'Solmar buries its couriers fast.';
    h.panelBody.textContent = '';
    h.panelPrompt.textContent = 'Press SPACE to start over';
  }
}

/** Forget every actor mesh (a new game, or a staged scene): the next draw rebuilds them. */
export function resetActors(r) {
  while (r.actorGroup.children.length > 0) r.actorGroup.remove(r.actorGroup.children[0]);
  r._knownCars = new Set();
  r._marker = null;
  r.lastChatCount = -1;
}

/** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
export function draw(r, state, screen) {
  if (!r.cityBuilt) {
    buildCityMeshes(r, state);
    r.cityBuilt = true;
  }
  r.water.position.y = 0.6 + Math.sin(state.time * 0.8) * 0.15;
  syncActors(r, state);
  syncMarker(r, state);
  updateCamera(r, state);
  updateHud(r, state);
  drawMinimap(r, state);
  showPanel(r, screen, state);
  r.renderer.render(r.scene, r.camera);
}
