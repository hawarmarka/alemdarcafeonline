'use strict';
// Pişti: alma, pişti (10/20), Vale ile pişti olmaz, dağıtım (kapalı 3 + açık 1, Vale açılmaz, aynı sayıdan 3 kart),
// puan (13 kart puanı, kart fazlası ve eşitlik), blöf puanları; botlarla çok sayıda el (52 kart korunur);
// masa akışı socket üzerinden (katıl, koltuk, botla doldur, maç 101'e kadar, blöf, yeniden bağlanma); bot rastgele oyuncuyu yener.
const assert = require('node:assert/strict');
const L = require('../server/pisti/logic');
const Bot = require('../server/pisti/bot');
const C = id => ({ id, suit: id[0], rank: Number(id.slice(1)) });
const open = ids => ids.map(id => ({ card: C(id), closed: false }));

// 1) Kart atma sonucu
assert.deepEqual(L.playResult([], C('H5')), { capture: false, pisti: 0 }, 'boş yere atılan kart almaz');
assert.deepEqual(L.playResult(open(['S7', 'H5']), C('D5')), { capture: true, pisti: 0 }, 'aynı sayı alır');
assert.deepEqual(L.playResult(open(['S7', 'H5']), C('D9')), { capture: false, pisti: 0 });
assert.deepEqual(L.playResult(open(['S7', 'H5']), C('C11')), { capture: true, pisti: 0 }, 'Vale her şeyi alır');
assert.deepEqual(L.playResult(open(['H5']), C('D5')), { capture: true, pisti: 10 }, 'pişti 10');
assert.deepEqual(L.playResult(open(['H11']), C('D11')), { capture: true, pisti: 20 }, 'Vale pişti 20');
assert.deepEqual(L.playResult(open(['H5']), C('D11')), { capture: true, pisti: 0 }, 'Vale ile pişti olmaz');
assert.deepEqual(L.playResult([{ card: C('H5'), closed: true }], C('D5')).pisti, 0, 'kapalı kartla pişti olmaz');
assert.equal(L.bluffPoints(C('H5'), 'believe'), 10); assert.equal(L.bluffPoints(C('H5'), 'challenge'), 20);
assert.equal(L.bluffPoints(C('H11'), 'believe'), 20, 'yerde Vale varsa blöf puanı 2 kat');

// 2) Puan: kart puanları toplamı 13; kart fazlası 3; eşit kartta puanı fazla olan alır
const deck = L.newDeck();
assert.equal(deck.reduce((n, c) => n + L.cardPoints(c), 0), 13);
let rows = L.roundScores([{ cards: deck.slice(0, 30), bonus: 10 }, { cards: deck.slice(30), bonus: 0 }]);
assert.equal(rows[0].most, 3); assert.equal(rows[1].most, 0);
assert.equal(rows[0].cardPts + rows[1].cardPts, 13);
assert.equal(rows[0].total, rows[0].cardPts + 10 + 3);
rows = L.roundScores([{ cards: ['S14', 'S3'].map(C), bonus: 0 }, { cards: ['S4', 'S5'].map(C), bonus: 0 }]);
assert.deepEqual(rows.map(r => r.most), [3, 0], 'eşit kartta puanı fazla olan 3 alır');
rows = L.roundScores([{ cards: ['S6', 'S3'].map(C), bonus: 0 }, { cards: ['S4', 'S5'].map(C), bonus: 0 }]);
assert.deepEqual(rows.map(r => r.most), [0, 0], 'puan da eşitse kimse almaz');

