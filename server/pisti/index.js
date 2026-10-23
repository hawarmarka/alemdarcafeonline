'use strict';
// Pişti masaları: katılma, dağıtım, kart atma, alma, pişti, blöf, süreler, botlar ve yeniden bağlanma.
// Sunucu yetkilidir: istemci yalnızca "şu kartı atmak istiyorum" der; kural (logic.js) burada denetlenir.
// Socket olayları 'pisti:' önekli. Masalar RAM'de tutulur. Sıra numarası i (0..n-1); p.seat masadaki koltuk
// (2 kişide 0 ve 2, karşılıklı). Puan "taraf"a yazılır: eşlide takım (i % 2), değilse oyuncu.
const crypto = require('node:crypto');
const L = require('./logic');
const Bot = require('./bot');
const Extras = require('../tableExtras');

const PLAY_MS = 15000, RESPOND_MS = 10000, AWAY_MS = 6000, BOT_MS = 850, CAPTURE_MS = 950, NEXT_ROUND_MS = 8000, FILL_MS = 6000, IDLE_MS = 60000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['Bot Ayşe', 'Bot Mehmet', 'Bot Zeynep', 'Bot Can', 'Bot Elif', 'Bot Emre'];

function install({ io, Accounts, Avatars, Logger }) {
  const rooms = new Map();
  const extras = Extras.create({ io, prefix: 'pisti' }); // sohbet, ikram, sesli sohbet
  const newCode = () => { let c; do c = 'P' + Array.from(crypto.randomBytes(5), b => ALPHABET[b % ALPHABET.length]).join(''); while (rooms.has(c)); return c; };
  const clear = (room, ...keys) => { for (const k of keys) { if (room[k]) clearTimeout(room[k]); room[k] = null; } };
  // Zamanlayıcı içindeki hata masayı dondurmasın: kaydedilir, masa sıradaki adıma geçmeye çalışır.
  const guarded = (room, label, fn) => (...a) => { try { fn(...a); } catch (err) { Logger.error?.(`Pişti ${label} hatası:`, err); try { schedule(room); } catch (_) {} } };
  const timer = (room, key, ms, label, fn) => { clear(room, key); room[key] = setTimeout(guarded(room, label, () => { room[key] = null; fn(); }), ms); room[key].unref?.(); };

  const size = room => L.TYPES[room.type].players;
  const team = room => L.TYPES[room.type].team;
  const validSeats = room => (size(room) === 2 ? [0, 2] : [0, 1, 2, 3]);
  const sideOf = (room, i) => (team(room) ? i % 2 : i);
  const sideCount = room => (team(room) ? 2 : size(room));
  const next = (room, i) => (i + 1) % size(room);
  const humans = room => room.players.filter(p => !p.isBot);
  const seatOfToken = (room, token) => room.players.findIndex(p => p.token === token);

  function makeRoom(opts) {
    const type = L.TYPES[opts.type] ? opts.type : 'ikili';
    const room = { code: newCode(), type, target: L.TARGETS.includes(Number(opts.target)) ? Number(opts.target) : 101, bluff: opts.bluff === true,
      isPublic: !!opts.isPublic, autoBots: !!opts.autoBots, hostToken: null, players: [], phase: 'waiting', round: 0, dealer: 0,
      totals: [], history: [], deck: [], pile: [], hands: [], captured: [], pistis: [], seen: new Set(), hidden: new Map(),
      closedIds: new Set(), closedSeen: null, lastCapturer: -1, turn: -1, deadline: 0, turnMs: PLAY_MS, notice: '', seq: 0, dealSeq: 0,
      lastPlay: null, bluffState: null, winners: null };
    rooms.set(room.code, room);
    return room;
  }
  function freeSeat(room, wanted) {
    const taken = new Set(room.players.map(p => p.seat)), valid = validSeats(room);
    if (Number.isInteger(wanted)) return valid.includes(wanted) && !taken.has(wanted) ? wanted : -1;
    return valid.find(s => !taken.has(s)) ?? -1;
  }
  function addBot(room) {
    const used = new Set(room.players.map(p => p.name));
    const name = BOT_NAMES.find(n => !used.has(n)) || `Bot ${room.players.length + 1}`;
    room.players.push({ token: 'bot-' + crypto.randomBytes(6).toString('hex'), socketId: null, name, avatar: Avatars.randomAvatar(), isBot: true, accountId: null, level: 1, seat: freeSeat(room) });
  }

  // ---------- Görünüm ----------
  const canBluff = room => room.bluff && room.phase === 'playing' && room.pile.length === 1 && !room.pile[0].closed;
  function snapshot(room, me) {
    const mySide = sideOf(room, me), b = room.bluffState;
    const playing = ['playing', 'capture', 'bluff', 'roundEnd', 'matchEnd'].includes(room.phase);
    return {
      code: room.code, type: room.type, n: size(room), team: team(room), target: room.target, bluff: room.bluff,
      round: room.round, phase: room.phase, me, isHost: room.players[me]?.token === room.hostToken, isPublic: room.isPublic, autoBots: room.autoBots, notice: room.notice, watchers: room.watchers?.size || 0, spectator: me < 0,
      players: room.players.map((p, i) => {
        const side = playing ? sideOf(room, i) : i;
        return { name: p.name, avatar: p.avatar, isBot: !!p.isBot, connected: !!p.socketId || !!p.isBot, seat: p.seat, account: !!p.accountId, level: p.level || 1,
          cards: room.hands[i]?.length || 0, side, total: room.totals[side] || 0, captured: room.captured[side]?.length || 0,
          pistis: (room.pistis[side] || []).map(x => ({ card: x.card, points: x.points, kind: x.kind })) };
      }),
      hand: room.hands[me] || [],
      // Kapalı kartların yüzü gönderilmez (blöfte inanılan kart da kapalı kalır).
      pile: room.pile.map(x => (x.closed ? { closed: true } : { card: x.card })),
      deckCount: room.deck.length, deckBottom: room.deck.length ? room.deck[room.deck.length - 1] : null,
      turn: room.turn, deadline: room.deadline, remainingMs: Math.max(0, room.deadline - Date.now()), turnMs: room.turnMs, dealer: room.dealer,
      lastPlay: room.lastPlay, dealSeq: room.dealSeq, canBluff: canBluff(room) && room.turn === me,
      bluffState: b ? { seat: b.seat, top: b.top, mine: b.seat === me ? b.card : null } : null,
      closedSeen: room.closedSeen && room.closedSeen.side === mySide ? room.closedSeen.cards : null,
      history: room.history, winners: room.winners,
    };
  }
  function emit(room) {
    room.players.forEach((p, i) => { if (p.socketId) io.to(p.socketId).emit('pisti:state', snapshot(room, i)); });
    extras.emitWatchers(room, snapshot); // canlı izleyenler
  }
  function lobbyInfo(room) {
    const host = room.players.find(p => p.token === room.hostToken) || room.players.find(p => !p.isBot);
    return { code: room.code, type: room.type, target: room.target, bluff: room.bluff, players: room.players.length, size: size(room), host: host?.name || '',
      valid: validSeats(room),
      seats: [0, 1, 2, 3].map(s => { const p = room.players.find(q => q.seat === s); return p ? { name: p.name, avatar: p.avatar, isBot: !!p.isBot, level: p.level || 1 } : null; }) };
  }

  // ---------- Akış ----------
  function startMatch(room) {
    if (room.phase === 'waiting' || room.round === 0) room.players.sort((a, b) => (a.seat ?? 9) - (b.seat ?? 9)); // sıra = koltuk sırası
    if (room.voice?.size) extras.voiceBroadcast(room); // sıra numaraları değişti
    room.round = 0; room.totals = Array(sideCount(room)).fill(0); room.history = []; room.winners = null;
    room.dealer = crypto.randomInt(size(room));
    clear(room, 'fillTimer');
    startRound(room, true);
  }
  function startRound(room, first = false) {
    if (!first) room.dealer = next(room, room.dealer); // dağıtıcı saatin tersine döner
    room.round++;
    const r = L.setupRound(size(room), room.dealer);
    Object.assign(room, { deck: r.deck, pile: r.pile, hands: r.hands, captured: Array.from({ length: sideCount(room) }, () => []),
      pistis: Array.from({ length: sideCount(room) }, () => []), seen: new Set([r.pile[3].card.id, r.deck[r.deck.length - 1].id]), hidden: new Map(),
      closedIds: new Set(r.pile.filter(x => x.closed).map(x => x.card.id)), closedSeen: null, lastCapturer: -1, lastPlay: null, bluffState: null,
      bottomId: r.deck[r.deck.length - 1].id });
    room.dealSeq++; room.notice = '';
    room.phase = 'playing'; room.turn = next(room, room.dealer);
    schedule(room);
  }
  // Sıradaki adımı zamanla: sıra bot ya da bağlantısı kopuk oyuncudaysa kısa sürede otomatik hamle; değilse süre sınırı.
  function schedule(room) {
    clear(room, 'turnTimer', 'botTimer');
    if (!['playing', 'bluff'].includes(room.phase)) { emit(room); return; }
    const p = room.players[room.turn], ms = room.phase === 'bluff' ? RESPOND_MS : PLAY_MS;
    room.deadline = Date.now() + ms; room.turnMs = ms;
    if (p.isBot) timer(room, 'botTimer', BOT_MS + (room.phase === 'bluff' ? 600 : 0), 'bot', () => autoMove(room));
    else timer(room, 'turnTimer', p.socketId ? ms : Math.min(ms, AWAY_MS), 'süre', () => autoMove(room, true));
    emit(room);
  }
  // Botun bildikleri: masada görünenler, kendi tarafının gördüğü kapalı kartlar ve kendi tarafının kapalı attığı kartlar.
  function knownTo(room, seat) {
    const seen = new Set(room.seen), side = sideOf(room, seat);
    if (room.closedSeen?.side === side) for (const c of room.closedSeen.cards) seen.add(c.id);
    for (const [id, by] of room.hidden) if (sideOf(room, by) === side) seen.add(id);
    return seen;
  }
  function autoMove(room, timedOut = false) {
    const seat = room.turn;
    if (timedOut) room.notice = `${room.players[seat].name} süresi dolduğu için otomatik oynandı.`;
    if (room.phase === 'bluff') {
      const b = room.bluffState;
      const choice = timedOut ? 'believe' : Bot.chooseResponse({ hand: room.hands[seat], seen: knownTo(room, seat), top: b.top, bluffer: { hand: room.hands[b.seat].length } });
      return act(room, seat, 'respond', choice);
    }
    if (room.phase !== 'playing') return;
    // Destenin altındaki açık kart son dağıtımda dağıtana gider; herkes onun kimde olduğunu bilir.
    const nx = next(room, seat), known = room.deck.length ? [] : room.hands[nx].filter(c => c.id === room.bottomId);
    const pick = Bot.choosePlay({ hand: room.hands[seat], pile: room.pile.map(x => ({ card: x.closed ? null : x.card, closed: x.closed })), seen: knownTo(room, seat),
      next: { hand: room.hands[nx].length, known }, deckLeft: room.deck.length, bluff: room.bluff && canBluff(room) && !timedOut });
    return act(room, seat, 'play', pick);
  }
  // Bütün hamleler buradan geçer; hata metni ya da null döner.
  function act(room, seat, kind, value) {
    if (seat !== room.turn) return 'Sıra sizde değil.';
    const name = room.players[seat].name;
    if (kind === 'play') {
      if (room.phase !== 'playing') return 'Şu an kart atılmıyor.';
      const hand = room.hands[seat], card = hand.find(c => c.id === value?.cardId);
      if (!card) return 'Bu kart elinizde yok.';
      const closed = value?.closed === true;
      if (closed && !canBluff(room)) return 'Kapalı kart yalnızca blöflü masada, yerde tek açık kart varken atılır.';
      room.hands[seat] = hand.filter(c => c !== card);
      room.seq++;
      if (closed) {
        room.bluffState = { seat, card, top: room.pile[0].card };
        room.lastPlay = { seq: room.seq, seat, closed: true };
        room.phase = 'bluff'; room.turn = next(room, seat);
        room.notice = `${name} kartını kapalı attı: "Pişti!" ${room.players[room.turn].name} inanacak mı?`;
        schedule(room); return null;
      }
      const res = L.playResult(room.pile, card), top = room.pile[room.pile.length - 1]?.card;
      room.pile.push({ card, closed: false }); room.seen.add(card.id);
      room.lastPlay = { seq: room.seq, seat, card, capture: res.capture, pisti: res.pisti };
      room.notice = res.pisti ? `${name} ${res.pisti === 20 ? 'VALE PİŞTİ' : 'PİŞTİ'} yaptı! +${res.pisti}` : '';
      if (res.capture) return startCapture(room, seat, res.pisti ? { card: top, points: res.pisti, kind: res.pisti === 20 ? 'vale' : 'pisti' } : null);
      return advance(room, seat);
    }
    if (kind === 'respond') {
      if (room.phase !== 'bluff') return 'Şu an blöf yok.';
      if (value !== 'believe' && value !== 'challenge') return 'İnan ya da aç.';
      const b = room.bluffState, bluffer = room.players[b.seat].name;
      room.bluffState = null; room.seq++;
      if (value === 'believe') {
        const pts = L.bluffPoints(b.top, 'believe');
        room.pile.push({ card: b.card, closed: true }); room.hidden.set(b.card.id, b.seat);
        room.lastPlay = { seq: room.seq, seat: b.seat, closed: true, capture: true, pisti: pts, response: 'believe', by: seat };
        room.notice = `${name} inandı: ${bluffer} +${pts}`;
        return startCapture(room, b.seat, { card: b.top, points: pts, kind: 'blof' });
      }
      const pts = L.bluffPoints(b.top, 'challenge'), real = b.card.rank === b.top.rank;
      room.pile.push({ card: b.card, closed: false }); room.seen.add(b.card.id);
      room.lastPlay = { seq: room.seq, seat: b.seat, card: b.card, capture: real, pisti: real ? pts : 0, response: 'challenge', by: seat, caught: !real, points: pts };
      if (real) { room.notice = `${name} açtı: gerçek pişti! ${bluffer} +${pts}`; return startCapture(room, b.seat, { card: b.top, points: pts, kind: 'blof' }); }
      room.pistis[sideOf(room, seat)].push({ card: b.card, points: pts, kind: 'yakaladi' });
      room.notice = `${name} blöfü yakaladı! +${pts}`;
      return advance(room, b.seat);
    }
    return 'Bilinmeyen hamle.';
  }
  // Alma: atılan kart bir süre yığının üstünde görünür, sonra yığın alanın önüne gider.
  function startCapture(room, seat, pisti) {
    room.phase = 'capture'; room.turn = -1; room.captureBy = seat;
    clear(room, 'turnTimer', 'botTimer'); emit(room);
    timer(room, 'captureTimer', CAPTURE_MS, 'alma', () => { takePile(room, seat, pisti); advance(room, seat); });
    return null;
  }
  function takePile(room, seat, pisti) {
    const side = sideOf(room, seat), cards = room.pile.map(x => x.card);
    room.captured[side].push(...cards);
    // İlk alan, yerdeki kapalı 3 kartı da alır ve (eşiyle) bunlara bakabilir.
    const closed = cards.filter(c => room.closedIds.has(c.id));
    if (closed.length) { room.closedSeen = { side, cards: closed }; room.closedIds.clear(); }
    if (pisti) room.pistis[side].push(pisti);
    room.pile = []; room.lastCapturer = seat;
  }
  function advance(room, from) {
    if (room.hands.every(h => !h.length)) {
      if (!room.deck.length) return endRound(room);
      L.dealHands(room.deck, size(room), room.dealer, room.hands); room.dealSeq++;
    }
    room.phase = 'playing'; room.turn = next(room, from);
    schedule(room); return null;
  }
  function endRound(room) {
    clear(room, 'turnTimer', 'botTimer');
    // Yerde kalan kartları en son alan (kimse almadıysa dağıtan) alır.
    if (room.pile.length) {
      const s = room.lastCapturer >= 0 ? room.lastCapturer : room.dealer;
      room.notice = `Yerde kalan ${room.pile.length} kartı ${room.players[s].name} aldı.`;
      takePile(room, s, null);
    }
    const rows = L.roundScores(room.captured.map((cards, k) => ({ cards, bonus: room.pistis[k].reduce((n, x) => n + x.points, 0) })));
    rows.forEach((r, k) => { room.totals[k] += r.total; });
    room.history.push({ round: room.round, rows, pistis: room.pistis.map(l => l.length) });
    const best = Math.max(...room.totals), leaders = room.totals.map((t, k) => k).filter(k => room.totals[k] === best);
    const over = best >= room.target && leaders.length === 1; // eşitlikte bir el daha
    room.phase = over ? 'matchEnd' : 'roundEnd'; room.turn = -1;
    if (over) {
      room.winners = leaders;
      for (const [i, p] of room.players.entries()) if (p.accountId && !p.isBot) { try { Accounts.award(p.accountId, leaders.includes(sideOf(room, i))); } catch (_) {} }
    } else timer(room, 'nextTimer', NEXT_ROUND_MS, 'yeni el', () => startRound(room));
    emit(room);
  }

  // ---------- Masaya giriş/çıkış ----------
  function leave(room, seat) {
    const p = room.players[seat]; if (!p) return;
    if (room.voice?.delete(p.token)) setTimeout(() => rooms.has(room.code) && extras.voiceBroadcast(room), 0);
    if (room.phase === 'waiting') room.players.splice(seat, 1);
    else { p.isBot = true; p.socketId = null; p.token = 'bot-' + crypto.randomBytes(6).toString('hex'); p.name += ' (bot)'; p.accountId = null; }
    if (!room.players.some(q => q.token === room.hostToken && !q.isBot)) room.hostToken = humans(room)[0]?.token || null;
    tidy(room);
    if (rooms.has(room.code)) { if (['playing', 'bluff'].includes(room.phase)) schedule(room); else emit(room); }
  }
  // Masada bağlı gerçek oyuncu kalmadıysa bir süre sonra masa silinir.
  function tidy(room) {
    if (room.players.some(p => !p.isBot && p.socketId)) { clear(room, 'idleTimer'); return; }
    if (!humans(room).length) return remove(room);
    if (!room.idleTimer) timer(room, 'idleTimer', IDLE_MS, 'boş masa', () => remove(room));
  }
  function remove(room) { clear(room, 'turnTimer', 'botTimer', 'captureTimer', 'nextTimer', 'fillTimer', 'idleTimer'); rooms.delete(room.code); }
  function seatPlayer(room, socket, data, account) {
    const name = account ? account.username : String(data?.playerName || '').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Oyuncu';
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return 'Bu masada aynı isim var.';
    const wanted = data?.seat == null ? null : Number(data.seat), seat = freeSeat(room, wanted);
    if (seat < 0) return wanted == null ? 'Masa dolu.' : 'Bu koltuk az önce doldu, başka bir koltuk seç.';
    const avatar = Avatars.ref(account?.avatar || (Avatars.BUILTIN.includes(data?.avatar) ? data.avatar : 'default.svg'));
    room.players.push({ token: String(data.token), socketId: socket.id, name, avatar, isBot: false, accountId: account?.id || null,
      level: Accounts.cleanUser?.(account)?.level || 1, seat });
    if (!room.hostToken) room.hostToken = String(data.token);
    socket.data.pistiCode = room.code; socket.data.pistiToken = String(data.token);
    socket.emit('pisti:joined', { code: room.code });
    if (room.players.length === size(room)) startMatch(room);
    else { if (room.autoBots) timer(room, 'fillTimer', FILL_MS, 'bot doldur', () => fillWithBots(room)); emit(room); }
    return null;
  }
  // Bekleyen masayı botlarla doldur; bağlantısı kopup dönmeyen oyuncular koltuğu kilitlemesin.
  function fillWithBots(room) {
    room.players = room.players.filter(p => p.isBot || p.socketId);
    if (!humans(room).length) return remove(room);
    if (!room.players.some(p => p.token === room.hostToken)) room.hostToken = humans(room)[0].token;
    while (room.players.length < size(room)) addBot(room);
    startMatch(room);
  }
  const where = socket => { const room = rooms.get(socket.data.pistiCode); return { room, seat: room ? seatOfToken(room, socket.data.pistiToken) : -1 }; };

  function onSocket(socket) {
    const fail = msg => socket.emit('pisti:error', { message: msg });
    socket.on('pisti:join', data => {
      if (!/^[\w-]{20,120}$/.test(String(data?.token || ''))) return fail('Oyuncu oturumu geçersiz.');
      if (where(socket).room) return fail('Zaten bir Pişti masasındasın.');
      const account = Accounts.fromToken(data?.authToken);
      const opts = { type: L.TYPES[data?.type] ? data.type : 'ikili', target: L.TARGETS.includes(Number(data?.target)) ? Number(data.target) : 101, bluff: data?.bluff === true };
      let room;
      if (data.mode === 'quick') {
        room = [...rooms.values()].find(r => r.isPublic && r.autoBots && r.phase === 'waiting' && r.type === opts.type && r.target === opts.target && r.bluff === opts.bluff && r.players.length < size(r))
          || makeRoom({ ...opts, isPublic: true, autoBots: true });
      } else if (data.mode === 'create') room = makeRoom({ ...opts, isPublic: data.isPublic === true, autoBots: false }); // açık: masa listesinde görünür
      else if (data.mode === 'code') {
        room = rooms.get(String(data.code || '').trim().toUpperCase());
        if (!room) return fail('Bu kodda Pişti masası bulunamadı.');
        if (room.phase !== 'waiting' || room.players.length >= size(room)) return fail('Masa dolu veya oyun başladı.');
      } else return fail('Bir giriş şekli seçin.');
      const err = seatPlayer(room, socket, data, account);
      if (err) { if (!room.players.length) remove(room); return fail(err); }
    });
    socket.on('pisti:rejoin', data => {
      const room = rooms.get(String(data?.code || '').toUpperCase());
      const seat = room ? seatOfToken(room, String(data?.token || '')) : -1;
      if (!room || seat < 0) return fail('Masa bulunamadı veya kapandı. Lobiden yeni masaya otur.');
      const p = room.players[seat];
      if (p.socketId && p.socketId !== socket.id) io.to(p.socketId).emit('pisti:replaced');
      p.socketId = socket.id; socket.data.pistiCode = room.code; socket.data.pistiToken = p.token;
      tidy(room);
      if (['playing', 'bluff'].includes(room.phase) && room.turn === seat) schedule(room); else emit(room);
    });
    const move = kind => data => {
      const { room, seat } = where(socket);
      if (!room || seat < 0) return fail('Masada değilsin.');
      const err = act(room, seat, kind, kind === 'play' ? { cardId: data?.cardId, closed: data?.closed === true } : data?.choice);
      if (err) { fail(err); socket.emit('pisti:state', snapshot(room, seat)); }
    };
    socket.on('pisti:play', move('play'));
    socket.on('pisti:respond', move('respond'));
    // Beklerken boş bir koltuğa geç (masadaki OTUR).
    socket.on('pisti:changeSeat', data => {
      const { room, seat } = where(socket);
      if (!room || seat < 0) return fail('Masada değilsin.');
      if (room.phase !== 'waiting') return fail('Oyun başladıktan sonra koltuk değiştirilemez.');
      const to = freeSeat(room, Number(data?.seat));
      if (to < 0) return fail('Bu koltuk dolu.');
      room.players[seat].seat = to; emit(room);
    });
    // Masayı açan: bot ekle / botlarla başlat (bekleme sırasında).
    const host = () => { const { room, seat } = where(socket); return room && room.phase === 'waiting' && room.players[seat]?.token === room.hostToken ? room : null; };
    socket.on('pisti:addBot', () => {
      const room = host(); if (!room) return fail('Bunu yalnızca masayı açan kişi yapabilir.');
      addBot(room); if (room.players.length === size(room)) startMatch(room); else emit(room);
    });
    socket.on('pisti:startBots', () => {
      const room = host(); if (!room) return fail('Bunu yalnızca masayı açan kişi yapabilir.');
      fillWithBots(room);
    });
    extras.attach(socket, where); // masa sohbeti, ikram, sesli sohbet
    extras.attachWatch(socket, { rooms, snapshot, emitAll: emit });
    socket.on('pisti:rematch', () => {
      const { room, seat } = where(socket);
      if (!room || seat < 0 || room.phase !== 'matchEnd') return;
      startMatch(room);
    });
    socket.on('pisti:leave', () => {
      const { room, seat } = where(socket);
      socket.data.pistiCode = null;
      if (room && seat >= 0) leave(room, seat);
      socket.emit('pisti:left');
    });
    socket.on('disconnect', () => {
      const { room, seat } = where(socket);
      if (!room || seat < 0 || room.players[seat].socketId !== socket.id) return;
      // Lobiden masa sayfasına geçerken eski bağlantı kopar; koltuk korunur, yeni sayfa pisti:rejoin ile döner.
      room.players[seat].socketId = null;
      if (room.voice?.delete(room.players[seat].token)) extras.voiceBroadcast(room);
      tidy(room);
      if (rooms.has(room.code) && room.turn === seat) schedule(room); else if (rooms.has(room.code)) emit(room);
    });
  }
  const stats = () => ({ tables: rooms.size, players: [...rooms.values()].reduce((n, r) => n + humans(r).length, 0),
    waiting: [...rooms.values()].filter(r => r.isPublic && r.phase === 'waiting').map(lobbyInfo) });
  return { onSocket, stats, rooms, _act: act, _autoMove: autoMove };
}
module.exports = { install };
