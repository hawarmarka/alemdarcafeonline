// Karakterler: basit geometriden, adından türetilen sabit görünüm (ten, saç, kıyafet, kasket/bıyık/gözlük).
// Duruşlar: 'sit' (sandalyede), 'stand', 'walk'. Karede yalnızca birkaç eklem döner; ek geometri üretilmez.
import * as THREE from '/vendor/three/three.module.js';

const SKIN = [0xf1c7a1, 0xe0ac83, 0xc98d62, 0xa8714b, 0xf5d3b5, 0xd9a27a];
const HAIR = [0x1e140e, 0x3b2516, 0x5a3a22, 0x7a7068, 0x111111, 0x8a4b22, 0xbdb7ae];
const SHIRT = [0x2f4f7f, 0x7f2f3a, 0x2f6f55, 0xd9c39a, 0x4a4a52, 0x8c5a2b, 0x5c3f7a, 0xe2e2e2, 0x274060, 0x6b6b4a];
const PANTS = [0x22252b, 0x3a3328, 0x2b3a52, 0x4a4a4a, 0x1a1a1a];
const mats = new Map();
const mat = (color, roughness = 0.7) => { const k = color + ':' + roughness; if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness })); return mats.get(k); };
const geos = new Map();
const geo = (key, make) => { if (!geos.has(key)) geos.set(key, make()); return geos.get(key); };

