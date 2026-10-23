'use strict';
// Batak kuralları (saf fonksiyonlar; oda/socket yok). 52 kart, 4 oyuncu, her birine 13 kart, oyun yönü saatin tersi
// (koltuk sırası 0 → 1 → 2 → 3; ekranda bir sonraki oyuncu sağda).
// Türler: 'ihaleli' (tekli, ihale en az 5, kimse girmezse dağıtanın sağındakine 4), 'kozmaca' (koz her zaman maça,
// herkes kaç el alacağını söyler, 0 = "el almaz"), 'esli' (karşılıklı oturanlar takım, ihale en az 8, kimse girmezse dağıtana 7).
const crypto = require('node:crypto');

const SUITS = ['S', 'H', 'D', 'C']; // Maça, Kupa, Karo, Sinek
const SUIT_NAMES = { S: 'Maça', H: 'Kupa', D: 'Karo', C: 'Sinek' };
const RANK_NAMES = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const TYPES = {
  ihaleli: { team: false, minBid: 5, forcedBid: 4, forcedSeat: 'right', declare: false },
  kozmaca: { team: false, declare: true, fixedTrump: 'S' },
  esli: { team: true, minBid: 8, forcedBid: 7, forcedSeat: 'dealer', declare: false },
};
const ROUND_LIMITS = [5, 7, 9, 11];

