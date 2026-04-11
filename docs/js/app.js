// ═══ 命運之星 RPG Engine v0.1 ═══
'use strict';

// ═══ CONFIG ═══
const CFG = {
  get key(){ return localStorage.getItem('fate_key') || ''; },
  set key(v){ localStorage.setItem('fate_key', v); },
  get model(){ return localStorage.getItem('fate_model') || 'claude-sonnet-4-20250514'; },
  set model(v){ localStorage.setItem('fate_model', v); },
  TILE: 32,         // tile size in pixels
  VIEW_W: 480,      // virtual canvas width
  VIEW_H: 320,      // virtual canvas height
  SPEED: 2,         // player movement speed (px/frame)
  FPS: 60,
};

// ═══ GAME STATE ═══
const G = {
  phase: 'title',   // title | play | dialogue | battle | menu | shop
  map: null,        // current map id
  player: { x: 7, y: 5, dir: 'down', moving: false, frame: 0 },
  camera: { x: 0, y: 0 },
  gold: { gold: 0, silver: 8, copper: 135 },
  partyIds: ['alfar', 'orange'],
  hp: {},
  inv: null,
  upgrade: {},
  formation: {},
  favor: {},
  quests: [],
  time: { day: 1, hour: 18, weather: '晴' },
  rep: {},
  intel: [],
  history: [],
  storyData: [],
  npcsOnMap: [],     // NPCs currently on the map
  _input: { up:false, down:false, left:false, right:false, action:false, cancel:false },
  _dialogue: { queue: [], idx: 0, typing: false, typingDone: null, callback: null },
  _battle: null,
  _transition: null,
};

// ═══ CANVAS ═══
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ═══ TILE MAP DEFINITIONS ═══
// Tile types: 0=floor, 1=wall, 2=water, 3=door, 4=grass, 5=path, 6=counter, 7=stairs
const TILE_COLORS = {
  0: '#2a2a3a', // floor
  1: '#1a1520', // wall
  2: '#1a2540', // water
  3: '#4a3520', // door
  4: '#1a2a1a', // grass
  5: '#3a3530', // path/road
  6: '#3a2a20', // counter/table
  7: '#4a4a5a', // stairs
};

// ═══ MAPS ═══
const MAPS = {
  iron_fog_town: {
    name: '鐵霧城',
    width: 30, height: 20,
    music: 'town',
    tiles: generateTownMap(30, 20),
    npcs: [
      { id: 'gelin', x: 8, y: 4, sprite: '👤', name: '葛林', dir: 'down',
        dialogue: ['歡迎來到鐵霧城的碼頭區。', '需要搬運工作的話，隨時來找我。'] },
      { id: 'guard1', x: 14, y: 3, sprite: '🛡', name: '城衛', dir: 'down',
        dialogue: ['這裡是鐵霧城，代理城主恩佐大人治理有方。', '外來的旅人請到城衛隊本部登記。'] },
      { id: 'merchant', x: 20, y: 8, sprite: '🏪', name: '商人', dir: 'left',
        dialogue: ['__SHOP__:iron_fog_general'] },
      { id: 'innkeeper', x: 5, y: 12, sprite: '🍺', name: '旅店老闆', dir: 'down',
        dialogue: ['歡迎來到鐵鎚旅館！', '住一晚3銀幣，包含早餐。', '__INN__'] },
      { id: 'blacksmith', x: 24, y: 6, sprite: '⚒', name: '鐵匠德溫', dir: 'down',
        dialogue: ['__SHOP__:iron_fog_weapon'] },
      { id: 'mysterious_cat', x: 12, y: 14, sprite: '🐈', name: '流浪貓', dir: 'down',
        dialogue: ['喵……', '（這隻貓盯著橘子看了很久。橘子裝作沒看到。）'] },
    ],
    doors: [
      { x: 14, y: 19, targetMap: 'iron_fog_outside', targetX: 15, targetY: 2 },
      { x: 0, y: 10, targetMap: 'iron_fog_port', targetX: 18, targetY: 10 },
    ],
    encounterRate: 0, // town = no encounters
  },
  iron_fog_outside: {
    name: '鐵霧城外',
    width: 40, height: 25,
    music: 'explore',
    tiles: generateFieldMap(40, 25),
    npcs: [
      { id: 'traveler1', x: 10, y: 12, sprite: '🚶', name: '旅人', dir: 'right',
        dialogue: ['小心北邊的山路，最近霧刃幫很活躍。'] },
    ],
    doors: [
      { x: 15, y: 1, targetMap: 'iron_fog_town', targetX: 14, targetY: 18 },
    ],
    encounterRate: 0.05, // random encounters
    encounterPool: ['goblin', 'wolf', 'bandit'],
  },
};

