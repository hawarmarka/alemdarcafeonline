'use strict';
// Masaların kalıcılığı: güncelleme/yeniden başlatmada süren oyunlar kaybolmasın.
// Her masa DATA_DIR/rooms/<KOD>.json dosyasında. Değişen masalar 2 sn'de bir, kapanışta (SIGTERM) hepsi yazılır.
// Yükleme açılışta değil, oyuncu yeniden bağlanınca (veya kodla katılınca) yapılır: Coolify yeni sürümü eskisi
// kapanmadan başlatır; eski sürüm kapanırken en son hali yazar, oyuncular ancak ondan sonra yeni sürüme bağlanır.
const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DIR = path.join(DATA_DIR, 'rooms');
const MAX_AGE_MS = 30 * 60000; // 30 dakikadan eski masa dosyası geri yüklenmez ve silinir
const dirty = new Set();
let rooms = null, restore = null;

// Zamanlayıcılar kaydedilmez (geri yüklemede yeniden kurulur); Set'ler diziye çevrilir.
const replacer = (k, v) => (k.endsWith('Timer') || k === 'watchers' ? undefined : v instanceof Set ? { __set: [...v] } : v); // izleyiciler kalıcı değil
const reviver = (k, v) => (v && typeof v === 'object' && Array.isArray(v.__set) ? new Set(v.__set) : v);
const fileOf = code => path.join(DIR, `${code}.json`);
const validCode = code => /^[A-Z0-9]{6}$/.test(String(code));

function serialize(room) { return JSON.stringify({ savedAt: Date.now(), room }, replacer); }
function writeSync(code) {
  const room = rooms.get(code);
  if (!room) return;
  const tmp = fileOf(code) + '.tmp';
  fs.writeFileSync(tmp, serialize(room));
  fs.renameSync(tmp, fileOf(code));
}
async function writeAsync(code) {
  const room = rooms.get(code);
  if (!room) return;
  const tmp = fileOf(code) + '.tmp';
  await fs.promises.writeFile(tmp, serialize(room));
  await fs.promises.rename(tmp, fileOf(code));
}
// onRestore(room): oda nesnesi bellek haritasına girdikten sonra index.js zamanlayıcıları ve botları yeniden kurar.
function init(roomMap, onRestore) {
  rooms = roomMap; restore = onRestore;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    for (const f of fs.readdirSync(DIR)) {
      const full = path.join(DIR, f);
      if (Date.now() - fs.statSync(full).mtimeMs > MAX_AGE_MS) fs.rmSync(full, { force: true });
    }
  } catch (err) { console.error('Masa kayıt klasörü hazırlanamadı:', err.message); }
  setInterval(() => {
    for (const code of [...dirty]) { dirty.delete(code); writeAsync(code).catch(err => console.error(`Masa ${code} kaydedilemedi:`, err.message)); }
  }, 2000).unref();
}
function markDirty(room) { if (rooms && room?.code) dirty.add(room.code); }
function remove(code) {
  dirty.delete(code);
  try { fs.rmSync(fileOf(code), { force: true }); } catch {}
}
// Bellekte olmayan bir masa diskte varsa (ör. güncelleme sonrası) geri yükler ve döndürür.
function load(code) {
  if (!rooms || !validCode(code) || rooms.has(code)) return rooms?.get(code) || null;
  try {
    const file = fileOf(code);
    if (!fs.existsSync(file)) return null;
    const { savedAt, room } = JSON.parse(fs.readFileSync(file, 'utf8'), reviver);
    if (!room || Date.now() - savedAt > MAX_AGE_MS) { fs.rmSync(file, { force: true }); return null; }
    rooms.set(code, room);
    restore(room);
    console.log(`Masa ${code} diskten geri yüklendi (${Math.round((Date.now() - savedAt) / 1000)} sn önceki hali).`);
    return room;
  } catch (err) { console.error(`Masa ${code} geri yüklenemedi:`, err.message); return null; }
}
// Kapanışta bütün masaları beklemeden yazar.
function flushAll() {
  if (!rooms) return;
  for (const code of rooms.keys()) { try { writeSync(code); } catch (err) { console.error(`Masa ${code} kaydedilemedi:`, err.message); } }
  dirty.clear();
}
module.exports = { init, markDirty, remove, load, flushAll };
