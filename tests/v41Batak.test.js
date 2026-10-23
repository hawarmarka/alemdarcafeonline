'use strict';
// Batak: renk takibi, büyütme, koz zorunluluğu ve koz kırılması; ihale (zorunlu ihale, eşli, koz maça); puan;
// botlarla çok sayıda el (52 kart korunur, her hamle kurala uygun); masa akışı socket üzerinden (katıl, botla doldur, maç biter).
const assert = require('node:assert/strict');
const L = require('../server/batak/logic');
const Bot = require('../server/batak/bot');
const C = id => ({ id, suit: id[0], rank: Number(id.slice(1)) });
const ids = cards => cards.map(c => c.id).sort();

// 1) Oynanabilir kartlar
const hand = ['S14', 'S3', 'H12', 'H5', 'D9', 'C2'].map(C);
assert.deepEqual(ids(L.legalCards(hand, [], 'S', false)), ['C2', 'D9', 'H12', 'H5'], 'koz kırılmadan koz açılmaz');
assert.deepEqual(ids(L.legalCards(hand, [], 'S', true)), ids(hand), 'koz kırıldıysa her kart açılır');
assert.deepEqual(ids(L.legalCards(['S5', 'S9'].map(C), [], 'S', false)), ['S5', 'S9'], 'yalnız koz varsa kozla açılır');
assert.deepEqual(ids(L.legalCards(hand, [{ seat: 0, card: C('H10') }], 'S', false)), ['H12'], 'rengi takip et ve büyüt');
assert.deepEqual(ids(L.legalCards(hand, [{ seat: 0, card: C('H13') }], 'S', false)), ['H12', 'H5'], 'geçemiyorsa renkten herhangi biri');
assert.deepEqual(ids(L.legalCards(hand, [{ seat: 0, card: C('H13') }, { seat: 1, card: C('S2') }], 'S', true)), ['H12', 'H5'], 'yer kozlandıysa renkten herhangi biri');
const noHearts = ['S14', 'S3', 'D9', 'C2'].map(C);
assert.deepEqual(ids(L.legalCards(noHearts, [{ seat: 0, card: C('H10') }], 'S', false)), ['S14', 'S3'], 'renk yoksa koz zorunlu');
assert.deepEqual(ids(L.legalCards(noHearts, [{ seat: 0, card: C('H10') }, { seat: 1, card: C('S9') }], 'S', true)), ['S14'], 'kozu büyütmek zorunlu');
assert.deepEqual(ids(L.legalCards(['D9', 'C2'].map(C), [{ seat: 0, card: C('H10') }], 'S', false)), ['C2', 'D9'], 'renk ve koz yoksa çöp');
assert.equal(L.trickWinner([{ seat: 0, card: C('H10') }, { seat: 1, card: C('H14') }, { seat: 2, card: C('S2') }, { seat: 3, card: C('D14') }], 'S').seat, 2);
assert.equal(L.trickWinner([{ seat: 0, card: C('H10') }, { seat: 1, card: C('D14') }], 'S').seat, 0, 'başka renk alamaz');
assert(L.canCancel(['S10', 'S2', 'H9', 'H8', 'H7', 'D10', 'D2', 'D3', 'C10', 'C9', 'C8', 'C7', 'C6'].map(C)));
assert(!L.canCancel(['S11', 'S2', 'H9', 'H8', 'H7', 'D10', 'D2', 'D3', 'C10', 'C9', 'C8', 'C7', 'C6'].map(C)));

