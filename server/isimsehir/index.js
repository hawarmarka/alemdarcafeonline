'use strict';
// İsim Şehir masaları: 2–10 kişi, tekli ya da eşli. Akış: bekleme → harf (çark) → yazma → hakem (sözlük + yapay zekâ) → sonuç → …
// İlk "BİTİRDİM" diyen (bütün kutuları doldurmuşsa) diğerlerinin süresini 10 saniyeye indirir; herkes bitirirse el hemen biter.
// Cevaplar yazılırken sunucuya taslak olarak gider; süre dolunca son taslak sayılır. Başkalarının cevapları sonuçta görünür.
// Socket olayları 'isim:' önekli. Masalar RAM'de. Sıra numarası i, p.seat masadaki yer; eşlide karşılıklı koltuklar takım.
const crypto = require('node:crypto');
const W = require('./words');
const L = require('./logic');
const Bot = require('./bot');
const Judge = require('./judge');
const Extras = require('../tableExtras');

const SPIN_MS = 2600, LAST_MS = 10000, RESULT_MS = 14000, FILL_MS = 6000, IDLE_MS = 60000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['Bot Ayşe', 'Bot Mehmet', 'Bot Zeynep', 'Bot Can', 'Bot Elif', 'Bot Emre', 'Bot Deniz', 'Bot Selin', 'Bot Kerem', 'Bot Ece'];

