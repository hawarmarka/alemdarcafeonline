'use strict';
// Güncelleme/yeniden başlatma: masa diske yazılır, bellekten silinir (yeni sunucu gibi), oyuncu yeniden bağlanınca
// aynı el ve aynı taşlarla geri gelir. Ayrıca HEMEN OYNA bekleyen açık masaya oturur.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const nativeLoad = Module._load;
let fakeIO;
class FakeSocket {
  static n = 0;
  constructor(io) { this.id = 'ps' + (++FakeSocket.n); this.handlers = {}; this.out = []; this.rooms = new Set(); this.data = {}; io.sockets.sockets.set(this.id, this); io.connect(this); }
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
function express() { return { disable() {}, use() {}, get() {}, post() {}, set() {} }; }
express.json = () => () => {}; express.static = () => () => {};
Module._load = function (request) {
  if (request === 'express') return express;
  if (request === 'socket.io') return { Server: FakeIO };
  if (request === 'http') return { createServer: () => ({ listen() {} }) };
  return nativeLoad.apply(this, arguments);
};
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'okey-persist-'));
const Logger = require('../server/logger'); for (const k of ['game', 'debug']) Logger[k] = () => {};
const quietLog = console.log; console.log = () => {};
const { rooms, _testing } = require('../server/index');
const RoomStore = require('../server/roomStore');
Module._load = nativeLoad;
const token = s => s.repeat(30).slice(0, 30);

// 1) HEMEN OYNA: oyuncunun aynı kurallarla açtığı açık masaya oturur; farklı kurallı masaya oturmaz.
const host = new FakeSocket(fakeIO);
host.receive('joinGame', { mode: 'create', isPublic: true, modeKey: 'klasik', playerName: 'Kurucu', token: token('k'), stackingMode: false, assisted: true, roundLimit: 2 });
const openRoom = rooms.get(host.last('joinedGame').code);
const quick = new FakeSocket(fakeIO);
quick.receive('joinGame', { mode: 'random', modeKey: 'klasik', playerName: 'Hizli', token: token('q') });
assert.equal(quick.last('joinedGame').code, openRoom.code, 'HEMEN OYNA bekleyen aynı kurallı açık masaya oturmalı');
const quick2 = new FakeSocket(fakeIO);
quick2.receive('joinGame', { mode: 'random', modeKey: 'yardimsiz', playerName: 'Hizli2', token: token('w') });
assert.notEqual(quick2.last('joinedGame').code, openRoom.code, 'farklı türdeki masaya oturmamalı');

// 2) Süren el: diske yaz, bellekten sil (sunucu yeniden başladı), yeniden bağlan → aynı el geri gelir.
const p = new FakeSocket(fakeIO);
p.receive('joinGame', { mode: 'create', playerName: 'Oyuncu', token: token('p'), roundLimit: 2 });
const code = p.last('joinedGame').code;
p.receive('startWithBots');
const room = rooms.get(code);
assert(room.started);
const tilesBefore = room.game.playerTiles[0].map(t => t.id).sort();
const roundBefore = room.roundId, turnBefore = room.game.currentPlayer;
RoomStore.flushAll();
assert(fs.existsSync(path.join(process.env.DATA_DIR, 'rooms', `${code}.json`)), 'masa dosyası yazılmalı');
_testing.stopTurn(room); clearTimeout(room.nextRoundTimer); clearTimeout(room.botFillTimer);
rooms.delete(code); // yeni sunucu: bellekte masa yok
const back = new FakeSocket(fakeIO);
back.receive('rejoinRoom', { roomCode: code, token: token('p') });
assert.equal(back.last('gameError'), undefined, 'yeniden bağlanma hatasız olmalı');
const restored = rooms.get(code);
assert(restored && restored !== room, 'masa diskten geri yüklenmeli');
assert.equal(typeof restored.game.isOkey, 'function', 'oyun nesnesi yeniden kurulmalı');
const st = back.last('gameState');
assert(st, 'oyuncuya oyun durumu gitmeli');
assert.equal(st.roundId, roundBefore);
assert.equal(st.currentPlayer, turnBefore);
assert.deepEqual(st.tiles.map(t => t.id).sort(), tilesBefore, 'aynı taşlar geri gelmeli');
assert(restored.turnTimer, 'sıra zamanlayıcısı yeniden kurulmalı');
assert.equal(restored.players[0].socketId, back.id);
// Geri yüklenen masada oyun devam eder: sıradaki bot oynar.
_testing.beginTurn(restored);
const botSeat = restored.game.currentPlayer;
if (restored.players[botSeat].isBot) { const t = restored.botTurnTimer; const cb = t._onTimeout; clearTimeout(t); cb(); assert.notEqual(restored.game.currentPlayer, botSeat, 'bot hamlesi yapılmalı'); }

// 3) Çok eski masa dosyası (30 dk+) geri yüklenmez.
const stale = 'ZZZZZ9';
fs.writeFileSync(path.join(process.env.DATA_DIR, 'rooms', `${stale}.json`), JSON.stringify({ savedAt: Date.now() - 31 * 60000, room: { code: stale, players: [] } }));
assert.equal(RoomStore.load(stale), null, 'eski masa geri yüklenmemeli');

// 4) Oyun sürerken son gerçek oyuncu ayrılınca masa kapanır ve kayıt dosyası silinir (botlar kendi kendine oynamaz).
back.receive('leaveGame');
assert(!rooms.has(code), 'yalnız bot kalan masa kapanmalı');
assert(!fs.existsSync(path.join(process.env.DATA_DIR, 'rooms', `${code}.json`)), 'masa dosyası silinmeli');

console.log = quietLog;
console.log('v35Persistence: HEMEN OYNA açık masaya oturur, güncelleme sonrası masa aynı elle geri yüklenir, eski kayıt yüklenmez');
require('../server/accounts').close(); // Windows'ta açık veritabanı dosyası silinemez
try { fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); } catch {}
process.exit(0);
