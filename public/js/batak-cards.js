'use strict';
// Gerçek iskambil kartı çizimi (SVG): iki köşede değer ve renk, 2-10 için standart taş (pip) dizilimi,
// As için büyük ortada simge, J/Q/K için çerçeveli, ayna simetrili resimli yüz. Arka yüz desenli.
// Kartlar bir kez çizilir ve önbelleğe alınır (her yeniden çizimde SVG baştan kurulmaz).
window.BatakCards = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const RED = '#c4161c', BLACK = '#161616';
  // Renk simgeleri (100×100 kutu); bir kez <symbol> olarak sayfaya eklenir, kartlar <use> ile kullanır.
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
      '<pattern id="bkBackPat" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="#123f7a"/><path d="M0 8h16M8 0v16" stroke="#2a64ad" stroke-width="3"/><circle cx="8" cy="8" r="2.4" fill="#f2c14e"/></pattern>' +
      '<pattern id="bkFacePat" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#fbf6e9"/><path d="M0 5h10" stroke="#efe2c0" stroke-width="2"/></pattern>' +
      '<linearGradient id="bkCardBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f3efe6"/></linearGradient></defs>';
    document.body.prepend(svg);
  }
  const use = (s, x, y, size, flip, color) => `<use href="#bk-${s}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="${color}"${flip ? ` transform="rotate(180 ${x} ${y})"` : ''}/>`;
  // Pip dizilimi (200×280 kartta): sütunlar ve satırlar gerçek destelerdeki gibi; alt yarıdakiler ters çevrilir.
  const L = 66, M = 100, R = 134;
  const PIPS = {
    2: [[M, 62], [M, 218]], 3: [[M, 62], [M, 140], [M, 218]],
    4: [[L, 62], [R, 62], [L, 218], [R, 218]], 5: [[L, 62], [R, 62], [M, 140], [L, 218], [R, 218]],
    6: [[L, 62], [R, 62], [L, 140], [R, 140], [L, 218], [R, 218]],
    7: [[L, 62], [R, 62], [M, 101], [L, 140], [R, 140], [L, 218], [R, 218]],
    8: [[L, 62], [R, 62], [M, 101], [L, 140], [R, 140], [M, 179], [L, 218], [R, 218]],
    9: [[L, 62], [R, 62], [L, 114], [R, 114], [M, 140], [L, 166], [R, 166], [L, 218], [R, 218]],
    10: [[L, 62], [R, 62], [M, 88], [L, 114], [R, 114], [L, 166], [R, 166], [M, 192], [L, 218], [R, 218]],
  };
  function corner(rank, suit, color) {
    const label = RANK[rank] || String(rank);
    const one = `<text x="22" y="44" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="${label.length > 1 ? 34 : 40}" fill="${color}" letter-spacing="-2">${label}</text>${use(suit, 22, 66, 26, false, color)}`;
    return one + `<g transform="rotate(180 100 140)">${one}</g>`;
  }
  // Resimli kart: çerçeve içinde üst yarıya figür, alt yarıya aynısı ters (gerçek kartlardaki gibi).
  function face(rank, suit, color) {
    const robe = color === RED ? '#c4161c' : '#1d4f9a', trim = '#e2a91f', skin = '#f6d2a8', hair = rank === 12 ? '#6b3a12' : '#3a2410';
    const crown = rank === 13 ? '<path d="M78 58l6-18 10 12 6-16 6 16 10-12 6 18z" fill="#f2c14e" stroke="#8a5a06" stroke-width="2"/>'
      : rank === 12 ? '<path d="M80 60q20-26 40 0z" fill="#f2c14e" stroke="#8a5a06" stroke-width="2"/><circle cx="100" cy="44" r="4" fill="#c4161c"/>'
      : '<path d="M78 60q22-20 44 0l-4-8q-18-10-36 0z" fill="' + robe + '" stroke="#111" stroke-width="1.5"/><circle cx="122" cy="52" r="5" fill="#f2c14e"/>';
    const half = `<g>
      <path d="M60 138c4-34 18-48 40-48s36 14 40 48z" fill="${robe}" stroke="#111" stroke-width="2"/>
      <path d="M86 92l14 30 14-30" fill="none" stroke="${trim}" stroke-width="5"/>
      <path d="M64 130h72" stroke="${trim}" stroke-width="4"/>
      <ellipse cx="100" cy="74" rx="17" ry="19" fill="${skin}" stroke="#111" stroke-width="1.8"/>
      <path d="M83 70q2-18 17-18t17 18q-6-8-17-8t-17 8z" fill="${hair}"/>
      <circle cx="94" cy="74" r="1.8" fill="#111"/><circle cx="106" cy="74" r="1.8" fill="#111"/>
      <path d="M95 83q5 4 10 0" fill="none" stroke="#8a2a12" stroke-width="1.8"/>
      ${rank === 13 ? '<path d="M88 86q12 14 24 0q-2 12-12 14q-10-2-12-14z" fill="' + hair + '"/>' : ''}
      ${crown}
      ${use(suit, 126, 110, 22, false, color === RED ? '#fff' : '#f2c14e')}
    </g>`;
    return `<rect x="38" y="30" width="124" height="220" rx="6" fill="url(#bkFacePat)" stroke="${color}" stroke-width="3"/>
      <rect x="44" y="36" width="112" height="208" rx="4" fill="none" stroke="${trim}" stroke-width="1.5"/>
      <clipPath id="clip-${rank}${suit}"><rect x="44" y="36" width="112" height="208" rx="4"/></clipPath>
      <g clip-path="url(#clip-${rank}${suit})">${half}<g transform="rotate(180 100 140)">${half}</g></g>
      <path d="M44 140h112" stroke="${trim}" stroke-width="2"/>`;
  }
  const cache = new Map();
  function faceSVG(card) {
    const key = card.id;
    if (cache.has(key)) return cache.get(key);
    const color = card.suit === 'H' || card.suit === 'D' ? RED : BLACK;
    let body;
    if (card.rank === 14) body = use(card.suit, 100, 140, card.suit === 'S' ? 104 : 84, false, color) + (card.suit === 'S' ? '<circle cx="100" cy="140" r="64" fill="none" stroke="#161616" stroke-width="2" stroke-dasharray="3 5"/>' : '');
    else if (card.rank > 10) body = face(card.rank, card.suit, color);
    else body = PIPS[card.rank].map(([x, y]) => use(card.suit, x, y, 40, y > 140, color)).join('');
    const svg = `<svg viewBox="0 0 200 280" xmlns="${NS}" aria-hidden="true"><rect x="2" y="2" width="196" height="276" rx="16" fill="url(#bkCardBg)" stroke="#b9b2a2" stroke-width="2"/>${body}${corner(card.rank, card.suit, color)}</svg>`;
    cache.set(key, svg);
    return svg;
  }
  const BACK = `<svg viewBox="0 0 200 280" xmlns="${NS}" aria-hidden="true"><rect x="2" y="2" width="196" height="276" rx="16" fill="#fff" stroke="#b9b2a2" stroke-width="2"/>
    <rect x="12" y="12" width="176" height="256" rx="10" fill="url(#bkBackPat)" stroke="#f2c14e" stroke-width="4"/>
    <circle cx="100" cy="140" r="34" fill="#0b2a55" stroke="#f2c14e" stroke-width="4"/>
    <text x="100" y="156" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="46" fill="#f2c14e">A</text></svg>`;
  // Kart elemanı: <div class="card"> içinde SVG; data-id ve erişilebilir ad taşır.
  const SUIT_NAME = { S: 'Maça', H: 'Kupa', D: 'Karo', C: 'Sinek' };
  function el(card, cls = '') {
    installSprite();
    const d = document.createElement('div');
    d.className = 'card ' + cls;
    if (!card) { d.classList.add('back'); d.innerHTML = BACK; return d; }
    d.dataset.id = card.id;
    d.setAttribute('role', 'img');
    d.setAttribute('aria-label', `${SUIT_NAME[card.suit]} ${RANK[card.rank] || card.rank}`);
    d.innerHTML = faceSVG(card);
    return d;
  }
  return { el, SUIT_NAME, RANK };
})();
