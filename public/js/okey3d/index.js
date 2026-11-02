// 3D okey masası: oda, karakterler, rakip ıstakaları, deste, gösterge, atıklar.
// Etkileşim (ıstaka, sürükle-bırak, masadaki seri/per, yerden alma) DOM katmanında kalır; bu sahne arkada çizilir.
// game.js her render()'da 'okey:render' olayı yollar. Görüntülü sohbet window.OkeyAV'den okunur.
import * as THREE from '/vendor/three/three.module.js';
import { buildHall, TABLE, TABLES, HOME, seatPose } from './hall.js?v=1';
import { Person } from './people.js?v=1';
import { makeTile, setTileFace, layFlat, TILE } from './tiles.js?v=1';

const PREF = 'okey3d';
function enabled() { try { return localStorage.getItem(PREF) !== '0'; } catch (_) { return true; } }
function webglOk() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (_) { return false; } }

const SEAT_ANGLE = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // 0 sen, 1 sağ, 2 üst, 3 sol
const toOwner = dir => new THREE.Vector3(Math.sin(SEAT_ANGLE[dir]), 0, Math.cos(SEAT_ANGLE[dir]));
const RACK = { wood: new THREE.MeshStandardMaterial({ color: 0x6a4022, roughness: 0.6 }), board: new THREE.BoxGeometry(0.6, 0.012, 0.075), back: new THREE.BoxGeometry(0.6, 0.07, 0.012) };
const ownerRight = dir => new THREE.Vector3(Math.cos(SEAT_ANGLE[dir]), 0, -Math.sin(SEAT_ANGLE[dir]));

