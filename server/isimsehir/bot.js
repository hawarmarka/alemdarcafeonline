'use strict';
// İsim Şehir botu: cevaplarını yerleşik sözlükten seçer. Her bot bir "bilgi" düzeyiyle kategorinin bir kısmını boş bırakabilir;
// ne zaman bitireceği turun süresine göre rastgele (en erken sürenin %55'i). Sık kullanılan kelimeyi seçme eğilimi yok:
// aynı harfte iki bot çoğu zaman farklı kelime yazar (aynı yazarlarsa ikisi de 5 puan alır, insan oyuncu gibi).
const crypto = require('node:crypto');
const W = require('./words');

const byLetter = new Map(); // `${kategori}:${harf}` → kelimeler
function words(cat, letter) {
  const k = `${cat}:${letter}`;
  if (!byLetter.has(k)) byLetter.set(k, W.LIST[cat].filter(w => W.lower(w).startsWith(W.lower(letter))));
  return byLetter.get(k);
}
// skill 0..1: bir kategoriyi bilme olasılığı.
function answers(letter, skill = 0.8, rand = Math.random) {
  const out = {};
  for (const cat of W.CATEGORIES) {
    const list = words(cat, letter);
    out[cat] = list.length && rand() < skill ? list[Math.floor(rand() * list.length)] : '';
  }
  return out;
}
// Bitirme anı (turun başından ms) ve "bitirdim" deyip demeyeceği.
function plan(timeMs, rand = Math.random) {
  const at = Math.round(timeMs * (0.55 + rand() * 0.4));
  return { at, declare: rand() < 0.45 };
}
const randomSkill = () => 0.62 + crypto.randomInt(30) / 100; // 0,62–0,91
module.exports = { answers, plan, words, randomSkill };
