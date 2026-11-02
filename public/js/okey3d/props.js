// Kıraathane eşyaları: masa (yeşil örtü), siyah sandalye, ince belli çay bardağı, çaydanlık, içecek dolabı,
// tablolar, duvar saati, askılık, kalorifer. Dokular canvas ile bir kez çizilir; tekrar eden eşya InstancedMesh.
import * as THREE from '/vendor/three/three.module.js';

export const TABLE = { size: 1.0, top: 0.76 };
export const std = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function noise(g, w, h, amt) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}

// ---------- dokular ----------
export function floorTexture() { // 60 cm bej seramik, ince derz
  return canvasTex(512, 512, (g, w, h) => {
    const n = 4, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 226 + Math.round((Math.random() - 0.5) * 10);
      g.fillStyle = `rgb(${v},${v - 8},${v - 20})`; g.fillRect(x * s, y * s, s, s);
    }
    noise(g, w, h, 8);
    g.strokeStyle = 'rgba(120,110,95,.55)'; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
  });
}
export function wallTexture() { // açık gri boya, altta hafif kirlenme
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#b9bcbd'; g.fillRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, h * 0.88, 0, h); grad.addColorStop(0, 'rgba(60,60,60,0)'); grad.addColorStop(1, 'rgba(60,60,60,.35)');
    g.fillStyle = grad; g.fillRect(0, h * 0.85, w, h * 0.15);
    noise(g, w, h, 6);
  });
}
function clothTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#0f5a52'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 12);
    g.globalAlpha = 0.06; g.strokeStyle = '#ffffff';
    for (let i = 0; i < w; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
    g.globalAlpha = 1;
  });
}
export function paintingTexture(kind) {
  return canvasTex(480, 320, (g, w, h) => {
    if (kind === 'bogaz') { // köprü ve şehir, gündüz
      const sky = g.createLinearGradient(0, 0, 0, h * 0.55); sky.addColorStop(0, '#6fa3d6'); sky.addColorStop(1, '#cfe2f0'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(60 + i * 80, 50 + (i % 2) * 20, 50, 14, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#7d8c99'; for (let x = 0; x < w; x += 14) g.fillRect(x, h * 0.42 - Math.random() * 40, 12, 60);
      g.fillStyle = '#2f6f99'; g.fillRect(0, h * 0.55, w, h * 0.2);
      g.fillStyle = '#2c4a2c'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.7); g.quadraticCurveTo(w * 0.5, h * 0.55, w, h * 0.78); g.lineTo(w, h); g.fill();
      g.strokeStyle = '#d8d8d8'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.1, h * 0.5); g.quadraticCurveTo(w * 0.45, h * 0.62, w * 0.8, h * 0.5); g.stroke();
      g.fillStyle = '#d8d8d8'; g.fillRect(w * 0.25, h * 0.32, 6, h * 0.24); g.fillRect(w * 0.65, h * 0.32, 6, h * 0.24); g.fillRect(w * 0.05, h * 0.505, w * 0.8, 4);
    } else if (kind === 'vapur') { // gün batımı, siluet ve vapur
      const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#6b4a3a'); sky.addColorStop(0.45, '#e0a052'); sky.addColorStop(1, '#3b2b25'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a2c28'; g.fillRect(0, h * 0.5, w, 16); g.fillRect(w * 0.6, h * 0.3, 14, h * 0.22);
      g.beginPath(); g.moveTo(w * 0.595, h * 0.31); g.lineTo(w * 0.614, h * 0.22); g.lineTo(w * 0.632, h * 0.31); g.fill();
      for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(w * (0.2 + i * 0.08), h * 0.5, 14 + i % 2 * 6, Math.PI, 0); g.fill(); }
      g.fillStyle = 'rgba(40,30,28,.85)'; g.fillRect(0, h * 0.54, w, h * 0.46);
      g.fillStyle = '#1b1a22'; g.fillRect(w * 0.38, h * 0.62, w * 0.3, 22); g.fillRect(w * 0.42, h * 0.58, w * 0.22, 14); g.fillRect(w * 0.5, h * 0.52, 10, 16);
      g.fillStyle = '#f3c070'; for (let x = w * 0.43; x < w * 0.63; x += 12) g.fillRect(x, h * 0.6, 5, 4);
    } else if (kind === 'balon') { // vadi ve sıcak hava balonları
      const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#9cc6e8'); sky.addColorStop(1, '#f3d9b0'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = '#b88b62'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.7); for (let x = 0; x <= w; x += 40) g.lineTo(x, h * (0.66 + Math.random() * 0.1)); g.lineTo(w, h); g.fill();
      const cols = ['#d9473b', '#f2b134', '#3f7fbf', '#5ba05b', '#c95b9a'];
      for (let i = 0; i < 11; i++) {
        const x = 30 + Math.random() * (w - 60), y = 30 + Math.random() * h * 0.5, r = 8 + Math.random() * 14;
        g.fillStyle = cols[i % cols.length]; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#5a3a20'; g.fillRect(x - 2, y + r + 2, 4, 4);
      }
    } else { // orman ve göl
      g.fillStyle = '#c9d6dc'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#4f6b52'; g.beginPath(); g.moveTo(0, h * 0.6); g.quadraticCurveTo(w * 0.3, h * 0.2, w * 0.6, h * 0.5); g.quadraticCurveTo(w * 0.8, h * 0.3, w, h * 0.55); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      g.fillStyle = '#3d7d93'; g.beginPath(); g.ellipse(w * 0.55, h * 0.8, w * 0.35, h * 0.12, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2f4a31'; for (let x = 0; x < w; x += 9) { g.beginPath(); g.moveTo(x, h * 0.72); g.lineTo(x + 5, h * 0.6 - Math.random() * 20); g.lineTo(x + 10, h * 0.72); g.fill(); }
    }
    noise(g, w, h, 10);
  });
}
// Kıraathanenin adı ve ince belli çay bardağı logosu (camekân yazısı).
export function signTexture(mirror = false) {
  return canvasTex(1024, 640, (g, w, h) => {
    if (mirror) { g.translate(w, 0); g.scale(-1, 1); }
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#c4161c'; g.textAlign = 'center';
    g.font = '900 120px "Arial Black", Arial, sans-serif';
    const word = 'ALEMDAR', R = 330, cx = w / 2, cy = 380;
    [...word].forEach((ch, i) => {
      const a = -Math.PI / 2 + (i - (word.length - 1) / 2) * 0.2;
      g.save(); g.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
    });
    // bardak
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(cx, cy + 70, 120, 34, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c4161c'; g.lineWidth = 10; g.stroke();
    g.fillStyle = '#b5401c'; g.beginPath(); g.moveTo(cx - 52, cy - 120); g.quadraticCurveTo(cx - 22, cy - 40, cx - 46, cy + 50); g.lineTo(cx + 46, cy + 50); g.quadraticCurveTo(cx + 22, cy - 40, cx + 52, cy - 120); g.fill();
    g.font = '900 86px "Arial Black", Arial, sans-serif'; g.fillStyle = '#c4161c'; g.fillText('KIRAATHANESİ', cx, cy + 200);
  });
}
function clockTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const g = c.getContext('2d'), now = new Date();
    g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#4a2c1a'; g.lineWidth = 18; g.strokeRect(9, 9, 238, 238);
    g.fillStyle = '#222'; g.font = '600 22px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2 - Math.PI / 2; g.fillText(String(i), 128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92); }
    const hand = (a, len, wd) => { g.lineWidth = wd; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * len, 128 + Math.sin(a) * len); g.stroke(); };
    g.strokeStyle = '#111'; g.lineCap = 'round';
    hand(((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2 - Math.PI / 2, 52, 7);
    hand(now.getMinutes() / 60 * Math.PI * 2 - Math.PI / 2, 78, 5);
    t.needsUpdate = true;
  };
  draw(); setInterval(draw, 30000); // gerçek saat
  return t;
}
function fridgeTexture() {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#dfe6ea'; g.fillRect(0, 0, w, h);
    const cols = ['#c8202a', '#e8a420', '#2f9a4a', '#2a6cc4', '#f4f4f4', '#8a2a8a'];
    for (let r = 0; r < 6; r++) {
      g.fillStyle = '#9aa4aa'; g.fillRect(0, 60 + r * 74, w, 4);
      for (let x = 10; x < w - 10; x += 22) { g.fillStyle = cols[(r + Math.floor(x / 44)) % cols.length]; g.fillRect(x, 18 + r * 74, 16, 42); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 2, 22 + r * 74, 3, 30); }
    }
  });
}

