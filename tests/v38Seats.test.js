'use strict';
// Koltuk seçimi: masa listesinden belirli koltuğa oturma, dolu koltuk hatası, bekleme sırasında koltuk değiştirme,
// oyun başlarken oyuncuların koltuk sırasına dizilmesi (eşlide karşılıklı koltuklar takım) ve başlayanın 22 taşla yalnızca taş atması.
const assert = require('node:assert/strict');
const Module = require('node:module');
const nativeLoad = Module._load;
let fakeIO;
class FakeSocket {
  static n = 0;
  constructor(io) { this.id = 'se' + (++FakeSocket.n); this.handlers = {}; this.out = []; this.rooms = new Set(); this.data = {}; io.sockets.sockets.set(this.id, this); io.connect(this); }
  on(e, fn) { this.handlers[e] = fn; } emit(e, d) { this.out.push({ event: e, data: d }); }
  join(r) { this.rooms.add(r); } leave(r) { this.rooms.delete(r); }
  receive(e, d) { return this.handlers[e](d); }
  last(e) { return this.out.filter(x => x.event === e).at(-1)?.data; }
}
class FakeIO {
  constructor() { fakeIO = this; this.sockets = { sockets: new Map() }; }
  on(e, cb) { if (e === 'connection') this.connect = cb; }
  to(room) { return { emit: (e, d) => { for (const s of this.sockets.sockets.values()) if (s.rooms.has(room) || s.id === room) s.emit(e, d); } }; }
}
const routes = {};
function express() { return { disable() {}, use() {}, get(p, fn) { routes[p] = fn; }, post() {}, set() {} }; }
express.json = () => () => {}; express.static = () => () => {};
Module._load = function (request) {
  if (request === 'express') return express;
  if (request === 'socket.io') return { Server: FakeIO };
  if (request === 'http') return { createServer: () => ({ listen() {} }) };
  return nativeLoad.apply(this, arguments);
};
process.env.DATA_DIR = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'okey-seats-'));
const Logger = require('../server/logger'); for (const k of ['game', 'debug']) Logger[k] = () => {};
const { rooms } = require('../server/index'); Module._load = nativeLoad;
const token = s => s.repeat(30).slice(0, 30);

// 1) Herkese açık masa açılır; ikinci oyuncu masa listesinden 2 numaralı koltuğu (üst) seçer.
const a = new FakeSocket(fakeIO);
a.receive('joinGame', { mode: 'create', isPublic: true, playerName: 'Ayse', token: token('a'), roundLimit: 1, teamMode: true });
const room = rooms.get(a.last('joinedGame').code);
const b = new FakeSocket(fakeIO);
b.receive('joinGame', { mode: 'code', roomCode: room.code, playerName: 'Bora', token: token('b'), seat: 2 });
assert.equal(room.players.find(p => p.name === 'Bora').seat, 2);
// Masa listesi koltukları gösterir: 0 ve 2 dolu, 1 ve 3 boş.
let list; routes['/api/rooms']({}, { json: j => { list = j; } });
const listed = list.waiting.find(r => r.code === room.code);
assert.deepEqual(listed.seats.map(s => s?.name || null), ['Ayse', null, 'Bora', null]);
// 2) Dolu koltuğa oturulamaz.
const c = new FakeSocket(fakeIO);
c.receive('joinGame', { mode: 'code', roomCode: room.code, playerName: 'Cem', token: token('c'), seat: 2 });
assert.match(c.last('gameError').message, /koltuk/);
assert(!room.players.some(p => p.name === 'Cem'));
// 3) Bekleme sırasında boş koltuğa geçilir, dolu koltuğa geçilemez.
a.receive('changeSeat', { seat: 3 });
assert.equal(room.players.find(p => p.name === 'Ayse').seat, 3);
a.receive('changeSeat', { seat: 2 });
assert.match(a.last('gameError').message, /dolu/);
// 4) Botlarla başlayınca oyuncular koltuk sırasına dizilir: Bora 2'de, Ayse 3'te; eşlide 1-3 takım (Ayse'nin eşi 1'deki bot).
a.receive('startWithBots');
assert(room.started);
assert.equal(room.players[2].name, 'Bora');
assert.equal(room.players[3].name, 'Ayse');
assert(room.players[0].isBot && room.players[1].isBot);
assert.deepEqual(room.players.map(p => p.seat), [0, 1, 2, 3]);
a.receive('changeSeat', { seat: 0 });
assert.match(a.last('gameError').message, /başladıktan/);
// 5) Başlayan oyuncu 22 taşla başlar ve taş çekmeden atar (hasDrawn); diğerleri 21 taş.
const g = room.game;
assert.equal(g.playerTiles[g.currentPlayer].length, 22);
assert.equal(g.hasDrawn, true);
assert.equal(g.playerTiles.filter(h => h.length === 21).length, 3);
console.log('v38Seats: koltuk seçimi, dolu koltuk, koltuk değiştirme, koltuk sırasına dizilme ve başlayanın yalnızca taş atması geçti');
process.exit(0);