// ═══ MAP GENERATORS ═══
function generateTownMap(w, h) {
  const m = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      // Borders = wall
      if (x === 0 || x === w-1 || y === 0 || y === h-1) { row.push(1); continue; }
      // Buildings (walls with doors)
      if (y >= 2 && y <= 5 && x >= 3 && x <= 6) { row.push(y === 5 && x === 5 ? 3 : 1); continue; }
      if (y >= 2 && y <= 5 && x >= 18 && x <= 22) { row.push(y === 5 && x === 20 ? 3 : 1); continue; }
      if (y >= 10 && y <= 13 && x >= 3 && x <= 7) { row.push(y === 13 && x === 5 ? 3 : 1); continue; }
      if (y >= 2 && y <= 5 && x >= 23 && x <= 26) { row.push(y === 5 && x === 24 ? 3 : 1); continue; }
      // Market area
      if (y >= 7 && y <= 9 && x >= 9 && x <= 11) { row.push(6); continue; }
      // Main road (horizontal)
      if (y >= 6 && y <= 7) { row.push(5); continue; }
      // Main road (vertical)
      if (x >= 13 && x <= 15) { row.push(5); continue; }
      // Water/harbor at left
      if (x <= 2 && y >= 8 && y <= 12) { row.push(2); continue; }
      // Rest is floor
      row.push(0);
    }
    m.push(row);
  }
  return m;
}

function generateFieldMap(w, h) {
  const m = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      if (x === 0 || x === w-1 || y === 0 || y === h-1) { row.push(1); continue; }
      // Path from south gate
      if (x >= 14 && x <= 16 && y <= 5) { row.push(5); continue; }
      // Winding path
      if (y >= 5 && y <= 7 && x >= 10 && x <= 25) { row.push(5); continue; }
      // Trees/walls scattered
      if (Math.sin(x*3.7+y*2.3) > 0.7) { row.push(1); continue; }
      // Water stream
      if (x >= 28 && x <= 29 && y >= 3 && y <= 20) { row.push(2); continue; }
      // Mostly grass
      row.push(4);
    }
    m.push(row);
  }
  return m;
}

