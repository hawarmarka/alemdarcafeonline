'use strict';
// Kıraathane salonu: yürüyen oyuncuların konumları. İstemci 'world:enter' ile girer, 'world:move' ile konum yollar
// (en fazla saniyede 10). Sunucu salondakilere saniyede 8 kez toplu 'world:state' yollar; konum doğrulanır, sınır dışı kırpılır.
// salon + teras + sokak + park (Unity Neighborhood: x ±26, z ..42)
const BOUNDS = { minX: -25.8, maxX: 25.8, minZ: -6.0, maxZ: 41.8 };
const MAX_PEOPLE = 80;
const TICK_MS = 125;
const POSES = new Set(['stand', 'walk', 'sit']);
const ORDER_ITEMS = new Set(['cay', 'kahve', 'oralet', 'tost', 'su', 'ayran', 'simit']); // Unity istemcisindeki menüyle aynı

function install({ io, fromToken }) {
  const people = new Map(); // socket.id → { id, name, x, z, ry, pose, speed, at }
  let timer = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  function tick() {
    if (!people.size) { clearInterval(timer); timer = null; return; }
    const list = [...people.values()].map(p => [p.id, p.name, +p.x.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2), p.pose, +p.speed.toFixed(2)]);
    io.to('world').emit('world:state', { t: Date.now(), list });
  }

  function onSocket(socket) {
    socket.on('world:enter', data => {
      if (people.has(socket.id)) return;
      if (people.size >= MAX_PEOPLE) return socket.emit('world:full', { message: 'Kıraathane şu an çok kalabalık, biraz sonra tekrar dene.' });
      const account = fromToken(data?.authToken);
      const name = account ? account.username : String(data?.name || '').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Misafir';
      // id kısa ve tahmin edilemez değil; yalnızca istemcide kişiyi eşlemek için (socket.id gönderilmez).
      const id = Math.random().toString(36).slice(2, 10);
      people.set(socket.id, { id, name, x: 0, z: 6.5, ry: Math.PI, pose: 'stand', speed: 0, at: 0 });
      socket.join('world');
      socket.emit('world:welcome', { id, name });
      if (!timer) timer = setInterval(tick, TICK_MS);
    });
    socket.on('world:move', data => {
      const p = people.get(socket.id); if (!p) return;
      const now = Date.now(); if (now - p.at < 90) return; p.at = now;
      const x = num(data?.x), z = num(data?.z), ry = num(data?.ry), speed = num(data?.speed);
      if (x === null || z === null || ry === null) return;
      p.x = clamp(x, BOUNDS.minX, BOUNDS.maxX); p.z = clamp(z, BOUNDS.minZ, BOUNDS.maxZ);
      p.ry = ry % (Math.PI * 2); p.speed = clamp(speed ?? 0, 0, 3);
      p.pose = POSES.has(data?.pose) ? data.pose : 'stand';
    });
    // Kahveciye sipariş: herkes aynı servisi görür (kahveci ocaktan yürür, masaya bırakır).
    socket.on('world:order', data => {
      const p = people.get(socket.id); if (!p) return;
      const item = String(data?.item || ''), table = Number(data?.table);
      if (!ORDER_ITEMS.has(item) || !Number.isInteger(table) || table < 0 || table > 20) return;
      const now = Date.now(); if (now - (p.orderAt || 0) < 4000) return socket.emit('world:notice', { message: 'Kahveci geliyor, biraz bekle.' });
      p.orderAt = now;
      io.to('world').emit('world:serve', { id: p.id, name: p.name, item, table, seat: Number.isInteger(data?.seat) ? data.seat : -1 });
    });
    const leave = () => { if (people.delete(socket.id)) socket.leave('world'); }; // sonraki 'world:state' listesinde yok
    socket.on('world:leave', leave);
    socket.on('disconnect', leave);
  }

  return { onSocket, count: () => people.size };
}

module.exports = { install, BOUNDS };
