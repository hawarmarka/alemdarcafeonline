'use strict';
// Monte Carlo bot: çift sayımı GameLogic ile aynı, açabilen el hemen "açar", karar tekrarlanabilir (tohum),
// bariz durumda doğru taşı seçer, worker_threads havuzu aynı sonucu verir ve süre dolarsa null döner.
const assert = require('node:assert/strict');
const BotMC = require('../server/botMC');
const BotPool = require('../server/botPool');
const GameLogic = require('../server/gameLogic');
const Logger = require('../server/logger'); for (const k of ['game', 'debug']) Logger[k] = () => {};

const okey = { color: 'Siyah', number: 9 };
let n = 0;
const T = (color, number) => ({ id: `t${++n}`, color, number, isFakeJoker: false });
const OK = () => ({ id: `t${++n}`, color: 'Siyah', number: 9, isFakeJoker: false });
const FAKE = () => ({ id: `t${++n}`, color: 'Sahte', number: 0, isFakeJoker: true });

// Havuzun worker'ı ve zamanlayıcıları unref'li (sunucunun kapanmasını engellemesin); test bitene kadar süreç açık kalsın.
const keepAlive = setInterval(() => {}, 1000);
(async () => {
  // 1) Çift sayısı GameLogic.countPairs ile aynı (rastgele ellerde).
  for (let i = 0; i < 300; i++) {
    const g = new GameLogic(); g.startGame([{}, {}, {}, {}]);
    for (const hand of g.playerTiles) assert.equal(BotMC.pairCount(hand, g.okey), g.countPairs(hand).length);
  }
  // 2) Bariz karar: el 101'e tek bir kırmızı 13 uzakta; geriye bir kırmızı 13 ve atılabilecek iki taş var.
  //    Kırmızı 11-12 dizisini bozan taşı atmak açılış şansını düşürmeli; işe yaramaz tek taş (Mavi 1) atılmalı.
  const hand = [T('Mavi', 13), T('Siyah', 13), T('Yesil', 13), // 39
    T('Mavi', 12), T('Siyah', 12), T('Yesil', 12),                // 36
    T('Kirmizi', 11), T('Kirmizi', 12),                           // yarım seri (13 gelirse +36)
    T('Mavi', 1), T('Yesil', 2), T('Siyah', 4), T('Mavi', 6), T('Yesil', 7), T('Siyah', 2), T('Kirmizi', 3), T('Mavi', 3), T('Yesil', 5), T('Kirmizi', 1), T('Siyah', 6), T('Kirmizi', 5), T('Yesil', 10), T('Mavi', 8)];
  const junk = hand.find(t => t.color === 'Mavi' && t.number === 1), keeper = hand.find(t => t.color === 'Kirmizi' && t.number === 12);
  const unseen = [];
  for (const c of ['Kirmizi', 'Yesil', 'Mavi', 'Siyah']) for (let v = 1; v <= 13; v++) unseen.push(T(c, v), T(c, v));
  const input = { hand, okey, unseen, candidates: [keeper.id, junk.id], myDraws: 5, need: 101, minPairs: 5, samples: 60, seed: 7 };
  const r1 = BotMC.chooseDiscard(input);
  assert.equal(r1.id, junk.id, 'yarım seriyi bozan taş tutulmalı');
  assert(r1.scores[junk.id] > r1.scores[keeper.id]);
  // 3) Aynı tohum aynı kararı verir.
  assert.deepEqual(BotMC.chooseDiscard(input), r1);
  // 4) Okey ve sahte okey: okey eşsiz bir taşla çift sayılır, sahte okey okeyin yerine geçen sabit taştır.
  assert.equal(BotMC.pairCount([OK(), T('Mavi', 3), FAKE(), T('Siyah', 9)], okey), 2);
  // 5) Çekiş kalmadıysa ilk aday (sezgisel seçim) döner.
  assert.equal(BotMC.chooseDiscard({ ...input, myDraws: 0 }).id, keeper.id);
  // 6) worker_threads havuzu aynı sonucu verir; çok kısa sürede cevap gelmezse null döner (masa beklemez).
  const viaWorker = await BotPool.decide(input, 20000);
  assert.deepEqual(viaWorker, r1);
  assert.equal(await BotPool.decide({ ...input, samples: 5000 }, 1), null);
  await BotPool.close();
  assert.equal(await BotPool.decide(input), null, 'kapanmış havuz null döner');
  console.log('v39BotMC: çift sayımı, bariz karar, tekrarlanabilirlik, okey/sahte okey, worker havuzu ve süre aşımı geçti');
  clearInterval(keepAlive);
})().catch(err => { console.error(err); process.exit(1); });
