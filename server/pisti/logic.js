'use strict';
// Pişti kuralları (saf fonksiyonlar; oda/socket yok). 52 kart; 2 ya da 4 oyuncu. Oyun yönü saatin tersi
// (sıra numarası 0 → 1 → …; ekranda sıradaki oyuncu sağda). Eşlide karşılıklı oturanlar takım (0-2, 1-3).
// Kart: { id: 'S14', suit: 'S'|'H'|'D'|'C', rank: 2..14 } (11 = Vale/J, 14 = As).
const crypto = require('node:crypto');

const SUITS = ['S', 'H', 'D', 'C'];
const JACK = 11;
const TYPES = {
  ikili: { players: 2, team: false },
  dortlu: { players: 4, team: false },
  esli: { players: 4, team: true },
};
const TARGETS = [101, 151, 171, 201];
const HAND = 4; // her dağıtımda kişi başı kart

function newDeck() {
  const deck = [];
  for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) deck.push({ id: `${suit}${rank}`, suit, rank });
  for (let i = deck.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
// Kart puanı: As 1, Vale 1, Sinek 2 ("güzel ikili") 2, Karo 10 ("güzel onlu") 3. Toplam 13.
const cardPoints = c => (c.rank === 14 || c.rank === JACK ? 1 : c.id === 'C2' ? 2 : c.id === 'D10' ? 3 : 0);

// Dağıtım: dağıtanın sağından (dealer+1) başlayarak saatin tersine herkese 4'er kart; dağıtan en son alır.
// Böylece destenin altındaki açık kart son dağıtımda dağıtana gelir.
function dealHands(deck, n, dealer, hands = Array.from({ length: n }, () => [])) {
  for (let k = 1; k <= n; k++) hands[(dealer + k) % n].push(...deck.splice(0, HAND));
  return hands;
}
// Bir oyuncuya aynı sayıdan 3 kart gelirse dağıtım düşer (yeniden dağıtılır).
const threeOfKind = hand => hand.some(c => hand.filter(x => x.rank === c.rank).length >= 3);

// El başı: ortaya 4 kart (3'ü kapalı, en üstteki açık ve Vale değil), herkese 4'er kart.
// Açılan kart Vale ise kapalılardan Vale olmayan biri açılır; 4'ü de Vale ise ya da ilk dağıtımda birine aynı sayıdan
// 3 kart geldiyse kartlar yeniden karıştırılır. deckIn: testler için sabit deste (bozuksa yeni karıştırılır).
function setupRound(n, dealer, deckIn = null) {
  for (let tries = 0; tries < 50; tries++) {
    const deck = deckIn && !tries ? [...deckIn] : newDeck();
    const center = deck.splice(0, 4);
    if (center.every(c => c.rank === JACK)) continue;
    if (center[3].rank === JACK) { const i = [2, 1, 0].find(k => center[k].rank !== JACK); [center[i], center[3]] = [center[3], center[i]]; }
    const hands = dealHands(deck, n, dealer);
    if (hands.some(threeOfKind)) continue;
    return { deck, pile: center.map((card, i) => ({ card, closed: i < 3 })), hands };
  }
  throw Error('Pişti dağıtımı yapılamadı.');
}

// Atılan kartın sonucu: yerdeki en üst kartın aynısı ya da Vale yerdekilerin hepsini alır.
// Pişti: yerde tek (açık) kart varken aynısını atmak: 10 puan; Vale üstüne Vale 20 puan. Vale ile başka karta pişti olmaz.
function playResult(pile, card) {
  if (!pile.length) return { capture: false, pisti: 0 };
  const top = pile[pile.length - 1].card, match = top.rank === card.rank;
  if (!match && card.rank !== JACK) return { capture: false, pisti: 0 };
  const pisti = pile.length === 1 && !pile[0].closed && match ? (card.rank === JACK ? 20 : 10) : 0;
  return { capture: true, pisti };
}
// Blöflü pişti: kapalı atılan kartın puanı. Yerdeki kart Vale ise 2 katı.
// İnanılırsa iddia eden 10; açılırsa kartlar eşleşiyorsa iddia eden, eşleşmiyorsa açan 20 alır.
function bluffPoints(top, kind) { return (kind === 'believe' ? 10 : 20) * (top.rank === JACK ? 2 : 1); }

// El sonu puanı. sides: [{ cards: [kart], bonus: sayı (pişti/blöf puanları) }].
// Kart fazlası: en çok kart toplayan 3 puan alır; eşitse eşitlerden puanı fazla olan alır, o da eşitse kimse almaz.
function roundScores(sides) {
  const rows = sides.map(s => ({ cards: s.cards.length, cardPts: s.cards.reduce((n, c) => n + cardPoints(c), 0), pistiPts: s.bonus || 0, most: 0 }));
  const maxCards = Math.max(...rows.map(r => r.cards));
  let lead = rows.map((r, i) => i).filter(i => rows[i].cards === maxCards);
  if (lead.length > 1) {
    const pts = i => rows[i].cardPts + rows[i].pistiPts, best = Math.max(...lead.map(pts));
    lead = lead.filter(i => pts(i) === best);
  }
  if (lead.length === 1 && maxCards > 0) rows[lead[0]].most = 3;
  for (const r of rows) r.total = r.cardPts + r.pistiPts + r.most;
  return rows;
}

module.exports = { SUITS, JACK, TYPES, TARGETS, HAND, newDeck, cardPoints, dealHands, threeOfKind, setupRound, playResult, bluffPoints, roundScores };
