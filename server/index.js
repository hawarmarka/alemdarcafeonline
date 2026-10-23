'use strict';
// Multiplayer rooms and all authoritative moves. No client-provided tile objects/scores are trusted.
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');
const GameLogic = require('./gameLogic');
const Accounts = require('./accounts');
const Avatars = require('./avatars');
const RoomStore = require('./roomStore');
const Melds = require('../public/js/meldSolver');
const app = express();
app.disable('x-powered-by');
// Coolify/Traefik gibi bir vekil sunucunun arkasında gerçek oyuncu IP'si (giriş deneme sınırı kişi başına olsun)
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
app.use(express.json({ limit: '230kb' }));
const authHits = new Map();
function limitAuth(req, res, next) {
  const ip = req.ip;
  let item = authHits.get(ip);
  if (!item || item.until < Date.now()) item = { n: 0, until: Date.now() + 60000 };
  item.n++; authHits.set(ip, item);
  if (item.n > 12) return res.status(429).json({ error: 'Çok fazla deneme. Bir dakika bekleyin.' });
  next();
}
// Süresi geçen deneme sayaçları silinir; yoksa her yeni IP harita büyüdükçe bellekte kalırdı.
setInterval(() => { const now = Date.now(); for (const [ip, item] of authHits) if (item.until < now) authHits.delete(ip); }, 60000).unref();
function authReq(req) { return Accounts.fromToken((req.headers.authorization || '').replace(/^Bearer /i, '')); }
app.post('/api/register', limitAuth, async (req, res) => {
  try { res.json(await Accounts.register(req.body?.username, req.body?.password)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/login', limitAuth, async (req, res) => {
  try { res.json(await Accounts.login(req.body?.username, req.body?.password)); }
  catch (e) { res.status(401).json({ error: e.message }); }
});
app.get('/api/me', (req, res) => {
  const user = authReq(req);
  if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
  res.json({ user: Accounts.cleanUser(user) });
});
app.post('/api/frame', (req, res) => {
  const user = authReq(req);
  if (!user) return res.status(401).json({ error: 'Önce giriş yapın.' });
  try { res.json({ user: Accounts.updateFrame(user, req.body?.frame) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/avatar', (req, res) => {
  const user = authReq(req);
  if (!user) return res.status(401).json({ error: 'Önce giriş yapın.' });
  try { res.json({ user: Accounts.updateAvatar(user, req.body?.avatar) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/logout', (req, res) => { Accounts.logout((req.headers.authorization || '').replace(/^Bearer /i, '')); res.json({ ok: true }); });
// Adres resmin içerik hash'i olduğu için içerik hiç değişmez: tarayıcı bir kez indirip saklar.
app.get('/api/avatar/:id', (req, res) => {
  const item = Avatars.get(req.params.id);
  if (!item) return res.status(404).end();
  res.set({ 'Content-Type': item.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }).send(item.data);
});
// Görseller/CSS/JS ?v= ile sürümlendiği için önbelleğe alınabilir; HTML her zaman taze gelsin.
app.use(express.static(path.join(__dirname, '..', 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    setHeaders(res, file) { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); }
}));
app.get('/game', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'game.html')));
// storage: 'persistent' olmalı. 'ephemeral' ise Coolify'da /app/data için kalıcı depolama yok, güncellemede hesaplar silinir.
app.get('/health', (_req, res) => res.json({ status: 'ok', storage: Accounts.storageStatus(), rooms: rooms.size }));
app.get('/api/leaderboard', (_req, res) => res.json({ top: Accounts.leaderboard(25) }));
app.get('/api/rooms', (_req, res) => {
  const list = [...rooms.values()].filter(r => r.isPublic);
  const modes = ['klasik', 'katlamali', 'yardimli', 'yardimsiz'];
  res.json({ modes: Object.fromEntries(modes.map(m => [m, {
    players: list.filter(r => r.modeKey === m).reduce((n,r) => n + r.players.length, 0),
    waitingRooms: list.filter(r => r.modeKey === m && !r.started).length
  }])), online: io.engine?.clientsCount || 0, waiting: list.filter(r => !r.started && !r.game && !r.matchEnded && r.players.length < 4).map(r => ({ code: r.code, modeKey: r.modeKey, players: r.players.length, custom: !!r.custom,
    teamMode: r.teamMode, stackingMode: r.stackingMode, assisted: r.assisted, roundLimit: r.roundLimit,
    host: (r.players.find(p => p.token === r.hostToken) || r.players.find(p => !p.isBot))?.name || '' })) });
});
const httpServer = http.createServer(app);
const io = new Server(httpServer, { maxHttpBufferSize: 1e5 });
const rooms = new Map();
RoomStore.init(rooms, reviveRoom); // masalar diske yazılır; güncelleme sonrası oyuncu dönünce geri yüklenir
const POSITION = ['bottom', 'right', 'top', 'left'];
const BASE_TURN_MS = 45000; // Standart sıra süresi
const OPEN_EXTRA_MS = 60000; // El açılan sırada bir defalık ek işlem süresi
const BOT_FILL_DELAY_MS = 8000;
const BOT_THINK_MS = 1200;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode() {
    let code;
    do { code = Array.from(crypto.randomBytes(6)).map(b => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join(''); }
    while (rooms.has(code));
    return code;
}

function turnMsFor(room) {
    return room?.turnDurationMs || BASE_TURN_MS;
}
function botName(room) {
    let n = room.nextBotId || 1;
    let name = `Bot ${n}`;
    while (room.players.some(p => p.name === name)) name = `Bot ${++n}`;
    room.nextBotId = n + 1;
    return name;
}
function addBotToRoom(room, seatIndex = room.players.length) {
    if (room.players.length >= 4 && seatIndex >= room.players.length) return null;
    const name = botName(room);
    const bot = {
        token: `bot-${room.code}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        socketId: null,
        name,
        avatar: Avatars.randomAvatar(),
        frame: 'silver',
        level: 1,
        accountId: null,
        isBot: true
    };
    if (seatIndex >= room.players.length) room.players.push(bot);
    else room.players.splice(seatIndex, 0, bot);
    if (!room.teamMode) room.scores[name] = room.scores[name] || 0;
    else if (!('team1' in room.scores)) room.scores = { team1: 0, team2: 0 };
    return bot;
}
// Oyun başlamadan ayrılan oyuncunun skor satırı da silinir (yoksa 0 puanla şampiyon görünebiliyordu).
function removeSeats(room, shouldRemove) {
    const gone = room.players.filter(shouldRemove);
    room.players = room.players.filter(p => !shouldRemove(p));
    if (!room.teamMode) for (const p of gone) delete room.scores[p.name];
}
function ensureBotFill(room, delay = BOT_FILL_DELAY_MS) {
    if (!room || room.started || room.matchEnded) return;
    // Arkadaşlarla açılan özel masada botları masayı açan kişi ekler (otomatik doldurma yok).
    if (!room.autoBots) { if (room.botFillTimer) clearTimeout(room.botFillTimer); room.botFillTimer = null; lobby(room); return; }
    if (room.botFillTimer) clearTimeout(room.botFillTimer);
    if (room.players.length >= 4) return;
    room.botFillAt = Date.now() + delay;
    room.botFillTimer = setTimeout(guardedTimer(room, 'Bot doldurma', () => {
        room.botFillTimer = null;
        if (room.started || room.matchEnded) return;
        // Oyun başlamadan bağlantısı kopan oyuncular koltuğu kilitlemesin (yoksa oyun hiç başlamazdı).
        if (!room.game) removeSeats(room, p => !p.isBot && !p.socketId);
        if (!room.players.some(p => !p.isBot)) { deleteIfEmpty(room); return; }
        while (room.players.length < 4) addBotToRoom(room);
        lobby(room);
        if (room.players.length === 4) newRound(room);
    }), delay);
    room.botFillTimer.unref?.();
    lobby(room); // bekleyenlere geri sayımı bildir
}
// 101 Okey Plus kuralı: bir sete bir turda en fazla 2 taş işlenebilir.
const MAX_ADDS_PER_GROUP_PER_TURN = 2;
function groupAddsThisTurn(game, owner, groupIndex) {
    const log = game.addLog;
    if (!log || log.serial !== (game.turnSerial || 0)) return 0;
    return log.counts[`${owner}:${groupIndex}`] || 0;
}
function noteGroupAdd(game, owner, groupIndex) {
    if (!game.addLog || game.addLog.serial !== (game.turnSerial || 0)) game.addLog = { serial: game.turnSerial || 0, counts: {} };
    const key = `${owner}:${groupIndex}`;
    game.addLog.counts[key] = (game.addLog.counts[key] || 0) + 1;
}
function findAttachTarget(game, tile) {
    for (let owner = 0; owner < game.playerStates.length; owner++) {
        const state = game.playerStates[owner];
        for (let groupIndex = 0; groupIndex < state.openedGroups.length; groupIndex++) {
            const group = state.openedGroups[groupIndex];
            if (state.openType === 'pairs') continue;
            if (groupAddsThisTurn(game, owner, groupIndex) >= MAX_ADDS_PER_GROUP_PER_TURN) continue;
            if (game.isValidGroup([tile, ...group])) return { owner, groupIndex, position: 'left' };
            if (game.isValidGroup([...group, tile])) return { owner, groupIndex, position: 'right' };
        }
    }
    return null;
}
function attachTileToGroup(room, actorIndex, target, tile) {
    const game = room.game;
    const state = game.playerStates[target.owner];
    const group = state.openedGroups[target.groupIndex];
    const newGroup = target.position === 'left' ? [tile, ...group] : [...group, tile];
    // Bitirmek için son taş atılmalı; son taş işlenemez.
    if (game.playerTiles[actorIndex].length <= 1) return false;
    if (state.openType === 'pairs' || !game.isValidGroup(newGroup)) return false;
    if (groupAddsThisTurn(game, target.owner, target.groupIndex) >= MAX_ADDS_PER_GROUP_PER_TURN) return false;
    noteGroupAdd(game, target.owner, target.groupIndex);
    state.openedGroups[target.groupIndex] = canonicalizeGroup(game, newGroup);
    game.playerTiles[actorIndex] = game.playerTiles[actorIndex].filter(t => t.id !== tile.id);
    const actorState = game.playerStates[actorIndex];
    if (actorState.drawnFromDiscardTile?.id === tile.id) applySidePickup(room, actorIndex, tile);
    return true;
}

function canonicalizeGroup(game, group) {
    return game.arrangeGroup(group);
}

// Masadaki bir serideki/perdeki gerçek okeyin yerine, temsil ettiği taşı koyup okeyi ele alır.
function trySwapTableOkey(room, actorIndex, owner, groupIndex, okeyTileId, tile) {
    const game = room.game;
    const state = game.playerStates[owner];
    const group = state?.openedGroups[groupIndex];
    if (!group || state.openType === 'pairs' || !tile || game.isOkey(tile)) return false;
    const pos = group.findIndex(t => t.id === okeyTileId && game.isOkey(t));
    if (pos < 0) return false;
    const replaced = [...group];
    replaced[pos] = tile;
    const fits = game.isValidSet(group) ? game.isValidSet(replaced) : game.orderedRunStart(replaced) !== null;
    if (!fits) return false;
    const okeyTile = group[pos];
    state.openedGroups[groupIndex] = canonicalizeGroup(game, replaced);
    game.playerTiles[actorIndex] = game.playerTiles[actorIndex].filter(t => t.id !== tile.id);
    game.playerTiles[actorIndex].push(okeyTile);
    const actorState = game.playerStates[actorIndex];
    if (actorState.drawnFromDiscardTile?.id === tile.id) applySidePickup(room, actorIndex, tile);
    return true;
}
function findOkeySwap(game, tile) {
    if (game.isOkey(tile)) return null;
    for (let owner = 0; owner < 4; owner++) {
        const state = game.playerStates[owner];
        if (state.openType === 'pairs') continue;
        for (let groupIndex = 0; groupIndex < state.openedGroups.length; groupIndex++) {
            const group = state.openedGroups[groupIndex];
            for (let pos = 0; pos < group.length; pos++) {
                if (!game.isOkey(group[pos])) continue;
                const replaced = [...group]; replaced[pos] = tile;
                const fits = game.isValidSet(group) ? game.isValidSet(replaced) : game.orderedRunStart(replaced) !== null;
                if (fits) return { owner, groupIndex, okeyTileId: group[pos].id };
            }
        }
    }
    return null;
}
// Taş atılınca masadaki açık bir gruba işlenebiliyorsa ceza yazılır.
function fitsAnyTableGroup(game, tile) {
    return game.playerStates.some((s, owner) => s.openType !== 'pairs' && s.openedGroups.some((group, gi) =>
        groupAddsThisTurn(game, owner, gi) < MAX_ADDS_PER_GROUP_PER_TURN &&
        (game.isValidGroup([...group, tile]) || game.isValidGroup([tile, ...group]))));
}
// Elde en az bir taş bırakacak şekilde seçilebilecek çiftler (yerden alınan taş varsa önce o).
function selectPairsToLay(game, index, requiredTile) {
    const hand = game.playerTiles[index];
    const pairs = game.countPairs(hand);
    const maxPairs = Math.floor((hand.length - 1) / 2);
    if (requiredTile) {
        const needed = pairs.find(p => p.some(t => t.id === requiredTile.id));
        if (!needed) return null;
        return [needed, ...pairs.filter(p => p !== needed)].slice(0, maxPairs);
    }
    return pairs.slice(0, maxPairs);
}

// Seri açmış oyuncu, masada çift açan biri varsa elindeki okeysiz çiftleri çift panosuna indirebilir.
// Bu çiftler seri gruplarından ayrı (extraPairs) tutulur; elde bitirmek için en az bir taş kalır.
function anyPairsOpener(game, except) { return game.playerStates.some((s, i) => i !== except && s.openType === 'pairs'); }
function laySeriesPairs(room, index) {
    const game = room.game, state = game.playerStates[index], hand = game.playerTiles[index];
    const laid = game.countPairs(hand, false).slice(0, Math.floor((hand.length - 1) / 2));
    if (!laid.length) return laid;
    const picked = state.drawnFromDiscardTile;
    state.extraPairs = [...(state.extraPairs || []), ...laid]; // yeni dizi: GERİ TOPLA anlık görüntüsü bozulmasın
    removeSelected(game, index, new Set(laid.flat().map(t => t.id)));
    if (picked && laid.some(p => p.some(t => t.id === picked.id))) applySidePickup(room, index, picked);
    return laid;
}
// Botun bu eldeki planı: seri mi çift mi. Açtıysa açtığı türdür; açmadıysa elindeki çift sayısı
// ve seri puanına bakar (4+ çift ve zayıf seri → çift; 5+ çift her zaman çift).
function botPlan(game, index) {
    const state = game.playerStates[index];
    if (state.hasOpened) return state.openType === 'pairs' ? 'pairs' : 'series';
    const hand = game.playerTiles[index];
    const pairs = game.countPairs(hand).length;
    const series = Melds.solve(hand, game.okey).score;
    if (game.oldBotSeats?.has(index)) return 'series';
    return pairs >= 5 || (pairs >= 4 && series < 85) ? 'pairs' : 'series';
}
// Görünmeyen taşlar: 106 taştan bu oyuncunun eli, masadaki gruplar, atık yığınları ve gösterge düşülür.
function unseenTileCounts(game, index) {
    const key = t => t.isFakeJoker ? 'F' : `${t.color}:${t.number}`;
    const counts = new Map();
    for (const color of ['Kirmizi', 'Yesil', 'Mavi', 'Siyah']) for (let n = 1; n <= 13; n++) counts.set(`${color}:${n}`, 2);
    counts.set('F', 2);
    const seen = [...game.playerTiles[index], ...game.discardPiles.flat(), ...game.playerStates.flatMap(s => [...s.openedGroups.flat(), ...(s.extraPairs || []).flat()]), game.indicator].filter(Boolean);
    for (const t of seen) { const k = key(t); if (counts.has(k)) counts.set(k, Math.max(0, counts.get(k) - 1)); }
    return counts;
}
// Her aday atış için: o taş atılınca kalan elin, görünmeyen bir taş çekildiğinde kazanacağı seri puanı (beklenen artış).
function seriesOuts(game, index, candidates) {
    const hand = game.playerTiles[index];
    const counts = unseenTileCounts(game, index);
    // Yalnızca eldeki taşlarla ilişkili türler (aynı renk ±2, aynı sayı) değerlendirilir; hız için.
    const related = new Set();
    for (const t of hand) {
        if (game.isOkey(t)) continue;
        const e = game.getEffectiveTile(t);
        for (let d = -2; d <= 2; d++) if (e.number + d >= 1 && e.number + d <= 13) related.add(`${e.color}:${e.number + d}`);
        for (const c of ['Kirmizi', 'Yesil', 'Mavi', 'Siyah']) related.add(`${c}:${e.number}`);
    }
    const types = [...related].filter(k => counts.get(k) > 0).map(k => { const [color, n] = k.split(':'); return { k, tile: { id: 'probe-' + k, color, number: Number(n), isFakeJoker: false } }; });
    const result = new Map();
    for (const cand of candidates) {
        const rest = hand.filter(t => t.id !== cand.id);
        // Kalan elin çözümü bir kez yapılır, her deneme taşı için yalnızca o taşı içeren gruplar denenir.
        const gains = Melds.probeGains(rest, game.okey, types.map(x => x.tile));
        let expected = 0;
        types.forEach(({ k }, i) => { if (gains[i] > 0) expected += gains[i] * counts.get(k); });
        result.set(cand.id, expected);
    }
    return result;
}
// Atılacak taş:
// - okey ve masaya işlenebilen taş (101 ceza) atılmaz;
// - plana göre korunanlar: seri planında per/seri taşları, çift planında çiftler;
// - kalanlardan en az işe yarayan atılır (yarım seri/per kuran komşular, aynı taşın eşi değerlidir);
// - eşitlikte: açmadan önce DÜŞÜK taş atılır (yüksek taş 101'e ulaştırır, açmayanın cezası zaten sabit 202),
//   açtıktan sonra YÜKSEK taş atılır (elde kalan ceza azalır).
const DANGER_WEIGHT = Number(process.env.BOT_DANGER_WEIGHT) || 20;
const tileKind = t => t.isFakeJoker ? 'F' : `${t.color}:${t.number}`;
function chooseBotDiscard(room, index) {
    const game = room.game;
    const hand = game.playerTiles[index];
    if (!hand.length) return null;
    const state = game.playerStates[index];
    const plan = botPlan(game, index);
    const protectedIds = new Set();
    if (plan === 'pairs') game.countPairs(hand).forEach(p => p.forEach(t => protectedIds.add(t.id)));
    else Melds.solve(hand, game.okey).groups.forEach(g => g.forEach(t => protectedIds.add(t.id)));
    const safe = hand.filter(tile => !game.isOkey(tile) && !fitsAnyTableGroup(game, tile));
    let candidates = safe.filter(tile => !protectedIds.has(tile.id));
    if (!candidates.length) candidates = safe;
    if (!candidates.length) candidates = hand.filter(tile => !game.isOkey(tile));
    if (!candidates.length) candidates = [...hand];
    const eff = t => game.getEffectiveTile(t);
    const jokers = hand.filter(t => game.isOkey(t)).length;
    const usefulness = tile => hand.reduce((n, other) => {
        if (other.id === tile.id || game.isOkey(other)) return n;
        const a = eff(tile), b = eff(other);
        if (a.color === b.color && a.number === b.number) return n + (plan === 'pairs' ? 4 : 1); // aynı taşın eşi
        if (plan === 'pairs') return n;
        const gap = Math.abs(a.number - b.number);
        if (a.color === b.color && gap === 1) return n + 3;
        if (a.color === b.color && gap === 2) return n + (jokers ? 2 : 1); // okey boşluğu doldurabilir
        if (a.color !== b.color && a.number === b.number) return n + 2;
        return n;
    }, 0);
    // Açmadan önce seri planında: her aday için kalan elin "çıkışlarını" hesapla —
    // henüz görünmeyen taşlardan hangileri gelirse seri puanı ne kadar artar (kopya sayısıyla ağırlıklı).
    // En az potansiyel kaybettiren taş atılır.
    // Rakip takibi: sağdaki oyuncu (atığımızı alan) yerden ne topladıysa, ona yarayacak taşı verme.
    const smart = !game.oldBotSeats?.has(index);
    const nextPicks = smart ? (game.pickLog?.[(index + 1) % 4] || []) : [];
    const danger = tile => { const a = eff(tile); return nextPicks.reduce((n, p) => { if (p.isFakeJoker || game.isOkey(p)) return n; const b = eff(p);
        if (a.color === b.color && Math.abs(a.number - b.number) <= 2) return n + (Math.abs(a.number - b.number) === 1 ? 3 : 2);
        if (a.color !== b.color && a.number === b.number) return n + 3; return n; }, 0); };
    if (!state.hasOpened && plan === 'series' && smart && candidates.length > 1) {
        // Aynı türden iki taşın sonucu aynıdır (eşitlikte küçük id seçilir), biri yeterli.
        const seen = new Set();
        candidates = [...candidates].sort((a, b) => a.id.localeCompare(b.id)).filter(t => !seen.has(tileKind(t)) && seen.add(tileKind(t)));
        const outs = seriesOuts(game, index, candidates);
        if (outs) return candidates.sort((a, b) => (outs.get(b.id) - danger(b) * DANGER_WEIGHT) - (outs.get(a.id) - danger(a) * DANGER_WEIGHT) || usefulness(a) - usefulness(b) || game.getTileValue(a) - game.getTileValue(b) || a.id.localeCompare(b.id))[0];
    }
    const valueOrder = (state.hasOpened || game.oldBotSeats?.has(index)) ? (a, b) => game.getTileValue(b) - game.getTileValue(a) : (a, b) => game.getTileValue(a) - game.getTileValue(b);
    return candidates.sort((a, b) => (usefulness(a) + danger(a) * 2) - (usefulness(b) + danger(b) * 2) || valueOrder(a, b) || a.id.localeCompare(b.id))[0];
}
function maybeBotOpen(room, index) {
    const game = room.game;
    const state = game.playerStates[index];
    if (state.hasOpened) return false;
    const required = state.mustOpenThisTurn ? state.drawnFromDiscardTile?.id : null;
    const minimum = room.stackingMode ? room.minimumOpenScore : 101;
    // Botlar ilk tam tur (4 hamle) boyunca açmaz; gerçek oyuncu gibi eli toparlamaya zaman tanır.
    if ((game.turnSerial || 0) < 4 && !state.mustOpenThisTurn) return false;
    const requiredScore = minimum;
    const solved = Melds.solve(game.playerTiles[index], game.okey, required, true);
    if (solved.groups.length && solved.score >= requiredScore) {
        const validation = game.canOpenHand(index, solved.groups);
        if (validation.valid && validation.score >= requiredScore) {
            const used = new Set(solved.groups.flat().map(t => t.id));
            const pickup = state.drawnFromDiscardTile;
            state.hasOpened = true;
            state.openedAtTurn = game.turnSerial || 0;
            state.openType = 'normal';
            state.openScore = validation.score;
            state.openedGroups = solved.groups.map(g => canonicalizeGroup(game, g));
            state.mustOpenThisTurn = false;
            state.drawnFromDiscardTile = null;
            removeSelected(game, index, used);
            if (pickup) applySidePickup(room, index, pickup);
            if (room.stackingMode) room.minimumOpenScore = validation.score + 1;
            return true;
        }
    }
    const minPairsToOpen = room.stackingMode ? room.minimumPairs : 5;
    const selected = selectPairsToLay(game, index, state.drawnFromDiscardTile);
    if (selected && selected.length >= minPairsToOpen) {
        const used = new Set(selected.flat().map(t => t.id));
        const picked = state.drawnFromDiscardTile;
        state.hasOpened = true;
        state.openedAtTurn = game.turnSerial || 0;
        state.openType = 'pairs';
        state.openScore = 0;
        state.openPairs = selected.length;
        if (room.stackingMode) room.minimumPairs = selected.length + 1; // Katlamalı: sonraki çift açılışı bir çift fazla ister.
        state.openedGroups = selected;
        state.mustOpenThisTurn = false;
        state.drawnFromDiscardTile = null;
        removeSelected(game, index, used);
        if (picked) applySidePickup(room, index, picked);
        return true;
    }
    return false;
}
function botProcessOpenMoves(room, index) {
    const game = room.game;
    const state = game.playerStates[index];
    // Önce yeni seri/per veya çiftleri indir.
    if (state.openType === 'pairs') {
        const extra = selectPairsToLay(game, index, state.drawnFromDiscardTile);
        if (extra?.length) {
            const picked = state.drawnFromDiscardTile;
            state.openedGroups.push(...extra);
            removeSelected(game, index, new Set(extra.flat().map(t => t.id)));
            if (picked && extra.some(p => p.some(t => t.id === picked.id))) applySidePickup(room, index, picked);
        }
    } else {
        const required = state.drawnFromDiscardTile?.id || null;
        let solved = Melds.solve(game.playerTiles[index], game.okey, required, true);
        if (!solved.groups.length && required) solved = Melds.solve(game.playerTiles[index], game.okey, null, true);
        if (solved.groups.length) {
            const picked = state.drawnFromDiscardTile;
            state.openedGroups.push(...solved.groups.map(g => canonicalizeGroup(game, g)));
            const used = new Set(solved.groups.flat().map(t => t.id));
            removeSelected(game, index, used);
            if (picked && used.has(picked.id)) applySidePickup(room, index, picked);
        }
    }
    for (let step = 0; step < 24; step++) {
        let moved = false;
        for (const tile of [...game.playerTiles[index]]) {
            const swap = findOkeySwap(game, tile);
            if (swap && trySwapTableOkey(room, index, swap.owner, swap.groupIndex, swap.okeyTileId, tile)) {
                moved = true;
                break;
            }
            if (game.isOkey(tile)) continue;
            const target = findAttachTarget(game, tile);
            if (target && attachTileToGroup(room, index, target, tile)) {
                moved = true;
                break;
            }
        }
        if (!moved) break;
    }
    // Okeyi elde bekletme (el biterse 101 ceza): el azaldıysa veya deste bitmek üzereyse masaya işle.
    if (!game.oldBotSeats?.has(index)) {
        for (const okeyTile of game.playerTiles[index].filter(t => game.isOkey(t))) {
            if (game.playerTiles[index].length > 4 && game.tiles.length > 12) break;
            const target = findAttachTarget(game, okeyTile);
            if (target) attachTileToGroup(room, index, target, okeyTile);
        }
    }
    // Seri açmış bot da masada çift açan varken elindeki çiftleri indirir (elde kalan ceza azalır).
    if (game.playerStates[index].openType === 'normal' && anyPairsOpener(game, index)) laySeriesPairs(room, index);
}
function runBotTurn(room, index) {
    const game = room.game;
    if (!room.started || !game || game.currentPlayer !== index || !room.players[index]?.isBot) return;
    const state = game.playerStates[index];
    if (!game.hasDrawn) {
        let fromDiscard = false;
        const left = game.getLeftDiscard(index);
        if (left && !game.isOkey(left)) {
            if (state.openType === 'pairs') fromDiscard = game.countPairs([...game.playerTiles[index], left], false).some(p => p.some(t => t.id === left.id)); // yerdeki taşı okeyle eşlemek için alma
            else if (state.hasOpened) {
                fromDiscard = !!findAttachTarget(game, left);
                // Açtıktan sonra: yerdeki taş elle yeni bir seri/per kuruyorsa da al
                if (!fromDiscard && !game.oldBotSeats?.has(index)) fromDiscard = Melds.solve([...game.playerTiles[index], left], game.okey, left.id, true).groups.length > 0;
            }
            else if (!(room.stackingMode && game.playerStates[(index + 3) % 4].openType === 'pairs')) {
                const minimum = room.stackingMode ? room.minimumOpenScore : 101;
                const trial = Melds.solve([...game.playerTiles[index], left], game.okey, left.id, true);
                fromDiscard = trial.score >= minimum;
                // Çift planı: yerdeki taş bir çifti tamamlıyor ve böylece çift açılabiliyorsa al
                if (!fromDiscard) {
                    const minPairs = room.stackingMode ? room.minimumPairs : 5;
                    const withLeft = game.countPairs([...game.playerTiles[index], left], false);
                    fromDiscard = withLeft.length >= minPairs && withLeft.some(p => p.some(t => t.id === left.id));
                }
            }
        }
        let tile = fromDiscard ? game.drawFromDiscard(index) : game.drawFromPile(index);
        // Yerdeki taş alınamıyorsa (ölü taş) desteden çek.
        if (fromDiscard && (!tile || tile.error)) tile = game.drawFromPile(index);
        if (!tile || tile.error) { finishRound(room, null, { type: 'exhausted' }); return; }
        game.playerTiles[index].push(tile);
        game.hasDrawn = true;
    }
    maybeBotOpen(room, index);
    if (game.playerStates[index].hasOpened) botProcessOpenMoves(room, index);
    if (state.mustOpenThisTurn) { timeoutMove(room); return; }
    const discard = chooseBotDiscard(room, index);
    if (!discard) { finishRound(room, null, { type: 'exhausted' }); return; }
    const error = discardAndAdvance(room, index, discard.id);
    if (error) timeoutMove(room);
}

const MODE_PRESETS = { klasik: { stackingMode: false, assisted: true }, katlamali: { stackingMode: true, assisted: true }, yardimli: { stackingMode: false, assisted: true }, yardimsiz: { stackingMode: false, assisted: false } };
function makeRoom(code, isPublic, options = {}) {
    // Açık masalarda kurallar istemciden değil mod anahtarından gelir; aynı moddaki masalar aynı kuralla oynar.
    const modeKey = MODE_PRESETS[options.modeKey] ? options.modeKey : 'klasik';
    // Hazır açık masalar mod ayarını kullanır; oyuncunun 'Masa Aç' ile açtığı masa kendi seçtiği kurallarla açılır.
    if (isPublic && !options.custom) options = { ...options, ...MODE_PRESETS[modeKey], teamMode: false, modeKey };
    else options = { ...options, modeKey };
    const room = { code, isPublic, players: [], game: null, started: false, roundId: 0,
        teamMode: !!options.teamMode, stackingMode: !!options.stackingMode,
        penaltyMode: options.penaltyMode !== false, assisted: options.assisted !== false, modeKey: options.modeKey || 'klasik', minimumOpenScore: 101, minimumPairs: 5, scores: {}, roundHistory: [], completedRounds: 0, roundLimit: [1,2,3,4].includes(Number(options.roundLimit)) ? Number(options.roundLimit) : 4, matchEnded: false, turnDeadline: 0, turnTimer: null, botTurnTimer: null, botFillTimer: null, nextRoundTimer: null, nextBotId: 1, chatHistory: [] };
    // Açık masalar botlarla otomatik dolar; özel masada botları masayı açan kişi ekler (testler autoBots:true verebilir).
    room.custom = !!options.custom;
    room.autoBots = (isPublic && !room.custom) || options.autoBots === true;
    rooms.set(code, room);
    return room;
}
function summary(room) {
    return room.players.map((p, i) => ({ name: p.name, avatar: p.avatar, index: i,
        position: POSITION[i], team: room.teamMode ? i % 2 + 1 : null, level: p.accountId ? p.level : 1, frame: p.frame || 'gold',
        connected: !!p.socketId || !!p.isBot, isBot: !!p.isBot, hasOpened: !!room.game?.playerStates[i]?.hasOpened,
        openType: room.game?.playerStates[i]?.openType || null,
        // Panelde gösterilir: açılış puanı (seri) / çift sayısı ve bu eldeki cezalar.
        openScore: room.game?.playerStates[i]?.openScore || 0,
        openPairs: room.game?.playerStates[i]?.openPairs || 0,
        roundPenalty: room.roundExtras?.[i] || 0,
        tileCount: room.game ? room.game.playerTiles[i].length : 0 }));
}
function lobby(room) {
    RoomStore.markDirty(room);
    // Masayı açan ayrıldıysa yönetim masadaki ilk gerçek oyuncuya geçer
    if (!room.isPublic && !room.players.some(p => p.token === room.hostToken)) room.hostToken = room.players.find(p => !p.isBot)?.token || null;
    io.to(room.code).emit('lobbyUpdate', { code: room.code, isPublic: room.isPublic,
        players: summary(room), teamMode: room.teamMode, started: room.started,
        // Bekleme paneli: masa ayarları ve botların masayı ne zaman dolduracağı
        assisted: room.assisted, stackingMode: room.stackingMode, roundLimit: room.roundLimit, botFillAt: room.botFillTimer ? room.botFillAt : 0,
        hostIndex: room.players.findIndex(p => p.token === room.hostToken), autoBots: !!room.autoBots });
}
function snapshot(room, index) {
    const game = room.game;
    return { roomCode: room.code, roundId: room.roundId, players: summary(room), playerIndex: index,
        turnDeadline: room.turnDeadline, turnRemainingMs: Math.max(0, room.turnDeadline - Date.now()), turnDurationMs: turnMsFor(room),
        teamMode: room.teamMode, stackingMode: room.stackingMode, assisted: room.assisted, modeKey: room.modeKey,
        scores: room.scores, roundHistory: room.roundHistory, minimumOpenScore: room.minimumOpenScore, minimumPairs: room.stackingMode ? room.minimumPairs : 5,
        // Masadaki açılış rozetleri: en yüksek seri açılış puanı ve en çok çift sayısı (açılış yoksa 0).
        openInfo: { series: Math.max(0, ...game.playerStates.filter(s => s.openType === 'normal').map(s => s.openScore || 0)), pairs: Math.max(0, ...game.playerStates.filter(s => s.openType === 'pairs').map(s => s.openPairs || 0)) },
        roundsCompleted: room.completedRounds, roundLimit: room.roundLimit,
        tiles: game.playerTiles[index], currentPlayer: game.currentPlayer,
        hasDrawn: game.hasDrawn, indicator: game.indicator, okey: game.okey,
        pileCount: game.getRemainingTileCount(),
        openedGroups: game.playerStates.map(s => s.openedGroups),
        extraPairs: game.playerStates.map(s => s.extraPairs || []),
        discards: game.discardPiles, myOpenType: game.playerStates[index].openType,
        mustOpenThisTurn: !!game.playerStates[index].mustOpenThisTurn,
        canRetract: canRetract(room, index) && turnChanged(room, index),
        leftLocked: leftLocked(game, index),
        retractPenalty: canRetract(room, index) && !room.turnSnap.states[index].hasOpened && !!game.playerStates[index].hasOpened, drawnFromDiscardTileId: game.playerStates[index].drawnFromDiscardTile?.id || null };
}
function broadcastGame(room) {
    RoomStore.markDirty(room); // her durum değişikliği yayınlanır; masa 2 sn içinde diske yazılır
    if (!room.game || !room.started) return;
    room.players.forEach((p, i) => {
        if (p.socketId) io.to(p.socketId).emit('gameState', snapshot(room, i));
    });
}
function newRound(room) {
    if (room.matchEnded || room.players.length !== 4 || room.players.some(p => !p.socketId && !p.isBot)) return false;
    if (room.nextRoundTimer) clearTimeout(room.nextRoundTimer);
    room.nextRoundTimer = null;
    if (room.botFillTimer) clearTimeout(room.botFillTimer);
    room.botFillTimer = null;
    room.roundId += 1;
    room.lastRoundResult = null;
    room.game = new GameLogic();
    room.tomatoes = [0,0,0,0];
    room.gifts = [0,0,0,0];
    room.roundExtras = [0,0,0,0];
    room.nextRoundReady = new Set();
    room.game.startGame(room.players);
    room.minimumOpenScore = 101;
    room.minimumPairs = 5;
    room.started = true;
    beginTurn(room);
    broadcastGame(room);
    return true;
}
// Yandan alınan taş açılışta veya işlemede kullanıldı: zorunluluk kalkar.
// (101 Okey Plus'ta taşı atan oyuncuya ceza yazılmaz.)
function applySidePickup(room, takerIndex, tile) {
    if (!tile) return;
    room.game.playerStates[takerIndex].drawnFromDiscardTile = null;
    room.game.playerStates[takerIndex].mustOpenThisTurn = false;
}
// Her sıranın süresi otoriter biçimde sunucuda tutulur; tarayıcıyı kapatmak süreyi durdurmaz.
function stopTurn(room) {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    if (room.botTurnTimer) clearTimeout(room.botTurnTimer);
    room.turnTimer = null;
    room.botTurnTimer = null;
    room.turnDeadline = 0;
}
// Zamanlayıcıda beklenmeyen bir hata oluşursa sunucu çökmez ve masa donmaz:
// önce sıradaki oyuncu için otomatik hamle denenir, o da olmazsa el iptal edilip yeniden başlatılır.
function recoverRoom(room, label, err) {
    console.error(`[${room.code}] ${label} hatası:`, err);
    try { if (room.started && room.game) { timeoutMove(room); return; } }
    catch (err2) { console.error(`[${room.code}] otomatik hamle de başarısız:`, err2); }
    try {
        abandonRound(room, 'Teknik bir sorun oluştu; el yeniden başlatılıyor.');
        newRound(room);
    } catch (err3) { console.error(`[${room.code}] el yeniden başlatılamadı:`, err3); }
}
function guardedTimer(room, label, fn) {
    return () => { try { fn(); } catch (err) { recoverRoom(room, label, err); } };
}
function beginTurn(room) {
    stopTurn(room);
    if (!room.started || !room.game) return;
    room.turnDurationMs = BASE_TURN_MS;
    const turnMs = turnMsFor(room);
    room.turnDeadline = Date.now() + turnMs;
    const deadline = room.turnDeadline, roundId = room.roundId, player = room.game.currentPlayer;
    room.turnTimer = setTimeout(guardedTimer(room, 'Sıra süresi', () => {
        if (!room.started || room.roundId !== roundId || room.turnDeadline !== deadline || room.game.currentPlayer !== player) return;
        timeoutMove(room);
    }), turnMs);
    room.turnTimer.unref?.();
    const actor = room.players[player];
    if (actor?.isBot) {
        room.botTurnTimer = setTimeout(guardedTimer(room, 'Bot hamlesi', () => {
            if (!room.started || room.roundId !== roundId || room.game?.currentPlayer !== player || !room.players[player]?.isBot) return;
            runBotTurn(room, player);
        }), BOT_THINK_MS + Math.floor(Math.random() * 1300)); // insan gibi değişken düşünme süresi (1,2–2,5 sn)
        room.botTurnTimer.unref?.();
    }
}
function extendTurnAfterOpening(room, index) {
    if (!room.started || !room.game || room.game.currentPlayer !== index) return;
    if (room.openBonusTurnSerial === room.game.turnSerial) return;
    room.openBonusTurnSerial = room.game.turnSerial;
    // Add one full minute to the REMAINING time, not to every later turn.
    const remaining = Math.max(0, room.turnDeadline - Date.now());
    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.turnDurationMs = turnMsFor(room) + OPEN_EXTRA_MS;
    room.turnDeadline = Date.now() + remaining + OPEN_EXTRA_MS;
    const deadline = room.turnDeadline, roundId = room.roundId;
    room.turnTimer = setTimeout(guardedTimer(room, 'Sıra süresi', () => {
        if (!room.started || room.roundId !== roundId || room.turnDeadline !== deadline || room.game.currentPlayer !== index) return;
        timeoutMove(room);
    }), remaining + OPEN_EXTRA_MS);
    room.turnTimer.unref?.();
}
function fillMissingSeatsWithBots(room) {
    room.players.forEach((p, seat) => {
        if (p.isBot || p.socketId) return;
        const bot = {
            token: `bot-replace-${room.code}-${Date.now()}-${seat}`,
            socketId: null,
            name: p.name,
            avatar: 'default.svg', frame: 'silver', level: 1, accountId: null, isBot: true
        };
        room.players[seat] = bot;
        if (!room.teamMode) room.scores[bot.name] = room.scores[p.name] || 0;
        io.to(room.code).emit('tableChatMessage', {from:'Sistem',message:`${p.name} dönmedi, yeni ele bot devam ediyor.`,at:Date.now()});
    });
}
function discardAndAdvance(room, index, tileId) {
    const game = room.game;
    const state = game.playerStates[index];
    if (state.mustOpenThisTurn) return 'Yerden alınan taş açılışta veya işlemekte kullanılmalı.';
    const tileIndex = game.playerTiles[index].findIndex(t => t.id === tileId);
    if (tileIndex < 0) return 'Atılacak taş bulunamadı.';
    const result = game.discardTile(index, tileIndex);
    if (!result || result.error) return result?.error || 'Taş atılamadı.';
    const isFinalWinningDiscard = state.hasOpened && game.playerTiles[index].length === 0;
    // Atılan taş masadaki açık gruplardan birine uyuyorsa +101 ceza.
    if (room.penaltyMode && !isFinalWinningDiscard && !game.isOkey(result) && fitsAnyTableGroup(game, result)) {
        addPenalty(room, index, 101, 'İşlek taş attı');
    }
    // Gerçek okey atmak da +101 ceza.
    if (room.penaltyMode && !isFinalWinningDiscard && !result.isFakeJoker && result.color === game.okey.color && result.number === game.okey.number) {
        addPenalty(room, index, 101, 'Okey attı');
    }
    if (isFinalWinningDiscard) {
        finishRound(room, index, { type: state.openType === 'pairs' ? 'pairs' : state.openedAtTurn === (game.turnSerial || 0) ? 'instant' : 'normal' });
        return null;
    }
    if (game.tiles.length === 0) { finishRound(room, null, {type:'exhausted'}); return null; }
    game.currentPlayer = (index + 1) % 4;
    game.turnSerial = (game.turnSerial || 0) + 1;
    game.hasDrawn = false;
    beginTurn(room);
    broadcastGame(room);
    return null;
}
function timeoutMove(room) {
    const game = room.game;
    if (!game || !room.started) return;
    const index = game.currentPlayer;
    const state = game.playerStates[index];
    // Yerden alma zorunluluğu yerine getirilemediyse taş geri bırakılır; ortadan çekilir.
    if (state.mustOpenThisTurn && state.drawnFromDiscardTile) {
        const picked = state.drawnFromDiscardTile;
        game.playerTiles[index] = game.playerTiles[index].filter(t => t.id !== picked.id);
        game.discardPiles[(index + 3) % 4].push(picked);
        state.drawnFromDiscardTile = null;
        state.mustOpenThisTurn = false;
        game.hasDrawn = false;
    }
    if (!game.hasDrawn) {
        const tile = game.drawFromPile(index);
        if (!tile || tile.error) { finishRound(room, null, {type:'exhausted'}); return; }
        game.playerTiles[index].push(tile);
        game.hasDrawn = true;
    }
    // Ceza yazdırmayacak (okey/işlenebilir olmayan), per dışı en yüksek taşı at.
    const chosen = chooseBotDiscard(room, index);
    if (!chosen) { finishRound(room, null, {type:'exhausted'}); return; }
    const error = discardAndAdvance(room, index, chosen.id);
    if (error) { stopTurn(room); return; }
    io.to(room.code).emit('autoDiscard', {playerIndex:index, tile:chosen, message:`${room.players[index].name} süre dolduğu için otomatik taş attı.`});
}
function finishRound(room, winnerIndex, result) {
    if (!room.started || !room.game) return;
    stopTurn(room);
    const game = room.game;
    const points = winnerIndex === null ? game.calculateExhaustedPoints() : game.calculatePoints(winnerIndex, result);
    if (room.teamMode) {
        room.scores.team1 = (room.scores.team1 || 0) + points[0] + points[2];
        room.scores.team2 = (room.scores.team2 || 0) + points[1] + points[3];
    } else room.players.forEach((p, i) => room.scores[p.name] = (room.scores[p.name] || 0) + points[i]);
    const roundTotalPoints = points.map((v, i) => v + (room.roundExtras?.[i] || 0));
    room.roundHistory.push(roundTotalPoints);
    room.nextRoundReady = new Set();
    room.completedRounds++;
    room.matchEnded = room.completedRounds >= room.roundLimit;
    if (winnerIndex !== null) room.players.forEach((player, i) => {
        if (player.accountId) Accounts.award(player.accountId, i === winnerIndex);
    });
    const scores = { ...room.scores };
    broadcastGame(room);
    room.started = false;
    // Kazanan = en az toplam ceza puanı alan oyuncu / takım.
    // Yalnızca masadaki oyuncular/takımlar sıralanır; takım şampiyonu "team1" değil oyuncu adlarıyla gösterilir.
    const name = i => room.players[i]?.name || '-';
    const standings = (room.teamMode
        ? [[scores.team1 || 0, `${name(0)} & ${name(2)}`], [scores.team2 || 0, `${name(1)} & ${name(3)}`]]
        : room.players.map(p => [scores[p.name] || 0, p.name])).sort((a, b) => a[0] - b[0]);
    room.lastRoundResult = {
        winner: winnerIndex,
        winnerName: winnerIndex === null ? 'Deste bitti' : room.players[winnerIndex].name,
        points: roundTotalPoints, roundHistory: room.roundHistory, players: summary(room), teamMode: room.teamMode, assisted: room.assisted, stackingMode: room.stackingMode, scores, completedRounds: room.completedRounds, roundLimit: room.roundLimit,
        matchEnded: room.matchEnded, champion: room.matchEnded ? standings[0]?.[1] : null
    };
    io.to(room.code).emit('gameFinished', room.lastRoundResult);
    if (!room.matchEnded) scheduleNextRound(room);
}
// Skor tablosu tam 5 saniye görünür; ardından bütün oyuncular aynı anda yeni ele geçer.
function scheduleNextRound(room) {
    if (room.nextRoundTimer) clearTimeout(room.nextRoundTimer);
    room.nextRoundTimer = setTimeout(guardedTimer(room, 'Yeni el', () => {
        room.nextRoundTimer = null;
        if (!room.started && !room.matchEnded) {
            fillMissingSeatsWithBots(room);
            if (!newRound(room)) {
                ensureBotFill(room, 500);
                if (!newRound(room)) io.to(room.code).emit('roundWaiting', {message:'Yeni el için oyuncular veya botlar hazırlanıyor.'});
            }
        }
    }), 5000);
    room.nextRoundTimer.unref?.();
}
function abandonRound(room, reason) {
    if(room.nextRoundTimer)clearTimeout(room.nextRoundTimer);room.nextRoundTimer=null;
    stopTurn(room);
    room.started = false;
    room.game = null;
    room.minimumOpenScore = 101;
    room.minimumPairs = 5;
    io.to(room.code).emit('roundCancelled', { message: reason });
    lobby(room);
    ensureBotFill(room);
}
// Masada hiç gerçek oyuncu kalmadıysa botların sonsuza dek oynamasını engelle ve odayı kapat.
function deleteIfEmpty(room) {
    if (room.players.some(p => !p.isBot)) return;
    stopTurn(room);
    for (const key of ['botFillTimer', 'nextRoundTimer']) { if (room[key]) clearTimeout(room[key]); room[key] = null; }
    room.started = false;
    rooms.delete(room.code);
    RoomStore.remove(room.code);
}
function getRoomAndSeat(socket) {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return {};
    const index = room.players.findIndex(p => p.socketId === socket.id && p.token === socket.data.token);
    return { room, index };
}
function issue(socket, message) { socket.emit('gameError', { message }); }
// Ceza toplam puana ve bu elin satırına yazılır; masadaki herkese bildirilir.
function addPenalty(room, index, amount = 101, reason = 'Ceza') {
    const key = room.teamMode ? `team${index % 2 + 1}` : room.players[index].name;
    room.scores[key] = (room.scores[key] || 0) + amount;
    room.roundExtras[index] = (room.roundExtras[index] || 0) + amount;
    io.to(room.code).emit('penalty', { playerIndex: index, name: room.players[index].name, amount, reason });
}
function addOpenAttemptPenalty(room, game, index, message) {
    if (!room.penaltyMode) return message;
    if (game.playerStates[index].penaltyAtTurn !== (game.turnSerial || 0)) {
        addPenalty(room, index, 101, 'Hatalı açma');
        game.playerStates[index].penaltyAtTurn = game.turnSerial || 0;
        broadcastGame(room);
        return `${message} +101 ceza yazıldı.`;
    }
    return message;
}
function leftLocked(game, index) {
    const r = game.returnedLeft, pile = game.discardPiles[(index + 3) % 4];
    return !!(r && r.index === index && r.serial === (game.turnSerial || 0) && pile[pile.length - 1]?.id === r.tileId);
}
function requireMove(socket, needsDrawn = true) {
    const { room, index } = getRoomAndSeat(socket);
    if (!room || !room.started || !room.game || index < 0) { issue(socket, 'Aktif bir oyunda değilsiniz.'); return null; }
    if (index !== room.game.currentPlayer) { issue(socket, 'Şu anda sıra sizde değil.'); return null; }
    if (needsDrawn && !room.game.hasDrawn) { issue(socket, 'Önce taş çekmelisiniz.'); return null; }
    return { room, game: room.game, index };
}
function validateIds(game, playerIndex, groups) {
    if (!Array.isArray(groups) || !groups.length || groups.length > 8) return { error: 'En az bir grup seçin.' };
    const tiles = game.playerTiles[playerIndex];
    const byId = new Map(tiles.map(tile => [tile.id, tile]));
    const used = new Set();
    const mapped = [];
    for (const ids of groups) {
        if (!Array.isArray(ids) || ids.length < 3 || ids.length > 13) return { error: 'Seri/per en az 3 taş olmalı.' };
        const group = [];
        for (const id of ids) {
            if (typeof id !== 'string' || !byId.has(id) || used.has(id)) return { error: 'Taşlar elinizde değil veya iki kere seçilmiş.' };
            used.add(id);
            group.push(byId.get(id));
        }
        if (!game.isValidGroup(group)) return { error: 'Geçersiz seri veya per.' };
        mapped.push(group);
    }
    return { groups: mapped, used };
}
// GERİ TOPLA için: oyuncunun bu turdaki ilk masa hamlesinden önceki durum saklanır.
function takeTurnSnapshot(room, index) {
    const game = room.game, serial = game.turnSerial || 0;
    if (room.turnSnap && room.turnSnap.serial === serial && room.turnSnap.index === index && room.turnSnap.roundId === room.roundId) return;
    room.turnSnap = {
        roundId: room.roundId, serial, index,
        hand: [...game.playerTiles[index]],
        states: game.playerStates.map(s => ({ ...s, openedGroups: s.openedGroups.map(g => [...g]) })),
        minimumOpenScore: room.minimumOpenScore, minimumPairs: room.minimumPairs,
        addLog: game.addLog ? JSON.parse(JSON.stringify(game.addLog)) : null,
    };
}
function turnChanged(room, index) {
    const s = room.turnSnap, now = room.game.playerTiles[index];
    return s.hand.length !== now.length || s.hand.some((t, i) => t.id !== now[i]?.id);
}
function canRetract(room, index) {
    const s = room.turnSnap, game = room.game;
    return !!(s && game && s.roundId === room.roundId && s.serial === (game.turnSerial || 0) && s.index === index && game.currentPlayer === index);
}
function removeSelected(game, index, used) {
    game.playerTiles[index] = game.playerTiles[index].filter(tile => !used.has(tile.id));
}
// Bağlantısı kopan (veya sunucu yeniden başladıktan sonra geri dönmeyen) oyuncu 60 sn içinde dönmezse:
// oyun sürüyorsa yerine bot geçer, oyun başlamadıysa koltuğu boşalır. Masada hiç gerçek oyuncu kalmazsa masa kapanır.
function scheduleSeatTakeover(room, oldToken) {
    const timeout = setTimeout(guardedTimer(room, 'Bağlantı kopması', () => {
        if (rooms.get(room.code) !== room) return;
        const seat = room.players.findIndex(p => p.token === oldToken);
        if (seat < 0) return;
        const missing = room.players[seat];
        if (missing.socketId || missing.isBot) return;
        if (room.started || (room.game && !room.matchEnded)) {
            room.players[seat] = {
                token: `bot-replace-${room.code}-${Date.now()}-${seat}`,
                socketId: null,
                name: missing.name,
                avatar: 'default.svg',
                frame: 'silver',
                level: 1,
                accountId: null,
                isBot: true
            };
            if (!room.teamMode) room.scores[room.players[seat].name] = room.scores[missing.name] || 0;
            io.to(room.code).emit('tableChatMessage', { from: 'Sistem', message: `${missing.name} bağlantıyı kaybetti. Yerine bot geçti.`, at: Date.now() });
            lobby(room);
            broadcastGame(room);
            if (room.game?.currentPlayer === seat) beginTurn(room);
            deleteIfEmpty(room); // yalnız botlar kaldıysa masa sonsuza dek kendi kendine oynamasın
        } else {
            removeSeats(room, p => p === missing);
            lobby(room);
            ensureBotFill(room);
            deleteIfEmpty(room);
        }
    }), 60000);
    timeout.unref?.();
}
// Diskten geri yüklenen masa (güncelleme/yeniden başlatma sonrası): oyun nesnesi, zamanlayıcılar ve botlar yeniden kurulur.
// Gerçek oyuncular bağlantısı kopmuş sayılır; dönenler kaldığı yerden devam eder, dönmeyenlerin yerine 60 sn sonra bot geçer.
function reviveRoom(room) {
    if (room.game) room.game = Object.assign(new GameLogic(), room.game);
    for (const key of ['turnTimer', 'botTurnTimer', 'botFillTimer', 'nextRoundTimer']) room[key] = null;
    for (const p of room.players) { p.socketId = null; if (!p.isBot) scheduleSeatTakeover(room, p.token); }
    if (room.started && room.game) beginTurn(room);
    else if (room.lastRoundResult && !room.matchEnded) scheduleNextRound(room);
    else if (!room.game) ensureBotFill(room);
}
function playerLeave(socket, deliberate = false) {
    const { room, index } = getRoomAndSeat(socket);
    if (!room || index < 0) return;
    const player = room.players[index];
    socket.leave(room.code);
    socket.data.roomCode = null;
    if (!deliberate) {
        player.socketId = null;
        lobby(room);
        if (room.started) broadcastGame(room);
        scheduleSeatTakeover(room, player.token);
        return;
    }
    // Maç sürerken (eller arasında da) koltuk sırası korunur; skor sütunları kaymasın.
    if (room.started || (room.game && !room.matchEnded)) {
        room.players[index] = {
            token: `bot-replace-${room.code}-${Date.now()}-${index}`,
            socketId: null,
            name: player.name,
            avatar: 'default.svg',
            frame: 'silver',
            level: 1,
            accountId: null,
            isBot: true
        };
        if (!room.teamMode) room.scores[room.players[index].name] = room.scores[player.name] || 0;
        io.to(room.code).emit('tableChatMessage', { from: 'Sistem', message: `${player.name} masadan ayrıldı. Yerine bot geçti.`, at: Date.now() });
        lobby(room);
        broadcastGame(room);
        if (room.game?.currentPlayer === index) beginTurn(room);
        deleteIfEmpty(room); // son gerçek oyuncu da ayrıldıysa botlar kendi kendine oynamasın
    } else {
        removeSeats(room, p => p === player);
        lobby(room);
        ensureBotFill(room);
        deleteIfEmpty(room);
    }
    socket.emit('leftGame');
}
// Hediye albümü (istemcideki GIFTS listesiyle aynı kimlikler); hediyeler ücretsiz ve semboliktir, elde 5 hak.
const GIFT_IDS = ['cay', 'gul', 'opucuk', 'goz', 'kahkaha', 'domates', 'alkis', 'ortaparmak', 'uyku', 'ates', 'kalp', 'hediye'];
// Socket başına olay hız sınırı (token bucket): normal oyun saniyede birkaç olay üretir; seli keser.
const EVENT_BURST = 30, EVENT_REFILL_PER_SEC = 15;
function allowEvent(socket) {
    const now = Date.now(), b = socket.data.bucket ||= { tokens: EVENT_BURST, at: now };
    b.tokens = Math.min(EVENT_BURST, b.tokens + (now - b.at) / 1000 * EVENT_REFILL_PER_SEC); b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1; return true;
}
io.on('connection', socket => {
    // Her olay korunur: hatalı bir istek sunucuyu (ve bütün masaları) düşürmez, yalnızca o oyuncuya hata döner.
    const rawOn = socket.on.bind(socket);
    socket.on = (event, handler) => rawOn(event, (...args) => {
        if (event !== 'disconnect' && !allowEvent(socket)) {
            if (Date.now() - (socket.data.slowWarnAt || 0) > 2000) { socket.data.slowWarnAt = Date.now(); issue(socket, 'Çok hızlı işlem yapıyorsunuz, biraz yavaşlayın.'); }
            return;
        }
        try { handler(...args); }
        catch (err) { console.error(`Socket olayı hatası (${event}):`, err); issue(socket, 'İşlem gerçekleştirilemedi, tekrar deneyin.'); }
    });
    socket.on('joinGame', data => {
        if (socket.data.roomCode) return issue(socket, 'Zaten bir odadasınız.');
        const account = Accounts.fromToken(data?.authToken);
        // Misafir adında yalnızca harf, rakam, boşluk ve _ . - kalır (HTML/script enjeksiyonu olmasın).
        const name = account ? account.username : String(data?.playerName || '').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
        const token = String(data?.token || '');
        if (!name || !/^[\w-]{20,120}$/.test(token)) return issue(socket, 'İsim veya oyuncu oturumu geçersiz.');
        const mode = data?.mode;
        let room;
        if (mode === 'random') {
            // HEMEN OYNA: aynı türde bekleyen herkese açık bir masa varsa oraya oturur. Oyuncunun "Masa Aç" ile açtığı masaya
            // yalnızca kuralları seçilen türle aynıysa girilir (eşli/katlamalı/yardımsız farkı habersiz gelmesin; onlar ODA SEÇ'te).
            // İçinde gerçek oyuncu bekleyen ve daha dolu masa önce seçilir; yoksa yeni masa açılır.
            const modeKey = MODE_PRESETS[data?.modeKey] ? data.modeKey : 'klasik', preset = MODE_PRESETS[modeKey];
            const sameRules = r => !r.custom || (!r.teamMode && r.stackingMode === preset.stackingMode && r.assisted === preset.assisted);
            const waiting = [...rooms.values()].filter(r => r.isPublic && r.modeKey === modeKey && sameRules(r) && !r.started && !r.game && !r.matchEnded && r.players.length < 4
                && !r.players.some(p => p.name.toLowerCase() === name.toLowerCase()));
            const humans = r => r.players.filter(p => !p.isBot && p.socketId).length;
            room = waiting.sort((a, b) => humans(b) - humans(a) || b.players.length - a.players.length)[0];
            if (!room) room = makeRoom(roomCode(), true, data);
        } else if (mode === 'create') {
            // isPublic: true → 'Oda Seç' listesinde görünür; false → yalnızca kodla katılınır
            room = makeRoom(roomCode(), data?.isPublic === true, { ...data, custom: true });
            room.hostToken = token; // masayı açan kişi bot ekleyip çıkarabilir
        } else if (mode === 'code') {
            const code = String(data?.roomCode || '').trim().toUpperCase();
            if (!/^[A-Z0-9]{6}$/.test(code)) return issue(socket, '6 karakterli oda kodu yazın.');
            room = rooms.get(code) || RoomStore.load(code);
            if (!room) return issue(socket, 'Bu kodda oda bulunamadı.');
        } else return issue(socket, 'Bir giriş şekli seçin.');
        if (room.started || room.game || room.matchEnded || room.players.length >= 4) return issue(socket, 'Oda dolu veya oyun başlamış.');
        if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return issue(socket, 'Bu odada aynı isim zaten var.');
        // Mesajlarda resmin kendisi değil kısa adresi gider (Avatars.ref).
        const avatar = Avatars.ref(account?.avatar || (Avatars.BUILTIN.includes(data.avatar) || (typeof data.avatar === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]{1,90000}$/.test(data.avatar)) ? data.avatar : 'default.svg'));
        room.players.push({ token, socketId: socket.id, name, avatar, frame: account?.frame || (['gold','silver','royal','emerald','neon','rose'].includes(data?.frame) ? data.frame : 'gold'), accountId: account?.id || null, level: Accounts.cleanUser(account)?.level || 1 });
        socket.join(room.code);
        socket.data.roomCode = room.code;
        socket.data.token = token;
        if (!room.teamMode) room.scores[name] = 0;
        else if (!('team1' in room.scores)) room.scores = { team1: 0, team2: 0 };
        socket.emit('joinedGame', { code: room.code });
        socket.emit('chatHistory', room.chatHistory);
        lobby(room);
        ensureBotFill(room);
        if (room.players.length === 4) newRound(room);
    });
    socket.on('rejoinRoom', data => {
        const code = String(data?.roomCode || '').toUpperCase();
        const token = String(data?.token || '');
        // Sunucu güncellendiyse masa bellekte yoktur: eski sürümün kapanırken diske yazdığı halinden geri yüklenir.
        const room = rooms.get(code) || RoomStore.load(code);
        const index = room?.players.findIndex(p => p.token === token) ?? -1;
        if (!room || index < 0) return issue(socket, 'Oturum bulunamadı veya oda kapandı. Ana sayfadan tekrar katılın.');
        const player = room.players[index];
        if (player.socketId && player.socketId !== socket.id) {
            const old = io.sockets.sockets.get(player.socketId);
            if (old) { old.data.roomCode = null; old.emit('sessionReplaced'); old.leave(room.code); }
        }
        player.socketId = socket.id;
        socket.join(room.code);
        socket.data.roomCode = room.code;
        socket.data.token = token;
        socket.emit('rejoinedRoom', { code, name: player.name });
        socket.emit('chatHistory', room.chatHistory);
        lobby(room);
        if (room.started) socket.emit('gameState', snapshot(room, index));
        else if (room.lastRoundResult) {
            socket.emit('gameFinished',room.lastRoundResult);
            if(!room.matchEnded && !room.nextRoundTimer && room.players.length===4 && room.players.every(p=>p.socketId||p.isBot)){
                room.nextRoundTimer=setTimeout(()=>{room.nextRoundTimer=null;if(!room.started)newRound(room);},5000);
                room.nextRoundTimer.unref?.();
            }
        }
        else if (room.players.length === 4 && room.players.every(p => !!p.socketId || p.isBot)) newRound(room);
    });
    // ---------- Masa kurucusu: bot ekle / çıkar / botlarla başlat ----------
    function requireHost(socket) {
        const { room, index } = getRoomAndSeat(socket);
        if (!room || index < 0) { issue(socket, 'Masada değilsiniz.'); return null; }
        if (room.started || room.game || room.matchEnded) { issue(socket, 'Oyun başladıktan sonra bot eklenemez.'); return null; }
        if (room.players[index].token !== room.hostToken) { issue(socket, 'Bunu yalnızca masayı açan kişi yapabilir.'); return null; }
        return room;
    }
    socket.on('addBot', () => {
        const room = requireHost(socket); if (!room) return;
        if (room.players.length >= 4) return issue(socket, 'Masa dolu.');
        addBotToRoom(room);
        lobby(room);
        if (room.players.length === 4) newRound(room);
    });
    socket.on('removeBot', data => {
        const room = requireHost(socket); if (!room) return;
        const i = Number(data?.index);
        if (!Number.isInteger(i) || !room.players[i]?.isBot) return issue(socket, 'Bu koltukta bot yok.');
        const [bot] = room.players.splice(i, 1);
        if (!room.teamMode) delete room.scores[bot.name];
        lobby(room);
    });
    socket.on('startWithBots', () => {
        const room = requireHost(socket); if (!room) return;
        while (room.players.length < 4) addBotToRoom(room);
        lobby(room);
        newRound(room);
    });
    socket.on('leaveGame', () => playerLeave(socket, true));
    socket.on('throwTomato', data => {
        const { room, index } = getRoomAndSeat(socket);
        if (!room || index < 0 || !room.started) return issue(socket, 'Masada değilsiniz.');
        const target = Number(data?.target);
        if (!Number.isInteger(target) || target < 0 || target > 3 || target === index) return issue(socket, 'Geçersiz domates hedefi.');
        if ((room.tomatoes[index] || 0) >= 3) return issue(socket, 'Bu el için domates hakkın bitti.');
        room.tomatoes[index]++;
        io.to(room.code).emit('tomatoHit', { from: room.players[index].name, fromIndex: index,
            to: room.players[target].name, toIndex: target, remaining: 3 - room.tomatoes[index] });
    });
    // Sadece aynı masaya katılmış oyuncular yazabilir; 200 karakter ve sunucu hız sınırı.
    socket.on('tableChatSend', data => {
        const {room,index}=getRoomAndSeat(socket);
        if(!room||index<0)return issue(socket,'Mesaj göndermek için masada olmalısınız.');
        const message=String(data?.message||'').replace(/[\x00-\x1F\x7F]/g,' ').trim().slice(0,200);
        if(!message)return;
        const now=Date.now();
        if(socket.data.lastChatAt && now-socket.data.lastChatAt<650)return issue(socket,'Mesajları biraz daha yavaş gönderin.');
        socket.data.lastChatAt=now;
        const msg={from:room.players[index].name,message,at:now};
        room.chatHistory.push(msg);
        if(room.chatHistory.length>50)room.chatHistory.shift();
        RoomStore.markDirty(room);
        io.to(room.code).emit('tableChatMessage',msg);
    });
    socket.on('sendGift', data => {
        const { room, index } = getRoomAndSeat(socket);
        if (!room || index < 0 || !room.started) return issue(socket, 'Masada değilsiniz.');
        const to = Number(data?.target), kind = String(data?.kind || '');
        if (!Number.isInteger(to) || to < 0 || to >= 4 || to === index) return issue(socket, 'Hediye gönderilecek oyuncu geçersiz.');
        if (!GIFT_IDS.includes(kind)) return issue(socket, 'Geçersiz hediye.');
        if ((room.gifts[index] || 0) >= 5) return issue(socket, 'Bir elde en fazla 5 ücretsiz hediye gönderebilirsin.');
        room.gifts[index]++;
        io.to(room.code).emit('giftSent', { from: room.players[index].name, fromIndex: index, to: room.players[to].name, toIndex: to, kind, left: 5 - room.gifts[index] });
    });
    socket.on('drawTile', data => {
        const ctx = requireMove(socket, false);
        if (!ctx) return;
        const { room, game, index } = ctx;
        if (game.hasDrawn) return issue(socket, 'Bu tur zaten taş aldınız.');
        const fromDiscard = data?.fromDiscard === true;
        // Yandan alınıp geri bırakılan taş aynı turda tekrar alınamaz; ortadan çekmek zorunlu.
        if (fromDiscard && leftLocked(game, index)) return issue(socket, 'Geri bıraktığın taşı bu tur tekrar alamazsın. Ortadan taş çek.');
        const tile = fromDiscard ? game.drawFromDiscard(index) : game.drawFromPile(index);
        if (!tile || tile.error) return issue(socket, tile?.error || 'Bu alanda çekilecek taş yok.');
        game.playerTiles[index].push(tile);
        game.hasDrawn = true;
        broadcastGame(room);
    });
    socket.on('undoDiscardDraw', () => {
        const ctx = requireMove(socket);
        if (!ctx) return;
        const { room, game, index } = ctx;
        const state = game.playerStates[index];
        const picked = state.drawnFromDiscardTile;
        if (!picked) return issue(socket, 'Geri alınabilecek yer taşı yok.');
        const idx = game.playerTiles[index].findIndex(t => t.id === picked.id);
        if (idx < 0) return issue(socket, 'Yerden alınan taş bulunamadı.');
        game.playerTiles[index].splice(idx, 1);
        game.discardPiles[(index + 3) % 4].push(picked);
        state.drawnFromDiscardTile = null;
        state.mustOpenThisTurn = false;
        game.hasDrawn = false;
        game.returnedLeft = { index, serial: game.turnSerial || 0, tileId: picked.id };
        game.pickLog?.[index]?.pop();
        broadcastGame(room);
    });
    socket.on('discardTile', data => {
        const ctx = requireMove(socket);
        if (!ctx) return;
        const { room, game, index } = ctx;
        if (!game.playerTiles[index].some(t => t.id === String(data?.tileId || ''))) return issue(socket, 'Atılacak taş elinizde yok.');
        const error = discardAndAdvance(room, index, String(data.tileId));
        if (error) issue(socket, error);
    });
    socket.on('openHand', data => {
        const ctx = requireMove(socket);
        if (!ctx) return;
        const { room, game, index } = ctx;
        takeTurnSnapshot(room, index);
        const opened = game.playerStates[index];
        // El açmış oyuncu sonraki turlarda puan sınırı olmadan yeni seri/per indirebilir.
        if (opened.hasOpened) {
            if (opened.openType === 'pairs') return issue(socket, 'Çift açtığınız için seri/per indiremezsiniz; çift indirip taş işleyebilirsiniz.');
            const extra = validateIds(game, index, data?.groups);
            if (extra.error) return issue(socket, extra.error);
            if (game.playerTiles[index].length - extra.used.size < 1) return issue(socket, 'Bitirmek için elinizde atılacak bir taş kalmalı.');
            const picked = opened.drawnFromDiscardTile;
            opened.openedGroups.push(...extra.groups.map(g => canonicalizeGroup(game, g)));
            removeSelected(game, index, extra.used);
            if (picked && extra.used.has(picked.id)) applySidePickup(room, index, picked);
            broadcastGame(room);
            return socket.emit('actionSuccess', { message: `${extra.groups.length} yeni seri/per masaya indirildi.` });
        }
        const parsed = validateIds(game, index, data?.groups);
        if (parsed.error) return issue(socket, addOpenAttemptPenalty(room, game, index, parsed.error));
        if (game.playerTiles[index].length - parsed.used.size < 1) return issue(socket, 'Bitirmek için elinizde atılacak bir taş kalmalı.');
        const pickup = game.playerStates[index].drawnFromDiscardTile;
        if (room.stackingMode && pickup && game.playerStates[(index + 3)%4].openType === 'pairs')
            return issue(socket, 'Katlamalı masada çift açmış oyuncunun taşını alıp seri açamazsınız.');
        const validation = game.canOpenHand(index, parsed.groups);
        if (!validation.valid) return issue(socket, addOpenAttemptPenalty(room, game, index, validation.message));
        const minimum = room.stackingMode ? room.minimumOpenScore : 101;
        if (validation.score < minimum) {
            return issue(socket, addOpenAttemptPenalty(room, game, index, `Açmak için en az ${minimum} puan gerekir (${validation.score}).`));
        }
        const state = game.playerStates[index];
        if (state.drawnFromDiscardTile && !parsed.used.has(state.drawnFromDiscardTile.id)) return issue(socket, 'Yerden aldığınız taşı açtığınız grupta kullanmalısınız.');
        state.hasOpened = true;
        state.openedAtTurn = game.turnSerial || 0;
        state.openType = 'normal';
        state.openScore = validation.score;
        state.openedGroups = parsed.groups.map(g => canonicalizeGroup(game, g));
        state.mustOpenThisTurn = false;
        state.drawnFromDiscardTile = null;
        removeSelected(game, index, parsed.used);
        if (pickup) applySidePickup(room, index, pickup);
        if (room.stackingMode) room.minimumOpenScore = validation.score + 1;
        extendTurnAfterOpening(room, index);
        broadcastGame(room);
        socket.emit('actionSuccess', { message: `Seri/per açıldı: ${validation.score} puan! Ek 60 saniye verildi.` });
    });
    socket.on('openWithPairs', () => {
        const ctx = requireMove(socket);
        if (!ctx) return;
        const { room, game, index } = ctx;
        takeTurnSnapshot(room, index);
        const state = game.playerStates[index];
        // Çift açmış oyuncu sonraki turlarda yeni çiftlerini indirebilir.
        if (state.hasOpened) {
            if (state.openType !== 'pairs') {
                if (!anyPairsOpener(game, index)) return issue(socket, 'Seri/per ile açtınız; masada çift açan olmadığı için çift indiremezsiniz.');
                const laid = laySeriesPairs(room, index);
                if (!laid.length) return issue(socket, 'İndirilecek çift yok (bitirmek için elde bir taş kalmalı).');
                broadcastGame(room);
                return socket.emit('actionSuccess', { message: `${laid.length} çift, çift panosuna indirildi.` });
            }
            const extra = selectPairsToLay(game, index, state.drawnFromDiscardTile);
            if (extra === null) return issue(socket, 'Yerden çekilen taş çiftte kullanılmalı; yerden geri bırakabilirsiniz.');
            if (!extra.length) return issue(socket, 'İndirilecek yeni çift yok (elde atılacak bir taş kalmalı).');
            const picked = state.drawnFromDiscardTile;
            state.openedGroups.push(...extra);
            removeSelected(game, index, new Set(extra.flat().map(t => t.id)));
            if (picked) applySidePickup(room, index, picked);
            broadcastGame(room);
            return socket.emit('actionSuccess', { message: `${extra.length} çift masaya indirildi.` });
        }
        const pairs = game.countPairs(game.playerTiles[index]);
        const minPairs = room.stackingMode ? room.minimumPairs : 5;
        if (pairs.length < minPairs) return issue(socket, addOpenAttemptPenalty(room, game, index, `Çift açmak için ${minPairs} çift gerekli. Sizde ${pairs.length} çift var.`));
        // The opened pairs must be physical tiles, removed from the rack exactly once; at least one tile stays to discard.
        const selected = selectPairsToLay(game, index, state.drawnFromDiscardTile);
        if (selected === null) return issue(socket, 'Yerden çekilen taş çiftte kullanılmalı; yerden geri bırakabilirsiniz.');
        if (selected.length < minPairs) return issue(socket, `Çift açmak için ${minPairs} çift gerekli.`);
        const used = new Set(selected.flat().map(t => t.id));
        state.hasOpened = true;
        state.openedAtTurn = game.turnSerial || 0;
        state.openType = 'pairs';
        state.openScore = 0;
        state.openPairs = selected.length;
        if (room.stackingMode) room.minimumPairs = selected.length + 1; // Katlamalı: sonraki çift açılışı bir çift fazla ister.
        state.openedGroups = selected;
        state.mustOpenThisTurn = false;
        const picked = state.drawnFromDiscardTile;
        state.drawnFromDiscardTile = null;
        removeSelected(game, index, used);
        if (picked) applySidePickup(room, index, picked);
        extendTurnAfterOpening(room, index);
        broadcastGame(room);
        socket.emit('actionSuccess', { message: `${selected.length} çift açıldı! Ek 60 saniye verildi.` });
        if (game.playerStates.every(s => s.openType === 'pairs')) {
            abandonRound(room, 'Dört oyuncu da çift açtı. El iptal edildi; ceza yok.');
            newRound(room);
        }
    });
    socket.on('addToGroup', data => {
        const ctx = requireMove(socket);
        if (!ctx) return;
        const { room, game, index } = ctx;
        takeTurnSnapshot(room, index);
        if (!game.playerStates[index].hasOpened) return issue(socket, 'Taş işlemek için önce el açmalısınız.');
        const target = Number(data?.targetPlayerIndex), groupIndex = Number(data?.targetGroupIndex);
        if (!Number.isInteger(target) || target < 0 || target > 3 || !Number.isInteger(groupIndex)) return issue(socket, 'Grup bulunamadı.');
        const state = game.playerStates[target];
        if (!state?.openedGroups[groupIndex]) return issue(socket, 'Masada grup bulunamadı.');
        const tile = game.playerTiles[index].find(t => t.id === data.tileId);
        if (!tile) return issue(socket, 'Taş elinizde bulunamadı.');
        const group = state.openedGroups[groupIndex];
        if (state.openType === 'pairs') return issue(socket, 'Çift grubuna tek taş işlenemez.');
        // Masadaki okeyin üstüne temsil ettiği taş bırakılırsa okey ele alınır.
        const targetTile = group.find(t => t.id === data?.targetTileId);
        if (targetTile && game.isOkey(targetTile)) {
            if (trySwapTableOkey(room, index, target, groupIndex, targetTile.id, tile)) {
                broadcastGame(room);
                return socket.emit('actionSuccess', { message: 'Masadaki okeyi aldınız!' });
            }
        }
        if (game.playerTiles[index].length <= 1) return issue(socket, 'Son taşınızı işleyemezsiniz; bitirmek için atmalısınız.');
        if (groupAddsThisTurn(game, target, groupIndex) >= MAX_ADDS_PER_GROUP_PER_TURN) return issue(socket, 'Bir sete bir turda en fazla 2 taş işlenebilir. Kalanı sonraki turda işleyin.');
        const leftGroup = [tile, ...group];
        const rightGroup = [...group, tile];
        let newGroup = null;
        if (data?.position === 'left') newGroup = leftGroup;
        else if (data?.position === 'right') newGroup = rightGroup;
        else if (game.isValidGroup(leftGroup) && !game.isValidGroup(rightGroup)) newGroup = leftGroup;
        else if (!game.isValidGroup(leftGroup) && game.isValidGroup(rightGroup)) newGroup = rightGroup;
        else if (game.isValidGroup(rightGroup)) newGroup = rightGroup;
        else if (game.isValidGroup(leftGroup)) newGroup = leftGroup;
        // İstenen kenara uymuyorsa diğer kenarı dene (sürükle-bırakta kenar tahmini yanlış olabilir)
        if (newGroup && !game.isValidGroup(newGroup)) newGroup = game.isValidGroup(rightGroup) ? rightGroup : game.isValidGroup(leftGroup) ? leftGroup : null;
        if (!newGroup || !game.isValidGroup(newGroup)) return issue(socket, 'Bu taş seçilen per veya seriye uymuyor.');
        noteGroupAdd(game, target, groupIndex);
        state.openedGroups[groupIndex] = canonicalizeGroup(game, newGroup);
        game.playerTiles[index] = game.playerTiles[index].filter(t => t.id !== tile.id);
        const currentState = game.playerStates[index];
        if (currentState.drawnFromDiscardTile?.id === tile.id) applySidePickup(room, index, tile);
        broadcastGame(room);
        socket.emit('actionSuccess', { message: 'Taş masadaki seriye/perine işlendi.' });
    });
    // TAŞLARI İŞLE: elde masaya işlenebilen bütün taşları (okey hariç) işler; son taş elde kalır.
    socket.on('processAll', () => {
        const ctx = requireMove(socket);
        if (!ctx) return;
        const { room, game, index } = ctx;
        takeTurnSnapshot(room, index);
        if (!room.assisted) return issue(socket, 'Hızlı İşle yalnızca yardımlı masalarda kullanılabilir.');
        if (!game.playerStates[index].hasOpened) return issue(socket, 'Taş işlemek için önce el açmalısınız.');
        let count = 0;
        for (let step = 0; step < 30; step++) {
            const tile = game.playerTiles[index].find(t => !game.isOkey(t) && findAttachTarget(game, t));
            if (!tile || !attachTileToGroup(room, index, findAttachTarget(game, tile), tile)) break;
            count++;
        }
        if (!count) return issue(socket, 'Masaya işlenebilecek taşınız yok.');
        broadcastGame(room);
        socket.emit('actionSuccess', { message: `${count} taş masaya işlendi.` });
    });
    // GERİ TOPLA: bu tur masaya indirilen/işlenen taşlar ele geri döner.
    // Bu tur el açılmışsa açılış da geri alınır ve 101 ceza yazılır (eli açıp toplama).
    socket.on('retractTurn', () => {
        const ctx = requireMove(socket);
        if (!ctx) return;
        const { room, game, index } = ctx;
        if (!canRetract(room, index) || !turnChanged(room, index)) return issue(socket, 'Bu tur masaya indirdiğiniz taş yok.');
        const snap = room.turnSnap;
        const openedThisTurn = !snap.states[index].hasOpened && game.playerStates[index].hasOpened;
        game.playerTiles[index] = snap.hand;
        game.playerStates = snap.states;
        room.minimumOpenScore = snap.minimumOpenScore;
        room.minimumPairs = snap.minimumPairs;
        game.addLog = snap.addLog;
        room.turnSnap = null;
        if (openedThisTurn && room.penaltyMode) addPenalty(room, index, 101, 'Eli açıp geri topladı');
        broadcastGame(room);
        socket.emit('actionSuccess', { message: openedThisTurn ? 'Açılış geri toplandı.' : 'Masaya indirilen taşlar geri toplandı.' });
    });
    socket.on('finishGame', () => {
        const ctx = requireMove(socket);
        if (!ctx) return;
        const { room, game, index } = ctx;
        if (!game.playerStates[index].hasOpened || game.playerTiles[index].length !== 1 || game.playerStates[index].mustOpenThisTurn) return issue(socket, 'Bitirmek için el açmış, yerden alınan taşı masaya işlemiş ve son atılacak 1 taşınız kalmış olmalı.');
        const final = game.playerTiles[index][0];
        game.discardPiles[index].push(final);
        game.playerTiles[index] = [];
        finishRound(room, index, { type: game.playerStates[index].openType === 'pairs' ? 'pairs' : game.playerStates[index].openedAtTurn === (game.turnSerial || 0) ? 'instant' : 'normal' });
    });
    socket.on('newRound', () => {
        const { room, index } = getRoomAndSeat(socket);
        if (!room || index < 0 || room.started) return;
        if (room.matchEnded) return issue(socket, 'Maç bitti. Yeni masa açmalısınız.');
        // Botların socket'i yoktur; yalnızca bağlantısı kopmuş gerçek oyuncular yeni eli bekletir.
        if (room.players.length !== 4 || room.players.some(p => !p.socketId && !p.isBot)) return issue(socket, 'Yeni el için 4 bağlı oyuncu gerekli.');
        room.nextRoundReady ||= new Set();
        room.nextRoundReady.add(room.players[index].token);
        // Botlar her zaman hazırdır; bütün gerçek oyuncular hazır olunca yeni el başlar.
        const humans = room.players.filter(p => !p.isBot);
        io.to(room.code).emit('nextRoundReady', { ready: humans.filter(p => room.nextRoundReady.has(p.token)).length, total: humans.length });
        if (humans.every(p => room.nextRoundReady.has(p.token))) newRound(room);
    });
    // Yalnızca geliştirme testi: OKEY_DEBUG=1 ile açılır. Elini ve bir rakibin açık gruplarını kurar.
    // Taşlar destede/ellerde gerçekten bulunan fiziksel taşlardan alınır; 106 taş korunur.
    if (process.env.OKEY_DEBUG === '1') socket.on('debugSetup', data => {
        const { room, index } = getRoomAndSeat(socket);
        if (!room?.game || index < 0) return;
        const game = room.game;
        const spec = s => s === 'okey' ? (t => game.isOkey(t)) : s === 'fake' ? (t => t.isFakeJoker) : (t => !t.isFakeJoker && t.color === s[0] && t.number === s[1] && !game.isOkey(t));
        const take = (pred, fromSeat) => {
            const pools = [game.tiles, ...game.playerTiles.filter((_, i) => i !== fromSeat && i !== index), ...game.discardPiles];
            for (const pool of pools) { const k = pool.findIndex(pred); if (k >= 0) return pool.splice(k, 1)[0]; }
            const own = game.playerTiles[fromSeat], k = own.findIndex(pred);
            return k >= 0 ? own.splice(k, 1)[0] : null;
        };
        // reset: masadaki bütün açılışlar ve atıklar desteye döner, oyuncu durumları sıfırlanır (her senaryo temiz başlasın).
        if (data?.reset) {
            game.tiles.unshift(...game.playerStates.flatMap(s => [...s.openedGroups.flat(), ...(s.extraPairs || []).flat()]), ...game.discardPiles.flat());
            game.playerStates = game.playerStates.map(() => game.createPlayerState());
            game.discardPiles = [[], [], [], []]; game.deadDiscards = {}; game.addLog = null; game.returnedLeft = null;
            room.turnSnap = null; room.minimumOpenScore = 101; room.minimumPairs = 5;
        }
        const counts = game.playerTiles.map(h => h.length);
        const buildHand = (seat, list) => {
            game.tiles.unshift(...game.playerTiles[seat].splice(0));
            game.playerTiles[seat] = (list || []).map(s => take(spec(s), seat)).filter(Boolean);
        };
        if (data?.hand) buildHand(index, data.hand);
        // Bir koltuğu verilen gruplarla "açmış" yapar (önceki test grupları desteye geri konur).
        const openFor = (seat, list, type) => {
            const st = game.playerStates[seat];
            game.tiles.unshift(...st.openedGroups.flat());
            const groups = list.map(g => g.map(s => take(spec(s), seat)).filter(Boolean));
            Object.assign(st, { hasOpened: true, openType: type, openScore: type === 'pairs' ? 0 : groups.reduce((n, g) => n + game.calculateGroupValue(g), 0),
                openPairs: type === 'pairs' ? groups.length : 0, openedGroups: type === 'pairs' ? groups : groups.map(g => game.arrangeGroup(g)) });
        };
        if (data?.opponentGroups) openFor((index + 1) % 4, data.opponentGroups, 'normal');
        if (data?.pairsOpponent) openFor((index + 2) % 4, data.pairsOpponent, 'pairs');
        if (data?.myGroups) openFor(index, data.myGroups, 'normal');
        // Diğer ellerin taş sayısını desteden tamamla (106 taş korunur).
        game.playerTiles.forEach((h, i) => { if (i !== index) while (h.length < counts[i] - (i === (index + 1) % 4 && data?.opponentGroups ? data.opponentGroups.flat().length : 0) && game.tiles.length) h.push(game.tiles.pop()); });
        if (data?.leftDiscard) { const t = take(spec(data.leftDiscard), index); if (t) game.discardPiles[(index + 3) % 4].push(t); game.deadDiscards = {}; }
        if (Number.isInteger(data?.turnTo)) { game.currentPlayer = (index + data.turnTo) % 4; game.hasDrawn = true; beginTurn(room); }
        if (data?.myTurn) { game.currentPlayer = index; game.hasDrawn = !!data.drawn; beginTurn(room); }
        broadcastGame(room);
    });
    socket.on('disconnect', () => playerLeave(socket, false));
});
const PORT = Number(process.env.PORT) || 3000;
httpServer.listen(PORT, '0.0.0.0', () => console.log(`Alemdar Cafe 101 Okey sunucusu: ${PORT}`));
// Coolify yeni sürüme geçerken SIGTERM gönderir: oyunculara haber ver, bağlantıları kapat, hızlı çık.
function shutdown(signal) {
    console.log(`${signal} alındı, sunucu kapanıyor...`);
    // Önce bütün masalar diske yazılır: yeni sürüm, oyuncular yeniden bağlanınca masaları bu halden geri yükler.
    RoomStore.flushAll();
    io.emit('tableChatMessage', { from: 'Sistem', message: 'Sunucu güncelleniyor. Masanız korunuyor, birkaç saniye içinde otomatik olarak geri bağlanacaksınız.', at: Date.now() });
    Accounts.close();
    io.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
}
if (require.main === module || process.env.NODE_ENV === 'production') { process.once('SIGTERM', () => shutdown('SIGTERM')); process.once('SIGINT', () => shutdown('SIGINT')); }
module.exports = { app, httpServer, rooms, _testing: { seriesOuts, timeoutMove, beginTurn, stopTurn, extendTurnAfterOpening, turnMsFor, fillMissingSeatsWithBots, finishRound, newRound } };
