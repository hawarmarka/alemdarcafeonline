// Alemdar Kıraathanesi salonu: karakterle yürü, diğer oyuncuları gör, masaya git ve otur (okey masasına katıl).
import * as THREE from '/vendor/three/three.module.js';
import { buildHall, HALL, TABLE, seatPose, SEAT_DIST } from '../okey3d/hall.js?v=1';
import { Person } from '../okey3d/people.js?v=1';

const $ = id => document.getElementById(id);
const socket = io();
const authToken = (() => { try { return localStorage.getItem('okeyAuthToken') || ''; } catch (_) { return ''; } })();
let myName = (() => { try { return localStorage.getItem('okeyPlayerName') || ''; } catch (_) { return ''; } })();
const MODE_NAMES = { klasik: 'Klasik', yardimli: 'Yardımlı', yardimsiz: 'Yardımsız', katlamali: 'Katlamalı' };

function toast(msg, ms = 2600) { const t = $('wToast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms); }

// ---------- sahne ----------
const canvas = $('world3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const maxRatio = Math.min(devicePixelRatio || 1, 2); let ratio = maxRatio; renderer.setPixelRatio(ratio);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 80);
const hall = buildHall(scene, {});
scene.fog = new THREE.Fog(0xdfe6ea, 18, 45);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- benim karakterim ----------
const me = { person: null, x: 0, z: 7.0, ry: Math.PI, vx: 0, vz: 0, speed: 0, pose: 'stand', target: null, onArrive: null, seated: false };
const keys = new Set();
let camYaw = Math.PI, camPitch = 0.32, camDist = 3.4;

function spawnMe() {
  me.person = new Person(myName, { tag: false });
  me.person.setPose('stand'); scene.add(me.person.root);
  me.ry = 0; camYaw = 0; // salona dönük girer (-z)
}

// ---------- çarpışma: duvarlar, kapı boşluğu, masalar, kolonlar, tezgah ----------
const R = 0.26;
const solids = [...hall.colliders];
const door = [-0.9, 0.9];
solids.push({ minX: HALL.minX - 1, maxX: door[0], minZ: HALL.maxZ - 0.12, maxZ: HALL.maxZ + 0.12 }, { minX: door[1], maxX: HALL.maxX + 1, minZ: HALL.maxZ - 0.12, maxZ: HALL.maxZ + 0.12 });
function blocked(x, z) {
  if (x < HALL.minX + R || x > HALL.maxX - R || z < HALL.minZ + R || z > HALL.terraceZ - R) return true;
  for (const b of solids) if (x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R) return true;
  return false;
}
function moveBy(dx, dz) { // duvara sürtünerek kayar
  if (!blocked(me.x + dx, me.z + dz)) { me.x += dx; me.z += dz; return true; }
  let moved = false;
  if (!blocked(me.x + dx, me.z)) { me.x += dx; moved = true; }
  if (!blocked(me.x, me.z + dz)) { me.z += dz; moved = true; }
  return moved;
}

// ---------- girdi ----------
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  keys.add(e.code);
  if (e.code === 'KeyE' || e.code === 'Enter') { const t = nearTable(); if (t >= 0) openTable(t); }
  if (e.code === 'Escape') closeTable();
  if (me.seated && /Key[WASD]|Arrow/.test(e.code)) standUp();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.moved > 6) { canvas.classList.add('dragging'); camYaw -= dx * 0.006; camPitch = Math.max(-0.1, Math.min(1.1, camPitch + dy * 0.004)); }
});
canvas.addEventListener('pointerup', e => { const click = drag && drag.moved <= 6; drag = null; canvas.classList.remove('dragging'); if (click) clickAt(e.clientX, e.clientY); });
canvas.addEventListener('wheel', e => { camDist = Math.max(1.6, Math.min(6, camDist + Math.sign(e.deltaY) * 0.3)); }, { passive: true });

// Tıklanan yere yürü; masaya tıklandıysa masaya git ve paneli aç.
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function clickAt(cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  // önce masa yüzeyi (y = masa yüksekliği), sonra zemin
  if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE.top), hit)) {
    const t = hall.tables.findIndex(tb => Math.abs(hit.x - tb.x) < 0.75 && Math.abs(hit.z - tb.z) < 0.75);
    if (t >= 0) return walkToTable(t);
  }
  if (ray.ray.intersectPlane(floorPlane, hit)) { if (me.seated) standUp(); me.target = { x: hit.x, z: hit.z }; me.onArrive = null; }
}
function walkToTable(t) {
  if (me.seated) standUp();
  const tb = hall.tables[t];
  // masanın en yakın kenarına, sandalyelerin dışına
  const a = Math.atan2(me.x - tb.x, me.z - tb.z), d = SEAT_DIST + 0.55;
  me.target = { x: tb.x + Math.sin(a) * d, z: tb.z + Math.cos(a) * d }; me.onArrive = () => openTable(t);
}

