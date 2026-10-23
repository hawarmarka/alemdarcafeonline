'use strict';
// Sanal çip ekonomisi: dağıtım kuralı, masa bahsi, maç sonu ödeme, %7 ücret, yetersiz çip, hediye çip, seviye ödülü.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const Economy = require('../server/economy');

// 1) Dağıtım kuralı (birim test)
const pot = 4 * 1000, fee = x => Math.floor(x * 0.07);
let r = Economy.settle({ bet: 1000, teamMode: false, totals: [50, 202, 202, 202], opened: [true, false, false, false] });
assert.equal(r[0].gross, pot, 'tek açan bütün potu alır'); assert.equal(r[0].payout, pot - fee(pot)); assert.equal(r[1].payout, 0);
r = Economy.settle({ bet: 1000, teamMode: false, totals: [30, 80, 150, 202], opened: [true, true, true, false] });
assert.equal(r[0].gross, 3000, 'birinci potun 3/4ü'); assert.equal(r[1].gross, 1000, 'ikinci potun 1/4ü'); assert.equal(r[2].gross, 0);
r = Economy.settle({ bet: 1000, teamMode: false, totals: [40, 40, 150, 202], opened: [true, true, true, false] });
assert.equal(r[0].gross, 2000); assert.equal(r[1].gross, 2000, 'eşit ceza: birinci ve ikinci pay eşit bölünür');
r = Economy.settle({ bet: 1000, teamMode: false, totals: [202, 202, 202, 202], opened: [false, false, false, false] });
assert(r.every(x => x.refund && x.payout === 1000 && x.fee === 0), 'kimse açmadıysa iade');
r = Economy.settle({ bet: 1000, teamMode: true, totals: [20, 200, 30, 150], opened: [true, true, false, false] });
assert.equal(r[0].gross, 2000); assert.equal(r[2].gross, 2000, 'eşli: kazanan takım potu paylaşır'); assert.equal(r[1].gross, 0);
assert.equal(Economy.normalizeBet(123), 1000); assert.equal(Economy.normalizeBet(25000), 25000);

// 2) Uçtan uca: hesaplı oyuncu bahisli masaya oturur, bahis alınır, maç sonunda pot ödenir.
const nativeLoad = Module._load;
let fakeIO;
class FakeSocket {
  static n = 0;
  constructor(io) { this.id = 'ec' + (++FakeSocket.n); this.handlers = {}; this.out = []; this.rooms = new Set(); this.data = {}; io.sockets.sockets.set(this.id, this); io.connect(this); }
  on(e, fn) { this.handlers[e] = fn; } emit(e, d) { this.out.push({ event: e, data: d }); }
  join(x) { this.rooms.add(x); } leave(x) { this.rooms.delete(x); }
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
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'okey-econ-'));
const Logger = require('../server/logger'); for (const k of ['game', 'debug']) Logger[k] = () => {};
const quietLog = console.log; console.log = () => {};
const { rooms, _testing } = require('../server/index');
const Accounts = require('../server/accounts');
Module._load = nativeLoad;
(async () => {
  const { token: auth, user } = await Accounts.register('CipOyuncu', 'uzunsifre123');
  assert.equal(user.chips, Accounts.START_CHIPS, 'yeni hesap başlangıç çipiyle açılır');
  // Yetersiz çip: 25.000'lik masa açılamaz
  const s0 = new FakeSocket(fakeIO);
  s0.receive('joinGame', { mode: 'create', authToken: auth, token: 'c'.repeat(30), bet: 25000, roundLimit: 1 });
  assert.match(s0.last('gameError').message, /çip gerekli/);
  // 5.000'lik masa: bahis maç başında alınır
  const s = new FakeSocket(fakeIO);
  s.receive('joinGame', { mode: 'create', authToken: auth, token: 'd'.repeat(30), bet: 5000, roundLimit: 1 });
  const room = rooms.get(s.last('joinedGame').code);
  assert.equal(room.bet, 5000);
  s.receive('startWithBots');
  assert.equal(Accounts.chipsOf(user.id), Accounts.START_CHIPS - 5000, 'bahis alındı');
  assert.equal(s.last('gameState').myChips, Accounts.START_CHIPS - 5000, 'istemciye çip gider');
  // Yalnız bu oyuncu açmış ve eli bitirmiş say: bütün pot (20.000) - %7 ücret
  room.game.playerStates[0].hasOpened = true;
  _testing.finishRound(room, 0, { type: 'normal' });
  // İlk galibiyet 200 XP: 1. seviyeden 2. seviyeye çıkar, seviye × 500 = 1.000 çip ödül.
  const up = s.last('levelUp');
  assert.deepEqual(up, { level: 2, reward: 1000 }, 'seviye atlayınca çip ödülü');
  const expected = Accounts.START_CHIPS - 5000 + (20000 - Math.floor(20000 * 0.07)) + up.reward;
  assert.equal(Accounts.chipsOf(user.id), expected, 'pot ödendi');
  const res = s.last('gameFinished');
  assert.equal(res.chips[0].net, 20000 - Math.floor(20000 * 0.07) - 5000);
  // Hediye çip: ilk seferde alınır, hemen ikinci kez alınamaz
  const b = Accounts.claimBonus(user);
  assert(b.amount >= 1000 && b.user.chips === expected + b.amount);
  assert.throws(() => Accounts.claimBonus(user), /Sonraki hediye/);
  console.log = quietLog;
  console.log('v36Economy: dağıtım kuralı, bahis alma, pot ödeme ve %7 ücret, seviye ödülü, yetersiz çip, hediye çip geçti');
  Accounts.close();
  try { fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch(err => { console.log = quietLog; console.error(err); process.exit(1); });
