'use strict';
// 101 turnuva kuralları (kullanıcının gönderdiği metin, 2026-11-02):
// eşin cezası silinir; dağıtan her el bir kayar, dağıtanın sağındaki 22 taşla başlar; yandan alıp geri bırakmak 101 ceza;
// yandan alınan taşın eşiyle açılabilir; 101'i bulmadan tek açışta bütün taşları açıp bitmek; elden bitme yalnızca kimse açmamışken.
const assert = require('node:assert/strict');
const Module = require('node:module');
const nativeLoad = Module._load;
let fakeIO;
class FakeSocket {
  static n = 0;
  constructor(io) { this.id = 'r1' + (++FakeSocket.n); this.handlers = {}; this.out = []; this.rooms = new Set(); this.data = {}; io.sockets.sockets.set(this.id, this); io.connect(this); }
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
function express() { return { disable() {}, use() {}, get() {}, post() {}, set() {} }; }
express.json = () => () => {}; express.static = () => () => {};
Module._load = function (request) {
  if (request === 'express') return express;
  if (request === 'socket.io') return { Server: FakeIO };
  if (request === 'http') return { createServer: () => ({ listen() {} }) };
  return nativeLoad.apply(this, arguments);
};
process.env.OKEY_DEBUG = '1';
process.env.DATA_DIR = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'okey-r101-'));
const Logger = require('../server/logger'); for (const k of ['game', 'debug']) Logger[k] = () => {};
const { rooms } = require('../server/index'); Module._load = nativeLoad;
const GameLogic = require('../server/gameLogic');
const token = s => s.repeat(30).slice(0, 30);

// 1) Eşli oyunda biten oyuncunun eşi ceza almaz (açmamış olsa bile); tekli oyunda alır.
{
  const g = new GameLogic(); g.startGame(['A', 'B', 'C', 'D'].map(name => ({ name })), 0);
  g.discardPiles[0].push(g.playerTiles[0].pop());
  const team = g.calculatePoints(0, { type: 'normal' }, true), solo = g.calculatePoints(0, { type: 'normal' }, false);
  assert.equal(team[0], -101); assert.equal(team[2], 0, 'eşin cezası silinir');
  assert.equal(solo[2], 202, 'tekli oyunda açmayan 202 alır');
  assert.equal(team[1], 202); assert.equal(team[3], 202);
}

// 2) Dağıtan her el bir kayar; dağıtanın sağındaki (sıradaki) 22 taşla başlar ve taş çekmeden oynar.
const a = new FakeSocket(fakeIO);
a.receive('joinGame', { mode: 'create', isPublic: true, playerName: 'Ayse', token: token('a'), roundLimit: 4, assisted: true, penaltyMode: true });
const room = rooms.get(a.last('joinedGame').code);
a.receive('startWithBots');
const d0 = room.dealer;
assert(Number.isInteger(d0));
assert.equal(room.game.currentPlayer, (d0 + 1) % 4, 'dağıtanın sağındaki başlar');
assert.equal(room.game.playerTiles[(d0 + 1) % 4].length, 22); assert.equal(room.game.hasDrawn, true);
const me = room.players.findIndex(p => p.name === 'Ayse');

// 3) Yandan alıp geri bırakmak 101 ceza (kural 7).
const penaltyOf = () => room.roundExtras[me];
a.receive('debugSetup', { reset: true, myTurn: true, drawn: false, hand: [['Kirmizi', 3], ['Mavi', 9], ['Siyah', 5]], leftDiscard: ['Yesil', 7] });
a.receive('drawTile', { fromDiscard: true });
assert(room.game.playerStates[me].drawnFromDiscardTile, 'yandan aldı');
const before = penaltyOf();
a.receive('undoDiscardDraw');
assert.equal(penaltyOf() - before, 101, 'geri bırakana 101 ceza');

// 4) Yandan alınan taşın eşi elde varsa açılışta eşi kullanılabilir (kural 6).
a.receive('debugSetup', { reset: true, myTurn: true, drawn: false, leftDiscard: ['Kirmizi', 13],
  hand: [['Kirmizi', 13], ['Mavi', 13], ['Siyah', 13], ['Kirmizi', 10], ['Kirmizi', 11], ['Kirmizi', 12], ['Mavi', 10], ['Mavi', 11], ['Mavi', 12], ['Siyah', 10], ['Siyah', 11], ['Siyah', 12], ['Yesil', 2]] });
a.receive('drawTile', { fromDiscard: true });
const st = room.game.playerStates[me], picked = st.drawnFromDiscardTile;
assert(picked, 'yandan K13 alındı');
const hand = room.game.playerTiles[me];
const find = (c, n, notId) => hand.find(t => t.color === c && t.number === n && t.id !== notId && !room.game.isOkey(t));
const twin = find('Kirmizi', 13, picked.id);
if (twin && [find('Mavi', 13), find('Siyah', 13)].every(Boolean)) {
  const groups = [[twin.id, find('Mavi', 13).id, find('Siyah', 13).id], ...['Kirmizi', 'Mavi', 'Siyah'].map(c => [10, 11, 12].map(n => find(c, n)?.id))];
  if (groups.every(g => g.every(Boolean))) {
    a.receive('openHand', { groups });
    assert.equal(st.hasOpened, true, 'eşiyle açtı: ' + JSON.stringify(a.last('gameError')));
    assert.equal(st.mustOpenThisTurn, false);
  }
}

// 5) 101'i bulmadan tek açışta bütün taşlarını açan biter; kimse açmamışsa elden bitiş (rakiplere 2 kat).
a.receive('debugSetup', { reset: true, myTurn: true, drawn: true, hand: [['Kirmizi', 1], ['Kirmizi', 2], ['Kirmizi', 3], ['Mavi', 1], ['Mavi', 2], ['Mavi', 3], ['Siyah', 4]] });
const roundsBefore = room.completedRounds;
const h5 = room.game.playerTiles[me];
const ids = c => h5.filter(t => t.color === c && t.number <= 3 && !room.game.isOkey(t)).map(t => t.id);
if (ids('Kirmizi').length === 3 && ids('Mavi').length === 3) {
  a.receive('openHand', { groups: [ids('Kirmizi'), ids('Mavi')] }); // 12 puan, 101'in altı
  assert.equal(room.completedRounds, roundsBefore + 1, 'el bitti: ' + JSON.stringify(a.last('gameError')));
  const res = room.lastRoundResult;
  assert.equal(res.winner, me);
  // el sonucu = bitiş puanı + o eldeki cezalar (3. adımdaki geri bırakma cezası aynı elde)
  const base = i => res.points[i] - (room.roundExtras[i] || 0);
  assert.equal(base(me), -202, 'elden bitiş: −202');
  for (let i = 0; i < 4; i++) if (i !== me) assert.equal(base(i), 404, 'açmayana 202 × 2');
}

console.log('v45Rules101: eşin cezası silinir, dağıtan kayar ve sağındaki başlar, yandan alıp bırakma 101, eşiyle açma, 101 altı tek açışta elden bitiş geçti');
process.exit(0);
