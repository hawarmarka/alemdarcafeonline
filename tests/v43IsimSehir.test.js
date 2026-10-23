'use strict';
// İsim Şehir: harf ve Türkçe karakter kontrolü, sözlük ve ekler, yapay zekâ hakem (sahte istemciyle) ve önbellek, puan (20/10/5/0),
// botların her harfte cevap bulması, masa akışı (bot doldurma, BİTİRDİM → 10 sn, hakem, sonuç, maç sonu), eşli takım puanı, izleyici.
const os = require('node:os'), path = require('node:path'), fs = require('node:fs');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'isim-test-'));
delete process.env.ANTHROPIC_API_KEY;
const assert = require('node:assert/strict');
const W = require('../server/isimsehir/words');
const L = require('../server/isimsehir/logic');
const Bot = require('../server/isimsehir/bot');
const Judge = require('../server/isimsehir/judge');

(async () => {
  // 1) Ön kontrol: harf, Türkçe karakter isteğe bağlı, takma ad, ek, kısa/boş
  assert.equal(Judge.precheck('esya', 'semsiye', 'Ş').valid, true, '"semsiye" Ş harfinde kabul');
  assert.equal(Judge.precheck('esya', 'Şemsiye', 'S').valid, false, 'Şemsiye S harfinde değil');
  assert.equal(Judge.precheck('sehir', 'canakkale', 'Ç').valid, true);
  assert.equal(Judge.precheck('sehir', 'canakkale', 'C').valid, false, 'Çanakkale C harfiyle başlamaz');
  assert.equal(Judge.precheck('sehir', 'antep', 'A').valid, true, 'takma ad kendi harfiyle');
  assert.equal(Judge.precheck('bitki', 'elma ağacı', 'E').valid, true, 'bitkide "ağacı" eki');
  assert.equal(Judge.precheck('hayvan', 'ZEBRA', 'Z').valid, true, 'büyük harf fark etmez');
  assert.equal(Judge.precheck('isim', '', 'A').empty, true);
  assert.match(Judge.precheck('isim', 'Mehmet', 'A').reason, /harfiyle/);
  assert.equal(Judge.precheck('esya', 'yksd', 'Y').pending, true, 'sözlükte olmayan hakeme gider');

  // 2) Yapay zekâ yokken sözlükte olmayan geçersiz; sahte istemciyle karar ve önbellek
  let r = await Judge.judgeRound('Y', [{ cat: 'esya', text: 'yksd' }, { cat: 'esya', text: 'Yastık' }]);
  assert.equal(r[0].valid, false); assert.match(r[0].reason, /Sözlükte yok/); assert.equal(r[1].valid, true);
  let calls = 0;
  Judge._setClient({ beta: { messages: { create: async req => {
    calls++;
    assert.equal(req.model, 'claude-opus-5-5'); assert.equal(req.output_config.format.type, 'json_schema');
    const items = JSON.parse(req.messages[0].content.split('\n')[1]);
    const ok = { yabankedisi: 'Yaban kedisi', yesilbiber: 'Yeşil biber' }, hit = x => ok[W.norm(x.cevap)];
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ results: items.map(x => ({ i: x.i, valid: !!hit(x), canonical: hit(x) || x.cevap, reason: hit(x) ? 'Gerçek bir tür' : 'Uydurma kelime' })) }) }] };
  } } }, messages: { create: async () => { throw Error('beklenmedi'); } } });
  assert.equal(Judge.aiEnabled(), true);
  r = await Judge.judgeRound('Y', [{ cat: 'hayvan', text: 'yaban kedisi' }, { cat: 'esya', text: 'YKSD' }, { cat: 'bitki', text: 'yesil biber' }, { cat: 'hayvan', text: 'Yaban Kedisi' }]);
  assert.deepEqual(r.map(x => x.valid), [true, false, true, true]); assert.equal(r[0].by, 'ai'); assert.equal(r[2].canonical, 'Yeşil biber');
  assert.equal(calls, 1, 'bir elde tek istek; aynı kelime bir kez sorulur');
  r = await Judge.judgeRound('Y', [{ cat: 'hayvan', text: 'Yaban kedisi' }]);
  assert.equal(calls, 1, 'önceki karar önbellekten'); assert.equal(r[0].valid, true);
  assert.equal(Judge.precheck('hayvan', 'yaban kedisi', 'K').valid, false, 'önbellekteki karar da harf kontrolünden geçer');

  // 3) Puan: tek doğru 20, farklı 10, aynı 5, geçersiz 0
  const v = (text, valid = true) => ({ text, canonical: text, valid });
  const pts = L.scoreRound([
    { isim: v('Ali'), sehir: v('Adana'), hayvan: v('At'), bitki: v('Ayva'), esya: v('Ayna') },
    { isim: v('ali'), sehir: v('Ankara'), hayvan: v('xx', false), bitki: v(''), esya: v('Ampul') },
    { isim: v('Ayşe'), sehir: v('', false), hayvan: v('', false), bitki: v('', false), esya: v('Askı') },
  ]);
  assert.deepEqual(pts.map(p => [p.isim, p.sehir, p.hayvan, p.bitki, p.esya]), [[5, 10, 20, 10, 10], [5, 10, 0, 10, 10], [10, 0, 0, 0, 10]]);

  // 4) Botlar her harfte her kategoride çoğunlukla cevap bulur
  let empty = 0;
  for (const letter of L.LETTERS) for (const cat of W.CATEGORIES) if (!Bot.words(cat, letter).length) empty++;
  assert(empty <= 6, `botların cevapsız kaldığı harf-kategori sayısı az olmalı (${empty})`);
  const a = Bot.answers('K', 1); for (const c of W.CATEGORIES) assert(Judge.precheck(c, a[c], 'K').valid, `bot cevabı geçerli: ${a[c]}`);
  const used = []; for (let i = 0; i < 10; i++) used.push(L.pickLetter(used)); assert.equal(new Set(used).size, 10, 'harf tekrar etmez');
  assert(!used.includes('Ğ') && !used.includes('J'));

  // 5) Masa: socket üzerinden
  Judge._setClient(null); // masa testinde yapay zekâ yok (sözlük)
  const sockets = new Map();
  class FakeSocket {
    static n = 0;
    constructor() { this.id = 'is' + (++FakeSocket.n); this.data = {}; this.handlers = {}; this.out = []; sockets.set(this.id, this); }
    on(e, fn) { (this.handlers[e] ||= []).push(fn); } emit(e, d) { this.out.push({ event: e, data: d }); }
    async receive(e, d) { for (const fn of this.handlers[e] || []) await fn(d); } last(e) { return this.out.filter(x => x.event === e).at(-1)?.data; }
  }
  const io = { to: id => ({ emit: (e, d) => sockets.get(id)?.out.push({ event: e, data: d }) }) };
  let awards = 0;
  const IS = require('../server/isimsehir').install({ io, Accounts: { fromToken: () => null, award() { awards++; } }, Avatars: { ref: x => x, BUILTIN: ['default.svg'], randomAvatar: () => 'av01.svg' }, Logger: { error(...x) { console.error(...x); } } });
  const fire = (obj, key) => { const t = obj[key]; if (!t) return false; const cb = t._onTimeout; clearTimeout(t); obj[key] = null; cb(); return true; };
  const s1 = new FakeSocket(); IS.onSocket(s1);
  await s1.receive('isim:join', { mode: 'quick', size: 4, team: false, rounds: 5, time: 60, token: 'z'.repeat(30), playerName: 'Ali' });
  const room = IS.rooms.get(s1.last('isim:joined').code);
  assert(fire(room, 'fillTimer')); assert.equal(room.players.length, 4); assert.equal(room.phase, 'letter');
  assert.equal(s1.last('isim:state').letter, null, 'çark dönerken harf gizli');
  fire(room, 'spinTimer'); assert.equal(room.phase, 'writing');
  const letter = room.letter;
  // Taslak gider; başkalarının cevapları sonuçtan önce görünmez.
  const mine = Bot.answers(letter, 1);
  await s1.receive('isim:answers', { answers: mine });
  assert.deepEqual(room.answers[0], Object.fromEntries(W.CATEGORIES.map(c => [c, mine[c]])));
  assert.equal(s1.last('isim:state').results, null);
  // Bütün satırlar doluysa BİTİRDİM: diğerlerine 10 sn
  const full = W.CATEGORIES.every(c => mine[c]);
  await s1.receive('isim:finish', { answers: mine });
  if (full) { assert(room.deadline - Date.now() <= 10000); assert.match(room.notice, /Son 10 saniye/); }
  // Botlar bitirir; ya da süre dolar
  for (const p of room.players) if (p.botTimer) { const cb = p.botTimer._onTimeout; clearTimeout(p.botTimer); p.botTimer = null; cb(); }
  if (room.phase === 'writing') { const cb = room.endTimer._onTimeout; clearTimeout(room.endTimer); room.endTimer = null; await cb(); }
  for (let k = 0; k < 20 && room.phase === 'judging'; k++) await new Promise(res => setTimeout(res, 5));
  assert.equal(room.phase, 'results'); const st = s1.last('isim:state');
  assert.equal(st.results.rows.length, 4); assert(st.results.rows[0].cells.isim.text !== undefined);
  assert.equal(room.totals[0], st.results.rows[0].total);
  // Maç sonuna kadar
  for (let g = 0; g < 50 && room.phase !== 'matchEnd'; g++) {
    if (room.phase === 'results') fire(room, 'nextTimer');
    if (room.phase === 'letter') fire(room, 'spinTimer');
    if (room.phase === 'writing') { const cb = room.endTimer._onTimeout; clearTimeout(room.endTimer); room.endTimer = null; await cb(); }
    for (let k = 0; k < 20 && room.phase === 'judging'; k++) await new Promise(res => setTimeout(res, 5));
  }
  assert.equal(room.phase, 'matchEnd'); assert.equal(room.history.length, 5); assert.equal(new Set(room.used).size, 5);
  assert(s1.last('isim:state').winners.length >= 1);

  // 6) Eşli 6 kişi, açık masa: kurucu başlatır, boş koltuklar botla dolar, takım puanı; izleyici
  const h = new FakeSocket(); IS.onSocket(h);
  await h.receive('isim:join', { mode: 'create', isPublic: true, size: 6, team: true, rounds: 5, time: 45, token: 'h'.repeat(30), playerName: 'Kurucu' });
  const r2 = IS.rooms.get(h.last('isim:joined').code);
  assert(IS.stats().waiting.some(x => x.code === r2.code && x.team && x.size === 6));
  const w = new FakeSocket(); IS.onSocket(w);
  await w.receive('isim:watch', { code: r2.code });
  assert.equal(w.last('isim:state').spectator, true); assert.equal(w.last('isim:state').myAnswers, null);
  await h.receive('isim:start');
  assert.equal(r2.players.length, 6, 'eşlide boş koltuk botla dolar');
  assert.deepEqual(h.last('isim:state').players.map(p => p.team), [0, 1, 2, 0, 1, 2], 'karşılıklı koltuklar takım');
  assert.equal(h.last('isim:state').watchers, 1);
  await w.receive('isim:answers', { answers: { isim: 'x' } }); // izleyici yazamaz
  assert(!r2.players.some(p => p.token === undefined));
  h.data.isimChatAt = 0; await h.receive('isim:chat', { text: 'Selam' }); assert.equal(w.last('isim:chat').text, 'Selam', 'izleyici sohbeti okur');
  await w.receive('isim:unwatch'); assert.equal(r2.watchers.size, 0);
  console.log(`v43IsimSehir: harf/Türkçe karakter, sözlük (${W.CATEGORIES.map(c => W.LIST[c].length).reduce((x, y) => x + y)} kelime), yapay zekâ hakem ve önbellek, puan, botlar (boş harf-kategori ${empty}), 4 kişilik 5 turluk maç, eşli takım ve izleyici geçti`);
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