// ---------- diğer oyuncular ----------
const others = new Map(); // id → { person, from, to, t }
let myId = null;
socket.on('world:welcome', d => { myId = d.id; });
socket.on('world:full', d => toast(d.message, 5000));
socket.on('world:state', ({ list }) => {
  const seen = new Set();
  $('wOnline').textContent = String(list.length);
  for (const [id, name, x, z, ry, pose, speed] of list) {
    if (id === myId) continue;
    seen.add(id);
    let o = others.get(id);
    if (!o) { const person = new Person(name, { tag: true }); person.setPose(pose === 'sit' ? 'sit' : 'stand'); person.placeAt(x, z, ry); scene.add(person.root); o = { person, x, z, ry }; others.set(id, o); }
    o.tx = x; o.tz = z; o.try = ry; o.pose = pose; o.speed = speed;
    if ((pose === 'sit') !== (o.person.pose === 'sit')) o.person.setPose(pose === 'sit' ? 'sit' : 'stand');
  }
  for (const [id, o] of others) if (!seen.has(id)) { scene.remove(o.person.root); o.person.dispose(); others.delete(id); }
});
let lastSent = 0, lastSig = '';
function sendMove(now) {
  if (now - lastSent < 110) return;
  const sig = [me.x.toFixed(2), me.z.toFixed(2), me.ry.toFixed(2), me.pose].join(',');
  if (sig === lastSig && now - lastSent < 2000) return;
  lastSent = now; lastSig = sig;
  socket.emit('world:move', { x: me.x, z: me.z, ry: me.ry, pose: me.pose, speed: me.speed });
}

// ---------- masalar: gerçek okey masaları salondaki masalara yerleşir ----------
let rooms = { waiting: [], playing: [] };
const slots = new Map(); // masa index → { kind: 'waiting'|'playing', room }
const seatedNpc = new Map(); // `${table}:${seat}` → Person
async function loadRooms() {
  try { const r = await fetch('/api/rooms').then(x => x.json()); rooms = { waiting: r.waiting || [], playing: r.playing || [] }; }
  catch (_) { return; }
  // her masa kodu her istemcide aynı masaya düşsün: koda göre sırala, sırayla yerleştir
  slots.clear();
  const all = [...rooms.waiting.map(r => ({ kind: 'waiting', room: r })), ...rooms.playing.map(r => ({ kind: 'playing', room: r }))].sort((a, b) => a.room.code.localeCompare(b.room.code));
  all.slice(0, hall.tables.length).forEach((s, i) => slots.set(i, s));
  paintSeated();
  if (openTableIdx >= 0) renderTable(openTableIdx);
}
function seatNames(slot) {
  if (!slot) return [null, null, null, null];
  if (slot.kind === 'waiting') return slot.room.seats.map(s => s && s.name);
  return [0, 1, 2, 3].map(i => slot.room.seats[i]?.name || null);
}
function paintSeated() {
  const want = new Map();
  hall.tables.forEach((tb, t) => seatNames(slots.get(t)).forEach((name, s) => { if (name) want.set(`${t}:${s}`, name); }));
  for (const [k, p] of seatedNpc) if (want.get(k) !== p.name) { scene.remove(p.root); p.dispose(); seatedNpc.delete(k); }
  for (const [k, name] of want) {
    if (seatedNpc.has(k)) continue;
    const [t, s] = k.split(':').map(Number), sp = seatPose(hall.tables[t], s);
    const p = new Person(name, { tag: true }); p.setPose('sit'); p.placeAt(sp.x, sp.z, sp.ry); scene.add(p.root); seatedNpc.set(k, p);
  }
}

