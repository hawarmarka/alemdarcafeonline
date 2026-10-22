'use strict';
// Yüklenen profil resimleri içerik hash'iyle bir kez saklanır; oyun mesajlarında yalnızca kısa URL gider
// (önceden her hamlede 4 oyuncunun base64 resmi tekrar gönderiliyordu).
const crypto = require('crypto');
const BUILTIN = ['default.svg', 'alibicim.png', 'egefitness.png', 'james.jpg', 'lvblc5.jpg'];
const MAX_BYTES = Number(process.env.AVATAR_CACHE_BYTES) || 64 * 1024 * 1024;
const store = new Map(); // id → { type, data, uri } (en eski kullanılan başta)
const idOf = new Map(); // data URI → id (aynı resim tekrar hash'lenmesin)
let total = 0;
// Hazır avatar adını aynen, data URI'yi /api/avatar/<id> adresine çevirir; tanınmayan değer default olur.
function ref(avatar) {
  if (typeof avatar !== 'string' || !avatar.startsWith('data:image/')) return BUILTIN.includes(avatar) ? avatar : 'default.svg';
  let id = idOf.get(avatar);
  if (id && store.has(id)) {
    const entry = store.get(id); store.delete(id); store.set(id, entry);
    return '/api/avatar/' + id;
  }
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(avatar);
  if (!m) return 'default.svg';
  id = crypto.createHash('sha256').update(avatar).digest('base64url').slice(0, 22);
  const data = Buffer.from(m[2], 'base64');
  store.set(id, { type: m[1], data, uri: avatar }); idOf.set(avatar, id); total += data.length;
  while (total > MAX_BYTES && store.size > 1) {
    const [oldId, old] = store.entries().next().value;
    store.delete(oldId); idOf.delete(old.uri); total -= old.data.length;
  }
  return '/api/avatar/' + id;
}
function get(id) { return store.get(String(id)) || null; }
module.exports = { ref, get, BUILTIN };