export function hash(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = (arr, h, shift) => arr[(h >>> shift) % arr.length];
function part(g, material, parent, x, y, z) { const m = new THREE.Mesh(g, material); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }

function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 30px "Segoe UI", Arial, sans-serif';
  const w = Math.min(248, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(15,18,22,.72)'; g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 46, 12); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(0.5, 0.125, 1); return s;
}

// Kişinin yerel ekseninde -z ileri (oturunca masaya doğru). Kök = ayakların ortası (oturunca sandalye merkezi).
export class Person {
  constructor(name, { tag = false } = {}) {
    this.name = name;
    const h = hash(name);
    this.root = new THREE.Group();
    const skin = mat(pick(SKIN, h, 0), 0.65), hairC = pick(HAIR, h, 3), shirt = mat(pick(SHIRT, h, 6), 0.85), pants = mat(pick(PANTS, h, 12), 0.8), shoe = mat(0x15110e, 0.5);
    const style = (h >>> 9) % 5; // 0 kısa, 1 kasket, 2 kel+bıyık, 3 uzun saç, 4 kısa+gözlük
    this.hips = new THREE.Group(); this.root.add(this.hips);
    this.body = new THREE.Group(); this.hips.add(this.body);
    this.torso = part(geo('torso', () => new THREE.CapsuleGeometry(0.16, 0.3, 6, 14)), shirt, this.body, 0, 0.3, 0);
    this.torso.scale.set(1.08, 1, 0.72);
    part(geo('neck', () => new THREE.CylinderGeometry(0.05, 0.055, 0.08, 12)), skin, this.body, 0, 0.6, 0);
    // baş
    this.head = new THREE.Group(); this.head.position.set(0, 0.74, -0.01); this.body.add(this.head);
    part(geo('skull', () => new THREE.SphereGeometry(0.115, 24, 18)), skin, this.head, 0, 0, 0).scale.set(0.92, 1.05, 0.95);
    part(geo('nose', () => new THREE.SphereGeometry(0.022, 10, 8)), skin, this.head, 0, -0.01, -0.11);
    for (const s of [-1, 1]) part(geo('ear', () => new THREE.SphereGeometry(0.025, 10, 8)), skin, this.head, s * 0.105, 0, 0);
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Group(); e.position.set(s * 0.038, 0.022, -0.101); this.head.add(e);
      part(geo('eyeW', () => new THREE.SphereGeometry(0.0115, 12, 8)), mat(0xf1ece4, 0.3), e, 0, 0, 0).scale.set(1.25, 0.8, 0.55);
      part(geo('eyeP', () => new THREE.SphereGeometry(0.0065, 10, 8)), mat(0x2a1a10, 0.2), e, 0, 0, -0.005);
      this.eyes.push(e);
      part(geo('brow', () => new THREE.BoxGeometry(0.036, 0.009, 0.012)), mat(hairC, 0.9), this.head, s * 0.039, 0.046, -0.104).rotation.z = s * -0.1;
    }
    this.mouth = part(geo('mouth', () => new THREE.BoxGeometry(0.036, 0.006, 0.01)), mat(0x7a3a30, 0.6), this.head, 0, -0.055, -0.103);
    const hairMat = mat(hairC, 0.85);
    if (style === 0 || style === 4) part(geo('hairCap', () => new THREE.SphereGeometry(0.122, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.1)), hairMat, this.head, 0, 0.012, 0.008).scale.set(0.95, 1, 1);
    if (style === 1) {
      part(geo('kasket', () => new THREE.CylinderGeometry(0.118, 0.124, 0.06, 20)), mat(0x3d3a36, 0.9), this.head, 0, 0.085, 0.005).scale.z = 1.05;
      part(geo('siper', () => new THREE.BoxGeometry(0.17, 0.012, 0.08)), mat(0x34312d, 0.9), this.head, 0, 0.06, -0.12).rotation.x = 0.25;
    }
    if (style === 1 || style === 2) part(geo('biyik', () => new THREE.BoxGeometry(0.075, 0.016, 0.02)), hairMat, this.head, 0, -0.038, -0.108);
    if (style === 3) part(geo('long', () => new THREE.SphereGeometry(0.13, 20, 14)), hairMat, this.head, 0, 0, 0.03).scale.set(1, 1.15, 0.95);
    if (style === 4) for (const s of [-1, 1]) part(geo('glass', () => new THREE.TorusGeometry(0.024, 0.004, 6, 18)), mat(0x111111, 0.3), this.head, s * 0.04, 0.025, -0.112).castShadow = false;
    // kollar
    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group(); shoulder.position.set(s * 0.2, 0.48, 0); this.body.add(shoulder);
      part(geo('upper', () => new THREE.CapsuleGeometry(0.045, 0.2, 4, 10)), shirt, shoulder, 0, -0.12, 0);
      const elbow = new THREE.Group(); elbow.position.set(0, -0.24, 0); shoulder.add(elbow);
      part(geo('fore', () => new THREE.CapsuleGeometry(0.04, 0.2, 4, 10)), shirt, elbow, 0, -0.12, 0);
      part(geo('hand', () => new THREE.SphereGeometry(0.045, 12, 10)), skin, elbow, 0, -0.27, 0);
      this.arms.push({ shoulder, elbow, side: s });
    }
    // bacaklar (kalçadan)
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.09, 0.02, 0); this.hips.add(hip);
      part(geo('thigh', () => new THREE.CapsuleGeometry(0.065, 0.32, 4, 10)), pants, hip, 0, -0.21, 0);
      const knee = new THREE.Group(); knee.position.set(0, -0.42, 0); hip.add(knee);
      part(geo('shin', () => new THREE.CapsuleGeometry(0.055, 0.34, 4, 10)), pants, knee, 0, -0.21, 0);
      part(geo('shoe', () => new THREE.BoxGeometry(0.1, 0.07, 0.24)), shoe, knee, 0, -0.44, -0.05);
      this.legs.push({ hip, knee, side: s });
    }
    if (tag) { this.tag = nameTag(name); this.tag.position.set(0, 1.95, 0); this.root.add(this.tag); }
    this.lookYaw = 0; this.lookPitch = -0.25; this.blinkAt = 1 + Math.random() * 3; this.phase = Math.random() * 10;
    this.active = false; this.talk = 0; this.reachT = 0; this.walkT = 0; this.pose = 'sit'; this.speed = 0;
    // kamera çerçevesi: görüntü açılınca başın üstünde görünür
    this.screen = new THREE.Mesh(geo('screen', () => new THREE.PlaneGeometry(0.4, 0.3)), new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }));
    this.screen.position.set(0, 1.78, 0.1); this.screen.visible = false;
    const bezel = new THREE.Mesh(geo('bezel', () => new THREE.BoxGeometry(0.43, 0.33, 0.015)), mat(0x141418, 0.4)); bezel.position.z = 0.009; this.screen.add(bezel);
    this.root.add(this.screen);
    this.video = null;
    this.setPose('sit');
  }

  setVideo(videoEl) {
    if (this.video === videoEl) return;
    this.video = videoEl;
    const m = this.screen.material;
    if (m.map) { m.map.dispose(); m.map = null; }
    if (videoEl) { const t = new THREE.VideoTexture(videoEl); t.colorSpace = THREE.SRGBColorSpace; m.map = t; m.color.set(0xffffff); }
    m.needsUpdate = true; this.screen.visible = !!videoEl;
  }

  setPose(pose) {
    this.pose = pose;
    const sit = pose === 'sit';
    this.hips.position.set(0, sit ? 0.52 : 0.92, sit ? 0.04 : 0);
    if (this.tag) this.tag.position.y = sit ? 1.6 : 1.98;
    this.screen.position.y = sit ? 1.78 : 2.15;
  }

  // dir: 0 alt(sen), 1 sağ, 2 üst, 3 sol — masa merkezine göre koltuk (okey sayfası).
  placeAt(x, z, ry) { this.root.position.set(x, 0, z); this.root.rotation.y = ry; }

  update(dt, t, lookAt) {
    const ph = t + this.phase, k = Math.min(1, dt * 3);
    this.torso.scale.y = 1 + Math.sin(ph * 1.6) * 0.012; // nefes
    // bakış
    let yaw = 0, pitch = this.pose === 'sit' ? -0.32 : -0.05;
    if (lookAt) {
      const local = this.root.worldToLocal(lookAt.clone());
      const eyeY = this.hips.position.y + 0.74;
      yaw = Math.atan2(-local.x, -local.z); pitch = Math.atan2(local.y - eyeY, Math.hypot(local.x, local.z));
      yaw = Math.max(-1.1, Math.min(1.1, yaw)); pitch = Math.max(-0.55, Math.min(0.3, pitch));
    }
    this.lookYaw += (yaw - this.lookYaw) * k; this.lookPitch += (pitch - this.lookPitch) * k;
    this.head.rotation.set(-this.lookPitch * 0.9 + Math.sin(ph * 0.7) * 0.02, this.lookYaw, Math.sin(ph * 0.5) * 0.03);
    const [L, R] = this.arms, [LL, RL] = this.legs;
    if (this.pose === 'sit') {
      const lean = this.active ? 0.16 : 0.04;
      this.body.rotation.x += (-lean - this.body.rotation.x) * k;
      this.reachT = this.active ? this.reachT + dt : 0;
      const reach = this.active ? Math.max(0, Math.sin(this.reachT * 1.3)) * 0.5 : 0;
      for (const a of [L, R]) { a.shoulder.rotation.set(-0.55, 0, a.side * 0.18); a.elbow.rotation.set(-0.95, 0, 0); }
      R.shoulder.rotation.x = -0.55 - reach; R.elbow.rotation.x = -0.95 + reach * 0.9;
      for (const l of [LL, RL]) { l.hip.rotation.set(Math.PI / 2 * 0.96, 0, l.side * 0.05); l.knee.rotation.set(-Math.PI / 2 * 0.98, 0, 0); }
      this.hips.position.y = 0.52;
    } else {
      // yürüyüş: hıza göre adım; durunca nötr duruş
      const moving = this.speed > 0.05;
      this.walkT += dt * (moving ? 2.2 + this.speed * 3.2 : 0);
      const sw = moving ? Math.sin(this.walkT * Math.PI) : 0, amp = Math.min(1, this.speed / 1.4);
      this.body.rotation.x += ((moving ? -0.06 : 0) - this.body.rotation.x) * k;
      LL.hip.rotation.set(sw * 0.55 * amp, 0, 0); RL.hip.rotation.set(-sw * 0.55 * amp, 0, 0);
      LL.knee.rotation.set(-Math.max(0, -sw) * 0.7 * amp, 0, 0); RL.knee.rotation.set(-Math.max(0, sw) * 0.7 * amp, 0, 0); // diz geriye bükülür
      L.shoulder.rotation.set(-sw * 0.45 * amp, 0, -0.08); R.shoulder.rotation.set(sw * 0.45 * amp, 0, 0.08);
      L.elbow.rotation.set(-0.25, 0, 0); R.elbow.rotation.set(-0.25, 0, 0);
      this.hips.position.y = 0.92 + Math.abs(Math.cos(this.walkT * Math.PI)) * 0.025 * amp;
    }
    // göz kırpma
    this.blinkAt -= dt;
    const blink = this.blinkAt < 0 && this.blinkAt > -0.12;
    if (this.blinkAt < -0.12) this.blinkAt = 2 + Math.random() * 4;
    for (const e of this.eyes) e.scale.y = blink ? 0.1 : 1;
    this.mouth.scale.y = 1 + this.talk * 3.2;
  }

  dispose() { this.setVideo(null); this.tag?.material.map.dispose(); this.tag?.material.dispose(); }
}