// 2) İhale
let b = L.startBidding('ihaleli', 0); // ilk söz dağıtanın sağı: 1
assert.equal(b.turn, 1);
assert.match(L.placeBid(b, 1, 4), /En az 5/);
assert.equal(L.placeBid(b, 1, 5), null); assert.equal(b.turn, 2);
assert.match(L.placeBid(b, 2, 5), /En az 6/);
L.placeBid(b, 2, null); L.placeBid(b, 3, 7); L.placeBid(b, 0, null);
assert.equal(b.turn, 1); L.placeBid(b, 1, null);
assert(b.done); assert.deepEqual(b.contract, { seat: 3, bid: 7, forced: false });
b = L.startBidding('ihaleli', 2); for (const s of [3, 0, 1, 2]) L.placeBid(b, s, null);
assert.deepEqual(b.contract, { seat: 3, bid: 4, forced: true }, 'kimse girmezse dağıtanın sağındakine 4');
b = L.startBidding('esli', 1); for (const s of [2, 3, 0, 1]) L.placeBid(b, s, null);
assert.deepEqual(b.contract, { seat: 1, bid: 7, forced: true }, 'eşlide dağıtana 7');
b = L.startBidding('esli', 1); assert.match(L.placeBid(b, 2, 7), /En az 8/);
b = L.startBidding('kozmaca', 3); for (const [s, v] of [[0, 3], [1, 0], [2, 5], [3, 4]]) assert.equal(L.placeBid(b, s, v), null);
assert(b.done); assert.deepEqual(b.bids, [3, 0, 5, 4]);

// 3) Puan
assert.deepEqual(L.roundScores('ihaleli', [7, 3, 0, 3], [null, null, null, null], { seat: 0, bid: 6 }), [61, 3, -60, 3]);
assert.deepEqual(L.roundScores('ihaleli', [5, 3, 2, 3], [null, null, null, null], { seat: 0, bid: 6 }), [-60, 3, 2, 3]);
assert.deepEqual(L.roundScores('kozmaca', [3, 0, 6, 4], [3, 0, 5, 5], null), [30, 50, 51, -50]);
assert.deepEqual(L.roundScores('kozmaca', [3, 1, 5, 4], [3, 0, 5, 5], null).slice(1, 2), [-50]);
assert.deepEqual(L.roundScores('esli', [5, 2, 4, 2], [null, null, null, null], { seat: 2, bid: 8 }), [81, 4, 81, 4]);
assert.deepEqual(L.roundScores('esli', [4, 3, 3, 3], [null, null, null, null], { seat: 1, bid: 8 }), [7, -80, 7, -80]);

// 4) Botlarla çok sayıda el: her kart kurala uygun, 52 kart, el sayıları toplamı 13
let rounds = 0;
for (const type of ['ihaleli', 'kozmaca', 'esli']) for (let r = 0; r < 120; r++) {
  const dealer = r % 4, hands = L.deal(dealer);
  assert.equal(new Set(hands.flat().map(c => c.id)).size, 52);
  const bid = L.startBidding(type, dealer);
  for (let g = 0; !bid.done && g < 60; g++) assert.equal(L.placeBid(bid, bid.turn, Bot.chooseBid(bid, hands[bid.turn], bid.turn)), null);
  assert(bid.done, 'ihale bitmeli');
  const trump = L.TYPES[type].fixedTrump || Bot.bestTrump(hands[bid.contract.seat]).suit;
  let leader = bid.contract ? bid.contract.seat : (dealer + 1) % 4, broken = false;
  const tricks = [0, 0, 0, 0], played = new Set();
  for (let t = 0; t < 13; t++) {
    const trick = [];
    for (let k = 0; k < 4; k++) {
      const seat = (leader + k) % 4;
      const card = Bot.choosePlay({ hand: hands[seat], trick, trump, trumpBroken: broken, seat, played,
        want: L.TYPES[type].declare && bid.bids[seat] === 0 ? 'avoid' : 'win', partner: L.TYPES[type].team ? (seat + 2) % 4 : null });
      assert(L.legalCards(hands[seat], trick, trump, broken).some(c => c.id === card.id), 'bot kurala uygun oynamalı');
      hands[seat] = hands[seat].filter(c => c.id !== card.id); trick.push({ seat, card }); played.add(card.id);
      if (card.suit === trump) broken = true;
    }
    leader = L.trickWinner(trick, trump).seat; tricks[leader]++;
  }
  assert.equal(tricks.reduce((a, c) => a + c, 0), 13);
  assert.equal(played.size, 52);
  L.roundScores(type, tricks, bid.bids, bid.contract).forEach(s => assert(Number.isInteger(s)));
  rounds++;
}

