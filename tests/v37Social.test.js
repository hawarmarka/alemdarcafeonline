'use strict';
// Arkadaşlık, mesajlar ve masaya davet: istek/kabul/red, karşılıklı istek, mesaj yalnızca arkadaşa,
// okunmamış sayısı, çevrimiçi takibi, davet yalnızca çevrimiçi arkadaşa ve masadayken.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'okey-social-'));
const Accounts = require('../server/accounts');
const Social = require('../server/social');
const SocialHub = require('../server/socialHub');

// Sahte Express ve Socket.IO: rotaları yakalar, gönderilen olayları kaydeder.
const routes = {};
const app = { get: (p, fn) => { routes['GET ' + p] = fn; }, post: (p, fn) => { routes['POST ' + p] = fn; } };
const sockets = new Map();
const io = { to: id => ({ emit: (e, d) => sockets.get(id)?.out.push({ event: e, data: d }) }) };
class FakeSocket {
  static n = 0;
  constructor() { this.id = 'so' + (++FakeSocket.n); this.data = {}; this.handlers = {}; this.out = []; sockets.set(this.id, this); }
  on(e, fn) { this.handlers[e] = fn; } emit(e, d) { this.out.push({ event: e, data: d }); }
  receive(e, d) { return this.handlers[e](d); }
  last(e) { return this.out.filter(x => x.event === e).at(-1)?.data; }
}
const rooms = new Map();
const authReq = req => Accounts.fromToken((req.headers.authorization || '').replace(/^Bearer /i, ''));
const hub = SocialHub.install({ app, io, rooms, authReq, fromToken: t => Accounts.fromToken(t) });
function call(method, url, token, body) {
  const [p, qs] = url.split('?');
  const req = { headers: { authorization: 'Bearer ' + token }, body, query: Object.fromEntries(new URLSearchParams(qs || '')) };
  let status = 200, json;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; } };
  routes[method + ' ' + p](req, res);
  return { status, ...json };
}
const connect = token => { const s = new FakeSocket(); hub.onSocket(s); s.receive('hello', { authToken: token }); return s; };

