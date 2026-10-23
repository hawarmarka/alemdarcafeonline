'use strict';
// Monte Carlo bot kararı: açmadan önce hangi taşı atarsa eli açma şansı en yüksek olur?
// Her aday atış için görünmeyen taşlardan rastgele gelecekler (çekişler ve soldaki oyuncunun atacağı taşlar) üretilir,
// bot o geleceği basit bir kuralla oynar ve açıp açamadığına bakılır. Bütün adaylar aynı rastgele geleceklerle denenir
// (ortak rastgele sayılar; adaylar arasındaki fark şanstan değil karardan gelsin).
// Saf fonksiyonlardır: oda/oyun nesnesine bağlı değildir; hem worker_threads içinde (botWorker.js) hem doğrudan çağrılabilir.
const Melds = require('../public/js/meldSolver');

// Basit, tohumlu rastgele sayı üreteci (aynı girdide aynı karar; test ve ölçüm tekrarlanabilsin).
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const kindOf = (t, okey) => t.isFakeJoker ? `${okey.color}:${okey.number}` : `${t.color}:${t.number}`;
const isOkey = (t, okey) => !t.isFakeJoker && t.color === okey.color && t.number === okey.number;
const eff = (t, okey) => t.isFakeJoker ? { color: okey.color, number: okey.number } : t;

// Çift sayısı (GameLogic.countPairs ile aynı kural): doğal çiftler, okey eşsiz bir taşla, artan iki okey kendi arasında.
function pairCount(hand, okey) {
  const seen = new Map(); let pairs = 0, singles = 0, okeys = 0;
  for (const t of hand) {
    if (isOkey(t, okey)) { okeys++; continue; }
    const k = kindOf(t, okey); seen.set(k, (seen.get(k) || 0) + 1);
  }
  for (const n of seen.values()) { pairs += n >> 1; singles += n & 1; }
  const withOkey = Math.min(okeys, singles);
  return pairs + withOkey + ((okeys - withOkey) >> 1);
}
// Açılabiliyor mu? Seri (101 veya katlamalı sınır) ya da çift (5 veya katlamalı sınır). Elde en az bir taş kalmalı.
function canOpen(hand, okey, need, minPairs, requiredId) {
  if (Math.min(pairCount(hand, okey), Math.floor((hand.length - 1) / 2)) >= minPairs) return { ok: true };
  const r = Melds.solve(hand, okey, requiredId || null, true);
  return { ok: r.score >= need, score: r.score };
}
// Benzetimdeki basit atış kuralı: en az işe yarayan taş (botun kendi "usefulness" ölçüsünün aynısı), eşitse düşük taş.
function rolloutDiscard(hand, okey, pairsPlan) {
  let best = -1, bestScore = Infinity;
  for (let i = 0; i < hand.length; i++) {
    const t = hand[i]; if (isOkey(t, okey)) continue;
    const a = eff(t, okey); let u = 0;
    for (let j = 0; j < hand.length; j++) {
      if (j === i || isOkey(hand[j], okey)) continue;
      const b = eff(hand[j], okey);
      if (a.color === b.color && a.number === b.number) { u += pairsPlan ? 4 : 1; continue; }
      if (pairsPlan) continue;
      const gap = Math.abs(a.number - b.number);
      if (a.color === b.color && gap === 1) u += 3;
      else if (a.color === b.color && gap === 2) u += 1;
      else if (a.color !== b.color && gap === 0) u += 2;
    }
    const score = u * 20 + a.number;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best < 0 ? 0 : best;
}
// Bir aday için bir gelecek: draws[k] kendi çekişlerim, lefts[k] soldaki oyuncunun o tur atacağı taş.
function simulate(hand, okey, need, minPairs, draws, lefts) {
  let h = hand;
  for (let k = 0; k < draws.length; k++) {
    const left = lefts[k];
    if (left && !isOkey(left, okey)) {
      // Yerden alınan taş açılışta kullanılmalı: çiftte çift sayısını artırmalı, seride gruba girmeli.
      const withLeft = [...h, left];
      const pairsOk = pairCount(withLeft, okey) > pairCount(h, okey) && Math.min(pairCount(withLeft, okey), Math.floor((withLeft.length - 1) / 2)) >= minPairs;
      if (pairsOk || Melds.solve(withLeft, okey, left.id, true).score >= need) return 1 - k * 0.04;
    }
    h = [...h, draws[k]];
    const o = canOpen(h, okey, need, minPairs);
    if (o.ok) return 1 - k * 0.04; // erken açmak daha iyi (bitirmeye vakit kalır)
    const pairsPlan = pairCount(h, okey) >= 5 || (pairCount(h, okey) >= 4 && o.score < 85);
    h = h.filter((_, i) => i !== rolloutDiscard(h, okey, pairsPlan));
  }
  return 0;
}
// input: { hand, okey, unseen: [taş], candidates: [id], myDraws, need, minPairs, samples, seed }
// Döner: { id, scores: { id: açma olasılığı } } — candidates'tan en iyisi.
function chooseDiscard(input) {
  const { hand, okey, unseen, candidates, need, minPairs } = input;
  const samples = Math.max(1, input.samples || 40);
  const draws = Math.max(0, Math.min(input.myDraws, 8));
  const random = rng(input.seed || 12345);
  const scores = Object.fromEntries(candidates.map(id => [id, 0]));
  if (!draws || unseen.length < draws * 2) return { id: candidates[0], scores };
  const pool = [...unseen];
  for (let s = 0; s < samples; s++) {
    // Kısmi karıştırma: yalnızca kullanılacak ilk 2×draws taş seçilir.
    for (let i = 0; i < draws * 2; i++) { const j = i + Math.floor(random() * (pool.length - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const future = pool.slice(0, draws), lefts = pool.slice(draws, draws * 2);
    for (const id of candidates) scores[id] += simulate(hand.filter(t => t.id !== id), okey, need, minPairs, future, lefts);
  }
  let best = candidates[0];
  for (const id of candidates) { scores[id] /= samples; if (scores[id] > scores[best] + 1e-9) best = id; }
  return { id: best, scores };
}
module.exports = { chooseDiscard, pairCount, canOpen, simulate };
