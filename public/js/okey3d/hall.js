// Alemdar Kıraathanesi salonu: 3×3 masa, kolonlar, ocak tezgahı, içecek dolabı, tablolar, saat, camekân ve teras.
// Okey masası sayfası da (oyuncunun masası ortadaki masa, 0,0) yürünen salon sayfası da aynı salonu kurar.
import * as THREE from '/vendor/three/three.module.js';
import {
  TABLE, std, canvasTex, floorTexture, wallTexture, signTexture, buildTable, chairSet, teaGlass, teapot,
  painting, wallClock, fridge, coatRack, radiator, sideTable, fluorescent, backgammon, cardFan,
} from './props.js?v=1';

export { TABLE };
export const HALL = { minX: -6.6, maxX: 6.6, minZ: -6.2, maxZ: 5.0, height: 3.0, terraceZ: 8.2 };
export const SEAT_DIST = TABLE.size / 2 + 0.26; // masa merkezinden sandalye oturağına
// Masalar: ortadaki (index 4) oyuncunun okey masası.
export const TABLES = [];
for (const z of [-3.0, 0, 3.0]) for (const x of [-4.2, 0, 4.2]) TABLES.push({ x, z });
export const HOME = 4;

// Koltuk dir: 0 güney (+z), 1 doğu (+x), 2 kuzey, 3 batı. Oturan kişi masaya bakar.
export const SEAT_ANGLE = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
export function seatPose(table, dir, dist = SEAT_DIST) {
  const a = SEAT_ANGLE[dir];
  return { x: table.x + Math.sin(a) * dist, z: table.z + Math.cos(a) * dist, ry: a };
}

function box(parent, w, h, d, mat, x, y, z, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
}

function walls(root) {
  const { minX, maxX, minZ, maxZ, height: H } = HALL, W = maxX - minX, D = maxZ - minZ, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const wallMat = std(0xffffff, 0.92, { map: wallTexture() });
  const stripe = std(0x3a2418, 0.55);
  const ceilMat = std(0xd9dbdc, 0.95);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, H, cz); root.add(ceil);
  // kirişler
  for (const x of [-2.1, 2.1]) box(root, 0.3, 0.32, D, std(0xd2d4d5, 0.9), x, H - 0.16, cz);
  for (const z of [-1.5, 1.5]) box(root, W, 0.28, 0.28, std(0xd2d4d5, 0.9), cx, H - 0.14, z);
  // arka (kuzey) ve yan duvarlar; ön taraf camekân
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat); back.position.set(cx, H / 2, minZ); back.receiveShadow = true; root.add(back);
  box(root, W, 0.14, 0.02, stripe, cx, 1.05, minZ + 0.01);
  for (const [x, ry] of [[minX, Math.PI / 2], [maxX, -Math.PI / 2]]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat); w.position.set(x, H / 2, cz); w.rotation.y = ry; w.receiveShadow = true; root.add(w);
    const s = box(root, 0.02, 0.14, D, stripe, x + (ry > 0 ? 0.01 : -0.01), 1.05, cz); void s;
  }
  // dış kabuk (güneş gölgesi için; içeriden görünmez taraf önemli değil)
  box(root, W + 0.4, 0.2, D + 0.4, std(0x888888), cx, H + 0.1, cz, { receive: false });
  box(root, 0.2, H, D, std(0x888888), minX - 0.1, H / 2, cz, { receive: false });
  box(root, 0.2, H, D, std(0x888888), maxX + 0.1, H / 2, cz, { receive: false });
  box(root, W, H, 0.2, std(0x888888), cx, H / 2, minZ - 0.1, { receive: false });
  // ön camekân: alt duvar, çerçeveler, kapı boşluğu, tabela
  const frame = std(0xe9e9e6, 0.5), glass = new THREE.MeshStandardMaterial({ color: 0xcfe3ea, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false });
  const door = [-0.9, 0.9];
  for (const [a, b] of [[minX, door[0]], [door[1], maxX]]) {
    const w = b - a, mx = (a + b) / 2;
    box(root, w, 0.8, 0.16, wallMat, mx, 0.4, maxZ);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.85), glass); g.position.set(mx, 1.72, maxZ); g.castShadow = false; root.add(g);
    for (let x = a; x <= b + 1e-6; x += w / Math.max(1, Math.round(w / 1.5))) box(root, 0.07, 1.9, 0.09, frame, x, 1.72, maxZ, { cast: true });
    box(root, w, 0.07, 0.09, frame, mx, 0.8, maxZ); box(root, w, 0.07, 0.09, frame, mx, 2.65, maxZ);
  }
  box(root, W, H - 2.65, 0.18, wallMat, cx, (H + 2.65) / 2, maxZ);
  for (const x of door) box(root, 0.09, 2.65, 0.12, frame, x, 1.325, maxZ);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({ map: signTexture(true), transparent: true, depthWrite: false }));
  sign.position.set(3.2, 1.9, maxZ - 0.01); sign.rotation.y = Math.PI; root.add(sign); // içeriden ters okunur
  // sol duvar pencereleri (ferforje desenli) ve altında kalorifer
  const grille = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = 'rgba(200,225,235,.25)'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2a2a2a'; g.lineWidth = 7;
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, y + 32); g.lineTo(x + 16, y); g.lineTo(x + 48, y); g.lineTo(x + 64, y + 32); g.lineTo(x + 48, y + 64); g.lineTo(x + 16, y + 64); g.closePath(); g.stroke(); }
  }, [3, 2]);
  for (const z of [-3.0, 2.2]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshBasicMaterial({ map: grille, transparent: true, color: 0xf4f8fa })); win.position.set(minX + 0.012, 1.9, z); win.rotation.y = Math.PI / 2; root.add(win);
    for (const dz of [-1.12, 1.12]) box(root, 0.06, 1.38, 0.06, frame, minX + 0.03, 1.9, z + dz);
    box(root, 0.06, 0.06, 2.3, frame, minX + 0.03, 2.57, z); box(root, 0.12, 0.06, 2.3, frame, minX + 0.05, 1.23, z);
    radiator(root, minX + 0.08, 0.55, z, Math.PI / 2, 1.5);
  }
}

