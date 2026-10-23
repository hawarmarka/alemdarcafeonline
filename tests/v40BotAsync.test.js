'use strict';
// Sunucudaki gerçek yol: BOT_AI=mc, karar worker_threads havuzunda (eşzamansız). Dört botla maçlar oynanır:
// sıra her zaman ilerlemeli, 106 taş korunmalı, karar beklenirken event loop serbest kalmalı, maç bitmeli.
process.env.BOT_AI = 'mc';
process.env.BOT_MC_SAMPLES = '24'; // test hızlı bitsin
const assert = require('node:assert/strict');
const Module = require('node:module');
const nativeLoad = Module._load;
let fakeIO;
class FakeSocket {
  static n = 0;
  constructor(io) { this.id = 'ba' + (++FakeSocket.n); this.handlers = {}; this.out = []; this.rooms = new Set(); this.data = {}; io.sockets.sockets.set(this.id, this); io.connect(this); }
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
process.env.DATA_DIR = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'okey-botasync-'));
const Logger = require('../server/logger'); for (const k of ['game', 'debug', 'info', 'warn', 'log']) Logger[k] = () => {};
const { rooms, _testing } = require('../server/index'); Module._load = nativeLoad;
const BotPool = require('../server/botPool');
const quietErrors = console.error; console.error = () => {};
function fire(room, key) { const t = room[key]; if (!t) return false; const cb = t._onTimeout; clearTimeout(t); room[key] = null; cb(); return true; }
const tileCount = room => { const g = room.game; return g.tiles.length + 1 + g.playerTiles.flat().length + g.discardPiles.flat().length + g.playerStates.flatMap(s => [...s.openedGroups, ...(s.extraPairs || [])]).flat().length; };
const tick = () => new Promise(r => setImmediate(r));
(async () => {
  let deferred = 0, maxLoopGap = 0, rounds = 0;
  for (let m = 0; m < 2; m++) {
    const h = new FakeSocket(fakeIO);
    h.receive('joinGame', { mode: 'create', autoBots: true, playerName: 'as' + m, token: 'y'.repeat(30) + m, roundLimit: 2 });
    const room = rooms.get(h.last('joinedGame').code);
    fire(room, 'botFillTimer');
    room.players[0].isBot = true; room.players[0].socketId = null;
    _testing.beginTurn(room);
    let guard = 0;
    while (!room.matchEnded && guard++ < 3000) {
      if (!room.started) { rounds++; if (!fire(room, 'nextRoundTimer')) fire(room, 'botFillTimer'); continue; }
      assert.equal(tileCount(room), 106, 'Toplam taş 106 kalmalı');
      const seat = room.game.currentPlayer, serial = room.game.turnSerial, game = room.game;
      assert(fire(room, 'botTurnTimer'), 'Bot sırası zamanlanmalı');
      if (room.game === game && room.started && room.game.currentPlayer === seat && room.game.turnSerial === serial) {
        // Karar worker'da: beklerken event loop dönebilmeli (setImmediate aralıkları kısa kalmalı).
        deferred++;
        let last = Date.now(), waited = 0;
        while (room.game === game && room.started && room.game.currentPlayer === seat && room.game.turnSerial === serial && waited < 8000) {
          await tick(); const now = Date.now(); maxLoopGap = Math.max(maxLoopGap, now - last); waited += now - last; last = now;
        }
        assert(waited < 8000, 'Worker kararı gelmeli (veya sezgisel karar kullanılmalı)');
      }
    }
    assert(room.matchEnded, 'Maç bitmeli');
    rounds++;
  }
  assert(deferred > 10, 'Açmadan önceki kararlar worker\'a gitmeli');
  assert(maxLoopGap < 50, `Karar beklenirken event loop takılmamalı (en uzun ara ${maxLoopGap} ms)`);
  await BotPool.close();
  console.error = quietErrors;
  console.log(`v40BotAsync: ${rounds} el, ${deferred} worker kararı, en uzun event-loop arası ${maxLoopGap} ms; 106 taş ve sıra ilerlemesi korundu`);
  process.exit(0);
})().catch(err => { console.error = quietErrors; console.error(err); process.exit(1); });