// 5) Masa: socket üzerinden katıl, botlarla dolsun, maç (5 el) sonuna kadar oynansın
const sockets = new Map();
class FakeSocket {
  static n = 0;
  constructor() { this.id = 'bt' + (++FakeSocket.n); this.data = {}; this.handlers = {}; this.out = []; sockets.set(this.id, this); }
  on(e, fn) { this.handlers[e] = fn; } emit(e, d) { this.out.push({ event: e, data: d }); }
  receive(e, d) { return this.handlers[e](d); } last(e) { return this.out.filter(x => x.event === e).at(-1)?.data; }
}
const io = { to: id => ({ emit: (e, d) => sockets.get(id)?.out.push({ event: e, data: d }) }) };
const Batak = require('../server/batak').install({ io, Accounts: { fromToken: () => null, award() {} }, Avatars: { ref: a => a, BUILTIN: ['default.svg'], randomAvatar: () => 'av01.svg' }, Logger: { error() {} } });
const fire = (room, key) => { const t = room[key]; if (!t) return false; const cb = t._onTimeout; clearTimeout(t); room[key] = null; cb(); return true; };
const s1 = new FakeSocket(); Batak.onSocket(s1);
s1.receive('batak:join', { mode: 'quick', type: 'ihaleli', rounds: 5, token: 'z'.repeat(30), playerName: 'Ali' });
const room = Batak.rooms.get(s1.last('batak:joined').code);
assert.equal(room.phase, 'waiting');
assert(fire(room, 'fillTimer'), 'bot doldurma zamanlanmalı');
assert.equal(room.players.length, 4); assert.notEqual(room.phase, 'waiting');
// Sırası gelince bizim oyuncu geçersiz kart dener: hata döner, oyun ilerlemez.
let guard = 0, triedIllegal = false;
while (room.phase !== 'matchEnd' && guard++ < 2000) {
  if (room.phase === 'playing' && room.turn === 0 && !triedIllegal && room.trick.length) {
    const st = s1.last('batak:state'); const bad = room.hands[0].find(c => !st.legal.includes(c.id));
    if (bad) { s1.receive('batak:play', { cardId: bad.id }); assert(s1.last('batak:error'), 'kural dışı kart reddedilmeli'); triedIllegal = true; }
  }
  if (!fire(room, 'botTimer') && !fire(room, 'turnTimer') && !fire(room, 'trickTimer') && !fire(room, 'nextTimer')) assert.fail('masa ilerlemedi: ' + room.phase);
}
assert.equal(room.phase, 'matchEnd'); assert.equal(room.history.length, 5);
assert.equal(s1.last('batak:state').phase, 'matchEnd');
assert.deepEqual(room.totals, [0, 1, 2, 3].map(i => room.history.reduce((n, h) => n + h.scores[i], 0)));
// Masa sohbeti: masadakilere gider, kontrol karakterleri ve uzunluk temizlenir, art arda yazma sınırlı.
s1.receive('batak:chat', { text: 'Selam\u0007 ' + 'x'.repeat(200) });
const chat = s1.last('batak:chat'); assert.equal(chat.seat, 0); assert.equal(chat.text.length, 100); assert(!chat.text.includes('\u0007'));
s1.receive('batak:chat', { text: 'hızlı' }); assert.match(s1.last('batak:error').message, /yavaş/);
assert.equal(s1.last('batak:state').turnMs > 0, true, 'süre halkası için turnMs gitmeli');
// Yeniden bağlanma: yeni socket aynı oyuncu jetonuyla masaya döner.
const s2 = new FakeSocket(); Batak.onSocket(s2);
s2.receive('batak:rejoin', { code: room.code, token: 'z'.repeat(30) });
assert.equal(s2.last('batak:state').me, 0);
console.log(`v41Batak: kurallar, ihale, puan, ${rounds} botlu el (3 tür) ve socket üzerinden 5 ellik maç geçti${triedIllegal ? '; kural dışı kart reddedildi' : ''}`);
process.exit(0);