function counter(root) {
  const z0 = HALL.minZ + 0.45, x0 = 0.6;
  const marble = std(0xe7e4df, 0.25), body = std(0xaeb1b3, 0.8), wood = std(0xb07a3c, 0.55);
  box(root, 3.4, 1.05, 0.5, body, x0, 0.525, z0 + 0.6); box(root, 3.5, 0.05, 0.6, marble, x0, 1.07, z0 + 0.6);
  // buzlu cam paneller
  const frost = new THREE.MeshStandardMaterial({ color: 0xdfe7ea, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), frost); p.position.set(x0 - 1.4 + i * 0.56, 1.35, z0 + 0.62); root.add(p);
    box(root, 0.04, 0.55, 0.05, std(0xf4f4f4, 0.5), x0 - 1.68 + i * 0.56, 1.35, z0 + 0.62);
  }
  // arka tezgah, ocak, çaydanlıklar, raflar, davlumbaz
  box(root, 3.4, 0.9, 0.55, wood, x0, 0.45, HALL.minZ + 0.3); box(root, 3.4, 0.04, 0.6, marble, x0, 0.92, HALL.minZ + 0.3);
  for (let i = 0; i < 3; i++) teapot(root, x0 - 1.2 + i * 0.32, 0.94, HALL.minZ + 0.32);
  for (const sx of [-0.9, 0.9]) {
    box(root, 1.2, 0.04, 0.25, wood, x0 + sx, 1.7, HALL.minZ + 0.14); box(root, 1.2, 0.04, 0.25, wood, x0 + sx, 2.05, HALL.minZ + 0.14);
    for (let k = 0; k < 7; k++) teaGlass(root, x0 + sx - 0.5 + k * 0.16, 1.72, HALL.minZ + 0.15);
  }
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.75, 0.45, 4, 1, true), std(0x45484b, 0.35, { metalness: 0.7, side: THREE.DoubleSide }));
  hood.rotation.y = Math.PI / 4; hood.position.set(x0 - 0.9, 2.35, HALL.minZ + 0.5); root.add(hood);
  box(root, 0.3, 0.45, 0.3, std(0x45484b, 0.35, { metalness: 0.7 }), x0 - 0.9, 2.78, HALL.minZ + 0.5);
  // dolap (oyun takımları)
  box(root, 0.9, 2.0, 0.45, std(0xd6cfc2, 0.7), x0 - 2.35, 1.0, HALL.minZ + 0.3);
  for (let k = 0; k < 4; k++) box(root, 0.7, 0.08, 0.36, std(0x2b1a0e, 0.6), x0 - 2.35, 1.25 + k * 0.1, HALL.minZ + 0.32);
  return { minX: x0 - 2.8, maxX: x0 + 1.75, minZ: HALL.minZ, maxZ: z0 + 0.95 };
}

