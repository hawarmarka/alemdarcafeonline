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
      '<pattern id="bkBackPat" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#1d4f9a"/><path d="M0 6h12M6 0v12" stroke="#fff" stroke-width="1.2" opacity=".55"/><circle cx="6" cy="6" r="1.6" fill="#fff" opacity=".8"/></pattern>' +
      '<pattern id="bkFacePat" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#fbf6e9"/><path d="M0 5h10" stroke="#efe2c0" stroke-width="2"/></pattern>' +
      '<linearGradient id="bkCardBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f3efe6"/></linearGradient></defs>';
    document.body.prepend(svg);
  }
  const use = (s, x, y, size, flip, color) => `<use href="#bk-${s}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="${color}"${flip ? ` transform="rotate(180 ${x} ${y})"` : ''}/>`;
  // Pip dizilimi (200×280 kartta): sütunlar ve satırlar gerçek destelerdeki gibi; alt yarıdakiler ters çevrilir.
  const L = 66, M = 100, RC = 134;
  const PIPS = {
    2: [[M, 62], [M, 218]], 3: [[M, 62], [M, 140], [M, 218]],
    4: [[L, 62], [RC,62], [L, 218], [RC,218]], 5: [[L, 62], [RC,62], [M, 140], [L, 218], [RC,218]],
    6: [[L, 62], [RC,62], [L, 140], [RC,140], [L, 218], [RC,218]],
    7: [[L, 62], [RC,62], [M, 101], [L, 140], [RC,140], [L, 218], [RC,218]],
    8: [[L, 62], [RC,62], [M, 101], [L, 140], [RC,140], [M, 179], [L, 218], [RC,218]],
    9: [[L, 62], [RC,62], [L, 114], [RC,114], [M, 140], [L, 166], [RC,166], [L, 218], [RC,218]],
    10: [[L, 62], [RC,62], [M, 88], [L, 114], [RC,114], [L, 166], [RC,166], [M, 192], [L, 218], [RC,218]],
  };
  function corner(rank, suit, color) {
    const label = RANK[rank] || String(rank);
    // Klasik destedeki gibi: sol üstte dar, kalın rakam; hemen altında küçük renk işareti. Sağ altta aynısı ters.
    const one = `<text x="${label.length > 1 ? 9 : 13}" y="38" font-family="'Arial Narrow','Helvetica Neue',Arial,sans-serif" font-weight="700" font-size="${label.length > 1 ? 32 : 36}" fill="${color}" letter-spacing="-3" textLength="${label.length > 1 ? 34 : 20}" lengthAdjust="spacingAndGlyphs">${label}</text>${use(suit, 22, 54, 20, false, color)}`;
    return one + `<g transform="rotate(180 100 140)">${one}</g>`;
  }
  // Resimli (saray) kart: klasik destedeki gibi ince çerçeve, sarı-kırmızı-mavi giysili figür, üst yarı alta ayna gibi ters.
  // Papaz (K) taçlı ve kılıçlı, kız (Q) taçlı ve çiçekli, vale (J) şapkalı ve asalı.
  const Y = '#f2c230', R = '#d5262b', B = '#2b4ea2', K = '#1a1a1a', SKIN = '#fbe3c4';
  function figure(rank, suit, color) {
    const robeA = color === RED ? R : B, robeB = color === RED ? B : R;
    const head = '<ellipse cx="100" cy="70" rx="12.5" ry="15" fill="' + SKIN + '" stroke="' + K + '" stroke-width="1.4"/>' +
      '<path d="M94 68h3M103 68h3" stroke="' + K + '" stroke-width="1.6"/><path d="M100 70v5h-2" fill="none" stroke="' + K + '" stroke-width="1"/>' +
      '<path d="M96 79q4 2 8 0" fill="none" stroke="' + R + '" stroke-width="1.5"/>';
    const hair = rank === 12
      ? '<path d="M86 68q0-20 14-20t14 20q2 10-4 18l-2-12q-8-6-16 0l-2 12q-6-8-4-18z" fill="' + Y + '" stroke="' + K + '" stroke-width="1.2"/>'
      : '<path d="M87 64q1-14 13-14t13 14l-3 6q-10-6-20 0z" fill="' + Y + '" stroke="' + K + '" stroke-width="1.2"/>' +
        (rank === 13 ? '<path d="M89 78q11 16 22 0q0 12-11 16q-11-4-11-16z" fill="' + Y + '" stroke="' + K + '" stroke-width="1.2"/>' : '');
    const hat = rank === 13 ? `<path d="M84 52l3-16 7 8 6-12 6 12 7-8 3 16z" fill="${Y}" stroke="${K}" stroke-width="1.4"/><path d="M84 52h32" stroke="${R}" stroke-width="3"/><circle cx="100" cy="38" r="2.6" fill="${R}"/>`
      : rank === 12 ? `<path d="M87 52l2-10 5 5 6-9 6 9 5-5 2 10z" fill="${Y}" stroke="${K}" stroke-width="1.4"/><path d="M87 52h26" stroke="${B}" stroke-width="2.5"/>`
      : `<path d="M82 54q18-18 36 0z" fill="${robeA}" stroke="${K}" stroke-width="1.4"/><path d="M82 54h36" stroke="${Y}" stroke-width="3"/><path d="M116 46q10-10 14-2" fill="none" stroke="${R}" stroke-width="3"/>`;
    // Elinde tuttuğu: papaz kılıç, kız çiçek, vale asa
    const prop = rank === 13 ? `<path d="M132 46v74" stroke="${K}" stroke-width="3"/><path d="M126 108h12" stroke="${Y}" stroke-width="4"/><path d="M132 46l-3 8h6z" fill="#cfd6df" stroke="${K}" stroke-width="1"/>`
      : rank === 12 ? `<path d="M68 118q2-26 10-36" fill="none" stroke="#2c7a2c" stroke-width="2.5"/><circle cx="78" cy="80" r="6" fill="${R}" stroke="${K}" stroke-width="1"/><circle cx="78" cy="80" r="2.2" fill="${Y}"/>`
      : `<path d="M134 40v86" stroke="#7a4a1a" stroke-width="3"/><path d="M128 48q6-10 12 0l-6 6z" fill="#cfd6df" stroke="${K}" stroke-width="1"/>`;
    // Giysi: iki renkli gövde, yakada beyaz kırma, sarı şeritler ve noktalı desen
    const body = `<path d="M54 140l6-36q6-14 24-18h32q18 4 24 18l6 36z" fill="${robeA}" stroke="${K}" stroke-width="1.6"/>
      <path d="M100 86v54h46l-6-36q-6-14-24-18z" fill="${robeB}" stroke="${K}" stroke-width="1.2"/>
      <path d="M86 90h28l7 50H79z" fill="${Y}" stroke="${K}" stroke-width="1.2"/>
      <g stroke="${K}" stroke-width="1" fill="none">${[100, 110, 120, 130].map(y => `<path d="M${84 - (y - 90) * .14} ${y}h${32 + (y - 90) * .28}"/>`).join('')}</g>
      <g fill="${R}">${[[93, 105], [107, 105], [100, 116], [91, 127], [109, 127]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4"/>`).join('')}</g>
      <path d="M60 128q14-10 26-6M140 128q-14-10-26-6" fill="none" stroke="${Y}" stroke-width="7" stroke-linecap="round"/>
      <path d="M60 128q14-10 26-6M140 128q-14-10-26-6" fill="none" stroke="${K}" stroke-width="1"/>
      <path d="M84 86q16 12 32 0l-2 9q-14 9-28 0z" fill="#fff" stroke="${K}" stroke-width="1.2"/>`;
    // Baş klasik kartlardaki gibi iri: baş, saç ve taç birlikte büyütülüp biraz yukarı alınır.
    return `<g>${body}${prop}<g transform="translate(100 64) scale(1.3) translate(-100 -70)">${hair}${head}${hat}</g>${use(suit, 66, 50, 16, false, color)}</g>`;
  }
  function face(rank, suit, color) {
    const half = figure(rank, suit, color);
    return `<rect x="40" y="30" width="120" height="220" fill="#fff" stroke="${K}" stroke-width="1.6"/>
      <clipPath id="clip-${rank}${suit}"><rect x="41" y="31" width="118" height="218"/></clipPath>
      <g clip-path="url(#clip-${rank}${suit})">${half}<g transform="rotate(180 100 140)">${half}</g></g>
      <path d="M41 140h118" stroke="${K}" stroke-width="1"/>`;
  }
  const cache = new Map();
  function faceSVG(card) {
    const key = card.id;
    if (cache.has(key)) return cache.get(key);
    const color = card.suit === 'H' || card.suit === 'D' ? RED : BLACK;
    let body;
    // As: ortada tek simge; maça ası klasik destedeki gibi büyük.
    if (card.rank === 14) body = use(card.suit, 100, 140, card.suit === 'S' ? 76 : 40, false, color);
    else if (card.rank > 10) body = face(card.rank, card.suit, color);
    else body = PIPS[card.rank].map(([x, y]) => use(card.suit, x, y, 34, y > 140, color)).join('');
    const svg = `<svg viewBox="0 0 200 280" xmlns="${NS}" aria-hidden="true"><rect x="1.5" y="1.5" width="197" height="277" rx="11" fill="#fff" stroke="#1a1a1a" stroke-width="2.4"/>${body}${corner(card.rank, card.suit, color)}</svg>`;
    cache.set(key, svg);
    return svg;
  }
  // Arka yüz: beyaz kenar içinde klasik lacivert kafes deseni.
  const BACK = `<svg viewBox="0 0 200 280" xmlns="${NS}" aria-hidden="true"><rect x="1.5" y="1.5" width="197" height="277" rx="11" fill="#fff" stroke="#1a1a1a" stroke-width="2.4"/>
    <rect x="12" y="12" width="176" height="256" rx="6" fill="url(#bkBackPat)" stroke="#0e2f63" stroke-width="2"/>
    <rect x="20" y="20" width="160" height="240" rx="4" fill="none" stroke="#fff" stroke-width="1.5" opacity=".6"/></svg>`;
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
  return { el, SUIT_NAME, RANK, install: installSprite };
})();
