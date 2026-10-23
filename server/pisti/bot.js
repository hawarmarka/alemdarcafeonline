'use strict';
// Pişti botu: oynanan kartları sayar ("kart saymak"), hangi sayıdan kaç kart kaldığını bilir.
// - Pişti yapabiliyorsa yapar; aynı sayıyla alabiliyorsa alır, Vale'yi değerli yerler için saklar.
// - Atarken sıradaki rakibin o sayıyı (ya da Vale) tutma olasılığını hesaplar; boş yere pişti verecek kartı atmaz,
//   büyük yığına rakibin alabileceği kartı koymaz, değerli kartları (♦10, ♣2, As) riske atmaz.
// - Blöflü masada gerçek piştiyi kapalı atar, ara sıra blöf yapar; blöfe inanıp inanmamayı olasılıkla seçer.
// Bot hile yapmaz: yalnızca masada görünen kartları, kendi elini ve kendi tarafının gördüğü kapalı kartları bilir.
const L = require('./logic');

const CARD_W = 0.1; // kart fazlası (3 puan) için kart başına yaklaşık değer
const ALL = L.SUITS.flatMap(s => Array.from({ length: 13 }, (_, i) => `${s}${i + 2}`));
const rankOf = id => Number(id.slice(1));

// U bilinmeyen karttan h tanesi rakibin elindeyse, belli bir sayıdan u kartın en az birini tutma olasılığı.
function probHas(u, h, U) {
  if (u <= 0 || h <= 0 || U <= 0) return 0;
  if (h >= U) return 1;
  let none = 1;
  for (let i = 0; i < h; i++) none *= Math.max(0, U - u - i) / (U - i);
  return 1 - none;
}
const pileValue = pile => pile.reduce((n, x) => n + (x.closed ? 0.25 : L.cardPoints(x.card)) + CARD_W, 0); // kapalı kart ortalama ~0,25 puan

// view: { hand, pile: [{ card|null, closed }], seen: Set(id), next: { hand: sayı, known: [kart] }, deckLeft, bluff }
function unknownCounts(view) {
  const mine = new Set(view.hand.map(c => c.id)), byRank = new Map();
  let U = 0;
  for (const id of ALL) {
    if (mine.has(id) || view.seen.has(id)) continue;
    U++; byRank.set(rankOf(id), (byRank.get(rankOf(id)) || 0) + 1);
  }
  return { U, u: r => byRank.get(r) || 0 };
}
// Sıradaki rakibin belli bir sayıdan kart tutma olasılığı (bildiği kart varsa kesin).
function oppHas(view, unk, rank) {
  if (view.next.known?.some(c => c.rank === rank)) return 1;
  return probHas(unk.u(rank), view.next.hand - (view.next.known?.length || 0), unk.U);
}

function scorePlay(view, unk, card) {
  const { pile } = view, res = L.playResult(pile, card), late = view.deckLeft === 0;
  if (res.capture) {
    let gain = pileValue(pile) + L.cardPoints(card) + CARD_W + res.pisti;
    // Vale'yi ucuz yığın için harcama (sonra pişti veya büyük yığın almak için lazım).
    if (card.rank === L.JACK && pile[pile.length - 1].card?.rank !== L.JACK) gain -= late ? 0.3 : 1.4 + (pile.length <= 2 ? 0.8 : 0);
    return gain;
  }
  // Almadan atılırsa: kart yığına gider; sıradaki rakip aynısıyla ya da Vale ile alabilir.
  const after = pileValue(pile) + L.cardPoints(card) + CARD_W;
  const pRank = oppHas(view, unk, card.rank), pJack = card.rank === L.JACK ? pRank : oppHas(view, unk, L.JACK);
  let loss;
  if (!pile.length) loss = pRank * (after + (card.rank === L.JACK ? 20 : 10)) + (1 - pRank) * pJack * after * 0.6; // boş yere: pişti tehlikesi
  else loss = (1 - (1 - pRank) * (1 - pJack)) * after;
  if (card.rank === L.JACK) loss += late ? 0.5 : 2.5; // Vale'yi boşa atma
  return -loss - L.cardPoints(card) * 0.15;
}

function choosePlay(view) {
  const unk = unknownCounts(view);
  const top = view.pile.length === 1 && !view.pile[0].closed ? view.pile[0].card : null;
  // Blöflü masa: yerde tek açık kart varken eşi elindeyse kapalı at (inanılırsa 10, açılırsa 20).
  if (view.bluff && top) {
    const match = view.hand.find(c => c.rank === top.rank);
    if (match) return { cardId: match.id, closed: true };
    // Ara sıra blöf: değersiz, tehlikesiz bir kartla. Rakibin hiç kartı kalmadıysa (son el) blöf yapılmaz.
    if (view.next.hand > 0 && unk.u(top.rank) > 0 && (view.rand ?? Math.random)() < 0.18) {
      const cheap = view.hand.filter(c => c.rank !== L.JACK && L.cardPoints(c) === 0);
      if (cheap.length) return { cardId: cheap.sort((a, b) => unk.u(a.rank) - unk.u(b.rank))[0].id, closed: true };
    }
  }
  let best = null, bestScore = -Infinity;
  for (const c of view.hand) {
    const s = scorePlay(view, unk, c) - unk.u(c.rank) * 0.01; // eşitlikte "ölü" sayıyı (kalanı az) at
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return { cardId: best.id, closed: false };
}

// Blöfe cevap. view: { hand, seen, top (yerdeki kart), bluffer: { hand: kapalı kartı attıktan sonra kalan } , rand }
function chooseResponse(view) {
  const unk = unknownCounts({ hand: view.hand, seen: view.seen });
  // Kapalı kart bilinmeyenlerin içinde; iddia edenin atmadan önceki elinde eşini tutma olasılığı:
  const u = unk.u(view.top.rank);
  if (u === 0) return 'challenge'; // eşi kalmadı: kesin blöf
  const pHas = probHas(u, view.bluffer.hand + 1, unk.U);
  const bluffRate = 0.25, pReal = pHas / (pHas + (1 - pHas) * bluffRate);
  // İnanmak: rakip +10. Açmak: gerçekse rakip +20, blöfse biz +20. Açmanın beklentisi 20 − 40p > −10 ⇔ p < 0,75.
  return 20 - 40 * pReal > -10 ? 'challenge' : 'believe';
}

module.exports = { choosePlay, chooseResponse, probHas };