// 3) Dağıtım
for (let i = 0; i < 400; i++) {
  const n = i % 2 ? 4 : 2, dealer = i % n, r = L.setupRound(n, dealer);
  assert.equal(r.pile.length, 4); assert.deepEqual(r.pile.map(x => x.closed), [true, true, true, false]);
  assert.notEqual(r.pile[3].card.rank, L.JACK, 'açık kart Vale olmaz');
  assert(r.hands.every(h => h.length === 4)); assert(!r.hands.some(L.threeOfKind), 'aynı sayıdan 3 kart dağıtılmaz');
  assert.equal(r.deck.length, 52 - 4 - 4 * n);
  // Kalan dağıtımlarda destenin en altındaki kart dağıtana gelir.
  const bottom = r.deck[r.deck.length - 1], hands = r.hands.map(() => []);
  while (r.deck.length) L.dealHands(r.deck, n, dealer, hands);
  assert(hands[dealer].some(c => c.id === bottom.id), 'destenin altındaki açık kart son dağıtımda dağıtana gelir');
}
const jacksTop = ['C11', 'D11', 'S3', 'H11'].map(C).concat(L.newDeck().filter(c => !['C11', 'D11', 'S3', 'H11'].includes(c.id)));
const fixed = L.setupRound(2, 0, jacksTop);
if (fixed.pile[0].card.id === 'C11') assert.equal(fixed.pile[3].card.id, 'S3', 'Vale açılınca kapalılardan Vale olmayan açılır');

// 4) Botlarla çok sayıda el: kartlar korunur, puan tutarlı
const Pr = Bot.probHas;
assert.equal(Pr(0, 4, 20), 0); assert.equal(Pr(3, 20, 20), 1); assert(Pr(1, 4, 40) > 0.09 && Pr(1, 4, 40) < 0.11);
assert.equal(Bot.choosePlay({ hand: ['H5', 'S9', 'C11', 'D2'].map(C), pile: open(['D5']), seen: new Set(), next: { hand: 4 }, deckLeft: 20 }).cardId, 'H5', 'pişti fırsatını kaçırmaz');
assert.notEqual(Bot.choosePlay({ hand: ['H5', 'S9', 'C11', 'D2'].map(C), pile: open(['D3', 'S8']), seen: new Set(), next: { hand: 4 }, deckLeft: 20 }).cardId, 'C11', 'ucuz yığına Vale harcamaz');
assert.equal(Bot.choosePlay({ hand: ['H5', 'S9'].map(C), pile: [], seen: new Set(['S5', 'C5', 'D5']), next: { hand: 4 }, deckLeft: 20 }).cardId, 'H5', 'boş yere eşi kalmayan kartı atar');
assert.equal(Bot.chooseResponse({ hand: [], seen: new Set(['S5', 'C5', 'D5', 'H5']), top: C('H5'), bluffer: { hand: 3 } }), 'challenge', 'eşi kalmayan karta pişti diyen blöftür');

// 5) Masa: socket üzerinden
const sockets = new Map();
class FakeSocket {
  static n = 0;
  constructor() { this.id = 'ps' + (++FakeSocket.n); this.data = {}; this.handlers = {}; this.out = []; sockets.set(this.id, this); }
  on(e, fn) { (this.handlers[e] ||= []).push(fn); } emit(e, d) { this.out.push({ event: e, data: d }); }
  receive(e, d) { for (const fn of this.handlers[e] || []) fn(d); } last(e) { return this.out.filter(x => x.event === e).at(-1)?.data; }
}
const io = { to: id => ({ emit: (e, d) => sockets.get(id)?.out.push({ event: e, data: d }) }) };
let awards = 0;
const Pisti = require('../server/pisti').install({ io, Accounts: { fromToken: () => null, award() { awards++; } }, Avatars: { ref: a => a, BUILTIN: ['default.svg'], randomAvatar: () => 'av01.svg' }, Logger: { error(...a) { console.error(...a); } } });
const fire = (room, ...keys) => { for (const key of keys) { const t = room[key]; if (!t) continue; const cb = t._onTimeout; clearTimeout(t); room[key] = null; cb(); return true; } return false; };
const step = room => fire(room, 'botTimer', 'turnTimer', 'captureTimer', 'nextTimer');
const total52 = room => room.deck.length + room.pile.length + room.hands.flat().length + room.captured.flat().length + (room.bluffState ? 1 : 0);