// ---------- masa ----------
const clothMat = std(0xffffff, 0.95, { map: clothTexture() });
const legMat = std(0x1a1a1a, 0.4, { metalness: 0.6 });
export function buildTable(parent, x, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
  const S = TABLE.size, T = TABLE.top, drop = 0.24;
  const top = new THREE.Mesh(new THREE.BoxGeometry(S + 0.04, 0.02, S + 0.04), clothMat); top.position.y = T - 0.01; top.receiveShadow = top.castShadow = true; g.add(top);
  // sarkan örtü: dört yan, alta doğru hafif açılır
  for (let i = 0; i < 4; i++) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(S + 0.06, drop, 1, 1), clothMat);
    side.material.side = THREE.DoubleSide;
    const a = i * Math.PI / 2; side.rotation.y = a; side.rotation.x = -0.08;
    side.position.set(Math.sin(a) * (S / 2 + 0.025), T - drop / 2, Math.cos(a) * (S / 2 + 0.025));
    side.castShadow = true; g.add(side);
  }
  for (const [lx, lz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, T - 0.02, 8), legMat); leg.position.set(lx * (S / 2 - 0.06), (T - 0.02) / 2, lz * (S / 2 - 0.06)); g.add(leg);
  }
  return g;
}

// ---------- sandalye (InstancedMesh: bütün salon için tek çizim) ----------
// Sandalye yerel ekseninde oturan kişi -z'ye (masaya) bakar.
export function chairSet(parent, placements) {
  const n = placements.length;
  const seatMat = std(0x111113, 0.55), frameMat = std(0x16161a, 0.35, { metalness: 0.7 });
  const parts = [
    [new THREE.BoxGeometry(0.44, 0.07, 0.43), seatMat, 0, 0.47, 0],
    [new THREE.BoxGeometry(0.42, 0.4, 0.06), seatMat, 0, 0.82, 0.21],
    [new THREE.BoxGeometry(0.03, 0.47, 0.03), frameMat, 0.2, 0.235, -0.19], [new THREE.BoxGeometry(0.03, 0.47, 0.03), frameMat, -0.2, 0.235, -0.19],
    [new THREE.BoxGeometry(0.03, 0.98, 0.03), frameMat, 0.2, 0.49, 0.22], [new THREE.BoxGeometry(0.03, 0.98, 0.03), frameMat, -0.2, 0.49, 0.22],
    [new THREE.BoxGeometry(0.43, 0.03, 0.03), frameMat, 0, 1.0, 0.23],
  ];
  const tmp = new THREE.Object3D(), local = new THREE.Matrix4(), out = [];
  for (const [geo, mat, px, py, pz] of parts) {
    const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.castShadow = true; mesh.receiveShadow = true;
    local.makeTranslation(px, py, pz);
    placements.forEach((p, i) => {
      tmp.position.set(p.x, 0, p.z); tmp.rotation.set(0, p.ry, 0); tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix.clone().multiply(local));
    });
    parent.add(mesh); out.push(mesh);
  }
  return out;
}

