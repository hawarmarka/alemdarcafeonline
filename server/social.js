'use strict';
// Arkadaşlık ve mesajlar (yalnızca hesabı olanlar). Hesaplarla aynı SQLite veritabanında.
// friends: (user_id → friend_id) satırı. 'pending' = user_id istek gönderdi; kabul edilince iki yönde 'accepted'.
// messages: yalnızca arkadaşlar arasında; 300 karakter; okunmamışlar alıcıya rozet olarak gösterilir.
const Accounts = require('./accounts');
const db = Accounts.db;
db.exec(`
  CREATE TABLE IF NOT EXISTS friends (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
    created INTEGER NOT NULL,
    PRIMARY KEY (user_id, friend_id)
  );
  CREATE INDEX IF NOT EXISTS friends_by_friend ON friends(friend_id, status);
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created INTEGER NOT NULL,
    read INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS messages_thread ON messages(from_id, to_id, created);
  CREATE INDEX IF NOT EXISTS messages_unread ON messages(to_id, read);
`);
const MAX_FRIENDS = 200, MAX_BODY = 300;
const q = {
  row: db.prepare('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?'),
  insert: db.prepare('INSERT OR REPLACE INTO friends (user_id, friend_id, status, created) VALUES (?, ?, ?, ?)'),
  del: db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?'),
  count: db.prepare("SELECT COUNT(*) AS n FROM friends WHERE user_id = ? AND status = 'accepted'"),
  accepted: db.prepare("SELECT u.* FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 'accepted' ORDER BY u.username"),
  incoming: db.prepare("SELECT u.* FROM friends f JOIN users u ON u.id = f.user_id WHERE f.friend_id = ? AND f.status = 'pending' ORDER BY f.created DESC"),
  outgoing: db.prepare("SELECT u.* FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 'pending' ORDER BY f.created DESC"),
  sendMsg: db.prepare('INSERT INTO messages (from_id, to_id, body, created) VALUES (?, ?, ?, ?)'),
  thread: db.prepare('SELECT * FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id DESC LIMIT ?'),
  markRead: db.prepare('UPDATE messages SET read = 1 WHERE to_id = ? AND from_id = ? AND read = 0'),
  unreadBy: db.prepare('SELECT from_id, COUNT(*) AS n FROM messages WHERE to_id = ? AND read = 0 GROUP BY from_id'),
};
const card = u => { const c = Accounts.cleanUser(u); return { id: c.id, username: c.username, avatar: c.avatar, frame: c.frame, level: c.level }; };
const status = (a, b) => q.row.get(a, b)?.status || null;
const areFriends = (a, b) => status(a, b) === 'accepted';
function target(me, username) {
  const t = Accounts.userByName(String(username || '').trim());
  if (!t) throw Error('Bu kullanıcı adıyla bir oyuncu bulunamadı.');
  if (t.id === me.id) throw Error('Kendini arkadaş ekleyemezsin.');
  return t;
}
// İstek gönder; karşı taraf zaten istek gönderdiyse doğrudan arkadaş olunur. Dönen: 'sent' | 'accepted'.
function request(me, username) {
  const t = target(me, username);
  if (areFriends(me.id, t.id)) throw Error(`${t.username} zaten arkadaşın.`);
  if (q.count.get(me.id).n >= MAX_FRIENDS) throw Error(`En fazla ${MAX_FRIENDS} arkadaş ekleyebilirsin.`);
  if (status(t.id, me.id) === 'pending') { accept(me.id, t.id); return { result: 'accepted', user: card(t) }; }
  q.insert.run(me.id, t.id, 'pending', Date.now());
  return { result: 'sent', user: card(t) };
}
function accept(meId, otherId) { const now = Date.now(); q.insert.run(meId, otherId, 'accepted', now); q.insert.run(otherId, meId, 'accepted', now); }
function respond(me, username, yes) {
  const t = target(me, username);
  if (status(t.id, me.id) !== 'pending') throw Error('Bu oyuncudan bekleyen bir istek yok.');
  if (yes) accept(me.id, t.id); else q.del.run(t.id, me.id);
  return { result: yes ? 'accepted' : 'declined', user: card(t) };
}
function remove(me, username) {
  const t = target(me, username);
  q.del.run(me.id, t.id); q.del.run(t.id, me.id);
  return { user: card(t) };
}
// Arkadaş listesi; her arkadaş için okunmamış mesaj sayısı. online/roomCode bilgisini index.js ekler.
function list(me) {
  const unread = new Map(q.unreadBy.all(me.id).map(r => [r.from_id, r.n]));
  const friends = q.accepted.all(me.id).map(u => ({ ...card(u), unread: unread.get(u.id) || 0 }));
  return { friends, incoming: q.incoming.all(me.id).map(card), outgoing: q.outgoing.all(me.id).map(card),
    unread: friends.reduce((n, f) => n + f.unread, 0) };
}
function send(me, username, body) {
  const t = target(me, username);
  if (!areFriends(me.id, t.id)) throw Error('Yalnızca arkadaşlarına mesaj gönderebilirsin.');
  const text = String(body || '').replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, MAX_BODY);
  if (!text) throw Error('Boş mesaj gönderilemez.');
  const created = Date.now();
  const id = Number(q.sendMsg.run(me.id, t.id, text, created).lastInsertRowid);
  return { to: t, message: { id, from: me.username, to: t.username, body: text, created } };
}
// Son 50 mesaj (eskiden yeniye); karşı taraftan gelenler okundu sayılır.
function thread(me, username) {
  const t = target(me, username);
  if (!areFriends(me.id, t.id)) throw Error('Yalnızca arkadaşlarınla mesajlaşabilirsin.');
  q.markRead.run(me.id, t.id);
  return q.thread.all(me.id, t.id, t.id, me.id, 50).reverse()
    .map(m => ({ id: m.id, from: m.from_id === me.id ? me.username : t.username, body: m.body, created: m.created }));
}
const friendIds = me => q.accepted.all(me.id).map(u => u.id);
module.exports = { request, respond, remove, list, send, thread, areFriends, friendIds, MAX_BODY };