// 5a) Hemen oyna, 2 kişi: bot doldurur, maç 101'e kadar oynanır; her adımda 52 kart.
const s1 = new FakeSocket(); Pisti.onSocket(s1);
s1.receive('pisti:join', { mode: 'quick', type: 'ikili', target: 101, token: 'z'.repeat(30), playerName: 'Ali' });
const room = Pisti.rooms.get(s1.last('pisti:joined').code);
assert.equal(room.phase, 'waiting');
assert(fire(room, 'fillTimer'), 'bot doldurma zamanlanmalı');
assert.equal(room.players.length, 2); assert.deepEqual(room.players.map(p => p.seat), [0, 2], 'iki kişide karşılıklı koltuklar');
let guard = 0, triedBad = false, pistis = 0;
while (room.phase !== 'matchEnd' && guard++ < 5000) {
  if (['playing', 'capture', 'bluff'].includes(room.phase)) assert.equal(total52(room), 52, '52 kart korunmalı');
  if (room.phase === 'playing' && room.turn === 0 && !triedBad) {
    s1.receive('pisti:play', { cardId: 'XX', closed: false }); assert.match(s1.last('pisti:error').message, /elinizde yok/);
    s1.receive('pisti:play', { cardId: room.hands[0][0].id, closed: true });
    if (!(room.bluff)) assert.match(s1.last('pisti:error').message, /blöflü/);
    triedBad = true;
  }
  if (room.lastPlay?.pisti) pistis++;
  if (!step(room)) assert.fail('masa ilerlemedi: ' + room.phase);
}
assert.equal(room.phase, 'matchEnd');
assert(Math.max(...room.totals) >= 101);
assert.deepEqual(room.totals, [0, 1].map(k => room.history.reduce((n, h) => n + h.rows[k].total, 0)));
for (const h of room.history) assert.equal(h.rows.reduce((n, r) => n + r.cardPts, 0), 13, 'her elde 13 kart puanı');
const st = s1.last('pisti:state'); assert.equal(st.phase, 'matchEnd'); assert(st.winners.length === 1);

// 5b) Eşli, blöflü, açık masa: koltuk seçimi, botlarla başlat, maç sonuna kadar; blöf yolları.
const h1 = new FakeSocket(); Pisti.onSocket(h1);
h1.receive('pisti:join', { mode: 'create', isPublic: true, type: 'esli', target: 101, bluff: true, token: 'h'.repeat(30), playerName: 'Host' });
const room2 = Pisti.rooms.get(h1.last('pisti:joined').code);
assert(Pisti.stats().waiting.some(r => r.code === room2.code && r.bluff), 'açık masa listede görünmeli');
const h2 = new FakeSocket(); Pisti.onSocket(h2);
h2.receive('pisti:join', { mode: 'code', code: room2.code, seat: 2, token: 'k'.repeat(30), playerName: 'Eş' });
const h3 = new FakeSocket(); Pisti.onSocket(h3);
h3.receive('pisti:join', { mode: 'code', code: room2.code, seat: 2, token: 'm'.repeat(30), playerName: 'Üçüncü' });
assert.match(h3.last('pisti:error').message, /koltuk/);
h1.receive('pisti:startBots');
assert.deepEqual(room2.players.map(p => p.seat), [0, 1, 2, 3]); assert.equal(room2.players[2].name, 'Eş');
let bluffs = 0, believed = 0, caught = 0; guard = 0;
while (room2.phase !== 'matchEnd' && guard++ < 8000) {
  if (['playing', 'capture', 'bluff'].includes(room2.phase)) assert.equal(total52(room2), 52);
  // İnsanların sırasında: blöf açılabiliyorsa kapalı at, blöf sorulursa sırayla inan/aç.
  if (room2.phase === 'playing' && [0, 2].includes(room2.turn) && room2.pile.length === 1 && !room2.pile[0].closed) {
    const sock = room2.turn === 0 ? h1 : h2; sock.receive('pisti:play', { cardId: room2.hands[room2.turn][0].id, closed: true });
    assert.equal(room2.phase, 'bluff'); bluffs++; continue;
  }
  if (room2.phase === 'bluff' && [0, 2].includes(room2.turn)) {
    const sock = room2.turn === 0 ? h1 : h2, choice = bluffs % 2 ? 'believe' : 'challenge';
    sock.receive('pisti:respond', { choice }); if (choice === 'believe') believed++; else caught++; continue;
  }
  if (room2.phase === 'bluff') { const v = h1.last('pisti:state'); assert.equal(v.bluffState?.mine ?? null, room2.bluffState.seat === 0 ? v.bluffState.mine : null); }
  if (!step(room2)) assert.fail('eşli masa ilerlemedi: ' + room2.phase);
}
assert.equal(room2.phase, 'matchEnd'); assert.equal(room2.totals.length, 2, 'eşlide iki taraf');
assert(bluffs > 0, 'blöf denenmeli');
const view = h1.last('pisti:state');
assert.equal(view.players[0].total, view.players[2].total, 'eşler aynı puanı görür');
for (const p of view.pile) assert(!p.closed || !p.card, 'kapalı kartın yüzü gönderilmez');
h2.receive('pisti:changeSeat', { seat: 1 }); assert.match(h2.last('pisti:error').message, /başladıktan/);
// İkram ve sohbet ortak modülden
h2.receive('pisti:treat', { item: 'cay', to: 0 }); assert.deepEqual(h1.last('pisti:treat'), { from: 2, to: 0, item: 'cay', name: 'Eş' });
h1.receive('pisti:chat', { text: 'Selam' }); assert.equal(h2.last('pisti:chat').text, 'Selam');
h1.receive('pisti:voiceJoin'); h2.receive('pisti:voiceJoin'); assert.deepEqual(h1.last('pisti:voice').list, [0, 2]);
// Yeniden oyna
h1.receive('pisti:rematch'); assert.equal(room2.phase, 'playing'); assert.equal(room2.round, 1);