// ---------- çay ----------
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.35 });
const teaMat = std(0x8a1e06, 0.15, { emissive: 0x200500 });
const saucerMat = std(0xffffff, 0.3, { map: canvasTex(128, 128, (g) => {
  g.fillStyle = '#fafafa'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#c4161c'; for (let i = 0; i < 12; i++) { g.save(); g.translate(64, 64); g.rotate(i / 12 * Math.PI * 2); g.fillRect(44, -5, 16, 10); g.restore(); }
}) });
const glassPts = [[0.016, 0], [0.019, 0.008], [0.012, 0.038], [0.019, 0.08], [0.02, 0.084]].map(([a, b]) => new THREE.Vector2(a, b));
const glassGeo = new THREE.LatheGeometry(glassPts, 18);
const teaGeo = new THREE.LatheGeometry(glassPts.slice(0, 4).map(v => new THREE.Vector2(v.x * 0.88, v.y * 0.86)), 14);
const saucerGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.008, 20);
export function teaGlass(parent, x, y, z) {
  const s = new THREE.Mesh(saucerGeo, saucerMat); s.position.set(x, y + 0.004, z); s.receiveShadow = true; parent.add(s);
  const tea = new THREE.Mesh(teaGeo, teaMat); tea.position.set(x, y + 0.009, z); parent.add(tea);
  const gl = new THREE.Mesh(glassGeo, glassMat); gl.position.copy(tea.position); parent.add(gl);
  const spoon = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.11, 4), std(0xcccccc, 0.2, { metalness: 0.9 }));
  spoon.position.set(x + 0.01, y + 0.07, z); spoon.rotation.z = -0.35; parent.add(spoon);
}
export function teapot(parent, x, y, z) { // çift katlı çaydanlık
  const steel = std(0xc9ccd0, 0.25, { metalness: 0.9 });
  const low = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.2, 20), steel); low.position.set(x, y + 0.1, z); low.castShadow = true; parent.add(low);
  const up = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.13, 18), steel); up.position.set(x, y + 0.265, z); parent.add(up);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 14, Math.PI), std(0x111111, 0.5)); handle.position.set(x, y + 0.34, z); parent.add(handle);
}