// ═══ RENDERING ═══
function render() {
  ctx.fillStyle = '#080b12';
  ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);

  if (G.phase === 'title') return; // title screen is HTML overlay

  const map = MAPS[G.map];
  if (!map) return;

  const T = CFG.TILE;
  // Camera follows player
  G.camera.x = Math.max(0, Math.min(map.width * T - CFG.VIEW_W, G.player.x * T - CFG.VIEW_W / 2 + T / 2));
  G.camera.y = Math.max(0, Math.min(map.height * T - CFG.VIEW_H, G.player.y * T - CFG.VIEW_H / 2 + T / 2));
  const cx = Math.floor(G.camera.x);
  const cy = Math.floor(G.camera.y);

  // Draw tiles
  const startCol = Math.floor(cx / T);
  const startRow = Math.floor(cy / T);
  const endCol = Math.min(map.width, startCol + Math.ceil(CFG.VIEW_W / T) + 2);
  const endRow = Math.min(map.height, startRow + Math.ceil(CFG.VIEW_H / T) + 2);

  for (let y = startRow; y < endRow; y++) {
    for (let x = startCol; x < endCol; x++) {
      const tile = map.tiles[y]?.[x] ?? 1;
      const px = x * T - cx;
      const py = y * T - cy;
      ctx.fillStyle = TILE_COLORS[tile] || TILE_COLORS[0];
      ctx.fillRect(px, py, T, T);

      // Tile decorations
      if (tile === 4) { // grass dots
        ctx.fillStyle = '#2a3a2a';
        ctx.fillRect(px + 8, py + 6, 2, 2);
        ctx.fillRect(px + 20, py + 18, 2, 2);
        ctx.fillRect(px + 14, py + 24, 2, 2);
      }
      if (tile === 2) { // water shimmer
        ctx.fillStyle = 'rgba(100,150,220,0.15)';
        ctx.fillRect(px + ((Date.now()/300 + x*3 + y*7) % T), py + 10, 6, 2);
      }
      if (tile === 3) { // door marker
        ctx.fillStyle = '#8a6a40';
        ctx.fillRect(px + 10, py + 2, 12, T - 2);
        ctx.fillStyle = '#c9a84c';
        ctx.fillRect(px + 20, py + 14, 3, 3);
      }
      if (tile === 5) { // path texture
        ctx.fillStyle = '#4a4540';
        if ((x + y) % 3 === 0) ctx.fillRect(px + 10, py + 10, 3, 3);
      }
    }
  }

  // Draw NPCs
  (map.npcs || []).forEach(npc => {
    const px = npc.x * T - cx;
    const py = npc.y * T - cy;
    if (px < -T || px > CFG.VIEW_W || py < -T || py > CFG.VIEW_H) return;
    // NPC body
    ctx.fillStyle = '#6a5a8a';
    ctx.fillRect(px + 6, py + 4, 20, 24);
    ctx.fillStyle = '#8a7aaa';
    ctx.fillRect(px + 8, py + 2, 16, 10); // head
    // Emoji label
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(npc.sprite || '?', px + T/2, py + 20);
    // Name above
    ctx.font = '9px "Noto Serif TC", serif';
    ctx.fillStyle = '#c9a84c';
    ctx.fillText(npc.name || '', px + T/2, py - 2);
  });

  // Draw player
  const ppx = G.player.x * T - cx;
  const ppy = G.player.y * T - cy;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(ppx + 6, ppy + 26, 20, 4);
  // Body
  ctx.fillStyle = '#a8b5cc';
  ctx.fillRect(ppx + 8, ppy + 8, 16, 20);
  // Head
  ctx.fillStyle = '#c0c8d6';
  ctx.fillRect(ppx + 10, ppy + 2, 12, 10);
  // Silver hair
  ctx.fillStyle = '#d0d8e6';
  ctx.fillRect(ppx + 8, ppy + 0, 16, 6);
  // Direction indicator (eyes)
  ctx.fillStyle = '#444';
  const eyeOffsets = { down: [0, 0], up: [0, -2], left: [-2, -1], right: [2, -1] };
  const eo = eyeOffsets[G.player.dir] || [0, 0];
  ctx.fillRect(ppx + 12 + eo[0], ppy + 6 + eo[1], 2, 2);
  ctx.fillRect(ppx + 18 + eo[0], ppy + 6 + eo[1], 2, 2);

  // Cat companion (follows slightly behind)
  const catOff = { down: [8, -T], up: [8, T], left: [T, 4], right: [-T+8, 4] };
  const co = catOff[G.player.dir] || [8, -T];
  ctx.fillStyle = '#e8d8c0';
  ctx.fillRect(ppx + co[0], ppy + co[1] + 12, 14, 10);
  ctx.fillStyle = '#f0e8d8';
  ctx.fillRect(ppx + co[0] + 2, ppy + co[1] + 8, 10, 8);
  // Cat ears
  ctx.fillStyle = '#e8d8c0';
  ctx.fillRect(ppx + co[0] + 1, ppy + co[1] + 6, 3, 3);
  ctx.fillRect(ppx + co[0] + 9, ppy + co[1] + 6, 3, 3);
  // Cat eyes
  ctx.fillStyle = '#4488cc';
  ctx.fillRect(ppx + co[0] + 4, ppy + co[1] + 10, 2, 2);
  ctx.fillRect(ppx + co[0] + 8, ppy + co[1] + 10, 2, 2);

  // Interaction prompt
  const facing = getFacingTile();
  const npcNear = getNearbyNPC();
  if (npcNear) {
    ctx.fillStyle = 'rgba(201,168,76,0.8)';
    ctx.font = '10px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('按 A 互動', ppx + T/2, ppy - 6);
  }

  // Screen transition
  if (G._transition) {
    ctx.fillStyle = `rgba(0,0,0,${G._transition.alpha})`;
    ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
  }
}

// ═══ INPUT ═══
const KEYS = {
  ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
  w:'up', s:'down', a:'left', d:'right',
  ' ':'action', Enter:'action', z:'action',
  Escape:'cancel', x:'cancel', Backspace:'cancel',
};

document.addEventListener('keydown', e => {
  const k = KEYS[e.key];
  if (k) { G._input[k] = true; e.preventDefault(); }
});
document.addEventListener('keyup', e => {
  const k = KEYS[e.key];
  if (k) { G._input[k] = false; e.preventDefault(); }
});

// Touch controls
function setupTouch() {
  const jBase = document.getElementById('joystick-base');
  const jThumb = document.getElementById('joystick-thumb');
  const jZone = document.getElementById('joystick-zone');
  const btnA = document.getElementById('btn-action');
  const btnB = document.getElementById('btn-cancel');

  if (!jZone) return;

  let jActive = false, jCenterX = 0, jCenterY = 0;
  const DEAD = 15, RANGE = 40;

  jZone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    const r = jBase.getBoundingClientRect();
    jCenterX = r.left + r.width / 2;
    jCenterY = r.top + r.height / 2;
    jActive = true;
  }, { passive: false });

  jZone.addEventListener('touchmove', e => {
    if (!jActive) return;
    e.preventDefault();
    const t = e.touches[0];
    let dx = t.clientX - jCenterX;
    let dy = t.clientY - jCenterY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > RANGE) { dx = dx/dist*RANGE; dy = dy/dist*RANGE; }

    jThumb.style.transform = `translate(${dx}px, ${dy}px)`;

    G._input.up = dy < -DEAD;
    G._input.down = dy > DEAD;
    G._input.left = dx < -DEAD;
    G._input.right = dx > DEAD;
  }, { passive: false });

  const endTouch = () => {
    jActive = false;
    jThumb.style.transform = '';
    G._input.up = G._input.down = G._input.left = G._input.right = false;
  };
  jZone.addEventListener('touchend', endTouch);
  jZone.addEventListener('touchcancel', endTouch);

  if (btnA) btnA.addEventListener('touchstart', e => { e.preventDefault(); G._input.action = true; setTimeout(() => G._input.action = false, 100); }, { passive: false });
  if (btnB) btnB.addEventListener('touchstart', e => { e.preventDefault(); G._input.cancel = true; setTimeout(() => G._input.cancel = false, 100); }, { passive: false });
}