// 5c) 2 kişilik masada geçersiz koltuk, yeniden bağlanma
const k1 = new FakeSocket(); Pisti.onSocket(k1);
k1.receive('pisti:join', { mode: 'create', type: 'ikili', token: 'q'.repeat(30), playerName: 'Kurucu' });
const room3 = Pisti.rooms.get(k1.last('pisti:joined').code);
const k2 = new FakeSocket(); Pisti.onSocket(k2);
k2.receive('pisti:join', { mode: 'code', code: room3.code, seat: 1, token: 'w'.repeat(30), playerName: 'Konuk' });
assert.match(k2.last('pisti:error').message, /koltuk/, 'iki kişide yan koltuk yok');
const re = new FakeSocket(); Pisti.onSocket(re);
re.receive('pisti:rejoin', { code: room.code, token: 'z'.repeat(30) }); assert.equal(re.last('pisti:state').me, 0);

// 6) Bot gücü: 2 kişilik masada rastgele oynayan oyuncuya karşı 30 maç
let botWins = 0, botPts = 0, rndPts = 0;
for (let m = 0; m < 30; m++) {
  const s = new FakeSocket(); Pisti.onSocket(s);
  s.receive('pisti:join', { mode: 'create', type: 'ikili', target: 101, token: ('r' + m).padEnd(30, 'x'), playerName: 'Rastgele' });
  const r = Pisti.rooms.get(s.last('pisti:joined').code);
  s.receive('pisti:startBots');
  for (let g = 0; r.phase !== 'matchEnd' && g < 5000; g++) {
    if (r.phase === 'playing' && r.turn === 0) { const h = r.hands[0]; Pisti._act(r, 0, 'play', { cardId: h[Math.floor(Math.random() * h.length)].id }); continue; }
    if (!step(r)) assert.fail('bot gücü maçı ilerlemedi');
  }
  if (r.winners[0] === 1) botWins++;
  botPts += r.totals[1]; rndPts += r.totals[0];
  s.receive('pisti:leave');
}
assert(botWins >= 20, `bot rastgele oyuncuyu çoğunlukla yenmeli (${botWins}/30)`);
console.log(`v42Pisti: kurallar, dağıtım, puan, 2 kişilik ve eşli blöflü maç (${bluffs} blöf, ${pistis} pişti), koltuk, yeniden bağlanma geçti; bot rastgele oyuncuyu ${botWins}/30 yendi (puan ${botPts} / ${rndPts})`);
process.exit(0);