function terrace(root) {
  const { minX, maxX, maxZ, terraceZ } = HALL;
  const floor = floorTexture(); floor.repeat.set((maxX - minX) / 2.4, (terraceZ - maxZ) / 2.4);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, terraceZ - maxZ), std(0xffffff, 0.75, { map: floor })); f.rotation.x = -Math.PI / 2; f.position.set(0, 0.001, (maxZ + terraceZ) / 2); f.receiveShadow = true; root.add(f);
  const wall = std(0xe7e5df, 0.9);
  box(root, maxX - minX, 0.9, 0.22, wall, 0, 0.45, terraceZ); box(root, 0.22, 0.9, terraceZ - maxZ, wall, minX, 0.45, (maxZ + terraceZ) / 2); box(root, 0.22, 0.9, terraceZ - maxZ, wall, maxX, 0.45, (maxZ + terraceZ) / 2);
  const steel = std(0x1c1c1c, 0.5, { metalness: 0.6 });
  for (const x of [minX + 0.2, -2.2, 2.2, maxX - 0.2]) box(root, 0.1, 2.8, 0.1, steel, x, 1.4, terraceZ - 0.1);
  box(root, maxX - minX, 0.12, 0.12, steel, 0, 2.8, terraceZ - 0.1);
  // oluklu çatı: çizgili doku, kısmi gölge
  const roof = canvasTex(64, 256, (g, w, h) => { for (let x = 0; x < w; x += 8) { g.fillStyle = x % 16 ? '#3a3d40' : '#55595c'; g.fillRect(x, 0, 8, h); } }, [30, 1]);
  const r = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, terraceZ - maxZ + 0.4), std(0xffffff, 0.6, { map: roof, side: THREE.DoubleSide }));
  r.rotation.x = Math.PI / 2 + 0.06; r.position.set(0, 2.95, (maxZ + terraceZ) / 2); r.castShadow = true; root.add(r);
  for (const x of [-4.5, -1.2, 1.2, 4.5]) box(root, 0.08, 0.08, terraceZ - maxZ, steel, x, 2.85, (maxZ + terraceZ) / 2);
  // sokak ve karşı bina
  const street = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), std(0x9a9a98, 0.95)); street.rotation.x = -Math.PI / 2; street.position.set(0, -0.01, terraceZ + 15); street.receiveShadow = true; root.add(street);
  box(root, 60, 14, 1, std(0xd9d4c8, 0.95), 0, 7, terraceZ + 14, { cast: false });
  // terasta iki masa
  return [{ x: -4.2, z: 6.6 }, { x: 4.2, z: 6.6 }];
}

