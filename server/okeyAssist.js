'use strict';
// Unity istemcisi için ıstaka dizme yardımı: tarayıcıdaki SERİ DİZ / ÇİFT DİZ ile aynı çözücü (public/js/meldSolver.js).
// 'okey:arrange' { mode: 'series' | 'pairs' } → ack { groups: [[tileId]], rest: [tileId], score }
// Yalnızca düzen önerisi; kural ve doğrulama yine hamle olaylarında (openHand, openWithPairs…).
const Melds = require('../public/js/meldSolver');

const ORDER = ['Kirmizi', 'Yesil', 'Mavi', 'Siyah', 'Sahte'];

function attach(socket, where) {
  socket.on('okey:arrange', (data, ack) => {
    if (typeof ack !== 'function') return;
    const { room, index } = where(socket);
    const game = room?.game;
    if (!game || index < 0) return ack({ error: 'Masada oyun yok.' });
    if (!room.assisted) return ack({ error: 'Yardımsız masada taşları kendin dizersin.' });
    const hand = game.playerTiles[index], okey = game.okey;
    const num = t => (t.isFakeJoker ? okey.number : t.number);
    let groups = [];
    if (data?.mode === 'pairs') {
      groups = game.countPairs(hand).map(p => p.slice(0, 2));
      groups.sort((a, b) => num(a[0]) - num(b[0]));
    } else {
      const r = Melds.solve(hand, okey);
      groups = r.groups;
      groups.sort((a, b) => Math.min(...a.map(num)) - Math.min(...b.map(num)));
    }
    const used = new Set(groups.flat().map(t => t.id));
    const rest = hand.filter(t => !used.has(t.id)).sort((a, b) => num(a) - num(b) || ORDER.indexOf(a.color) - ORDER.indexOf(b.color));
    const score = data?.mode === 'pairs' ? groups.length : Melds.solve(hand, okey).score;
    ack({ groups: groups.map(g => g.map(t => t.id)), rest: rest.map(t => t.id), score });
  });

  // SERİ AÇ öncesi ön kontrol (ceza yok): ıstakadaki grupların hangisi geçerli, geçerlilerin puanı, açmak için gereken puan.
  // 'okey:check' { groups: [[tileId]] } → ack { valid: [bool], score, need, opened }
  socket.on('okey:check', (data, ack) => {
    if (typeof ack !== 'function') return;
    const { room, index } = where(socket);
    const game = room?.game;
    if (!game || index < 0) return ack({ error: 'Masada oyun yok.' });
    const hand = game.playerTiles[index], state = game.playerStates[index];
    const groups = Array.isArray(data?.groups) ? data.groups.slice(0, 12) : [];
    const valid = [], used = new Set(); let score = 0;
    for (const ids of groups) {
      const tiles = (Array.isArray(ids) ? ids : []).map(id => hand.find(t => t.id === String(id)));
      const ok = tiles.length >= 3 && tiles.every(Boolean) && tiles.every(t => !used.has(t.id)) && game.isValidGroup(tiles);
      valid.push(ok);
      if (ok) { tiles.forEach(t => used.add(t.id)); score += game.calculateGroupValue(game.arrangeGroup ? game.arrangeGroup(tiles) : tiles); }
    }
    ack({ valid, score, need: room.stackingMode ? room.minimumOpenScore : 101, opened: !!state.hasOpened });
  });
}

module.exports = { attach };
