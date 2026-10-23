'use strict';
// Batak masaları: katılma, ihale, koz seçimi, oynama, süreler, botlar ve yeniden bağlanma.
// Sunucu yetkilidir: istemci yalnızca "şu kartı oynamak istiyorum" der; kural (logic.js) burada denetlenir.
// Socket olayları 'batak:' önekli; okey olaylarıyla karışmaz. Masalar RAM'de tutulur.
const crypto = require('node:crypto');
const L = require('./logic');
const Bot = require('./bot');

const BID_MS = 20000, PLAY_MS = 25000, BOT_MS = 900, TRICK_SHOW_MS = 1300, NEXT_ROUND_MS = 7000, FILL_MS = 6000, IDLE_MS = 60000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['Bot Ayşe', 'Bot Mehmet', 'Bot Zeynep', 'Bot Can', 'Bot Elif', 'Bot Emre'];

function install({ io, Accounts, Avatars, Logger }) {
  const rooms = new Map();
  const newCode = () => { let c; do c = 'B' + Array.from(crypto.randomBytes(5), b => ALPHABET[b % ALPHABET.length]).join(''); while (rooms.has(c)); return c; };
  const clear = (room, ...keys) => { for (const k of keys) { if (room[k]) clearTimeout(room[k]); room[k] = null; } };
  // Zamanlayıcı içindeki hata masayı dondurmasın: kaydedilir, masa sıradaki adıma geçmeye çalışır.
  const guarded = (room, label, fn) => (...a) => { try { fn(...a); } catch (err) { Logger.error?.(`Batak ${label} hatası:`, err); try { schedule(room); } catch (_) {} } };
  const timer = (room, key, ms, label, fn) => { clear(room, key); room[key] = setTimeout(guarded(room, label, () => { room[key] = null; fn(); }), ms); room[key].unref?.(); };

  function makeRoom(opts) {
    const type = L.TYPES[opts.type] ? opts.type : 'ihaleli';
    const room = { code: newCode(), type, roundLimit: L.ROUND_LIMITS.includes(Number(opts.rounds)) ? Number(opts.rounds) : 5,
      isPublic: !!opts.isPublic, autoBots: !!opts.autoBots, hostToken: null, players: [], phase: 'waiting', round: 0, dealer: 0,
      totals: [0, 0, 0, 0], history: [], hands: null, bidding: null, contract: null, trump: null, trumpBroken: false,
      trick: [], lastTrick: null, tricks: [0, 0, 0, 0], played: new Set(), turn: -1, deadline: 0, revealed: null, notice: '' };
    rooms.set(room.code, room);
    return room;
  }
  const seatOfToken = (room, token) => room.players.findIndex(p => p.token === token);
  const humans = room => room.players.filter(p => !p.isBot);
  function addBot(room) {
    const used = new Set(room.players.map(p => p.name));
    const name = BOT_NAMES.find(n => !used.has(n)) || `Bot ${room.players.length + 1}`;
    room.players.push({ token: 'bot-' + crypto.randomBytes(6).toString('hex'), socketId: null, name, avatar: Avatars.randomAvatar(), isBot: true, accountId: null });
  }

  // ---------- Görünüm ----------
  function snapshot(room, seat) {
    const b = room.bidding, playing = room.phase === 'playing' && room.turn === seat;
    const hand = room.hands?.[seat] || [];
    return {
      code: room.code, type: room.type, team: L.TYPES[room.type].team, declare: !!L.TYPES[room.type].declare,
      roundLimit: room.roundLimit, round: room.round, phase: room.phase, me: seat, isHost: room.players[seat]?.token === room.hostToken,
      isPublic: room.isPublic, notice: room.notice,
      players: room.players.map((p, i) => ({ name: p.name, avatar: p.avatar, isBot: !!p.isBot, connected: !!p.socketId || !!p.isBot,
        bid: b ? b.bids[i] : null, passed: b ? b.passed[i] : false, tricks: room.tricks[i], total: room.totals[i], cards: room.hands?.[i]?.length || 0 })),
      hand, legal: playing ? L.legalCards(hand, room.trick, room.trump, room.trumpBroken).map(c => c.id) : [],
      turn: room.turn, deadline: room.deadline, remainingMs: Math.max(0, room.deadline - Date.now()), turnMs: room.turnMs || PLAY_MS, dealer: room.dealer,
      bidding: b && !b.done ? { high: b.high, minNext: L.TYPES[room.type].declare ? 0 : (b.high ? b.high.bid + 1 : L.TYPES[room.type].minBid) } : null,
      contract: room.contract, trump: room.trump, trumpBroken: room.trumpBroken, trick: room.trick, lastTrick: room.lastTrick,
      revealed: room.revealed != null && room.revealed !== seat ? { seat: room.revealed, cards: room.hands[room.revealed] } : null,
      canCancel: room.phase === 'bidding' && untouched(room) && L.canCancel(hand), history: room.history,
    };
  }
  const untouched = room => room.bidding && room.bidding.bids.every(v => v == null) && room.bidding.passed.every(p => !p);
  function emit(room) {
    room.players.forEach((p, i) => { if (p.socketId) io.to(p.socketId).emit('batak:state', snapshot(room, i)); });
  }
  function lobbyInfo(room) {
    return { code: room.code, type: room.type, rounds: room.roundLimit, players: room.players.length,
      seats: [0, 1, 2, 3].map(i => room.players[i] ? { name: room.players[i].name, avatar: room.players[i].avatar, isBot: !!room.players[i].isBot } : null) };
  }

  // ---------- Akış ----------
  function startMatch(room) {
    room.round = 0; room.totals = [0, 0, 0, 0]; room.history = []; room.dealer = crypto.randomInt(4);
    clear(room, 'fillTimer');
    startRound(room, true);
  }
  function startRound(room, first = false) {
    if (!first) room.dealer = (room.dealer + 1) % 4; // dağıtıcı saatin tersine döner
    room.round++;
    redeal(room);
  }
  function redeal(room) {
    room.hands = L.deal(room.dealer);
    room.bidding = L.startBidding(room.type, room.dealer);
    room.contract = null; room.trump = L.TYPES[room.type].fixedTrump || null; room.trumpBroken = false;
    room.trick = []; room.lastTrick = null; room.tricks = [0, 0, 0, 0]; room.played = new Set(); room.revealed = null;
    room.phase = 'bidding'; room.turn = room.bidding.turn;
    // Elinde 10'dan büyük kart olmayan bot el iptal ister (insan oyuncuya düğme gösterilir).
    const botCancel = room.players.findIndex((p, i) => p.isBot && L.canCancel(room.hands[i]));
    if (botCancel >= 0 && !room.cancelGuard) { room.cancelGuard = true; room.notice = `${room.players[botCancel].name} el iptal etti, kartlar yeniden dağıtıldı.`; return redeal(room); }
    room.cancelGuard = false;
    schedule(room);
  }
  // Sıradaki adımı zamanla: sıra bot ya da bağlantısı kopuk oyuncudaysa kısa sürede otomatik hamle; değilse süre sınırı.
  function schedule(room) {
    clear(room, 'turnTimer', 'botTimer');
    if (!['bidding', 'trump', 'playing'].includes(room.phase)) { emit(room); return; }
    const p = room.players[room.turn];
    const ms = room.phase === 'playing' ? PLAY_MS : BID_MS;
    room.deadline = Date.now() + ms; room.turnMs = ms;
    if (p.isBot) timer(room, 'botTimer', BOT_MS, 'bot', () => autoMove(room));
    else timer(room, 'turnTimer', p.socketId ? ms : Math.min(ms, 8000), 'süre', () => autoMove(room, true));
    emit(room);
  }
  function wantOf(room, seat) {
    if (L.TYPES[room.type].declare && room.bidding.bids[seat] === 0) return 'avoid';
    return 'win';
  }
  function autoMove(room, timedOut = false) {
    const seat = room.turn, hand = room.hands[seat];
    if (timedOut) room.notice = `${room.players[seat].name} süresi dolduğu için otomatik oynandı.`;
    if (room.phase === 'bidding') return act(room, seat, 'bid', timedOut && !L.TYPES[room.type].declare ? null : Bot.chooseBid(room.bidding, hand, seat));
    if (room.phase === 'trump') return act(room, seat, 'trump', Bot.bestTrump(hand).suit);
    if (room.phase === 'playing') {
      const card = Bot.choosePlay({ hand, trick: room.trick, trump: room.trump, trumpBroken: room.trumpBroken, seat, played: room.played,
        want: wantOf(room, seat), partner: L.TYPES[room.type].team ? (seat + 2) % 4 : null });
      return act(room, seat, 'play', card.id);
    }
  }
  // Bütün hamleler buradan geçer; hata metni ya da null döner.
  function act(room, seat, kind, value) {
    if (seat !== room.turn) return 'Sıra sizde değil.';
    if (kind === 'bid') {
      if (room.phase !== 'bidding') return 'Şu an ihale yok.';
      const err = L.placeBid(room.bidding, seat, value == null ? null : Number(value));
      if (err) return err;
      room.notice = '';
      if (!room.bidding.done) { room.turn = room.bidding.turn; schedule(room); return null; }
      if (L.TYPES[room.type].declare) { room.phase = 'playing'; room.turn = (room.dealer + 1) % 4; }
      else {
        room.contract = room.bidding.contract;
        if (room.contract.forced) room.notice = `Kimse ihaleye girmedi: ${room.players[room.contract.seat].name} ${room.contract.bid} el almak zorunda.`;
        room.phase = 'trump'; room.turn = room.contract.seat;
      }
      schedule(room); return null;
    }
    if (kind === 'trump') {
      if (room.phase !== 'trump') return 'Şu an koz seçilmiyor.';
      if (!L.SUITS.includes(value)) return 'Geçersiz koz.';
      room.trump = value; room.phase = 'playing'; room.turn = room.contract.seat;
      room.notice = `Koz ${L.SUIT_NAMES[value]}.`;
      schedule(room); return null;
    }
    if (kind === 'play') {
      if (room.phase !== 'playing') return 'Şu an kart oynanmıyor.';
      const hand = room.hands[seat], card = hand.find(c => c.id === value);
      if (!card) return 'Bu kart elinizde yok.';
      if (!L.legalCards(hand, room.trick, room.trump, room.trumpBroken).some(c => c.id === card.id)) return illegalReason(room, hand, card);
      room.hands[seat] = hand.filter(c => c.id !== card.id);
      room.trick.push({ seat, card }); room.played.add(card.id);
      if (card.suit === room.trump) room.trumpBroken = true;
      // Eşli: ilk kart oynanınca ihaleyi alanın eşi kartlarını masaya açar.
      if (L.TYPES[room.type].team && room.revealed == null && room.contract) room.revealed = (room.contract.seat + 2) % 4;
      room.notice = '';
      if (room.trick.length < 4) { room.turn = (seat + 1) % 4; schedule(room); return null; }
      const win = L.trickWinner(room.trick, room.trump);
      room.tricks[win.seat]++;
      room.phase = 'trickEnd'; room.turn = win.seat; room.winner = win.seat;
      clear(room, 'turnTimer', 'botTimer'); emit(room);
      timer(room, 'trickTimer', TRICK_SHOW_MS, 'el', () => {
        room.lastTrick = { cards: room.trick, winner: win.seat }; room.trick = [];
        if (room.hands.every(h => !h.length)) endRound(room);
        else { room.phase = 'playing'; schedule(room); }
      });
      return null;
    }
    return 'Bilinmeyen hamle.';
  }
  function illegalReason(room, hand, card) {
    if (!room.trick.length) return 'Koz henüz oynanmadı; koz dışında bir renkle açmalısın.';
    const led = room.trick[0].card.suit;
    if (card.suit !== led && hand.some(c => c.suit === led)) return `Yerdeki rengi (${L.SUIT_NAMES[led]}) takip etmek zorundasın.`;
    if (card.suit !== led && card.suit !== room.trump && hand.some(c => c.suit === room.trump)) return 'Elinde açılan renk yoksa koz atmak zorundasın.';
    return 'Yerdeki kartı geçebiliyorsan büyütmek zorundasın.';
  }
  function endRound(room) {
    const scores = L.roundScores(room.type, room.tricks, room.bidding.bids, room.contract);
    scores.forEach((s, i) => { room.totals[i] += s; });
    room.history.push({ round: room.round, scores, tricks: [...room.tricks], bids: [...room.bidding.bids], contract: room.contract, trump: room.trump });
    const over = room.round >= room.roundLimit;
    room.phase = over ? 'matchEnd' : 'roundEnd'; room.turn = -1;
    if (over) {
      const best = Math.max(...room.totals);
      room.winners = [0, 1, 2, 3].filter(i => room.totals[i] === best);
      for (const [i, p] of room.players.entries()) if (p.accountId && !p.isBot) { try { Accounts.award(p.accountId, room.winners.includes(i)); } catch (_) {} }
    } else timer(room, 'nextTimer', NEXT_ROUND_MS, 'yeni el', () => startRound(room));
    emit(room);
  }

  // ---------- Masaya giriş/çıkış ----------
  function leave(room, seat) {
    const p = room.players[seat]; if (!p) return;
    if (room.phase === 'waiting') room.players.splice(seat, 1);
    else { p.isBot = true; p.socketId = null; p.token = 'bot-' + crypto.randomBytes(6).toString('hex'); p.name += ' (bot)'; p.accountId = null; }
    // Masayı açan ayrıldıysa yönetim masadaki ilk gerçek oyuncuya geçer.
    if (!room.players.some(q => q.token === room.hostToken && !q.isBot)) room.hostToken = humans(room)[0]?.token || null;
    tidy(room);
    if (rooms.has(room.code)) { if (room.phase === 'waiting') emit(room); else schedule(room); }
  }
  // Masada bağlı gerçek oyuncu kalmadıysa bir süre sonra masa silinir.
  function tidy(room) {
    if (room.players.some(p => !p.isBot && p.socketId)) { clear(room, 'idleTimer'); return; }
    if (!humans(room).length) return remove(room);
    if (!room.idleTimer) timer(room, 'idleTimer', IDLE_MS, 'boş masa', () => remove(room));
  }
  function remove(room) { clear(room, 'turnTimer', 'botTimer', 'trickTimer', 'nextTimer', 'fillTimer', 'idleTimer'); rooms.delete(room.code); }
  function seatPlayer(room, socket, data, account) {
    const name = account ? account.username : String(data?.playerName || '').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Oyuncu';
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return 'Bu masada aynı isim var.';
    const avatar = Avatars.ref(account?.avatar || (Avatars.BUILTIN.includes(data?.avatar) ? data.avatar : 'default.svg'));
    room.players.push({ token: String(data.token), socketId: socket.id, name, avatar, isBot: false, accountId: account?.id || null });
    if (!room.hostToken) room.hostToken = String(data.token);
    socket.data.batakCode = room.code; socket.data.batakToken = String(data.token);
    socket.emit('batak:joined', { code: room.code });
    if (room.players.length === 4) startMatch(room);
    else { if (room.autoBots) timer(room, 'fillTimer', FILL_MS, 'bot doldur', () => fillWithBots(room)); emit(room); }
    return null;
  }
  // Bekleyen masayı botlarla doldur; bu arada bağlantısı kopup dönmeyen oyuncular koltuğu kilitlemesin.
  function fillWithBots(room) {
    room.players = room.players.filter(p => p.isBot || p.socketId);
    if (!humans(room).length) return remove(room);
    if (!room.players.some(p => p.token === room.hostToken)) room.hostToken = humans(room)[0].token;
    while (room.players.length < 4) addBot(room);
    startMatch(room);
  }
  const where = socket => { const room = rooms.get(socket.data.batakCode); return { room, seat: room ? seatOfToken(room, socket.data.batakToken) : -1 }; };

  function onSocket(socket) {
    const fail = msg => socket.emit('batak:error', { message: msg });
    socket.on('batak:join', data => {
      if (!/^[\w-]{20,120}$/.test(String(data?.token || ''))) return fail('Oyuncu oturumu geçersiz.');
      if (where(socket).room) return fail('Zaten bir Batak masasındasın.');
      const account = Accounts.fromToken(data?.authToken);
      let room;
      if (data.mode === 'quick') {
        const type = L.TYPES[data.type] ? data.type : 'ihaleli';
        room = [...rooms.values()].find(r => r.isPublic && r.autoBots && r.phase === 'waiting' && r.type === type && r.players.length < 4)
          || makeRoom({ type, rounds: data.rounds, isPublic: true, autoBots: true });
      } else if (data.mode === 'create') room = makeRoom({ type: data.type, rounds: data.rounds, isPublic: false, autoBots: false });
      else if (data.mode === 'code') {
        room = rooms.get(String(data.code || '').trim().toUpperCase());
        if (!room) return fail('Bu kodda Batak masası bulunamadı.');
        if (room.phase !== 'waiting' || room.players.length >= 4) return fail('Masa dolu veya oyun başladı.');
      } else return fail('Bir giriş şekli seçin.');
      const err = seatPlayer(room, socket, data, account);
      if (err) { if (!room.players.length) remove(room); return fail(err); }
    });
    socket.on('batak:rejoin', data => {
      const room = rooms.get(String(data?.code || '').toUpperCase());
      const seat = room ? seatOfToken(room, String(data?.token || '')) : -1;
      if (!room || seat < 0) return fail('Masa bulunamadı veya kapandı. Lobiden yeni masaya otur.');
      const p = room.players[seat];
      if (p.socketId && p.socketId !== socket.id) io.to(p.socketId).emit('batak:replaced');
      p.socketId = socket.id; socket.data.batakCode = room.code; socket.data.batakToken = p.token;
      tidy(room);
      if (['bidding', 'trump', 'playing'].includes(room.phase) && room.turn === seat) schedule(room); else emit(room);
    });
    const move = kind => data => {
      const { room, seat } = where(socket);
      if (!room || seat < 0) return fail('Masada değilsin.');
      const err = act(room, seat, kind, kind === 'bid' ? data?.value : kind === 'trump' ? data?.suit : data?.cardId);
      if (err) { fail(err); socket.emit('batak:state', snapshot(room, seat)); }
    };
    socket.on('batak:bid', move('bid'));
    socket.on('batak:trump', move('trump'));
    socket.on('batak:play', move('play'));
    socket.on('batak:cancel', () => {
      const { room, seat } = where(socket);
      if (!room || seat < 0 || room.phase !== 'bidding' || !untouched(room) || !L.canCancel(room.hands[seat])) return fail('El iptal yalnızca ihale başlamadan ve elinde 10\'dan büyük kart yokken istenebilir.');
      room.notice = `${room.players[seat].name} el iptal etti, kartlar yeniden dağıtıldı.`;
      room.cancelGuard = true; redeal(room);
    });
    // Masayı açan: bot ekle / botlarla başlat (bekleme sırasında).
    socket.on('batak:addBot', () => {
      const { room, seat } = where(socket);
      if (!room || room.phase !== 'waiting' || room.players[seat]?.token !== room.hostToken) return fail('Bunu yalnızca masayı açan kişi yapabilir.');
      addBot(room); if (room.players.length === 4) startMatch(room); else emit(room);
    });
    socket.on('batak:startBots', () => {
      const { room, seat } = where(socket);
      if (!room || room.phase !== 'waiting' || room.players[seat]?.token !== room.hostToken) return fail('Bunu yalnızca masayı açan kişi yapabilir.');
      fillWithBots(room);
    });
    // Masa sohbeti: kısa mesaj ya da hazır cümle; masadaki herkese gider, oyuncunun avatarının üstünde balon olarak görünür.
    socket.on('batak:chat', data => {
      const { room, seat } = where(socket);
      if (!room || seat < 0) return;
      const now = Date.now();
      if (now - (socket.data.batakChatAt || 0) < 1200) return fail('Biraz daha yavaş yaz.');
      const text = String(data?.text || '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
      if (!text) return;
      socket.data.batakChatAt = now;
      for (const p of room.players) if (p.socketId) io.to(p.socketId).emit('batak:chat', { seat, name: room.players[seat].name, text });
    });
    // Maç bitince aynı masada yeniden.
    socket.on('batak:rematch', () => {
      const { room, seat } = where(socket);
      if (!room || seat < 0 || room.phase !== 'matchEnd') return;
      startMatch(room);
    });
    socket.on('batak:leave', () => {
      const { room, seat } = where(socket);
      socket.data.batakCode = null;
      if (room && seat >= 0) leave(room, seat);
      socket.emit('batak:left');
    });
    socket.on('disconnect', () => {
      const { room, seat } = where(socket);
      if (!room || seat < 0 || room.players[seat].socketId !== socket.id) return;
      // Lobiden masa sayfasına geçerken eski bağlantı kopar; koltuk korunur, yeni sayfa batak:rejoin ile geri bağlanır.
      room.players[seat].socketId = null;
      tidy(room);
      if (rooms.has(room.code) && room.turn === seat) schedule(room); else if (rooms.has(room.code)) emit(room);
    });
  }
  const stats = () => ({ tables: rooms.size, players: [...rooms.values()].reduce((n, r) => n + humans(r).length, 0),
    waiting: [...rooms.values()].filter(r => r.isPublic && r.phase === 'waiting').map(lobbyInfo) });
  return { onSocket, stats, rooms, _act: act, _autoMove: autoMove };
}
module.exports = { install };