// ═══ MOVEMENT & COLLISION ═══
function canWalk(x, y) {
  const map = MAPS[G.map];
  if (!map) return false;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
  const tile = map.tiles[ty]?.[tx] ?? 1;
  if (tile === 1 || tile === 2 || tile === 6) return false; // wall, water, counter
  // NPC collision
  if (map.npcs?.some(n => n.x === tx && n.y === ty)) return false;
  return true;
}

function getFacingTile() {
  const d = G.player.dir;
  let fx = Math.floor(G.player.x);
  let fy = Math.floor(G.player.y);
  if (d === 'up') fy--;
  else if (d === 'down') fy++;
  else if (d === 'left') fx--;
  else if (d === 'right') fx++;
  return { x: fx, y: fy };
}

function getNearbyNPC() {
  const f = getFacingTile();
  const map = MAPS[G.map];
  if (!map) return null;
  return map.npcs?.find(n => n.x === f.x && n.y === f.y) || null;
}

function checkDoor() {
  const px = Math.floor(G.player.x);
  const py = Math.floor(G.player.y);
  const map = MAPS[G.map];
  if (!map) return;
  const door = map.doors?.find(d => d.x === px && d.y === py);
  if (door) {
    doTransition(() => {
      G.map = door.targetMap;
      G.player.x = door.targetX;
      G.player.y = door.targetY;
      updateHUD();
      const newMap = MAPS[G.map];
      if (newMap?.music) BGM.play(newMap.music);
    });
  }
}

let _stepCount = 0;
function update() {
  if (G.phase !== 'play') return;
  if (G._transition) return;

  const inp = G._input;
  let dx = 0, dy = 0;
  if (inp.up) { dy = -1; G.player.dir = 'up'; }
  else if (inp.down) { dy = 1; G.player.dir = 'down'; }
  else if (inp.left) { dx = -1; G.player.dir = 'left'; }
  else if (inp.right) { dx = 1; G.player.dir = 'right'; }

  if (dx !== 0 || dy !== 0) {
    const speed = CFG.SPEED / CFG.TILE;
    const nx = G.player.x + dx * speed;
    const ny = G.player.y + dy * speed;
    if (canWalk(Math.floor(nx + 0.5), Math.floor(ny + 0.5))) {
      G.player.x = nx;
      G.player.y = ny;
      G.player.moving = true;
      _stepCount++;
      if (_stepCount % 16 === 0) checkDoor();
      if (_stepCount % 32 === 0) checkEncounter();
    }
    G.player.frame = (G.player.frame + 1) % 32;
  } else {
    G.player.moving = false;
    // Snap to grid when stopped
    G.player.x = Math.round(G.player.x * 4) / 4;
    G.player.y = Math.round(G.player.y * 4) / 4;
  }

  // Action button
  if (inp.action) {
    inp.action = false;
    const npc = getNearbyNPC();
    if (npc) startDialogue(npc);
    else checkDoor();
  }
  if (inp.cancel) {
    inp.cancel = false;
    openMenu();
  }
}