(async () => {
  try {
    const a = await Accounts.register('ayse', 'sifre1234'), b = await Accounts.register('bora', 'sifre1234'), c = await Accounts.register('cem', 'sifre1234');
    const sa = connect(a.token), sb = connect(b.token);
    assert(hub.isOnline(a.user.id) && hub.isOnline(b.user.id) && !hub.isOnline(c.user.id));
    // 1) Giriş yapmadan kullanılamaz; kendini ve olmayan kişiyi ekleyemez.
    assert.equal(call('GET', '/api/friends', 'yanlis').status, 401);
    assert.match(call('POST', '/api/friends/request', a.token, { username: 'ayse' }).error, /Kendini/);
    assert.match(call('POST', '/api/friends/request', a.token, { username: 'yok' }).error, /bulunamadı/);
    // 2) İstek: alıcıya anlık bildirim gider, listede bekleyen olarak görünür.
    assert.equal(call('POST', '/api/friends/request', a.token, { username: 'bora' }).result, 'sent');
    assert.deepEqual(sb.last('social'), { type: 'request', from: 'ayse' });
    assert.equal(call('GET', '/api/friends', b.token).incoming[0].username, 'ayse');
    assert.equal(call('GET', '/api/friends', a.token).outgoing[0].username, 'bora');
    // Arkadaş olmadan mesaj gönderilemez.
    assert.match(call('POST', '/api/messages', a.token, { to: 'bora', body: 'selam' }).error, /arkadaşlarına/);
    // 3) Kabul: iki tarafta da arkadaş, çevrimiçi bilgisiyle.
    assert.equal(call('POST', '/api/friends/respond', b.token, { username: 'ayse', accept: true }).result, 'accepted');
    assert.deepEqual(sa.last('social'), { type: 'accepted', from: 'bora' });
    const la = call('GET', '/api/friends', a.token);
    assert.equal(la.friends.length, 1); assert.equal(la.friends[0].username, 'bora'); assert.equal(la.friends[0].online, true);
    assert.equal(la.incoming.length + la.outgoing.length, 0);
    assert.match(call('POST', '/api/friends/request', a.token, { username: 'bora' }).error, /zaten/);
    // 4) Karşılıklı istek kendiliğinden arkadaşlık olur; red isteği siler.
    call('POST', '/api/friends/request', c.token, { username: 'ayse' });
    assert.equal(call('POST', '/api/friends/request', a.token, { username: 'cem' }).result, 'accepted');
    call('POST', '/api/friends/remove', a.token, { username: 'cem' });
    assert(!Social.areFriends(a.user.id, c.user.id) && !Social.areFriends(c.user.id, a.user.id), 'çıkarma iki yönlü olmalı');
    call('POST', '/api/friends/request', c.token, { username: 'bora' });
    assert.equal(call('POST', '/api/friends/respond', b.token, { username: 'cem', accept: false }).result, 'declined');
    assert.equal(call('GET', '/api/friends', b.token).incoming.length, 0);
    // 5) Mesaj: alıcıya anlık gider, okunmamış sayılır, sohbet açılınca okundu olur. Kontrol karakterleri ve uzunluk temizlenir.
    const m = call('POST', '/api/messages', a.token, { to: 'bora', body: 'merhaba\u0007 <b>dostum</b>' + 'x'.repeat(400) });
    assert.equal(m.message.body.length, 300); assert(!m.message.body.includes('\u0007'));
    assert.equal(sb.last('social').type, 'message'); assert.equal(sb.last('social').from, 'ayse');
    assert.match(call('POST', '/api/messages', a.token, { to: 'bora', body: 'hızlı' }).error, /yavaş/, 'saniyede bir mesaj');
    assert.equal(call('GET', '/api/friends', b.token).unread, 1);
    const thread = call('GET', '/api/messages?with=ayse', b.token).messages;
    assert.equal(thread.length, 1); assert.equal(thread[0].from, 'ayse');
    assert.equal(call('GET', '/api/friends', b.token).unread, 0);
    assert.match(call('POST', '/api/messages', b.token, { to: 'ayse', body: '   ' }).error, /Boş/);
    // 6) Davet: masada değilken olmaz; masadayken çevrimiçi arkadaşa gider; arkadaş olmayana ve çevrimdışına gitmez.
    sa.receive('inviteFriend', { username: 'bora' });
    assert.match(sa.last('gameError').message, /masaya otur/);
    rooms.set('ABC123', { code: 'ABC123', players: [{ accountId: a.user.id, socketId: sa.id }], bet: 5000, started: false, roundLimit: 2, teamMode: false, assisted: true, stackingMode: false });
    sa.data.roomCode = 'ABC123';
    sa.receive('inviteFriend', { username: 'bora' });
    assert.equal(sb.last('invite').roomCode, 'ABC123'); assert.equal(sb.last('invite').bet, 5000); assert.equal(sb.last('invite').from, 'ayse');
    assert.match(sa.last('actionSuccess').message, /davet edildi/);
    sa.data.lastInviteAt = 0;
    sa.receive('inviteFriend', { username: 'cem' });
    assert.match(sa.last('gameError').message, /arkadaşlarını/);
    // Arkadaş listesi masayı gösterir.
    assert.equal(call('GET', '/api/friends', b.token).friends[0].table.code, 'ABC123');
    // 7) Bağlantı kopunca çevrimdışı; çevrimdışı arkadaşa davet gitmez.
    sb.handlers.disconnect();
    assert(!hub.isOnline(b.user.id));
    sa.data.lastInviteAt = 0;
    sa.receive('inviteFriend', { username: 'bora' });
    assert.match(sa.last('gameError').message, /çevrimiçi değil/);
    // Çıkış yapan sekme 'hello' ile hesapsız kalır.
    sa.receive('hello', { authToken: '' });
    assert(!hub.isOnline(a.user.id));
    console.log('v37Social: arkadaş isteği/kabul/red/çıkarma, mesaj ve okunmamış, çevrimiçi takibi ve masaya davet geçti');
  } finally {
    Accounts.close();
    try { fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  }
})().catch(err => { console.error(err); process.exit(1); });
