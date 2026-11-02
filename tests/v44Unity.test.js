'use strict';
// Unity istemcisinin kullandığı sunucu ekleri: masanın salondaki yeri (hallTable), 'okey:arrange' (SERİ DİZ / ÇİFT DİZ),
// salon varlığı ('world:enter' / 'world:move' / 'world:state') ve kahveci siparişi ('world:order' → 'world:serve').
const assert = require('node:assert/strict');
const Module = require('node:module');
const nativeLoad = Module._load;
let fakeIO;
class FakeSocket {
  static n = 0;
  constructor(io) { this.id = 'un' + (++FakeSocket.n); this.handlers = {}; this.out = []; this.rooms = new Set(); this.data = {}; io.sockets.sockets.set(this.id, this); io.connect(this); }
  on(e, fn) { this.handlers[e] = fn; } emit(e, d) { this.out.push({ event: e, data: d }); }
  join(r) { this.rooms.add(r); } leave(r) { this.rooms.delete(r); }
  receive(e, ...args) { return this.handlers[e](...args); }
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
process.env.DATA_DIR = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'okey-unity-'));
const Logger = require('../server/logger'); for (const k of ['game', 'debug']) Logger[k] = () => {};
const { rooms } = require('../server/index'); Module._load = nativeLoad;
const token = s => s.repeat(30).slice(0, 30);
const list = () => { let j; routes['/api/rooms']({}, { json: x => { j = x; } }); return j; };

// 1) Salonda kurulan masa salondaki yerini taşır; masa listesinde de görünür, oyun başlayınca 'playing' altında.
const a = new FakeSocket(fakeIO);
a.receive('joinGame', { mode: 'create', isPublic: true, playerName: 'Ayse', token: token('a'), roundLimit: 1, hallTable: 7, assisted: true });
const room = rooms.get(a.last('joinedGame').code);
assert.equal(room.hallTable, 7);
assert.equal(list().waiting.find(r => r.code === room.code).hallTable, 7);
const bad = new FakeSocket(fakeIO);
bad.receive('joinGame', { mode: 'create', isPublic: true, playerName: 'Kotu', token: token('k'), hallTable: 'x' });
assert.equal(rooms.get(bad.last('joinedGame').code).hallTable, undefined, 'geçersiz masa yeri yok sayılır');
a.receive('startWithBots');
const playing = list().playing.find(r => r.code === room.code);
assert.equal(playing.hallTable, 7); assert.equal(playing.seats.length, 4);

// 2) SERİ DİZ / ÇİFT DİZ: önerilen dizilim elin bütün taşlarını tam bir kez içerir; gruplar sunucu kuralına göre geçerli.
const idx = room.players.findIndex(p => p.name === 'Ayse');
const hand = room.game.playerTiles[idx];
for (const mode of ['series', 'pairs']) {
  let res; a.receive('okey:arrange', { mode }, r => { res = r; });
  assert(!res.error, res.error);
  const ids = [...res.groups.flat(), ...res.rest];
  assert.equal(ids.length, hand.length); assert.equal(new Set(ids).size, hand.length);
  assert(ids.every(id => hand.some(t => t.id === id)));
  const byId = id => hand.find(t => t.id === id);
  if (mode === 'series') for (const g of res.groups) assert(room.game.isValidGroup(g.map(byId)), 'seri/per geçerli olmalı');
  else for (const g of res.groups) assert.equal(g.length, 2);
}
// SERİ AÇ ön kontrolü: geçerli grup kabul, geçersiz üçlü ve aynı taşın iki kez kullanımı ret; ceza yazılmaz.
{
  let arr; a.receive('okey:arrange', { mode: 'series' }, r => { arr = r; });
  const okGroup = arr.groups[0];
  const bogus = arr.rest.slice(0, 3);
  const scoresBefore = JSON.stringify(room.scores);
  let chk; a.receive('okey:check', { groups: [okGroup, bogus, okGroup].filter(Boolean) }, r => { chk = r; });
  if (okGroup) { assert.equal(chk.valid[0], true); assert(chk.score > 0); assert.equal(chk.valid[2], false, 'aynı taşlar ikinci kez sayılmaz'); }
  if (bogus.length === 3 && !room.game.isValidGroup(bogus.map(id => hand.find(t => t.id === id)))) assert.equal(chk.valid[okGroup ? 1 : 0], false);
  assert.equal(chk.need, 101); assert.equal(chk.opened, false);
  assert.equal(JSON.stringify(room.scores), scoresBefore, 'ön kontrol ceza yazmaz');
}
// yardımsız masada dizme yok; masada olmayan bağlantı hata alır
let out; new FakeSocket(fakeIO).receive('okey:arrange', { mode: 'series' }, r => { out = r; });
assert(out.error);

// 3) Salon: giriş, konum (sınıra kırpılır), toplu durum ve kahveci siparişi herkese gider.
(async () => {
const w1 = new FakeSocket(fakeIO), w2 = new FakeSocket(fakeIO);
w1.receive('world:enter', { name: 'Cemal<b>' }); w2.receive('world:enter', { name: 'Dilek' });
assert.equal(w1.last('world:welcome').name, 'Cemalb', 'ad temizlenir');
w1.receive('world:move', { x: 99, z: 1.5, ry: 1, pose: 'walk', speed: 1.4 });
await new Promise(r => setTimeout(r, 200));
const state = w2.last('world:state');
const row = state.list.find(r => r[1] === 'Cemalb');
assert.equal(row[2], 6.4, 'x sınıra kırpılır'); assert.equal(row[5], 'walk');
assert(!JSON.stringify(state).includes(w1.id), 'socket id istemciye gitmez');
w1.receive('world:order', { item: 'cay', table: 3, seat: 1 });
assert.deepEqual(w2.last('world:serve'), { id: row[0], name: 'Cemalb', item: 'cay', table: 3, seat: 1 });
w1.receive('world:order', { item: 'kola', table: 3 });
w1.receive('world:order', { item: 'kahve', table: 3 });
assert.match(w1.last('world:notice').message, /bekle/, 'arka arkaya sipariş sınırlı');
assert.equal(w2.out.filter(x => x.event === 'world:serve').length, 1, 'listede olmayan ve hızlı sipariş yayınlanmaz');
w1.receive('disconnect'); w2.receive('disconnect');

console.log('v44Unity: salon masa yeri, playing listesi, SERİ/ÇİFT DİZ önerisi, salon varlığı ve kahveci siparişi geçti');
process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