// ═══ TRANSITIONS ═══
function doTransition(callback) {
  G._transition = { alpha: 0, phase: 'out' };
  const step = () => {
    if (G._transition.phase === 'out') {
      G._transition.alpha += 0.05;
      if (G._transition.alpha >= 1) {
        G._transition.alpha = 1;
        G._transition.phase = 'in';
        callback();
      }
    } else {
      G._transition.alpha -= 0.05;
      if (G._transition.alpha <= 0) {
        G._transition = null;
        return;
      }
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ═══ DIALOGUE ═══
function startDialogue(npc) {
  if (G.phase === 'dialogue') return;
  G.phase = 'dialogue';
  const lines = npc.dialogue || ['……'];
  G._dialogue = { queue: [], idx: 0, typing: false, typingDone: null, callback: null };

  for (const line of lines) {
    if (line.startsWith('__SHOP__:')) {
      G._dialogue.queue.push({ type: 'shop', shopId: line.replace('__SHOP__:', '') });
    } else if (line === '__INN__') {
      G._dialogue.queue.push({ type: 'inn' });
    } else {
      G._dialogue.queue.push({ type: 'text', speaker: npc.name, text: line });
    }
  }

  showDialogueFrame(0);
}

function showDialogueFrame(idx) {
  const frame = G._dialogue.queue[idx];
  if (!frame) { closeDialogue(); return; }

  if (frame.type === 'shop') {
    closeDialogue();
    openShopById(frame.shopId);
    return;
  }
  if (frame.type === 'inn') {
    closeDialogue();
    doInnRest();
    return;
  }

  const box = document.getElementById('dialogue-box');
  const nameEl = document.getElementById('dialogue-speaker');
  const textEl = document.getElementById('dialogue-text');
  const indEl = document.getElementById('dialogue-indicator');

  box.hidden = false;
  nameEl.textContent = frame.speaker || '';
  indEl.style.display = 'none';

  // Typewriter
  G._dialogue.typing = true;
  textEl.textContent = '';
  let i = 0;
  const speed = 30;
  const skip = () => { textEl.textContent = frame.text; G._dialogue.typing = false; G._dialogue.typingDone = null; indEl.style.display = ''; };
  G._dialogue.typingDone = skip;
  const tick = () => {
    if (!G._dialogue.typing) return;
    if (i < frame.text.length) {
      textEl.textContent += frame.text[i]; i++;
      const ch = frame.text[i-1];
      const d = '，。！？、；：'.includes(ch) ? speed*3 : '…—'.includes(ch) ? speed*2 : speed;
      setTimeout(tick, d);
    } else { G._dialogue.typing = false; G._dialogue.typingDone = null; indEl.style.display = ''; }
  };
  tick();
}

function advanceDialogue() {
  if (G._dialogue.typing && G._dialogue.typingDone) {
    G._dialogue.typingDone();
    return;
  }
  G._dialogue.idx++;
  showDialogueFrame(G._dialogue.idx);
}

function closeDialogue() {
  G.phase = 'play';
  document.getElementById('dialogue-box').hidden = true;
  G._dialogue = { queue: [], idx: 0, typing: false, typingDone: null, callback: null };
}

// Click/tap on dialogue box to advance
document.getElementById('dialogue-box')?.addEventListener('click', () => {
  if (G.phase === 'dialogue') advanceDialogue();
});

// ═══ RANDOM ENCOUNTERS ═══
function checkEncounter() {
  const map = MAPS[G.map];
  if (!map || !map.encounterRate) return;
  if (Math.random() > map.encounterRate) return;
  const pool = map.encounterPool || ['goblin'];
  const enemyId = pool[Math.floor(Math.random() * pool.length)];
  startBattle([enemyId]);
}

// ═══ BATTLE SYSTEM ═══
function startBattle(enemyIds) {
  G.phase = 'battle';
  BGM.play('battle');
  const enemies = enemyIds.map((eid, i) => {
    const tmpl = typeof ENEMY_DB !== 'undefined' ? ENEMY_DB[eid] : null;
    if (!tmpl) return { id: eid+'_'+i, name: eid, hp: 20, maxHp: 20, stats: {atk:5,def:3}, icon: '👹' };
    return { id: eid+'_'+i, name: tmpl.name, hp: tmpl.hp, maxHp: tmpl.hp, stats: {...tmpl.stats}, icon: tmpl.icon || '👹', exp: tmpl.exp || 0, gold: {...(tmpl.gold||{s:0,c:0})} };
  });
  G._battle = { enemies, turn: 'player', log: [], round: 1 };
  renderBattle();
  document.getElementById('battle-overlay').hidden = false;
}

function renderBattle() {
  if (!G._battle) return;
  const enemyDiv = document.getElementById('battle-enemies');
  enemyDiv.innerHTML = G._battle.enemies.map(e =>
    `<div class="battle-enemy${e.hp<=0?' dead':''}">
      <div class="enemy-icon">${e.icon}</div>
      <div class="enemy-name">${e.name}</div>
      <div class="enemy-hp-bar"><div class="enemy-hp-fill" style="width:${Math.max(0,e.hp/e.maxHp*100)}%"></div></div>
      <div class="enemy-hp-text">${Math.max(0,e.hp)}/${e.maxHp}</div>
    </div>`
  ).join('');

  const partyDiv = document.getElementById('battle-party-status');
  const party = G.partyIds.map(id => {
    const c = typeof PARTY !== 'undefined' ? PARTY.find(p => p.id === id) : null;
    const hp = G.hp[id] || { cur: 30, max: 30 };
    return `<div class="battle-member">
      <span class="bm-name">${c?.name || id}</span>
      <div class="bm-hp-bar"><div class="bm-hp-fill" style="width:${hp.cur/hp.max*100}%"></div></div>
      <span class="bm-hp">${hp.cur}/${hp.max}</span>
    </div>`;
  }).join('');
  partyDiv.innerHTML = party;

  const logDiv = document.getElementById('battle-log');
  logDiv.innerHTML = G._battle.log.slice(-4).map(l => `<div>${l}</div>`).join('');
}

function battleAction(action) {
  if (!G._battle || G._battle.turn !== 'player') return;
  const party = G.partyIds[0]; // simplified: only lead attacks
  const pStats = (typeof PARTY !== 'undefined' ? PARTY.find(p => p.id === party)?.stats : null) || { '武力': 30 };
  const upgrade = G.upgrade[party] || {};
  const atk = (pStats['武力'] || 30) + (upgrade['武力'] || 0);

  if (action === 'attack') {
    const alive = G._battle.enemies.filter(e => e.hp > 0);
    if (!alive.length) { endBattle('win'); return; }
    const target = alive[0];
    const dmg = Math.max(1, Math.floor(atk / 3 + Math.random() * 8 - (target.stats?.def || 0) / 4));
    target.hp -= dmg;
    G._battle.log.push(`艾爾法 攻擊 ${target.name}！造成 ${dmg} 傷害。`);
    if (target.hp <= 0) G._battle.log.push(`${target.name} 被擊敗了！`);
  } else if (action === 'defend') {
    G._battle.log.push('艾爾法 擺出防禦姿態。');
  } else if (action === 'flee') {
    if (Math.random() > 0.4) {
      G._battle.log.push('成功逃跑了！');
      endBattle('flee');
      return;
    }
    G._battle.log.push('逃跑失敗！');
  } else if (action === 'item') {
    G._battle.log.push('（道具功能開發中）');
  } else if (action === 'skill') {
    G._battle.log.push('（技能功能開發中）');
  }

  renderBattle();

  // Check win
  if (G._battle.enemies.every(e => e.hp <= 0)) {
    setTimeout(() => endBattle('win'), 800);
    return;
  }

  // Enemy turn
  G._battle.turn = 'enemy';
  setTimeout(() => {
    G._battle.enemies.filter(e => e.hp > 0).forEach(e => {
      const dmg = Math.max(1, Math.floor((e.stats?.atk || 5) + Math.random() * 4 - atk / 10));
      const hp = G.hp[party] || { cur: 30, max: 30 };
      hp.cur = Math.max(0, hp.cur - dmg);
      G.hp[party] = hp;
      G._battle.log.push(`${e.name} 攻擊！造成 ${dmg} 傷害。`);
    });
    G._battle.turn = 'player';
    G._battle.round++;
    renderBattle();

    // Check defeat
    const pHp = G.hp[G.partyIds[0]] || { cur: 0, max: 30 };
    if (pHp.cur <= 0) {
      setTimeout(() => endBattle('defeat'), 800);
    }
  }, 600);
}

function endBattle(result) {
  if (result === 'win') {
    let totalExp = 0, totalGold = { s: 0, c: 0 };
    G._battle.enemies.forEach(e => {
      totalExp += e.exp || 5;
      totalGold.s += e.gold?.s || 0;
      totalGold.c += e.gold?.c || 0;
    });
    G.gold.silver += totalGold.s;
    G.gold.copper += totalGold.c;
    normalizeGold();
    G._battle.log.push(`✦ 勝利！獲得 ${totalExp} EXP、銀${totalGold.s}・銅${totalGold.c}`);
    renderBattle();
  } else if (result === 'defeat') {
    // Heal to 1 HP
    G.partyIds.forEach(id => { if (G.hp[id]) G.hp[id].cur = 1; });
    G._battle.log.push('⚠ 敗北……勉強逃出了戰鬥。');
    renderBattle();
  }

  setTimeout(() => {
    G._battle = null;
    document.getElementById('battle-overlay').hidden = true;
    G.phase = 'play';
    const map = MAPS[G.map];
    if (map?.music) BGM.play(map.music);
    updateHUD();
  }, result === 'flee' ? 500 : 1500);
}

// Battle button listeners
document.querySelectorAll('.battle-btn').forEach(btn => {
  btn.addEventListener('click', () => battleAction(btn.dataset.action));
});

// ═══ SHOP SYSTEM ═══
function openShopById(shopId) {
  G.phase = 'shop';
  const overlay = document.getElementById('shop-overlay');
  const nameEl = document.getElementById('shop-name');
  const goldEl = document.getElementById('shop-gold-amount');
  const itemsEl = document.getElementById('shop-items');

  nameEl.textContent = shopId.replace(/_/g, ' ');
  goldEl.textContent = goldStr();
  overlay.hidden = false;

  // Get items from SHOP_TEMPLATES/CITY_EXTRAS if available
  let items = [];
  if (typeof SHOP_TEMPLATES !== 'undefined') {
    const key = shopId.includes('weapon') ? 'weapon' : shopId.includes('armor') ? 'armor' : 'general';
    items = [...(SHOP_TEMPLATES[key] || SHOP_TEMPLATES.general || [])];
  }

  itemsEl.innerHTML = items.length ? items.map((item, i) =>
    `<div class="shop-item" onclick="buyItem(${i})">
      <span class="si-name">${item.n}</span>
      <span class="si-desc">${item.t || ''}</span>
      <span class="si-price">${priceStr(item.price)}</span>
    </div>`
  ).join('') : '<div style="padding:1rem;color:#6a7a8a;">商品準備中…</div>';

  document.getElementById('shop-close').onclick = () => {
    overlay.hidden = true;
    G.phase = 'play';
  };
}

function buyItem(idx) {
  // Simplified buy
  showToast('購買功能完善中');
}

// ═══ INN ═══
function doInnRest() {
  if (G.gold.silver < 3) { showToast('金幣不足'); G.phase = 'play'; return; }
  G.gold.silver -= 3;
  normalizeGold();
  G.partyIds.forEach(id => {
    const hp = G.hp[id] || { cur: 30, max: 30 };
    hp.cur = hp.max;
    G.hp[id] = hp;
  });
  G.time.hour = 8;
  G.time.day++;
  showToast('✦ 休息一晚，全員回復！');
  updateHUD();
  G.phase = 'play';
}

// ═══ MENU ═══
function openMenu() {
  if (G.phase === 'battle' || G.phase === 'dialogue') return;
  G.phase = 'menu';
  document.getElementById('menu-overlay').hidden = false;
  renderMenuParty();
}

function closeMenu() {
  G.phase = 'play';
  document.getElementById('menu-overlay').hidden = true;
}

function renderMenuParty() {
  const list = document.getElementById('party-list');
  if (!list) return;
  list.innerHTML = G.partyIds.map(id => {
    const c = typeof PARTY !== 'undefined' ? PARTY.find(p => p.id === id) : null;
    const hp = G.hp[id] || { cur: 30, max: 30 };
    const u = G.upgrade[id] || { lv: 1 };
    return `<div class="menu-party-card">
      <div class="mpc-emoji">${c?.emoji || '?'}</div>
      <div class="mpc-info">
        <div class="mpc-name">${c?.name || id}</div>
        <div class="mpc-title">Lv${u.lv || 1} ${c?.title || ''}</div>
        <div class="mpc-hp">HP ${hp.cur}/${hp.max}</div>
      </div>
    </div>`;
  }).join('');
}

// Menu tab switching
document.querySelectorAll('.menu-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.menu-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.querySelector(`.menu-panel[data-panel="${tab.dataset.tab}"]`);
    if (panel) panel.classList.add('active');
  });
});

