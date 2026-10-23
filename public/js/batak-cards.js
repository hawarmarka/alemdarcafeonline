'use strict';
// Alemdar Cafe iskambil destesi (Batak, Pişti ortak). Kartlar vektörle (SVG) çizilir: her boyutta keskin, resim dosyası yok.
// Her kartın SVG'si bir kez üretilir, data-URL olarak önbelleğe alınır ve CSS arka planı olarak kullanılır;
// sayfada yüzlerce kart olsa da DOM'da yalnızca bir <div> vardır (satır içi SVG yok, akıcı).
// Kart: { id: 'S14', suit: 'S'|'H'|'D'|'C', rank: 2..14 } (11 J, 12 Q, 13 K, 14 A).
window.BatakCards = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const SUIT_NAME = { S: 'Maça', H: 'Kupa', D: 'Karo', C: 'Sinek' };
  const RED = '#c8161d', BLACK = '#161a22', GOLD = '#d9a520';
  const SUIT_PATHS = {
    H: '<path d="M50 92C22 68 2 50 2 29 2 13 14 2 29 2c10 0 17 6 21 14 4-8 11-14 21-14 15 0 27 11 27 27 0 21-20 39-48 63z"/>',
    D: '<path d="M50 2 88 50 50 98 12 50z"/>',
    S: '<path d="M50 2C66 24 98 40 98 63c0 15-11 25-25 25-9 0-16-4-20-10 1 10 5 17 13 22H34c8-5 12-12 13-22-4 6-11 10-20 10C13 88 2 78 2 63 2 40 34 24 50 2z"/>',
    C: '<circle cx="50" cy="27" r="22"/><circle cx="25" cy="60" r="22"/><circle cx="75" cy="60" r="22"/><path d="M44 56c0 22-5 34-14 42h40c-9-8-14-20-14-42z"/>',
  };
  const color = s => (s === 'H' || s === 'D' ? RED : BLACK);
  // Simge: (x, y) merkezli, boyu size; flip: kartın alt yarısındakiler ters durur.
  const pip = (s, x, y, size, flip = false) => `<g transform="translate(${x} ${y})${flip ? ' rotate(180)' : ''} scale(${size / 100}) translate(-50 -50)">${SUIT_PATHS[s]}</g>`;
  // Kart 250×350. Sayı kartlarında simgelerin yerleri (sol 82, orta 125, sağ 168).
  const L = 82, M = 125, R = 168;
  const LAYOUT = {
    2: [[M, 78], [M, 272]], 3: [[M, 78], [M, 175], [M, 272]],
    4: [[L, 78], [R, 78], [L, 272], [R, 272]], 5: [[L, 78], [R, 78], [M, 175], [L, 272], [R, 272]],
    6: [[L, 78], [R, 78], [L, 175], [R, 175], [L, 272], [R, 272]],
    7: [[L, 78], [R, 78], [M, 126], [L, 175], [R, 175], [L, 272], [R, 272]],
    8: [[L, 78], [R, 78], [M, 126], [L, 175], [R, 175], [M, 224], [L, 272], [R, 272]],
    9: [[L, 78], [R, 78], [L, 143], [R, 143], [M, 175], [L, 207], [R, 207], [L, 272], [R, 272]],
    10: [[L, 78], [R, 78], [M, 110], [L, 143], [R, 143], [L, 207], [R, 207], [M, 240], [L, 272], [R, 272]],
  };
  // Köşe: sayı/harf ve altında küçük simge (sol üst ve sağ alt, ters).
  const corner = (c, label) => {
    const one = `<text x="0" y="0" text-anchor="middle" font-family="'Arial Narrow',Arial,Helvetica,sans-serif" font-weight="700" font-size="${label.length > 1 ? 36 : 40}" letter-spacing="${label.length > 1 ? -3 : 0}">${label}</text>${pip(c.suit, 0, 22, 24)}`;
    return `<g fill="${color(c.suit)}"><g transform="translate(27 44)">${one}</g><g transform="translate(223 306) rotate(180)">${one}</g></g>`;
  };
  // Resimli kartlar (J, Q, K): çerçeve içinde modern çizim; üst yarı alta ters yansır (klasik iskambil gibi).
  function court(c) {
    const red = color(c.suit) === RED, robe = red ? '#c62828' : '#1f4fa3', robe2 = red ? '#8e1717' : '#13306a', tint = red ? '#fff3f1' : '#f1f5ff';
    const head = `<circle cx="125" cy="104" r="21" fill="#f6d6b8" stroke="#3a2a1e" stroke-width="2"/>
      <path d="M115 104q2 3 4 0M131 104q2 3 4 0" stroke="#3a2a1e" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M119 114q6 4 12 0" stroke="#a5372b" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    // Giysi: omuzlar çerçeve kenarına yayılır; ortada altın yaka ve düğmeler, yanlarda koyu kol.
    const body = `<path d="M52 175V158c10-18 36-28 73-28s63 10 73 28v17z" fill="${robe}" stroke="#2a1d14" stroke-width="2"/>
      <path d="M52 175V158c6-10 14-16 24-20l8 37z M198 175V158c-6-10-14-16-24-20l-8 37z" fill="${robe2}"/>
      <path d="M106 132l19 24 19-24" stroke="${GOLD}" stroke-width="5" fill="none" stroke-linejoin="round"/>
      <g fill="${GOLD}"><circle cx="125" cy="163" r="3.5"/><circle cx="125" cy="173" r="3.5"/></g>`;
    let hat = '', behind = '', front = '';
    if (c.rank === 13) { // Papaz: taç ve sakal
      hat = `<path d="M100 92l4-22 11 12 10-17 10 17 11-12 4 22z" fill="${GOLD}" stroke="#7a5a08" stroke-width="2"/><circle cx="125" cy="72" r="3.5" fill="${RED}"/>`;
      front = `<path d="M106 110q19 34 38 0q-4 22-19 24q-15-2-19-24z" fill="#7a4a2a" stroke="#3a2a1e" stroke-width="1.5"/>`;
    } else if (c.rank === 12) { // Kız: uzun saç ve küçük taç
      behind = `<path d="M101 104c0-28 48-28 48 0v34c-6-8-10-14-10-28h-28c0 14-4 20-10 28z" fill="#5a3214"/>`;
      hat = `<path d="M108 86l6-11 5 7 6-10 6 10 5-7 6 11z" fill="${GOLD}" stroke="#7a5a08" stroke-width="1.5"/><circle cx="125" cy="76" r="3" fill="#2f7de1"/>`;
    } else { // Vale: şapka ve tüy
      hat = `<path d="M100 92c2-18 48-18 50 0z" fill="${robe2}" stroke="#2a1d14" stroke-width="2"/><path d="M140 82c14-22 26-22 30-18-10 2-18 10-28 20" fill="${GOLD}" stroke="#7a5a08" stroke-width="1.5"/>`;
    }
    const half = `<g>${behind}${body}${head}${front}${hat}
      <text x="72" y="92" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="34" fill="${color(c.suit)}">${RANK[c.rank]}</text>${pip(c.suit, 178, 80, 26)}</g>`;
    return `<defs><clipPath id="f"><rect x="52" y="56" width="146" height="238" rx="10"/></clipPath></defs>
      <rect x="52" y="56" width="146" height="238" rx="10" fill="${tint}"/>
      <g clip-path="url(#f)">${half}<g transform="rotate(180 125 175)">${half}</g></g>
      <path d="M52 175h146" stroke="${GOLD}" stroke-width="2"/>
      <rect x="52" y="56" width="146" height="238" rx="10" fill="none" stroke="${color(c.suit)}" stroke-width="3"/>
      <rect x="57" y="61" width="136" height="228" rx="7" fill="none" stroke="${GOLD}" stroke-width="1.5" opacity=".8"/>`;
  }
  function faceSvg(c) {
    const label = RANK[c.rank] || String(c.rank);
    let mid;
    if (c.rank === 14) mid = c.suit === 'S'
      ? `<circle cx="125" cy="175" r="70" fill="none" stroke="${GOLD}" stroke-width="3"/><circle cx="125" cy="175" r="62" fill="none" stroke="${BLACK}" stroke-width="1" opacity=".35"/><g fill="${BLACK}">${pip('S', 125, 172, 104)}</g>`
      : `<g fill="${color(c.suit)}">${pip(c.suit, 125, 175, 92)}</g>`;
    else if (c.rank > 10) mid = court(c);
    else mid = `<g fill="${color(c.suit)}">${LAYOUT[c.rank].map(([x, y]) => pip(c.suit, x, y, 46, y > 175)).join('')}</g>`;
    return `<svg xmlns="${NS}" viewBox="0 0 250 350"><rect x="1.5" y="1.5" width="247" height="347" rx="16" fill="#fffefb" stroke="#c9c4b8" stroke-width="3"/>${mid}${corner(c, label)}</svg>`;
  }
  // Arka yüz: koyu bordo, altın kafes, ortada Alemdar amblemi.
  const BACK_SVG = `<svg xmlns="${NS}" viewBox="0 0 250 350"><defs><pattern id="p" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="22" height="22" fill="#7d1220"/><path d="M0 11h22M11 0v22" stroke="#d9a520" stroke-width="1.4" opacity=".55"/><circle cx="11" cy="11" r="2.4" fill="#f2c94c" opacity=".85"/></pattern></defs>
    <rect x="1.5" y="1.5" width="247" height="347" rx="16" fill="#fffefb" stroke="#c9c4b8" stroke-width="3"/><rect x="13" y="13" width="224" height="324" rx="10" fill="url(#p)"/>
    <rect x="13" y="13" width="224" height="324" rx="10" fill="none" stroke="#d9a520" stroke-width="3"/><rect x="21" y="21" width="208" height="308" rx="7" fill="none" stroke="#f2c94c" stroke-width="1" opacity=".7"/>
    <circle cx="125" cy="175" r="44" fill="#5a0c16" stroke="#d9a520" stroke-width="4"/><text x="125" y="192" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="50" fill="#f2c94c">A</text></svg>`;
  const url = svg => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s{2,}/g, ' '))}")`;
  const cache = new Map();
  const faceUrl = c => { let u = cache.get(c.id); if (!u) { u = url(faceSvg(c)); cache.set(c.id, u); } return u; };
  const BACK_URL = url(BACK_SVG);
  // Renk simgeleri (koz kutusu, koz seçimi) için <use href="#bk-S"> sembolleri.
  function installSprite() {
    if (document.getElementById('bkSuitSprite')) return;
    const svg = document.createElementNS(NS, 'svg');
    svg.id = 'bkSuitSprite'; svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
    svg.innerHTML = '<defs>' + Object.entries(SUIT_PATHS).map(([s, p]) => `<symbol id="bk-${s}" viewBox="0 0 100 100">${p}</symbol>`).join('') + '</defs>';
    document.body.prepend(svg);
    document.documentElement.style.setProperty('--card-back', BACK_URL);
  }
  function el(card, cls = '') {
    installSprite();
    const d = document.createElement('div');
    d.className = 'card ' + cls;
    if (!card) { d.classList.add('back'); return d; }
    d.classList.add('face');
    d.dataset.id = card.id;
    d.setAttribute('role', 'img');
    d.setAttribute('aria-label', `${SUIT_NAME[card.suit]} ${RANK[card.rank] || card.rank}`);
    d.style.backgroundImage = faceUrl(card);
    return d;
  }
  // Sayfa açılınca 52 kartın görüntüsü boşta hazırlanır; ilk dağıtımda takılma olmaz.
  const warm = () => { for (const s of ['S', 'H', 'D', 'C']) for (let r = 2; r <= 14; r++) { const img = new Image(); img.src = faceUrl({ id: s + r, suit: s, rank: r }).slice(5, -2); } };
  (window.requestIdleCallback || (f => setTimeout(f, 300)))(warm);
  return { el, SUIT_NAME, RANK, install: installSprite, faceSvg };
})();
