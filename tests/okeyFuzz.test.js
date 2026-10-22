'use strict';
// Okey/sahte okey içeren rastgele ellerde istemci çözücüsünün bulduğu her grup sunucuda da geçerli olmalı,
// puanlar aynı olmalı ve sunucunun dizdiği grup (arrangeGroup) geçerliliğini ve puanını korumalı.
const assert = require('node:assert/strict');
const Game = require('../server/gameLogic');
const Melds = require('../public/js/meldSolver');
const colors = ['Kirmizi', 'Yesil', 'Mavi', 'Siyah'];
let seed = 12345;
const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
let checked = 0, withJoker = 0;
for (let round = 0; round < 1500; round++) {
  const g = new Game();
  const okey = { color: colors[rnd(4)], number: 1 + rnd(13) };
  g.okey = okey;
  const deck = [];
  for (let s = 0; s < 2; s++) for (const c of colors) for (let n = 1; n <= 13; n++) deck.push({ id: `${c}-${n}-${s}`, color: c, number: n, isFakeJoker: false });
  deck.push({ id: 'Sahte-1', color: 'Sahte', number: 0, isFakeJoker: true }, { id: 'Sahte-2', color: 'Sahte', number: 0, isFakeJoker: true });
  for (let i = deck.length - 1; i > 0; i--) { const j = rnd(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  // Okey ve sahte okeyleri ele sık düşür
  const hand = deck.slice(0, 18);
  if (rnd(2)) hand.push({ id: `${okey.color}-${okey.number}-0x`, color: okey.color, number: okey.number, isFakeJoker: false });
  if (rnd(3) === 0) hand.push({ id: 'Sahte-x', color: 'Sahte', number: 0, isFakeJoker: true });
  const solved = Melds.solve(hand, okey, null, true);
  let total = 0;
  for (const grp of solved.groups) {
    assert(g.isValidGroup(grp), 'Çözücü grubu sunucuda geçersiz: ' + grp.map(t => t.color[0] + t.number).join(' '));
    const v = g.calculateGroupValue(grp);
    total += v;
    const arranged = g.arrangeGroup(grp);
    assert(g.isValidGroup(arranged), 'Dizilmiş grup geçersiz');
    assert.equal(arranged.length, grp.length);
    assert.equal(g.calculateGroupValue(arranged), v, 'Dizince puan değişmemeli: ' + grp.map(t => t.color[0] + t.number).join(' ') + ' → ' + arranged.map(t => t.color[0] + t.number).join(' '));
    assert.equal(Melds.isValidGroup(grp, okey), true, 'İstemci isValidGroup tutarsız');
    if (grp.some(t => g.isOkey(t) || t.isFakeJoker)) withJoker++;
    checked++;
  }
  assert.equal(total, solved.score, 'Çözücü puanı ile sunucu puanı farklı');
  assert(solved.groups.flat().length < hand.length, 'keepOne: elde en az bir taş kalmalı');
}
assert(withJoker > 100, 'yeterince okeyli grup denenmeli');
// Botun hızlı hesabı (probeGains) her deneme taşı için tam çözümle aynı artışı vermeli.
let probes = 0;
for (let round = 0; round < 200; round++) {
  const okey = { color: colors[rnd(4)], number: 1 + rnd(13) };
  const deck = [];
  for (let s = 0; s < 2; s++) for (const c of colors) for (let n = 1; n <= 13; n++) deck.push({ id: `${c}-${n}-${s}`, color: c, number: n, isFakeJoker: false });
  deck.push({ id: 'Sahte-1', color: 'Sahte', number: 0, isFakeJoker: true }, { id: 'Sahte-2', color: 'Sahte', number: 0, isFakeJoker: true });
  for (let i = deck.length - 1; i > 0; i--) { const j = rnd(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const hand = deck.slice(0, 14 + rnd(8));
  const list = deck.slice(40, 52).map((t, i) => ({ ...t, id: 'probe-' + i }));
  const base = Melds.solve(hand, okey).score;
  Melds.probeGains(hand, okey, list).forEach((gain, i) => {
    assert.equal(gain, Melds.solve([...hand, list[i]], okey).score - base, 'probeGains tam çözümden farklı');
    probes++;
  });
}
console.log(`okeyFuzz: ${checked} grup (${withJoker} okeyli/sahte okeyli) çözücü ve sunucuda tutarlı; ${probes} deneme taşında probeGains tam çözümle aynı`);