let openTableIdx = -1;
function nearTable() {
  let best = -1, bd = 1.7;
  hall.tables.forEach((tb, i) => { const d = Math.hypot(me.x - tb.x, me.z - tb.z); if (d < bd) { bd = d; best = i; } });
  return best;
}
function openTable(t) { openTableIdx = t; renderTable(t); $('wTable').classList.remove('hidden'); }
function closeTable() { openTableIdx = -1; $('wTable').classList.add('hidden'); }
$('wTableClose').onclick = closeTable;
function renderTable(t) {
  const slot = slots.get(t), r = slot?.room;
  $('wTableTitle').textContent = `Masa ${t + 1}` + (t >= 9 ? ' · Teras' : '');
  $('wTableInfo').textContent = !slot ? 'Boş masa. Kur, otur; boş koltuklara birkaç saniye sonra bilgisayar oyuncuları oturur.'
    : `${MODE_NAMES[r.modeKey] || 'Okey'} · ${Number(r.bet || 0).toLocaleString('tr-TR')} çip` + (slot.kind === 'playing' ? ' · oyun sürüyor' : ' · oyuncu bekleniyor');
  const box = $('wSeats'); box.replaceChildren();
  const names = seatNames(slot), labels = ['GÜNEY', 'DOĞU', 'KUZEY', 'BATI'];
  names.forEach((name, s) => {
    const el = document.createElement('div'); el.className = 'w-seat' + (name ? '' : ' empty');
    const small = document.createElement('small'); small.textContent = labels[s] + ' KOLTUK';
    const who = document.createElement('div'); who.textContent = name || 'Boş';
    el.append(small, who);
    if (!name && slot?.kind === 'waiting') { const b = document.createElement('button'); b.className = 'w-btn green'; b.textContent = 'OTUR'; b.onclick = () => sitAndJoin(t, s, { mode: 'code', roomCode: r.code, seat: s }); el.append(b); }
    box.append(el);
  });
  $('wCreate').classList.toggle('hidden', !!slot);
  const row = box.parentElement.querySelector('.w-row'); row?.remove();
  if (slot?.kind === 'playing') {
    const div = document.createElement('div'); div.className = 'w-row';
    const b = document.createElement('button'); b.className = 'w-btn'; b.textContent = 'MASAYI İZLE'; b.onclick = () => watch(r.code);
    div.append(b); box.after(div);
  }
}
$('wCreateBtn').onclick = () => {
  const t = openTableIdx; if (t < 0) return;
  const mode = $('wMode').value;
  sitAndJoin(t, 0, { mode: 'create', modeKey: mode, stackingMode: mode === 'katlamali', assisted: mode !== 'yardimsiz', bet: Number($('wBet').value), roundLimit: Number($('wRounds').value), isPublic: true });
};

// Sandalyeye yürü, otur, sonra okey masasına katıl.
let pendingJoin = null;
function sitAndJoin(t, seat, join) {
  closeTable();
  const sp = seatPose(hall.tables[t], seat), out = seatPose(hall.tables[t], seat, SEAT_DIST + 0.5);
  me.target = { x: out.x, z: out.z };
  me.onArrive = () => {
    me.x = sp.x; me.z = sp.z; me.ry = sp.ry; me.seated = true; me.pose = 'sit'; me.person.setPose('sit');
    camYaw = sp.ry; camPitch = 0.55; camDist = 2.2;
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
    pendingJoin = { modeKey: 'klasik', stackingMode: false, assisted: true, bet: 1000, roundLimit: 4, ...join, playerName: myName, token, authToken, penaltyMode: true, teamMode: false };
    setTimeout(() => socket.emit('joinGame', pendingJoin), 700);
  };
}
socket.on('joinedGame', data => {
  if (!pendingJoin) return;
  sessionStorage.setItem('okeySession', JSON.stringify({ roomCode: data.code, token: pendingJoin.token, playerName: pendingJoin.playerName }));
  sessionStorage.setItem('fromWorld', '1');
  location.assign('/game');
});
socket.on('gameError', d => { if (pendingJoin) { pendingJoin = null; standUp(); toast(d.message || 'Masaya oturulamadı.'); loadRooms(); } });
function watch(code) {
  sessionStorage.setItem('okeySession', JSON.stringify({ roomCode: code, watch: true }));
  sessionStorage.setItem('fromWorld', '1');
  location.assign('/game');
}
function standUp() { if (!me.seated) return; me.seated = false; me.pose = 'stand'; me.person.setPose('stand'); camPitch = 0.32; camDist = 3.4; const p = me; const a = p.ry; p.x += Math.sin(a) * 0.55; p.z += Math.cos(a) * 0.55; }