// Salonu kurar. opts.home: oyuncunun masası (okey sayfasında rakip ıstakaları ayrıca çizilir, süs konmaz).
export function buildHall(scene, opts = {}) {
  const root = new THREE.Group(); scene.add(root);
  const { minX, maxX, minZ, maxZ } = HALL;
  const floorTex = floorTexture(); floorTex.repeat.set((maxX - minX) / 2.4, (maxZ - minZ) / 2.4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), std(0xffffff, 0.55, { map: floorTex })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (minZ + maxZ) / 2); floor.receiveShadow = true; root.add(floor);
  walls(root);
  const counterBox = counter(root);
  const outside = terrace(root);
  const tables = [...TABLES, ...outside];
  const colliders = [counterBox];
  // kolonlar
  for (const [x, z] of [[-2.1, -1.5], [2.1, -1.5], [-2.1, 1.5], [2.1, 1.5]]) {
    box(root, 0.36, HALL.height, 0.36, std(0xc4c6c7, 0.9), x, HALL.height / 2, z);
    box(root, 0.38, 0.28, 0.38, std(0x3a2418, 0.6), x, 1.05, z);
    colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25 });
  }
  const noSmoke = canvasTex(128, 192, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c4161c'; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(33, 33); g.lineTo(95, 95); g.stroke(); g.fillStyle = '#c4161c'; g.font = '900 20px Arial'; g.textAlign = 'center'; g.fillText('SİGARA', 64, 140); g.fillText('İÇİLMEZ', 64, 166); });
  const ns = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), std(0xffffff, 0.6, { map: noSmoke })); ns.position.set(-2.1, 1.9, -1.31); root.add(ns);
  // masalar, sandalyeler, masa süsleri
  const chairs = [];
  tables.forEach((t, i) => {
    buildTable(root, t.x, t.z);
    colliders.push({ minX: t.x - 0.56, maxX: t.x + 0.56, minZ: t.z - 0.56, maxZ: t.z + 0.56, table: i });
    for (let d = 0; d < 4; d++) { const p = seatPose(t, d, SEAT_DIST + 0.06); chairs.push(p); }
    if (i === HOME && opts.home) return;
    const top = TABLE.top;
    const deco = i % 4;
    if (deco === 0) backgammon(root, t.x, top, t.z, 0.3 * (i % 3));
    else if (deco === 1) { cardFan(root, t.x - 0.2, top, t.z + 0.15, 0.4); cardFan(root, t.x + 0.18, top, t.z - 0.2, -2); }
    else if (deco === 2) for (let d = 0; d < 4; d++) { const a = SEAT_ANGLE[d], rack = box(root, 0.5, 0.06, 0.07, std(0x6a4022, 0.6), t.x + Math.sin(a) * 0.36, top + 0.03, t.z + Math.cos(a) * 0.36); rack.rotation.y = a; }
    teaGlass(root, t.x + 0.38, top, t.z + 0.38); teaGlass(root, t.x - 0.38, top, t.z - 0.36);
  });
  chairSet(root, chairs);
  for (const [x, z] of [[-2.9, -3.6], [5.2, 0.6], [-5.6, 3.6]]) { sideTable(root, x, z); teaGlass(root, x, 0.635, z); colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.22, maxZ: z + 0.22 }); }
  // duvar eşyaları
  painting(root, 'vapur', 1.1, 0.7, -4.2, 1.9, minZ + 0.02, 0);
  painting(root, 'balon', 0.9, 0.6, 4.4, 1.9, minZ + 0.02, 0);
  painting(root, 'bogaz', 1.3, 0.75, maxX - 0.02, 1.9, 1.5, -Math.PI / 2);
  painting(root, 'orman', 0.9, 0.6, maxX - 0.02, 1.9, -3.4, -Math.PI / 2);
  wallClock(root, maxX - 0.02, 2.2, -1.0, -Math.PI / 2);
  fridge(root, maxX - 0.45, minZ + 0.4, 0); colliders.push({ minX: maxX - 0.85, maxX, minZ, maxZ: minZ + 0.8 });
  coatRack(root, minX + 0.4, 0.4); colliders.push({ minX: minX, maxX: minX + 0.6, minZ: 0.2, maxZ: 0.6 });
  // ışıklar: floresanlar (görsel) + birkaç dolgu ışığı, gün ışığı (gölgeli)
  for (const z of [-3.0, 0, 3.0]) for (const x of [-4.2, 0, 4.2]) fluorescent(root, x, HALL.height - 0.03, z, 0);
  scene.add(new THREE.HemisphereLight(0xe8eef2, 0x7a7266, 1.25));
  for (const [x, z] of [[-3.5, -2], [3.5, -2], [0, 1.5], [-3.5, 3], [3.5, 3]]) { const l = new THREE.PointLight(0xf3f6ff, 4.2, 7.5, 1.6); l.position.set(x, 2.7, z); scene.add(l); }
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.position.set(-5, 9, 16); sun.target.position.set(0, 0, 1);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
  scene.add(sun, sun.target);
  scene.background = new THREE.Color(0xdfe6ea);
  return { root, tables, colliders, sun };
}