function install({ io, Accounts, Avatars, Logger }) {
  const rooms = new Map();
  const extras = Extras.create({ io, prefix: 'isim' });
  const newCode = () => { let c; do c = 'S' + Array.from(crypto.randomBytes(5), b => ALPHABET[b % ALPHABET.length]).join(''); while (rooms.has(c)); return c; };
  const clear = (room, ...keys) => { for (const k of keys) { if (room[k]) clearTimeout(room[k]); room[k] = null; } };
  const guarded = (room, label, fn) => (...a) => { try { fn(...a); } catch (err) { Logger.error?.(`İsim Şehir ${label} hatası:`, err); } };
  const timer = (room, key, ms, label, fn) => { clear(room, key); room[key] = setTimeout(guarded(room, label, () => { room[key] = null; fn(); }), ms); room[key].unref?.(); };
  const humans = room => room.players.filter(p => !p.isBot);
  const seatOfToken = (room, token) => room.players.findIndex(p => p.token === token);
  const teamOf = (room, i) => (room.team ? room.players[i].seat % (room.size / 2) : i);
  const blank = () => Object.fromEntries(W.CATEGORIES.map(c => [c, '']));
  const filled = a => W.CATEGORIES.filter(c => Judge.clean(a?.[c])).length;

  // İstemciden gelen ayarlar izin verilen değerlere indirgenir (eşli en az 4 kişi).
  function settings(o) {
    const size = L.SIZES.includes(Number(o.size)) ? Number(o.size) : 4;
    return { size, team: o.team === true && size >= 4, rounds: L.ROUNDS.includes(Number(o.rounds)) ? Number(o.rounds) : 5, time: L.TIMES.includes(Number(o.time)) ? Number(o.time) : 60 };
  }
  function makeRoom(o) {
    const room = { code: newCode(), ...settings(o), isPublic: !!o.isPublic, autoBots: !!o.autoBots, hostToken: null,
      players: [], phase: 'waiting', round: 0, letter: null, used: [], deadline: 0, answers: [], finished: new Set(), totals: [], history: [],
      results: null, notice: '', winners: null };
    rooms.set(room.code, room);
    return room;
  }
  function freeSeat(room, wanted) {
    const taken = new Set(room.players.map(p => p.seat));
    if (Number.isInteger(wanted)) return wanted >= 0 && wanted < room.size && !taken.has(wanted) ? wanted : -1;
    for (let s = 0; s < room.size; s++) if (!taken.has(s)) return s;
    return -1;
  }
  function addBot(room) {
    const used = new Set(room.players.map(p => p.name));
    const name = BOT_NAMES.find(n => !used.has(n)) || `Bot ${room.players.length + 1}`;
    room.players.push({ token: 'bot-' + crypto.randomBytes(6).toString('hex'), socketId: null, name, avatar: Avatars.randomAvatar(), isBot: true, accountId: null, level: 1,
      seat: freeSeat(room), skill: Bot.randomSkill() });
  }

  // ---------- Görünüm ----------
  function snapshot(room, me) {
    const reveal = ['results', 'matchEnd'].includes(room.phase);
    return {
      code: room.code, size: room.size, team: room.team, rounds: room.rounds, time: room.time, isPublic: room.isPublic, autoBots: room.autoBots,
      isHost: room.players[me]?.token === room.hostToken, me, spectator: me < 0, watchers: room.watchers?.size || 0, ai: Judge.aiEnabled(),
      phase: room.phase, round: room.round, letter: room.phase === 'letter' ? null : room.letter, used: room.used, notice: room.notice,
      deadline: room.deadline, remainingMs: Math.max(0, room.deadline - Date.now()), turnMs: room.time * 1000,
      categories: W.CATEGORIES, catNames: W.CATEGORY_NAMES,
      players: room.players.map((p, i) => ({ name: p.name, avatar: p.avatar, isBot: !!p.isBot, connected: !!p.socketId || !!p.isBot, seat: p.seat, level: p.level || 1,
        account: !!p.accountId, team: room.phase === 'waiting' ? null : teamOf(room, i), total: room.totals[i] || 0,
        finished: room.finished.has(i), filled: reveal ? 5 : filled(room.answers[i]) })),
      myAnswers: me >= 0 ? room.answers[me] || blank() : null,
      results: reveal ? room.results : null, history: room.history, winners: room.winners,
    };
  }
  function emit(room) {
    room.players.forEach((p, i) => { if (p.socketId) io.to(p.socketId).emit('isim:state', snapshot(room, i)); });
    extras.emitWatchers(room, snapshot);
  }
  function lobbyInfo(room) {
    const host = room.players.find(p => p.token === room.hostToken) || room.players.find(p => !p.isBot);
    return { code: room.code, size: room.size, team: room.team, rounds: room.rounds, time: room.time, players: room.players.length, host: host?.name || '',
      seats: Array.from({ length: room.size }, (_, s) => { const p = room.players.find(q => q.seat === s); return p ? { name: p.name, avatar: p.avatar, isBot: !!p.isBot } : null; }) };
  }

  // ---------- Akış ----------
  function startMatch(room) {
    clear(room, 'fillTimer', 'nextTimer');
    if (room.team) while (room.players.length < room.size) addBot(room); // eşlide boş koltuk bırakılmaz
    room.players.sort((a, b) => a.seat - b.seat);
    if (room.voice?.size) extras.voiceBroadcast(room);
    Object.assign(room, { round: 0, used: [], totals: room.players.map(() => 0), history: [], winners: null, results: null });
    startRound(room);
  }
  function startRound(room) {
    room.round++;
    room.letter = L.pickLetter(room.used); room.used.push(room.letter);
    room.answers = room.players.map(() => blank()); room.finished = new Set(); room.results = null; room.notice = '';
    room.phase = 'letter'; room.deadline = Date.now() + SPIN_MS;
    clear(room, 'endTimer', 'nextTimer');
    for (const p of room.players) clear(p, 'botTimer');
    emit(room);
    timer(room, 'spinTimer', SPIN_MS, 'harf', () => beginWriting(room));
  }
  function beginWriting(room) {
    room.phase = 'writing'; room.deadline = Date.now() + room.time * 1000;
    room.notice = `Harf: ${room.letter}`;
    room.players.forEach((p, i) => { if (p.isBot) scheduleBot(room, i); });
    timer(room, 'endTimer', room.time * 1000, 'süre', () => endWriting(room));
    emit(room);
  }
  // within: botun bitirme anını zorla bu süre içine al (biri BİTİRDİM deyince kalan 10 saniye).
  function scheduleBot(room, i, within = 0) {
    const p = room.players[i], round = room.round, plan = within ? { at: 1500 + crypto.randomInt(Math.max(1, within - 2500)), declare: false } : Bot.plan(room.time * 1000);
    clear(p, 'botTimer');
    p.botTimer = setTimeout(guarded(room, 'bot', () => {
      p.botTimer = null;
      if (room.phase !== 'writing' || room.round !== round || room.players[i] !== p) return;
      room.answers[i] = Bot.answers(room.letter, p.skill || 0.75);
      finish(room, i, plan.declare);
    }), plan.at);
    p.botTimer.unref?.();
  }
  // Oyuncu bitirdi. declare: "BİTİRDİM" (bütün kutular doluysa diğerlerine 10 saniye kalır).
  function finish(room, i, declare) {
    if (room.phase !== 'writing' || room.finished.has(i)) return;
    room.finished.add(i);
    if (declare && filled(room.answers[i]) === W.CATEGORIES.length && room.deadline - Date.now() > LAST_MS) {
      room.deadline = Date.now() + LAST_MS;
      room.notice = `${room.players[i].name} bitirdi! Son 10 saniye!`;
      timer(room, 'endTimer', LAST_MS, 'süre', () => endWriting(room));
      room.players.forEach((p, j) => { if (p.isBot && !room.finished.has(j)) scheduleBot(room, j, LAST_MS); }); // botlar da son saniyelerde yazar
    }
    if (room.finished.size === room.players.length) return endWriting(room);
    emit(room);
  }
  async function endWriting(room) {
    if (room.phase !== 'writing') return;
    clear(room, 'endTimer'); for (const p of room.players) clear(p, 'botTimer');
    room.phase = 'judging'; room.notice = Judge.aiEnabled() ? 'Cevaplar kontrol ediliyor (yapay zekâ hakem)…' : 'Cevaplar kontrol ediliyor…'; room.deadline = 0;
    emit(room);
    const round = room.round, list = [];
    room.answers.forEach((a, i) => W.CATEGORIES.forEach(cat => list.push({ i, cat, text: a?.[cat] || '' })));
    let verdicts;
    try { verdicts = await Judge.judgeRound(room.letter, list); }
    catch (err) { Logger.error?.('İsim Şehir hakem hatası:', err); verdicts = list.map(x => Judge.precheck(x.cat, x.text, room.letter)).map(v => (v.pending ? { ...v, valid: false, reason: 'Doğrulanamadı' } : v)); }
    if (!rooms.has(room.code) || room.round !== round || room.phase !== 'judging') return; // masa kapandı ya da yeniden başladı
    const per = room.players.map(() => ({}));
    list.forEach((x, k) => { per[x.i][x.cat] = verdicts[k]; });
    const points = L.scoreRound(per);
    room.results = { letter: room.letter, round, rows: room.players.map((p, i) => ({ seat: i, total: L.sum(points[i]),
      cells: Object.fromEntries(W.CATEGORIES.map(c => [c, { text: per[i][c].text || '', valid: !!per[i][c].valid, canonical: per[i][c].canonical || '', reason: per[i][c].reason || '', by: per[i][c].by || '', pts: points[i][c] }])) })) };
    room.results.rows.forEach((r, i) => { room.totals[i] += r.total; });
    room.history.push({ round, letter: room.letter, points: room.results.rows.map(r => r.total) });
    const over = room.round >= room.rounds;
    room.phase = over ? 'matchEnd' : 'results'; room.notice = '';
    if (over) {
      const score = i => (room.team ? room.players.reduce((n, p, j) => n + (teamOf(room, j) === teamOf(room, i) ? room.totals[j] : 0), 0) : room.totals[i]);
      const best = Math.max(...room.players.map((_, i) => score(i)));
      room.winners = room.players.map((_, i) => i).filter(i => score(i) === best);
      for (const [i, p] of room.players.entries()) if (p.accountId && !p.isBot) { try { Accounts.award(p.accountId, room.winners.includes(i)); } catch (_) {} }
    } else { room.deadline = Date.now() + RESULT_MS; timer(room, 'nextTimer', RESULT_MS, 'yeni tur', () => startRound(room)); }
    emit(room);
  }

  // ---------- Masaya giriş/çıkış ----------
  function leave(room, i) {
    const p = room.players[i]; if (!p) return;
    if (room.voice?.delete(p.token)) setTimeout(() => rooms.has(room.code) && extras.voiceBroadcast(room), 0);
    if (room.phase === 'waiting') room.players.splice(i, 1);
    else { p.isBot = true; p.socketId = null; p.token = 'bot-' + crypto.randomBytes(6).toString('hex'); p.name += ' (bot)'; p.accountId = null; p.skill = 0.7;
      if (room.phase === 'writing' && !room.finished.has(i)) scheduleBot(room, i); }
    if (!room.players.some(q => q.token === room.hostToken && !q.isBot)) room.hostToken = humans(room)[0]?.token || null;
    tidy(room);
    if (rooms.has(room.code)) emit(room);
  }
  function tidy(room) {
    if (room.players.some(p => !p.isBot && p.socketId)) { clear(room, 'idleTimer'); return; }
    if (!humans(room).length) return remove(room);
    if (!room.idleTimer) timer(room, 'idleTimer', IDLE_MS, 'boş masa', () => remove(room));
  }
  function remove(room) { clear(room, 'spinTimer', 'endTimer', 'nextTimer', 'fillTimer', 'idleTimer'); for (const p of room.players) clear(p, 'botTimer'); rooms.delete(room.code); }
  function seatPlayer(room, socket, data, account) {
    const name = account ? account.username : String(data?.playerName || '').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Oyuncu';
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return 'Bu masada aynı isim var.';
    const wanted = data?.seat == null ? null : Number(data.seat), seat = freeSeat(room, wanted);
    if (seat < 0) return wanted == null ? 'Masa dolu.' : 'Bu koltuk az önce doldu, başka bir koltuk seç.';
    const avatar = Avatars.ref(account?.avatar || (Avatars.BUILTIN.includes(data?.avatar) ? data.avatar : 'default.svg'));
    room.players.push({ token: String(data.token), socketId: socket.id, name, avatar, isBot: false, accountId: account?.id || null, level: Accounts.cleanUser?.(account)?.level || 1, seat });
    if (!room.hostToken) room.hostToken = String(data.token);
    socket.data.isimCode = room.code; socket.data.isimToken = String(data.token);
    socket.emit('isim:joined', { code: room.code });
    if (room.players.length === room.size) startMatch(room);
    else { if (room.autoBots) timer(room, 'fillTimer', FILL_MS, 'bot doldur', () => fillWithBots(room)); emit(room); }
    return null;
  }
  function fillWithBots(room) {
    room.players = room.players.filter(p => p.isBot || p.socketId);
    if (!humans(room).length) return remove(room);
    if (!room.players.some(p => p.token === room.hostToken)) room.hostToken = humans(room)[0].token;
    while (room.players.length < room.size) addBot(room);
    startMatch(room);
  }
  const where = socket => { const room = rooms.get(socket.data.isimCode); return { room, seat: room ? seatOfToken(room, socket.data.isimToken) : -1 }; };
  const cleanAnswers = a => Object.fromEntries(W.CATEGORIES.map(c => [c, Judge.clean(a?.[c])]));

  function onSocket(socket) {
    const fail = msg => socket.emit('isim:error', { message: msg });
    socket.on('isim:join', data => {
      if (!/^[\w-]{20,120}$/.test(String(data?.token || ''))) return fail('Oyuncu oturumu geçersiz.');
      if (where(socket).room) return fail('Zaten bir İsim Şehir masasındasın.');
      const account = Accounts.fromToken(data?.authToken);
      const opts = { size: data?.size, team: data?.team === true, rounds: data?.rounds, time: data?.time };
      let room;
      if (data.mode === 'quick') {
        const want = settings(opts);
        room =[...rooms.values()].find(r => r.isPublic && r.autoBots && r.phase === 'waiting' && r.size === want.size && r.team === want.team && r.rounds === want.rounds && r.time === want.time && r.players.length < r.size)
          || makeRoom({ ...opts, isPublic: true, autoBots: true });
      } else if (data.mode === 'create') room = makeRoom({ ...opts, isPublic: data.isPublic === true, autoBots: false });
      else if (data.mode === 'code') {
        room = rooms.get(String(data.code || '').trim().toUpperCase());
        if (!room) return fail('Bu kodda İsim Şehir masası bulunamadı.');
        if (room.phase !== 'waiting' || room.players.length >= room.size) return fail('Masa dolu veya oyun başladı. İstersen İZLE ile seyredebilirsin.');
      } else return fail('Bir giriş şekli seçin.');
      const err = seatPlayer(room, socket, data, account);
      if (err) { if (!room.players.length) remove(room); return fail(err); }
    });
    socket.on('isim:rejoin', data => {
      const room = rooms.get(String(data?.code || '').toUpperCase());
      const i = room ? seatOfToken(room, String(data?.token || '')) : -1;
      if (!room || i < 0) return fail('Masa bulunamadı veya kapandı. Lobiden yeni masaya otur.');
      const p = room.players[i];
      if (p.socketId && p.socketId !== socket.id) io.to(p.socketId).emit('isim:replaced');
      p.socketId = socket.id; socket.data.isimCode = room.code; socket.data.isimToken = p.token;
      tidy(room); emit(room);
    });
    // Yazarken taslak (her değişiklikte, gecikmeli): süre dolunca bu sayılır.
    socket.on('isim:answers', data => {
      const { room, seat } = where(socket);
      if (!room || seat < 0 || room.phase !== 'writing' || room.finished.has(seat)) return;
      room.answers[seat] = cleanAnswers(data?.answers);
    });
    socket.on('isim:finish', data => {
      const { room, seat } = where(socket);
      if (!room || seat < 0) return fail('Masada değilsin.');
      if (room.phase !== 'writing') return fail('Şu an yazma süresi değil.');
      room.answers[seat] = cleanAnswers(data?.answers);
      finish(room, seat, true);
    });
    const host = () => { const { room, seat } = where(socket); return room && room.players[seat]?.token === room.hostToken ? room : null; };
    socket.on('isim:start', () => {
      const room = host(); if (!room || room.phase !== 'waiting') return fail('Oyunu yalnızca masayı açan başlatabilir.');
      if (room.players.length < 2 && !room.team) return fail('En az 2 oyuncu gerekli. BOT EKLE ile bot ekleyebilirsin.');
      startMatch(room);
    });
    socket.on('isim:addBot', () => {
      const room = host(); if (!room || room.phase !== 'waiting') return fail('Bunu yalnızca masayı açan kişi yapabilir.');
      if (room.players.length >= room.size) return fail('Masa dolu.');
      addBot(room); if (room.players.length === room.size) startMatch(room); else emit(room);
    });
    socket.on('isim:startBots', () => { const room = host(); if (!room || room.phase !== 'waiting') return fail('Bunu yalnızca masayı açan kişi yapabilir.'); fillWithBots(room); });
    socket.on('isim:next', () => { const room = host(); if (room?.phase === 'results') { clear(room, 'nextTimer'); startRound(room); } });
    socket.on('isim:changeSeat', data => {
      const { room, seat } = where(socket);
      if (!room || seat < 0) return fail('Masada değilsin.');
      if (room.phase !== 'waiting') return fail('Oyun başladıktan sonra koltuk değiştirilemez.');
      const to = freeSeat(room, Number(data?.seat)); if (to < 0) return fail('Bu koltuk dolu.');
      room.players[seat].seat = to; emit(room);
    });
    extras.attach(socket, where); // masa sohbeti, ikram, sesli sohbet
    extras.attachWatch(socket, { rooms, snapshot, emitAll: emit });
    socket.on('isim:rematch', () => { const { room, seat } = where(socket); if (room && seat >= 0 && room.phase === 'matchEnd') startMatch(room); });
    socket.on('isim:leave', () => {
      const { room, seat } = where(socket);
      socket.data.isimCode = null;
      if (room && seat >= 0) leave(room, seat);
      socket.emit('isim:left');
    });
    socket.on('disconnect', () => {
      const { room, seat } = where(socket);
      if (!room || seat < 0 || room.players[seat].socketId !== socket.id) return;
      room.players[seat].socketId = null;
      if (room.voice?.delete(room.players[seat].token)) extras.voiceBroadcast(room);
      tidy(room); if (rooms.has(room.code)) emit(room);
    });
  }
  const stats = () => ({ tables: rooms.size, players: [...rooms.values()].reduce((n, r) => n + humans(r).length, 0), ai: Judge.aiEnabled(),
    waiting: [...rooms.values()].filter(r => r.isPublic && r.phase === 'waiting').map(lobbyInfo) });
  return { onSocket, stats, rooms, _endWriting: endWriting, _finish: finish };
}
module.exports = { install };
