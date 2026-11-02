// 3D okey taşları: tek ortak geometri, yüz dokuları (renk+sayı) bir kez çizilip önbellekte tutulur.
import * as THREE from '/vendor/three/three.module.js';

export const TILE = { w: 0.034, h: 0.048, d: 0.012 }; // metre: gerçek taş ölçüsüne yakın
const INK = { Kirmizi: '#c3212b', Yesil: '#d4861a', Mavi: '#1d5bbd', Siyah: '#1b1b1f', Sahte: '#1f7a3e' };

const geometry = new THREE.BoxGeometry(TILE.w, TILE.h, TILE.d);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf4ecd8, roughness: 0.42, metalness: 0 });
const backMat = new THREE.MeshStandardMaterial({ color: 0xeee5cf, roughness: 0.5 });
const faceCache = new Map();

function faceTexture(tile) {
  const key = tile ? `${tile.color}-${tile.number}` : 'back';
  if (faceCache.has(key)) return faceCache.get(key);
  const c = document.createElement('canvas'); c.width = 96; c.height = 136;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 136);
  grad.addColorStop(0, '#fffaf0'); grad.addColorStop(1, '#efe5cc');
  g.fillStyle = grad; g.fillRect(0, 0, 96, 136);
  if (tile) {
    g.fillStyle = INK[tile.color] || '#222';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (tile.isFakeJoker) { g.font = '700 64px "Segoe UI Symbol", serif'; g.fillText('♣', 48, 62); }
    else { g.font = '800 66px "Segoe UI", Arial, sans-serif'; g.fillText(String(tile.number), 48, 58); }
    g.beginPath(); g.arc(48, 112, 6, 0, Math.PI * 2); g.fill(); // alt nokta
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38 });
  faceCache.set(key, mat);
  return mat;
}

// tile = null → arkası dönük taş (rakip ıstakası, deste, okey).
export function makeTile(tile) {
  const front = faceTexture(tile);
  // BoxGeometry yüz sırası: +x, -x, +y, -y, +z (ön), -z (arka)
  const mesh = new THREE.Mesh(geometry, [bodyMat, bodyMat, bodyMat, bodyMat, front, backMat]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.key = tile ? tile.id : 'back';
  return mesh;
}

export function setTileFace(mesh, tile) {
  mesh.material[4] = faceTexture(tile);
  mesh.userData.key = tile ? tile.id : 'back';
}

// Masaya yüzü yukarı yatırılmış taş.
export function layFlat(mesh) { mesh.rotation.set(-Math.PI / 2, 0, 0); return mesh; }