document.getElementById('menu-close')?.addEventListener('click', closeMenu);
document.getElementById('btn-menu')?.addEventListener('click', openMenu);

// ═══ HUD ═══
function updateHUD() {
  const locEl = document.getElementById('hud-location');
  if (locEl) locEl.textContent = MAPS[G.map]?.name || '未知之地';
  const goldEl = document.getElementById('gold-amount');
  if (goldEl) goldEl.textContent = goldStr();

  G.partyIds.forEach((id, i) => {
    const member = document.getElementById(`hud-member-${i}`);
    if (!member) return;
    const c = typeof PARTY !== 'undefined' ? PARTY.find(p => p.id === id) : null;
    const hp = G.hp[id] || { cur: 30, max: 30 };
    member.querySelector('.hud-name').textContent = c?.name || id;
    const fill = member.querySelector('.hud-hp-fill');
    if (fill) fill.style.width = `${hp.cur/hp.max*100}%`;
  });
}

// ═══ GOLD ═══
function normalizeGold() {
  while (G.gold.copper >= 10) { G.gold.silver++; G.gold.copper -= 10; }
  while (G.gold.silver >= 100) { G.gold.gold++; G.gold.silver -= 100; }
  while (G.gold.copper < 0 && G.gold.silver > 0) { G.gold.silver--; G.gold.copper += 10; }
  while (G.gold.silver < 0 && G.gold.gold > 0) { G.gold.gold--; G.gold.silver += 100; }
}

