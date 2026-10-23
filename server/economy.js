'use strict';
// Masa bahsi ve maç sonu çip dağıtımı (sanal çip, gerçek para yok). 101 Okey Plus'taki kurala göre:
// - Çip değişimi her elde değil, maç (1-4 el) bitince olur. Herkes başta masanın bahsini ortaya koyar (pot = 4 × bahis).
// - Sıralamaya yalnızca maç boyunca en az bir kez elini açan oyuncular girer; düşük toplam ceza önde.
// - Tek kişi açtıysa bütün potu o alır. Birden çok açan varsa birinci potun 3/4'ünü, ikinci 1/4'ünü alır.
//   Eşit cezalı oyuncular, işgal ettikleri sıraların payını eşit paylaşır.
// - Eşli oyunda birim takımdır: elini açmış ve toplamı düşük olan takım bütün potu alır (iki ortağa eşit); eşitlikte iade.
// - Hiç kimse açmadıysa herkesin bahsi iade edilir (ücret alınmaz).
// - Kazananın aldığından %7 masa ücreti kesilir.
const BET_LEVELS = [1000, 5000, 25000, 100000];
const DEFAULT_BET = 1000;
const FEE_RATE = 0.07;
const normalizeBet = bet => (BET_LEVELS.includes(Number(bet)) ? Number(bet) : DEFAULT_BET);

// totals: koltuk başına maç toplam cezası, opened: koltuk başına "en az bir kez açtı mı".
// Dönen dizi: koltuk başına { gross, fee, payout } (payout = gross - fee, potun kendisinden).
function settle({ bet, teamMode, totals, opened }) {
  const pot = bet * 4, gross = [0, 0, 0, 0];
  if (teamMode) {
    const teams = [[0, 2], [1, 3]].map(seats => ({ seats, total: seats.reduce((n, s) => n + (totals[s] || 0), 0), opened: seats.some(s => opened[s]) }));
    const live = teams.filter(t => t.opened);
    let winners = [];
    if (live.length === 1) winners = live;
    else if (live.length === 2) winners = live[0].total === live[1].total ? [] : [live[0].total < live[1].total ? live[0] : live[1]];
    if (!winners.length) return refund(bet);
    for (const s of winners[0].seats) gross[s] = pot / 2;
  } else {
    const ranked = [0, 1, 2, 3].filter(s => opened[s]).sort((a, b) => totals[a] - totals[b]);
    if (!ranked.length) return refund(bet);
    if (ranked.length === 1) gross[ranked[0]] = pot;
    else {
      const shares = [0.75, 0.25];
      for (let i = 0; i < ranked.length && i < shares.length;) {
        // Aynı cezayı alanlar grubu: kapladıkları sıraların payını eşit bölüşür.
        let j = i; while (j + 1 < ranked.length && totals[ranked[j + 1]] === totals[ranked[i]]) j++;
        const slotShare = shares.slice(i, j + 1).reduce((n, x) => n + x, 0);
        for (let k = i; k <= j; k++) gross[ranked[k]] += (pot * slotShare) / (j - i + 1);
        i = j + 1;
      }
    }
  }
  return gross.map(g => { const fee = Math.floor(g * FEE_RATE); return { gross: Math.floor(g), fee, payout: Math.floor(g) - fee }; });
}
function refund(bet) { return [0, 1, 2, 3].map(() => ({ gross: bet, fee: 0, payout: bet, refund: true })); }
module.exports = { BET_LEVELS, DEFAULT_BET, FEE_RATE, normalizeBet, settle };
