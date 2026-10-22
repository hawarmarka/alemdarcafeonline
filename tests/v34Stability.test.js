'use strict';
// Kararlılık: hatalı olay sunucuyu düşürmez, bot hamlesi hata verirse masa donmaz, olay seli sınırlanır,
// misafir adı temizlenir, oyundan önce ayrılan oyuncu şampiyon görünmez, takım şampiyonu adlarla yazılır.
const assert = require('node:assert/strict');
const Module = require('node:module');
const nativeLoad = Module._load;
let fakeIO;
class FakeSocket {
  static n = 0;
  constructor(io) { this.id = 'st' + (++FakeSocket.n); this.handlers = {}; this.out = []; this.rooms = new Set(); this.data = {}; io.sockets.sockets.set(this.id, this); io.connect(this); }
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
process.env.DATA_DIR = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'okey-stab-'));
const Logger = require('../server/logger'); for (const k of ['game', 'debug']) Logger[k] = () => {};
const { rooms, _testing } = require('../server/index'); Module._load = nativeLoad;
const quietErrors = console.error; console.error = () => {}; // beklenen hata günlükleri test çıktısını kirletmesin
const token = s => s.repeat(30).slice(0, 30);
function fire(room, key) { const t = room[key]; if (!t) return false; const cb = t._onTimeout; clearTimeout(t); room[key] = null; cb(); return true; }
try {
  // 1) Misafir adı: HTML/script karakterleri atılır.
  const a = new FakeSocket(fakeIO);
  a.receive('joinGame', { mode: 'create', playerName: '<img src=x onerror=1>Ali', token: token('a'), roundLimit: 1 });
  const room = rooms.get(a.last('joinedGame').code);
  assert.equal(room.players[0].name, 'img srcx onerror1Ali');
  // 2) Oyundan önce ayrılan oyuncunun skor satırı silinir; şampiyon masadaki biri olmalı.
  const b = new FakeSocket(fakeIO);
  b.receive('joinGame', { mode: 'code', roomCode: room.code, playerName: 'Veli', token: token('b') });
  assert('Veli' in room.scores);
  b.receive('leaveGame');
  assert(!('Veli' in room.scores), 'ayrılan oyuncunun skoru silinmeli');
  a.receive('startWithBots');
  assert(room.started);
  _testing.finishRound(room, null, { type: 'exhausted' });
  assert(room.matchEnded);
  assert(room.players.some(p => p.name === room.lastRoundResult.champion), 'şampiyon masadaki bir oyuncu olmalı');
  // 3) Olay işlerken beklenmeyen hata: sunucu çökmez, oyuncuya hata döner.
  const c = new FakeSocket(fakeIO);
  c.receive('joinGame', { mode: 'create', playerName: 'Cem', token: token('c'), roundLimit: 2 });
  const room2 = rooms.get(c.last('joinedGame').code);
  c.receive('startWithBots');
  room2.game.currentPlayer = 0; room2.game.hasDrawn = false; _testing.beginTurn(room2);
  const realDraw = room2.game.drawFromPile;
  room2.game.drawFromPile = () => { throw new Error('test'); };
  assert.doesNotThrow(() => c.receive('drawTile', {}));
  assert.match(c.last('gameError').message, /gerçekleştirilemedi/);
  room2.game.drawFromPile = realDraw;
  // 4) Bot hamlesi hata verirse masa donmaz: otomatik hamleyle sıra ilerler.
  room2.game.currentPlayer = 1; room2.game.hasDrawn = false; _testing.beginTurn(room2);
  const realLeft = room2.game.getLeftDiscard;
  room2.game.getLeftDiscard = () => { throw new Error('test'); };
  fire(room2, 'botTurnTimer');
  room2.game.getLeftDiscard = realLeft;
  assert.notEqual(room2.game.currentPlayer, 1, 'sıra bir sonraki oyuncuya geçmeli');
  assert(room2.turnTimer, 'yeni sıra zamanlanmış olmalı');
  // 5) Olay seli: kısa sürede yüzlerce olay gelirse fazlası işlenmez, tek uyarı döner.
  const before = c.out.length;
  for (let i = 0; i < 300; i++) c.receive('throwTomato', { target: 9 });
  const replies = c.out.slice(before).filter(x => x.event === 'gameError');
  assert(replies.length < 60, 'olay seli sınırlanmalı');
  assert(replies.some(x => /hızlı/.test(x.data.message)), 'yavaşlama uyarısı gönderilmeli');
  // 6) Takım modunda şampiyon "team1" değil oyuncu adlarıyla yazılır.
  const d = new FakeSocket(fakeIO);
  d.receive('joinGame', { mode: 'create', playerName: 'Deniz', token: token('d'), roundLimit: 1, teamMode: true });
  const room3 = rooms.get(d.last('joinedGame').code);
  d.receive('startWithBots');
  _testing.finishRound(room3, null, { type: 'exhausted' });
  assert.match(room3.lastRoundResult.champion, / & /);
  // 7) Seri açan oyuncu, masada çift açan varsa okeysiz çiftlerini çift panosuna indirebilir; yoksa indiremez.
  const e = new FakeSocket(fakeIO);
  e.receive('joinGame', { mode: 'create', playerName: 'Ece', token: token('e'), roundLimit: 1 });
  const room4 = rooms.get(e.last('joinedGame').code);
  e.receive('startWithBots');
  const g4 = room4.game, me = 0;
  const isOk = t => g4.isOkey(t);
  const pool = g4.tiles.filter(t => !t.isFakeJoker && !isOk(t));
  const twin = pool.find(t => pool.some(u => u !== t && u.color === t.color && u.number === t.number));
  const pairTiles = [twin, pool.find(u => u !== twin && u.color === twin.color && u.number === twin.number)];
  const singles = pool.filter(t => !pairTiles.includes(t) && !(t.color === twin.color && t.number === twin.number)).slice(0, 2);
  g4.tiles = g4.tiles.filter(t => !pairTiles.includes(t) && !singles.includes(t)).concat(g4.playerTiles[me]);
  g4.playerTiles[me] = [...pairTiles, ...singles];
  Object.assign(g4.playerStates[me], { hasOpened: true, openType: 'normal', openedGroups: [] });
  g4.currentPlayer = me; g4.hasDrawn = true; _testing.beginTurn(room4);
  e.receive('openWithPairs');
  assert.match(e.last('gameError').message, /çift açan olmadığı/, 'masada çift açan yokken seri açan çift indiremez');
  g4.playerStates[1].openType = 'pairs'; g4.playerStates[1].hasOpened = true;
  e.receive('openWithPairs');
  assert.equal(g4.playerStates[me].extraPairs.length, 1, 'çift, çift panosuna inmeli');
  assert.equal(g4.playerTiles[me].length, 2, 'elde iki tek taş kalmalı');
  assert.equal(e.last('gameState').extraPairs[me].length, 1, 'istemciye extraPairs gitmeli');
  console.log('v34Stability: güvenli olaylar, bot hata kurtarma, olay sınırı, misafir adı, şampiyon ve takım adı, seri açanın çift indirmesi geçti');
} finally { console.error = quietErrors; }