const cardName = c => `${SUIT_NAMES[c.suit]} ${RANK_NAMES[c.rank] || c.rank}`;
function newDeck() {
  const deck = [];
  for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) deck.push({ id: `${suit}${rank}`, suit, rank });
  for (let i = deck.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
// Dağıtım saatin tersine birer birer: dağıtanın sağındaki (dealer+1) ilk kartı alır.
function deal(dealer, deck = newDeck()) {
  const hands = [[], [], [], []];
  deck.forEach((card, i) => hands[(dealer + 1 + i) % 4].push(card));
  return hands.map(sortHand);
}
// Elde gösterim sırası: Maça, Kupa, Sinek, Karo (renkler sırayla kırmızı/siyah), her renkte büyükten küçüğe.
const HAND_ORDER = { S: 0, H: 1, C: 2, D: 3 };
function sortHand(hand) { return [...hand].sort((a, b) => HAND_ORDER[a.suit] - HAND_ORDER[b.suit] || b.rank - a.rank); }
// "El iptal": elinde 10'dan büyük kart (J, Q, K, A) olmayan oyuncu yeniden dağıtım isteyebilir.
const canCancel = hand => hand.length === 13 && !hand.some(c => c.rank > 10);

// Yerdeki elin şu an kazananı: koz oynandıysa en büyük koz, yoksa açılan renkten en büyük kart.
function trickWinner(trick, trump) {
  let best = trick[0];
  for (const play of trick.slice(1)) {
    const a = play.card, b = best.card;
    if (a.suit === b.suit ? a.rank > b.rank : a.suit === trump) best = play;
  }
  return best;
}
// Oynanabilir kartlar:
// - El açan: koz henüz oynanmadıysa (kırılmadıysa) koz açamaz; elinde yalnızca koz varsa açabilir.
// - Açılan rengi takip etmek zorunlu; yer kozlanmadıysa geçebiliyorsa büyütmek (daha büyük kart atmak) zorunlu.
// - Açılan renk yoksa koz atmak zorunlu; yerde koz varsa geçebiliyorsa büyütmek zorunlu.
// - Ne renk ne koz varsa herhangi bir kart (çöp).
function legalCards(hand, trick, trump, trumpBroken) {
  if (!trick.length) {
    const nonTrump = hand.filter(c => c.suit !== trump);
    return trumpBroken || !nonTrump.length ? [...hand] : nonTrump;
  }
  const led = trick[0].card.suit, top = trickWinner(trick, trump).card;
  const follow = hand.filter(c => c.suit === led);
  if (follow.length) {
    if (top.suit !== led) return follow; // yer kozlandı: renkten herhangi bir kart
    const higher = follow.filter(c => c.rank > top.rank);
    return higher.length ? higher : follow;
  }
  const trumps = hand.filter(c => c.suit === trump);
  if (trumps.length) {
    if (top.suit !== trump) return trumps;
    const higher = trumps.filter(c => c.rank > top.rank);
    return higher.length ? higher : trumps;
  }
  return [...hand];
}

// ---------- İhale ----------
// İhaleli/eşli: sırayla ihale (öncekinden büyük, en az minBid, en çok 13) ya da pas. Pas diyen bir daha giremez.
// Bir kişi dışında herkes pas dediyse ihale onundur. Herkes pas derse zorunlu ihale (forcedBid) kurala göre bir kişiye kalır.
// Koz maça: herkes sırayla 0..13 söyler (0 = el almaz).
// Sıradaki ihaleci: pas dememiş bir sonraki oyuncu (saatin tersi).
function nextBidder(b, from) {
  for (let k = 1; k <= 4; k++) { const s = (from + k) % 4; if (!b.passed[s]) return s; }
  return -1;
}
function startBidding(type, dealer) {
  return { type, dealer, turn: (dealer + 1) % 4, bids: [null, null, null, null], passed: [false, false, false, false], high: null, done: false, contract: null };
}
// Döner: hata metni ya da null. b yerinde güncellenir; ihale bitince b.done = true ve b.contract = { seat, bid, forced }.
function placeBid(b, seat, value) {
  const rule = TYPES[b.type];
  if (b.done) return 'İhale bitti.';
  if (seat !== b.turn) return 'Sıra sizde değil.';
  if (rule.declare) {
    if (!Number.isInteger(value) || value < 0 || value > 13) return '0 ile 13 arasında bir sayı söyleyin.';
    b.bids[seat] = value;
    if (b.bids.every(v => v != null)) { b.done = true; b.contract = null; return null; }
    b.turn = (seat + 1) % 4;
    return null;
  }
  if (value == null) b.passed[seat] = true;
  else {
    const floor = b.high ? b.high.bid + 1 : rule.minBid;
    if (!Number.isInteger(value) || value < floor || value > 13) return `En az ${floor}, en çok 13 diyebilirsiniz.`;
    b.bids[seat] = value; b.high = { seat, bid: value };
  }
  const active = [0, 1, 2, 3].filter(s => !b.passed[s]);
  if (b.high && active.length === 1 && active[0] === b.high.seat) { b.done = true; b.contract = { seat: b.high.seat, bid: b.high.bid, forced: false }; return null; }
  if (!active.length) {
    const forcedSeat = rule.forcedSeat === 'dealer' ? b.dealer : (b.dealer + 1) % 4;
    b.done = true; b.contract = { seat: forcedSeat, bid: rule.forcedBid, forced: true }; return null;
  }
  b.turn = nextBidder(b, seat);
  return null;
}

// ---------- Puan ----------
// Taahhüdü tuttu: 10 × taahhüt + (alınan − taahhüt). Tutmadı: −10 × taahhüt.
// İhaleli/eşli: ihaleye girmeyen oyuncu (takım) el aldıysa aldığı el sayısı kadar, hiç almadıysa −10 × ihale.
// Koz maça "el almaz" (0): hiç almadıysa +50, aldıysa −50.
const contractScore = (bid, taken) => taken >= bid ? 10 * bid + (taken - bid) : -10 * bid;
function roundScores(type, tricks, bids, contract) {
  if (TYPES[type].declare) return tricks.map((t, s) => bids[s] === 0 ? (t === 0 ? 50 : -50) : contractScore(bids[s], t));
  if (TYPES[type].team) {
    const team = s => s % 2, taken = [tricks[0] + tricks[2], tricks[1] + tricks[3]];
    const own = team(contract.seat);
    const teamScore = [0, 1].map(t => t === own ? contractScore(contract.bid, taken[t]) : (taken[t] ? taken[t] : -10 * contract.bid));
    return [0, 1, 2, 3].map(s => teamScore[team(s)]);
  }
  return tricks.map((t, s) => s === contract.seat ? contractScore(contract.bid, t) : (t ? t : -10 * contract.bid));
}

module.exports = { SUITS, SUIT_NAMES, TYPES, ROUND_LIMITS, newDeck, deal, sortHand, canCancel, trickWinner, legalCards,
  startBidding, placeBid, roundScores, contractScore, cardName };
