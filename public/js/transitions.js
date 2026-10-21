/* Alemdar Cafe – sahne geçişi: ekranı beyaz okey taşları kaplar, sonra dağılır (lobi ↔ masa).
   Kullanım: await AlemdarTransition.cover(); …; AlemdarTransition.uncover();
   Sayfa değişiminde: AlemdarTransition.leaveTo(url) → yeni sayfa açılınca taşlar kendiliğinden dağılır. */
(function () {
  'use strict';
  const COLS = 6, ROWS = 4; // az ve büyük taş: akıcı geçiş
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function layer() {
    let l = document.getElementById('tileTransition');
    if (l) return l;
    l = document.createElement('div');
    l.id = 'tileTransition';
    l.setAttribute('aria-hidden', 'true');
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = document.createElement('i');
      const ang = Math.random() * Math.PI * 2, dist = 70 + Math.random() * 40;
      t.style.setProperty('--x', (c / (COLS - 1) * 100 + (Math.random() * 8 - 4)) + '%');
      t.style.setProperty('--y', (r / (ROWS - 1) * 100 + (Math.random() * 10 - 5)) + '%');
      t.style.setProperty('--r', (Math.random() * 70 - 35).toFixed(1) + 'deg');
      t.style.setProperty('--fx', (Math.cos(ang) * dist).toFixed(1) + 'vw');
      t.style.setProperty('--fy', (Math.sin(ang) * dist).toFixed(1) + 'vh');
      t.style.setProperty('--d', Math.round(Math.random() * 180) + 'ms');
      l.append(t);
    }
    (document.body || document.documentElement).append(l);
    return l;
  }
  const api = {
    cover() {
      if (reduce()) return Promise.resolve();
      const l = layer();
      l.className = '';
      void l.offsetWidth;
      l.className = 'tt-cover';
      return new Promise(res => setTimeout(res, 640));
    },
    uncover() {
      if (reduce()) return;
      const l = layer();
      l.className = 'tt-cover tt-instant';
      void l.offsetWidth;
      requestAnimationFrame(() => { l.className = 'tt-uncover'; setTimeout(() => { if (l.className === 'tt-uncover') l.className = ''; }, 760); });
    },
    async leaveTo(url) {
      try { sessionStorage.setItem('tileTransition', '1'); } catch (_) {}
      await api.cover();
      window.location.assign(url);
    }
  };
  window.AlemdarTransition = api;
  let pending = false;
  try { pending = sessionStorage.getItem('tileTransition') === '1'; sessionStorage.removeItem('tileTransition'); } catch (_) {}
  if (pending) {
    const go = () => api.uncover();
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }
})();