function goldStr() {
  const g = G.gold;
  const parts = [];
  if (g.gold > 0) parts.push(`金${g.gold}`);
  parts.push(`銀${g.silver}`);
  parts.push(`銅${g.copper}`);
  return parts.join('・');
}

function priceStr(p) {
  if (!p) return '免費';
  const parts = [];
  if (p.g) parts.push(`金${p.g}`);
  if (p.s) parts.push(`銀${p.s}`);
  if (p.c) parts.push(`銅${p.c}`);
  return parts.join('・') || '免費';
}

// ═══ BGM ═══
const BGM = {
  _audio: null, _current: null, vol: 0.5,
  play(mood) {
    if (mood === this._current && this._audio && !this._audio.paused) return;
    this.stop();
    this._current = mood;
    const src = `assets/bgm/${mood}.mp3`;
    this._audio = new Audio(src);
    this._audio.loop = true;
    this._audio.volume = this.vol;
    this._audio.play().catch(() => {});
  },
  stop() {
    if (this._audio) { this._audio.pause(); this._audio.src = ''; this._audio = null; }
    this._current = null;
  },
  setVolume(v) { this.vol = v; if (this._audio) this._audio.volume = v; }
};

// ═══ SAVE / LOAD ═══
const SAVE_KEY = 'fate_rpg_save';
function saveGame() {
  const data = {
    map: G.map, player: G.player, gold: G.gold, partyIds: G.partyIds,
    hp: G.hp, inv: G.inv, upgrade: G.upgrade, favor: G.favor,
    quests: G.quests, time: G.time, rep: G.rep, intel: G.intel,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  showToast('✦ 已存檔');
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    Object.assign(G, {
      map: data.map, gold: data.gold || G.gold,
      partyIds: data.partyIds || G.partyIds,
      hp: data.hp || {}, inv: data.inv, upgrade: data.upgrade || {},
      favor: data.favor || {}, quests: data.quests || [],
      time: data.time || G.time, rep: data.rep || {}, intel: data.intel || [],
    });
    if (data.player) Object.assign(G.player, data.player);
    return true;
  } catch (e) { return false; }
}

