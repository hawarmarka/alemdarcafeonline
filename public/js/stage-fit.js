/* v17: referans sahnesini tüm ekranlara taşmadan ölçekler. */
(function () {
  const W = 1690, H = 818; // 805 sahne + ıstakanın alt kenarı için küçük pay
  function fit() {
    const host = document.getElementById('gameContainer');
    if (!host) return;
    const scale = Math.min(innerWidth / W, innerHeight / H);
    host.style.setProperty('--stage-scale', String(scale));
  }
  window.addEventListener('resize', fit, {passive:true});
  window.addEventListener('orientationchange', fit);
  fit();
})();