class OkeyScene {
  constructor() {
    this.canvas = document.createElement('canvas'); this.canvas.id = 'okey3d';
    document.body.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxRatio = Math.min(window.devicePixelRatio || 1, 2); this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60);
    // kendi sandalyende göz hizası; masanın tamamı ve karşıdakinin yüzü görünür
    this.camera.position.set(0, 1.78, 1.5); this.lookTarget = new THREE.Vector3(0, 0.6, -0.3);
    this.camera.lookAt(this.lookTarget);
    buildHall(this.scene, { home: true });
    this.scene.fog = new THREE.Fog(0xdfe6ea, 14, 40);
    this.people = new Map(); // dir → Person
    this.racks = [null, null, null, null];
    this.piles = [null, null, null, null];
    this.deck = new THREE.Group(); this.scene.add(this.deck);
    this.indicator = layFlat(makeTile(null)); this.indicator.visible = false; this.scene.add(this.indicator);
    this.sig = {};
    this.clock = new THREE.Clock(); this.frames = 0; this.frameTime = 0; this.goodFor = 0;
    this.fpsBox = /[?&]fps=1/.test(location.search) ? Object.assign(document.createElement('div'), { id: 'okey3dFps' }) : null;
    if (this.fpsBox) document.body.append(this.fpsBox);
    this.resize(); addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.clock.getDelta(); });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Dar ekranda masanın tamamı görünsün diye görüş açısı genişler.
    this.camera.fov = w / h < 1.5 ? 58 : 50;
    this.camera.updateProjectionMatrix();
  }

  seatOf(state, i) { return (i - state.playerIndex + 4) % 4; }

  setState(state) {
    if (!state?.players) return;
    this.state = state;
    const seats = state.players.map((p, i) => [this.seatOf(state, i), p]);
    // karakterler (kendi koltuğun hariç: kamera senin gözün)
    for (const [dir, p] of seats) {
      if (dir === 0 && !state.spectator) continue;
      let person = this.people.get(dir);
      if (!person || person.name !== p.name) {
        if (person) { this.scene.remove(person.root); person.dispose(); }
        person = new Person(p.name); const sp = seatPose(TABLES[HOME], dir); person.placeAt(sp.x, sp.z, sp.ry);
        this.scene.add(person.root); this.people.set(dir, person);
      }
      person.active = state.currentPlayer === p.index;
    }
    for (const [dir, p] of seats) if (dir !== 0) this.renderRack(dir, p.tileCount || 0);
    this.renderDeck(state.pileCount || 0);
    const ind = state.indicator;
    if (ind && this.sig.ind !== ind.id) {
      this.sig.ind = ind.id; setTileFace(this.indicator, ind); this.indicator.visible = true;
      this.indicator.position.set(0.11, TABLE.top + TILE.d / 2, 0.0);
    }
    // atıklar: sağ (1) ve üst (2) rakibin attıkları; soldakinin attıkları senin aldığın yer, DOM'da tıklanabilir.
    for (const dir of [1, 2]) {
      const idx = state.players.findIndex((_, i) => this.seatOf(state, i) === dir);
      this.renderPile(dir, idx >= 0 ? (state.discards?.[idx] || []) : []);
    }
  }

  renderRack(dir, count) {
    if (this.sig['rack' + dir] === count) return;
    this.sig['rack' + dir] = count;
    if (this.racks[dir]) this.scene.remove(this.racks[dir]);
    const g = new THREE.Group();
    const board = new THREE.Mesh(RACK.board, RACK.wood); board.castShadow = board.receiveShadow = true; g.add(board);
    const back = new THREE.Mesh(RACK.back, RACK.wood); back.position.set(0, 0.03, 0.035); back.castShadow = true; g.add(back);
    const perRow = 15, step = TILE.w + 0.002;
    for (let i = 0; i < Math.min(count, 26); i++) {
      const row = i < perRow ? 0 : 1, col = row ? i - perRow : i, n = row ? Math.min(count, 26) - perRow : Math.min(count, perRow);
      const t = makeTile(null);
      t.position.set((col - (n - 1) / 2) * step, 0.03 + row * 0.0, 0.012 - row * 0.03);
      t.rotation.x = -0.18; g.add(t);
    }
    const u = toOwner(dir).multiplyScalar(TABLE.size / 2 - 0.07);
    g.position.set(u.x, TABLE.top + 0.006, u.z); g.rotation.y = SEAT_ANGLE[dir];
    this.scene.add(g); this.racks[dir] = g;
  }

  renderDeck(count) {
    const stacks = Math.ceil(count / 4);
    if (this.sig.deck === stacks) return;
    this.sig.deck = stacks;
    this.deck.clear();
    for (let s = 0; s < stacks; s++) {
      const h = Math.min(4, count - s * 4);
      for (let k = 0; k < h; k++) {
        const t = layFlat(makeTile(null)); t.rotation.x = Math.PI / 2; // yüzü aşağı
        t.position.set(-0.12 + (s % 4) * (TILE.w + 0.003) - 0.03, TABLE.top + TILE.d / 2 + k * TILE.d, -0.04 + Math.floor(s / 4) * (TILE.h + 0.004));
        this.deck.add(t);
      }
    }
  }

  renderPile(dir, pile) {
    const key = pile.length + ':' + (pile[pile.length - 1]?.id || '');
    if (this.sig['pile' + dir] === key) return;
    const grew = this.sig['pile' + dir] && pile.length > Number(this.sig['pile' + dir].split(':')[0]);
    this.sig['pile' + dir] = key;
    if (this.piles[dir]) this.scene.remove(this.piles[dir]);
    const g = new THREE.Group();
    const show = pile.slice(-3);
    show.forEach((tile, k) => {
      const t = layFlat(makeTile(tile));
      t.position.set(k * 0.004, TABLE.top + TILE.d / 2 + k * TILE.d, -k * 0.006);
      t.rotation.z = (k - 1) * 0.12; g.add(t);
    });
    const pos = toOwner(dir).multiplyScalar(0.3).add(ownerRight(dir).multiplyScalar(0.36));
    g.position.copy(pos); g.rotation.y = SEAT_ANGLE[dir];
    this.scene.add(g); this.piles[dir] = g;
    if (grew && show.length) { const top = g.children[g.children.length - 1]; top.userData.drop = 0.18; top.position.y += 0.18; }
  }

  frame() {
    if (document.hidden) return;
    const dt = Math.min(0.05, this.clock.getDelta()), t = this.clock.elapsedTime;
    const s = this.state, av = window.OkeyAV;
    const active = s ? [...this.people.values()].find(p => p.active) : null;
    const meTurn = s && s.currentPlayer === s.playerIndex;
    for (const p of this.people.values()) {
      let target;
      if (p.active) target = new THREE.Vector3(0, TABLE.top, 0);
      else if (active) target = active.head.getWorldPosition(new THREE.Vector3());
      else target = meTurn ? this.camera.position : new THREE.Vector3(0, TABLE.top, 0);
      p.talk += ((av?.level?.(p.name) || 0) - p.talk) * Math.min(1, dt * 12);
      p.setVideo(av?.videoFor?.(p.name) || null);
      p.update(dt, t, target);
    }
    // yeni atılan taş yukarıdan düşer
    for (const g of this.piles) {
      const top = g?.children[g.children.length - 1];
      if (top?.userData.drop > 0) { const d = Math.min(top.userData.drop, dt * 0.9); top.userData.drop -= d; top.position.y -= d; }
    }
    // hafif kamera salınımı (canlılık), çok küçük
    this.camera.position.x = Math.sin(t * 0.21) * 0.006;
    this.camera.lookAt(this.lookTarget);
    this.renderer.render(this.scene, this.camera);
    this.adapt(dt);
  }

  // Kare süresi uzarsa çözünürlük düşer, uzun süre rahatsa geri çıkar. FPS kaybı olmasın.
  adapt(dt) {
    this.frames++; this.frameTime += dt;
    if (this.frameTime < 2) return;
    const fps = this.frames / this.frameTime; this.frames = 0; this.frameTime = 0;
    if (this.fpsBox) this.fpsBox.textContent = `${fps.toFixed(0)} FPS · ${this.ratio.toFixed(2)}x`;
    if (fps < 50 && this.ratio > 0.6) { this.ratio = Math.max(0.6, this.ratio - 0.2); this.renderer.setPixelRatio(this.ratio); this.resize(); this.goodFor = 0; }
    else if (fps > 58 && this.ratio < this.maxRatio) { if ((this.goodFor += 2) >= 10) { this.ratio = Math.min(this.maxRatio, this.ratio + 0.1); this.renderer.setPixelRatio(this.ratio); this.resize(); this.goodFor = 0; } }
    if (fps < 35 && this.ratio <= 0.6 && this.renderer.shadowMap.enabled) { this.renderer.shadowMap.enabled = false; this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
  }
}

let instance = null;
function start() {
  if (instance || !enabled() || !webglOk()) return;
  instance = new OkeyScene();
  document.body.classList.add('scene3d');
  if (window.okeyLastState) instance.setState(window.okeyLastState);
}
document.addEventListener('okey:render', e => { if (instance) instance.setState(e.detail); });
window.Okey3D = {
  get on() { return !!instance; },
  toggle() {
    try { localStorage.setItem(PREF, enabled() ? '0' : '1'); } catch (_) { /* yok */ }
    location.reload();
  },
};
start();
