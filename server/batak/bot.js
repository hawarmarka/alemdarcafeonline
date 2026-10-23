'use strict';
// Batak botu: ihale için elin kaç el alacağını tahmin eder, oyunda oynanan kartları takip eder.
// - Gerek varsa eli en ucuz kazanan kartla alır; kazanamıyorsa en küçük kartı atar.
// - Eşlide eşi kazanıyorsa üstüne çıkmaz.
// - "El almaz" (koz maçada 0) diyen bot eli kaybedecek en büyük kartı atar.
const L = require('./logic');

// Bir renkte elin alabileceği tahmini el sayısı (koz olsun ya da olmasın).
function suitTricks(cards, isTrump) {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a), n = ranks.length;
  let t = 0;
  if (ranks.includes(14)) t += 1;
  if (ranks.includes(13)) t += n >= 2 ? (ranks.includes(14) ? 1 : 0.75) : 0.25;
  if (ranks.includes(12)) t += n >= 3 ? (ranks.includes(14) || ranks.includes(13) ? 0.6 : 0.35) : 0;
  if (isTrump) {
    if (ranks.includes(11) && n >= 4) t += 0.4;
    t += Math.max(0, n - 3) * 0.9; // uzun koz: diğerleri bitince her biri el alır
  }
  return t;
}
// Koz seçilirse elin tahmini el sayısı: renklerin toplamı + kısa renklerde kozla kesme.
function estimate(hand, trump) {
  const by = Object.fromEntries(L.SUITS.map(s => [s, hand.filter(c => c.suit === s)]));
  let t = 0;
  for (const s of L.SUITS) t += suitTricks(by[s], s === trump);
  if (trump) {
    const spare = Math.max(0, by[trump].length - 3);
    for (const s of L.SUITS) if (s !== trump) t += Math.min(spare, by[s].length === 0 ? 1 : by[s].length === 1 ? 0.5 : 0) * 0.8;
  }
  return t;
}
function bestTrump(hand) {
  let best = 'S', score = -1;
  for (const s of L.SUITS) { const e = estimate(hand, s); if (e > score) { score = e; best = s; } }
  return { suit: best, tricks: score };
}
// İhale kararı: sayı ya da null (pas). Koz maça: 0..13.
function chooseBid(bidding, hand, seat) {
  const rule = L.TYPES[bidding.type];
  if (rule.declare) {
    const e = estimate(hand, 'S');
    if (e < 0.35 && !hand.some(c => c.rank >= 13) && hand.filter(c => c.suit === 'S').length <= 2) return 0; // el almaz
    return Math.max(1, Math.min(13, Math.round(e)));
  }
  const floor = bidding.high ? bidding.high.bid + 1 : rule.minBid;
  // Eşlide eşin de 3 civarı el alacağı varsayılır; eşi ihaleyi zaten tutuyorsa üstüne çıkılmaz.
  if (rule.team && bidding.high && bidding.high.seat % 2 === seat % 2) return null;
  const e = bestTrump(hand).tricks + (rule.team ? 3 : 0);
  return Math.floor(e + 0.15) >= floor && floor <= 13 ? floor : null;
}
const beats = (a, b, trump) => a.suit === b.suit ? a.rank > b.rank : a.suit === trump;
// Kart seçimi. view: { hand, trick, trump, trumpBroken, seat, played:Set(id), want: 'win'|'avoid', partner: seat|null }
function choosePlay(view) {
  const { hand, trick, trump, trumpBroken, seat, played } = view;
  const legal = L.legalCards(hand, trick, trump, trumpBroken);
  if (legal.length === 1) return legal[0];
  const low = cards => [...cards].sort((a, b) => (a.suit === trump) - (b.suit === trump) || a.rank - b.rank)[0];
  const high = cards => [...cards].sort((a, b) => b.rank - a.rank)[0];
  // Bu rengin, henüz oynanmamış daha büyük kartı kalmadı mı? (elindeki "patron" kart)
  const isMaster = c => { for (let r = c.rank + 1; r <= 14; r++) { const id = `${c.suit}${r}`; if (!played.has(id) && !hand.some(h => h.id === id)) return false; } return true; };
  if (!trick.length) {
    if (view.want === 'avoid') return low(legal);
    const masters = legal.filter(c => c.suit !== trump && isMaster(c));
    if (masters.length) return high(masters);
    // Koz kırıldıysa ve elde çok koz varsa kozla çek; yoksa en uzun renkten küçük kart.
    const trumps = legal.filter(c => c.suit === trump);
    if (trumps.length >= 4 && trumps.some(isMaster)) return high(trumps.filter(isMaster));
    const bySuit = L.SUITS.filter(s => s !== trump).map(s => legal.filter(c => c.suit === s)).filter(x => x.length).sort((a, b) => b.length - a.length);
    return bySuit.length ? low(bySuit[0]) : low(legal);
  }
  const top = L.trickWinner(trick, trump);
  const winners = legal.filter(c => beats(c, top.card, trump));
  const last = trick.length === 3;
  if (view.want === 'avoid') {
    const losers = legal.filter(c => !beats(c, top.card, trump));
    return losers.length ? high(losers) : high(legal); // mecbursa en büyükle al, sonra küçüklerle kaçar
  }
  // Eşi kazanıyorsa ve sonradan geçilmesi zor görünüyorsa üstüne çıkma.
  if (view.partner != null && top.seat === view.partner && (last || isMaster(top.card) || top.card.suit === trump)) return low(legal);
  if (!winners.length) return low(legal);
  if (last) return low(winners);
  const safe = winners.filter(c => c.suit === trump || isMaster(c));
  return safe.length ? low(safe) : low(winners);
}
module.exports = { chooseBid, choosePlay, bestTrump, estimate };
