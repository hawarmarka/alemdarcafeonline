'use strict';
// Batak kartları: kullanıcının gönderdiği klasik deste resmi (asset/cards/klasik-deste.jpg) tek bir "sprite" olarak kullanılır.
// Resimde 4 satır (sinek, maça, kupa, karo) × 13 sütun (2…10, J, Q, K, A); her kart 90×121 piksel,
// sütunlar 92, satırlar 124 piksel arayla. Kart elemanında yalnızca o kartın bölgesi gösterilir (CSS background-position).
// Arka yüz ve renk simgeleri (koz kutusu, koz seçimi) SVG ile çizilir.
window.BatakCards = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const SUIT_NAME = { S: 'Maça', H: 'Kupa', D: 'Karo', C: 'Sinek' };
  const ROW = { C: 0, S: 1, H: 2, D: 3 };
  const SPRITE = { x0: 1, y0: 157, dx: 92, dy: 124, w: 90, h: 121 };
  const SUIT_PATHS = {
    H: '<path d="M50 92C22 68 2 50 2 29 2 13 14 2 29 2c10 0 17 6 21 14 4-8 11-14 21-14 15 0 27 11 27 27 0 21-20 39-48 63z"/>',
    D: '<path d="M50 2 88 50 50 98 12 50z"/>',
    S: '<path d="M50 2C66 24 98 40 98 63c0 15-11 25-25 25-9 0-16-4-20-10 1 10 5 17 13 22H34c8-5 12-12 13-22-4 6-11 10-20 10C13 88 2 78 2 63 2 40 34 24 50 2z"/>',
    C: '<circle cx="50" cy="27" r="22"/><circle cx="25" cy="60" r="22"/><circle cx="75" cy="60" r="22"/><path d="M44 56c0 22-5 34-14 42h40c-9-8-14-20-14-42z"/>',
  };
  function installSprite() {
    if (document.getElementById('bkSuitSprite')) return;
    const svg = document.createElementNS(NS, 'svg');
    svg.id = 'bkSuitSprite'; svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
    svg.innerHTML = '<defs>' + Object.entries(SUIT_PATHS).map(([s, p]) => `<symbol id="bk-${s}" viewBox="0 0 100 100">${p}</symbol>`).join('') +
      '<pattern id="bkBackPat" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#1d4f9a"/><path d="M0 6h12M6 0v12" stroke="#fff" stroke-width="1.2" opacity=".55"/><circle cx="6" cy="6" r="1.6" fill="#fff" opacity=".8"/></pattern></defs>';
    document.body.prepend(svg);
  }
  // Arka yüz: beyaz kenar içinde klasik lacivert kafes deseni (deste resmiyle aynı oran).
  const BACK = `<svg viewBox="0 0 90 121" preserveAspectRatio="none" xmlns="${NS}" aria-hidden="true"><rect x=".75" y=".75" width="88.5" height="119.5" rx="4" fill="#fff" stroke="#1a1a1a" stroke-width="1.5"/>
    <rect x="5" y="5" width="80" height="111" rx="2" fill="url(#bkBackPat)" stroke="#0e2f63" stroke-width="1"/></svg>`;
  function el(card, cls = '') {
    installSprite();
    const d = document.createElement('div');
    d.className = 'card ' + cls;
    if (!card) { d.classList.add('back'); d.innerHTML = BACK; return d; }
    d.classList.add('face');
    d.dataset.id = card.id;
    d.setAttribute('role', 'img');
    d.setAttribute('aria-label', `${SUIT_NAME[card.suit]} ${RANK[card.rank] || card.rank}`);
    d.style.setProperty('--sx', String(SPRITE.x0 + SPRITE.dx * (card.rank - 2)));
    d.style.setProperty('--sy', String(SPRITE.y0 + SPRITE.dy * ROW[card.suit]));
    return d;
  }
  return { el, SUIT_NAME, RANK, install: installSprite };
})();