// ---------- döngü ----------
const clock = new THREE.Clock(); let frames = 0, ftime = 0;
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3();
function frame() {
  if (document.hidden) return;
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime, now = performance.now();
  if (me.person) {
    // klavye yönü kameraya göre; tıklanan hedef varsa oraya
    let ix = 0, iz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    let dx = 0, dz = 0;
    if (ix || iz) { me.target = null; me.onArrive = null; const s = Math.sin(camYaw), c = Math.cos(camYaw); dx = ix * c + iz * s; dz = -ix * s + iz * c; }
    else if (me.target) { dx = me.target.x - me.x; dz = me.target.z - me.z; if (Math.hypot(dx, dz) < 0.08) { me.target = null; dx = dz = 0; const cb = me.onArrive; me.onArrive = null; cb?.(); } }
    const len = Math.hypot(dx, dz);
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const want = me.seated || !len ? 0 : (run ? 3.0 : 1.5);
    me.speed += (want - me.speed) * Math.min(1, dt * 8);
    if (len && !me.seated) {
      const step = Math.min(len, me.speed * dt);
      if (!moveBy(dx / len * step, dz / len * step) && me.target) { me.target = null; me.onArrive = null; }
      const tr = Math.atan2(-dx, -dz); let d = tr - me.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); me.ry += d * Math.min(1, dt * 10);
      if (!ix && !iz && !me.target) me.speed = 0;
    }
    if (!me.seated) me.pose = me.speed > 0.1 ? 'walk' : 'stand';
    me.person.speed = me.speed; me.person.placeAt(me.x, me.z, me.ry); me.person.update(dt, t, null);
    // E ipucu
    const nt = me.seated ? -1 : nearTable(), pr = $('wPrompt');
    if (nt >= 0 && openTableIdx < 0) { pr.innerHTML = '<kbd>E</kbd> Masa ' + (nt + 1) + (slots.get(nt) ? ' · ' + (slots.get(nt).kind === 'playing' ? 'oyun sürüyor' : 'boş koltuk var') : ' · boş masa'); pr.classList.remove('hidden'); }
    else pr.classList.add('hidden');
    sendMove(now);
    // üçüncü şahıs kamera, duvar içinde kalır
    camTarget.set(me.x, me.seated ? 1.25 : 1.55, me.z);
    camPos.set(me.x + Math.sin(camYaw) * camDist * Math.cos(camPitch), camTarget.y + Math.sin(camPitch) * camDist, me.z + Math.cos(camYaw) * camDist * Math.cos(camPitch));
    camPos.x = Math.max(HALL.minX + 0.2, Math.min(HALL.maxX - 0.2, camPos.x)); camPos.z = Math.max(HALL.minZ + 0.2, Math.min(HALL.terraceZ + 3, camPos.z)); camPos.y = Math.min(HALL.height - 0.15, camPos.y);
    camera.position.lerp(camPos, Math.min(1, dt * 8)); camera.lookAt(camTarget);
  }
  for (const o of others.values()) {
    const k = Math.min(1, dt * 10);
    o.x += (o.tx - o.x) * k; o.z += (o.tz - o.z) * k;
    let d = o.try - o.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); o.ry += d * k;
    o.person.speed = o.pose === 'walk' ? o.speed : 0; o.person.placeAt(o.x, o.z, o.ry); o.person.update(dt, t, null);
  }
  for (const p of seatedNpc.values()) p.update(dt, t, null);
  renderer.render(scene, camera);
  // uyarlanır çözünürlük: FPS düşerse çizim çözünürlüğü iner
  frames++; ftime += dt;
  if (ftime >= 2) {
    const fps = frames / ftime; frames = 0; ftime = 0;
    if (fps < 50 && ratio > 0.6) { ratio = Math.max(0.6, ratio - 0.2); renderer.setPixelRatio(ratio); resize(); }
    else if (fps > 58 && ratio < maxRatio) { ratio = Math.min(maxRatio, ratio + 0.1); renderer.setPixelRatio(ratio); resize(); }
  }
}

// ---------- başlangıç ----------
function enter() {
  spawnMe();
  socket.emit('world:enter', { name: myName, authToken });
  socket.on('connect', () => socket.emit('world:enter', { name: myName, authToken }));
  loadRooms(); setInterval(loadRooms, 4000);
  setTimeout(() => $('wHint').classList.add('fade'), 9000);
  renderer.setAnimationLoop(frame);
  $('wLoading').classList.add('done');
}
$('wLobbyBtn').onclick = () => { sessionStorage.setItem('fromWorld', ''); location.assign('/?lobi=1'); };
$('wFullBtn').onclick = () => { if (window.alemdar?.toggleFullscreen) window.alemdar.toggleFullscreen(); else if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
async function boot() {
  if (authToken) {
    try { const r = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + authToken } }); if (r.ok) { const u = await r.json(); myName = u.username || u.user?.username || myName; } } catch (_) { /* misafir */ }
  }
  if (myName) return enter();
  $('wName').classList.remove('hidden'); $('wLoading').classList.add('done');
  $('wNameInput').focus();
  $('wNameForm').onsubmit = e => {
    e.preventDefault();
    const n = $('wNameInput').value.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 20);
    if (n.length < 2) return toast('Ad en az 2 harf olmalı.');
    myName = n; try { localStorage.setItem('okeyPlayerName', n); } catch (_) {}
    $('wName').classList.add('hidden'); enter();
  };
}
boot();
