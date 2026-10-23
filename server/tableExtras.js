'use strict';
// Kart oyunu masalarının ortak ekleri (Batak, Pişti…): masa sohbeti, ikram ve sesli sohbet sinyali.
// Her oyun kendi önekiyle bağlar ('batak:chat', 'pisti:chat'…). Sunucu yalnızca iletir; ses tarayıcılar arasında akar.
const TREATS = ['cay', 'kahve', 'oralet', 'ayran', 'su', 'lokum', 'simit', 'kola']; // istemcideki ikram listesiyle aynı olmalı

// prefix: olay öneki; where(socket) → { room, seat }; room.players[i] = { token, socketId, name }.
function create({ io, prefix }) {
  const ev = name => `${prefix}:${name}`;
  // Sesli sohbetteki oyuncuların güncel koltukları (bağlı olanlar).
  function voiceBroadcast(room) {
    const list = room.players.map((p, i) => (p.socketId && room.voice?.has(p.token) ? i : -1)).filter(i => i >= 0);
    for (const p of room.players) if (p.socketId) io.to(p.socketId).emit(ev('voice'), { list });
  }
  function attach(socket, where) {
    const fail = message => socket.emit(ev('error'), { message });
    // Masa sohbeti: kısa mesaj ya da hazır cümle; oyuncunun avatarının üstünde balon olarak görünür.
    socket.on(ev('chat'), data => {
      const { room, seat } = where(socket);
      if (!room || seat < 0) return;
      const now = Date.now(), key = `${prefix}ChatAt`;
      if (now - (socket.data[key] || 0) < 1200) return fail('Biraz daha yavaş yaz.');
      const text = String(data?.text || '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
      if (!text) return;
      socket.data[key] = now;
      for (const p of room.players) if (p.socketId) io.to(p.socketId).emit(ev('chat'), { seat, name: room.players[seat].name, text });
    });
    // İkram: bir oyuncuya ya da bütün masaya (to = -1). Herkese gider, ekranda uçarak gelir.
    socket.on(ev('treat'), data => {
      const { room, seat } = where(socket);
      if (!room || seat < 0) return;
      const item = String(data?.item || ''), to = Number(data?.to);
      if (!TREATS.includes(item)) return fail('Bu ikram yok.');
      if (!(to === -1 || (Number.isInteger(to) && to >= 0 && to < room.players.length && to !== seat))) return fail('Kime ikram edeceğini seç.');
      const now = Date.now(), key = `${prefix}TreatAt`;
      if (now - (socket.data[key] || 0) < 3000) return fail('Biraz bekle, çay demleniyor.');
      socket.data[key] = now;
      for (const p of room.players) if (p.socketId) io.to(p.socketId).emit(ev('treat'), { from: seat, to, item, name: room.players[seat].name });
    });
    // Sesli sohbet (WebRTC): üyelik oyuncu jetonuyla tutulur (koltuk sırası maç başında değişebilir).
    socket.on(ev('voiceJoin'), () => {
      const { room, seat } = where(socket); if (!room || seat < 0) return;
      room.voice = room.voice || new Set(); room.voice.add(room.players[seat].token); voiceBroadcast(room);
    });
    socket.on(ev('voiceLeave'), () => {
      const { room, seat } = where(socket); if (!room || seat < 0 || !room.voice) return;
      room.voice.delete(room.players[seat].token); voiceBroadcast(room);
    });
    socket.on(ev('signal'), data => {
      const { room, seat } = where(socket); if (!room || seat < 0) return;
      const to = Number(data?.to), target = room.players[to];
      if (!target?.socketId || !room.voice?.has(room.players[seat].token) || !room.voice.has(target.token)) return;
      const payload = data?.data;
      if (!payload || JSON.stringify(payload).length > 20000) return;
      io.to(target.socketId).emit(ev('signal'), { from: seat, data: payload });
    });
  }
  return { attach, voiceBroadcast };
}
module.exports = { create, TREATS };
