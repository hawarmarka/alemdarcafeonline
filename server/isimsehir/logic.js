'use strict';
// İsim Şehir kuralları (saf fonksiyonlar). Harf seçimi ve el puanı.
// Puan (her kategori ayrı): geçerli cevabı olan tek kişiysen 20; geçerli cevabın başkasınınkinden farklıysa 10;
// başka biriyle aynı cevabı verdiysen 5; boş ya da geçersizse 0. Eşlide takım puanı iki oyuncunun toplamıdır.
const crypto = require('node:crypto');
const W = require('./words');

// Türk alfabesi; Ğ ve J çıkmaz (oyun klasiği). Aynı oyunda bir harf iki kez gelmez.
const LETTERS = ['A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'G', 'H', 'I', 'İ', 'K', 'L', 'M', 'N', 'O', 'Ö', 'P', 'R', 'S', 'Ş', 'T', 'U', 'Ü', 'V', 'Y', 'Z'];
const SIZES = [2, 4, 6, 8, 10];
const ROUNDS = [5, 10];
const TIMES = [45, 60, 90];
function pickLetter(used = []) {
  const left = LETTERS.filter(l => !used.includes(l));
  return (left.length ? left : LETTERS)[crypto.randomInt((left.length ? left : LETTERS).length)];
}
// verdicts[i][cat] = { valid, canonical, text } → points[i][cat]
function scoreRound(verdicts) {
  const points = verdicts.map(() => ({}));
  for (const cat of W.CATEGORIES) {
    const valid = verdicts.map((v, i) => (v[cat]?.valid ? { i, key: W.norm(v[cat].canonical || v[cat].text) } : null)).filter(Boolean);
    verdicts.forEach((v, i) => { points[i][cat] = 0; });
    for (const a of valid) points[a.i][cat] = valid.length === 1 ? 20 : valid.some(b => b.i !== a.i && b.key === a.key) ? 5 : 10;
  }
  return points;
}
const sum = p => W.CATEGORIES.reduce((n, c) => n + (p[c] || 0), 0);
module.exports = { LETTERS, SIZES, ROUNDS, TIMES, pickLetter, scoreRound, sum };
