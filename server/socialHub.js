'use strict';
// Arkadaşlar, mesajlar ve masaya davet: HTTP uçları, çevrimiçi takibi ve anlık bildirimler.
// Lobi ve masa sayfası bağlanınca 'hello' ile hesap anahtarını gönderir; sunucu hangi hesabın hangi socket'lerde açık olduğunu bilir.
const Social = require('./social');

function install({ app, io, rooms, authReq, fromToken }) {
  const online = new Map(); // hesap id → socket id kümesi
  const notify = (uid, event, payload) => { for (const sid of online.get(uid) || []) io.to(sid).emit(event, payload); };
  // Arkadaş masada mı? (yalnızca bağlı olduğu, bitmemiş masa)
  const tableOf = uid => {
    for (const room of rooms.values()) {
      if (room.matchEnded) continue;
      if (room.players.some(p => p.accountId === uid && p.socketId)) return { code: room.code, started: !!room.started, seats: room.players.length };
    }
    return null;
  };
  const withPresence = data => ({ ...data, friends: data.friends.map(f => ({ ...f, online: online.has(f.id), table: tableOf(f.id) })) });
  const wrap = fn => (req, res) => {
    const me = authReq(req);
    if (!me) return res.status(401).json({ error: 'Arkadaşlar ve mesajlar için giriş yapın.' });
    try { res.json(fn(me, req)); } catch (e) { res.status(400).json({ error: e.message }); }
  };
  const lastMsg = new Map(); // hesap id → son mesaj zamanı (saniyede en fazla bir mesaj)

  app.get('/api/friends', wrap(me => withPresence(Social.list(me))));
  app.post('/api/friends/request', wrap((me, req) => {
    const r = Social.request(me, req.body?.username);
    notify(r.user.id, 'social', { type: r.result === 'accepted' ? 'accepted' : 'request', from: me.username });
    return r;
  }));
  app.post('/api/friends/respond', wrap((me, req) => {
    const r = Social.respond(me, req.body?.username, req.body?.accept === true);
    if (r.result === 'accepted') notify(r.user.id, 'social', { type: 'accepted', from: me.username });
    return r;
  }));
  app.post('/api/friends/remove', wrap((me, req) => Social.remove(me, req.body?.username)));
  app.get('/api/messages', wrap((me, req) => ({ messages: Social.thread(me, req.query.with) })));
  app.post('/api/messages', wrap((me, req) => {
    const now = Date.now();
    if (now - (lastMsg.get(me.id) || 0) < 1000) throw Error('Biraz daha yavaş yaz.');
    const r = Social.send(me, req.body?.to, req.body?.body);
    lastMsg.set(me.id, now); // yalnızca gönderilen mesaj sayılır
    notify(r.to.id, 'social', { type: 'message', from: me.username, message: r.message });
    return { message: r.message };
  }));

  // index.js her bağlantıda çağırır (socket.on orada hata korumalı sarılıdır).
  function onSocket(socket) {
    // Giriş/çıkış yapılınca tekrar gönderilir; önceki hesabın kaydı silinir.
    const forget = () => {
      const uid = socket.data.uid; if (!uid) return;
      const set = online.get(uid); set?.delete(socket.id);
      if (set && !set.size) online.delete(uid);
      socket.data.uid = null; socket.data.username = null;
    };
    socket.on('hello', data => {
      forget();
      const me = fromToken(data?.authToken);
      if (!me) return;
      socket.data.uid = me.id; socket.data.username = me.username;
      if (!online.has(me.id)) online.set(me.id, new Set());
      online.get(me.id).add(socket.id);
    });
    // Masadaki oyuncu çevrimiçi bir arkadaşını bu masaya çağırır.
    socket.on('inviteFriend', data => {
      const uid = socket.data.uid, room = rooms.get(socket.data.roomCode);
      if (!uid) return socket.emit('gameError', { message: 'Davet için hesabınla giriş yapmalısın.' });
      if (!room || room.matchEnded) return socket.emit('gameError', { message: 'Önce bir masaya otur.' });
      const now = Date.now();
      if (now - (socket.data.lastInviteAt || 0) < 3000) return socket.emit('gameError', { message: 'Davetleri biraz daha yavaş gönder.' });
      socket.data.lastInviteAt = now;
      const friend = Social.list({ id: uid, username: socket.data.username }).friends.find(f => f.username === String(data?.username || ''));
      if (!friend) return socket.emit('gameError', { message: 'Yalnızca arkadaşlarını davet edebilirsin.' });
      if (!online.has(friend.id)) return socket.emit('gameError', { message: `${friend.username} şu an çevrimiçi değil.` });
      notify(friend.id, 'invite', { from: socket.data.username, roomCode: room.code, bet: room.bet, seats: room.players.length, started: !!room.started,
        teamMode: room.teamMode, assisted: room.assisted, stackingMode: room.stackingMode, roundLimit: room.roundLimit });
      socket.emit('actionSuccess', { message: `${friend.username} masaya davet edildi.` });
    });
    socket.on('disconnect', forget);
  }
  return { onSocket, notify, isOnline: uid => online.has(uid) };
}
module.exports = { install };