// ---------- duvar eşyaları ----------
export function painting(parent, kind, w, h, x, y, z, ry) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.03), std(0x3b2414, 0.6)); g.add(frame);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std(0xffffff, 0.85, { map: paintingTexture(kind) })); pic.position.z = 0.016; g.add(pic);
}
export function wallClock(parent, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.04), [std(0x4a2c1a), std(0x4a2c1a), std(0x4a2c1a), std(0x4a2c1a), std(0xffffff, 0.5, { map: clockTexture() }), std(0x4a2c1a)]);
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m);
}
export function fridge(parent, x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.95, 0.65), std(0xb31b22, 0.45)); body.position.y = 0.975; body.castShadow = true; g.add(body);
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.45), new THREE.MeshBasicMaterial({ map: fridgeTexture() })); inside.position.set(0, 0.92, 0.327); g.add(inside);
  const head = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#b31b22'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'italic 900 30px Arial'; c.textAlign = 'center'; c.fillText('SOĞUK İÇECEK', w / 2, 43); });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.16), new THREE.MeshBasicMaterial({ map: head })); top.position.set(0, 1.8, 0.327); g.add(top);
  const glow = new THREE.PointLight(0xdfefff, 0.6, 1.6, 2); glow.position.set(0, 1.0, 0.6); g.add(glow);
}
export function coatRack(parent, x, z) {
  const m = std(0x141414, 0.4, { metalness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.8, 8), m); pole.position.set(x, 0.9, z); pole.castShadow = true; parent.add(pole);
  for (let i = 0; i < 4; i++) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 6), m); const r = i * Math.PI / 2; a.position.set(x + Math.cos(r) * 0.07, 1.7, z + Math.sin(r) * 0.07); a.rotation.set(Math.sin(r) * 0.8, 0, -Math.cos(r) * 0.8); parent.add(a); }
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 6), m); const r = i / 3 * Math.PI * 2; f.position.set(x + Math.cos(r) * 0.16, 0.04, z + Math.sin(r) * 0.16); f.rotation.set(Math.sin(r) * 1.3, 0, -Math.cos(r) * 1.3); parent.add(f); }
}
export function radiator(parent, x, y, z, ry, len = 1.4) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  const m = std(0xf2f2f0, 0.5);
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, 0.55, 0.08), m); body.castShadow = true; g.add(body);
  for (let i = 0; i < len / 0.05; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.52, 0.01), std(0xdcdcd8, 0.6)); f.position.set(-len / 2 + 0.03 + i * 0.05, 0, 0.045); g.add(f); }
}
export function sideTable(parent, x, z) {
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.36), std(0xd8cfbf, 0.6)); top.position.set(x, 0.62, z); top.castShadow = true; parent.add(top);
  for (const [lx, lz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.62, 0.02), legMat); l.position.set(x + lx * 0.18, 0.31, z + lz * 0.15); parent.add(l); }
}
export function fluorescent(parent, x, y, z, ry) {
  const tube = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.03, 0.06), new THREE.MeshBasicMaterial({ color: 0xf7fbff, toneMapped: false }));
  tube.position.set(x, y, z); tube.rotation.y = ry; parent.add(tube);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.1), std(0xdddddd, 0.5)); base.position.set(x, y + 0.03, z); base.rotation.y = ry; parent.add(base);
}
export function backgammon(parent, x, y, z, ry) {
  const tex = canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = '#3b2617'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a3b22'; g.fillRect(16, 16, w / 2 - 24, h - 32); g.fillRect(w / 2 + 8, 16, w / 2 - 24, h - 32);
    for (let i = 0; i < 12; i++) {
      const half = i < 6 ? 0 : 1, k = i % 6, x0 = 16 + half * (w / 2 - 8) + k * ((w / 2 - 24) / 6), cw = (w / 2 - 24) / 6;
      for (const top of [true, false]) { g.fillStyle = (k + (top ? 0 : 1)) % 2 ? '#d8c9a8' : '#1f140c'; g.beginPath(); const y0 = top ? 16 : h - 16; g.moveTo(x0, y0); g.lineTo(x0 + cw, y0); g.lineTo(x0 + cw / 2, top ? y0 + 140 : y0 - 140); g.fill(); }
    }
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, 0.38), [std(0x2b1a0e), std(0x2b1a0e), std(0xffffff, 0.6, { map: tex }), std(0x2b1a0e), std(0x2b1a0e), std(0x2b1a0e)]);
  m.position.set(x, y + 0.0125, z); m.rotation.y = ry; m.castShadow = true; parent.add(m);
}
export function cardFan(parent, x, y, z, ry) {
  const back = std(0xffffff, 0.6, { map: canvasTex(64, 96, g => { g.fillStyle = '#f6f2ea'; g.fillRect(0, 0, 64, 96); g.fillStyle = '#c84f3c'; g.fillRect(5, 5, 54, 86); g.strokeStyle = '#f6f2ea'; for (let i = -96; i < 96; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 96, 96); g.stroke(); } }) });
  for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.088), back); c.rotation.set(-Math.PI / 2, 0, ry + (i - 2.5) * 0.12); c.position.set(x + i * 0.012, y + 0.001 + i * 0.0005, z); parent.add(c); }
}