// ═══ TOAST ═══
function showToast(msg) {
  // Simple on-screen toast
  const existing = document.getElementById('_toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = '_toast';
  el.textContent = msg;
  el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(8,11,18,.9);border:1px solid #c9a84c;color:#e8cc7a;padding:.5rem 1rem;border-radius:4px;font-size:.8rem;z-index:999;pointer-events:none;transition:opacity .5s;font-family:"Noto Serif TC",serif;';
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 2000);
}

// ═══ INIT HP ═══
function initHP() {
  G.partyIds.forEach(id => {
    if (!G.hp[id]) {
      const c = typeof PARTY !== 'undefined' ? PARTY.find(p => p.id === id) : null;
      const baseHp = id === 'orange' ? 15 : 50;
      G.hp[id] = { cur: baseHp, max: baseHp };
    }
  });
}

// ═══ GAME START ═══
function startNewGame() {
  G.map = 'iron_fog_town';
  G.player = { x: 14, y: 10, dir: 'down', moving: false, frame: 0 };
  G.gold = { gold: 0, silver: 8, copper: 135 };
  G.partyIds = ['alfar', 'orange'];
  initHP();
  beginPlay();
}

function continueGame() {
  if (loadGame()) {
    initHP();
    beginPlay();
  } else {
    showToast('沒有存檔');
  }
}

function beginPlay() {
  G.phase = 'play';
  // Hide title, show HUD + controls
  document.getElementById('title-screen').hidden = true;
  document.getElementById('loading').hidden = true;
  document.getElementById('hud').hidden = false;
  document.getElementById('touch-controls').hidden = false;
  document.getElementById('btn-menu').hidden = false;

  updateHUD();
  const map = MAPS[G.map];
  if (map?.music) BGM.play(map.music);

  // Auto-save periodically
  setInterval(() => { if (G.phase === 'play') saveGame(); }, 60000);
}

// ═══ GAME LOOP ═══
function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}

// ═══ CANVAS RESIZE ═══
function resizeCanvas() {
  const ratio = CFG.VIEW_W / CFG.VIEW_H;
  let w = window.innerWidth;
  let h = window.innerHeight;
  if (w / h > ratio) { w = h * ratio; }
  else { h = w / ratio; }
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
window.addEventListener('resize', resizeCanvas);

// ═══ BOOT ═══
window.addEventListener('DOMContentLoaded', () => {
  resizeCanvas();
  setupTouch();

  // Title screen buttons
  document.getElementById('btn-new-game')?.addEventListener('click', startNewGame);
  document.getElementById('btn-continue')?.addEventListener('click', continueGame);

  // Check if continue is available
  const hasSave = !!localStorage.getItem(SAVE_KEY);
  const continueBtn = document.getElementById('btn-continue');
  if (continueBtn) continueBtn.style.opacity = hasSave ? '1' : '0.3';

  // Handle action input during dialogue
  document.addEventListener('keydown', e => {
    if (G.phase === 'dialogue' && (e.key === ' ' || e.key === 'Enter' || e.key === 'z')) {
      e.preventDefault();
      advanceDialogue();
    }
  });

  // Hide loading, show title
  document.getElementById('loading').hidden = true;

  // Start render loop
  gameLoop();
});
