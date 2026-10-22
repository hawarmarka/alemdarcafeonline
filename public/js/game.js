'use strict';
// Client handles presentation and rack layout only; the server verifies every gameplay move.
const socketAvailable = typeof io === 'function';
const socket = socketAvailable ? io() : {connected:false,on(){return this;},emit(){},disconnect(){}};
const $ = id => document.getElementById(id);
let session = null;
try { session = JSON.parse(sessionStorage.getItem('okeySession') || 'null'); } catch (_) {}
const userAuth = localStorage.getItem('okeyAuthToken') || '';
async function refreshGameProfile() {
    if (!userAuth) return;
    try {
        const res = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + userAuth } });
        if (!res.ok) return;
        const { user } = await res.json();
        $('gamebarName').textContent = user.username;
        $('gamebarAvatar').src = avatarSrc(user.avatar);
        $('gamebarLevel').textContent = `Seviye ${user.level} · ${user.xp} XP · ${user.wins} zafer`;
    } catch (_) {}
}
refreshGameProfile();
// Sunucu yüklenen resimleri /api/avatar/<id> adresiyle gönderir; sunucu yeniden başladıysa resim bulunamaz, varsayılana dönülür.
document.addEventListener('error', e => { if (e.target.tagName === 'IMG' && e.target.src.includes('/api/avatar/')) e.target.src = '/asset/avatar-default.svg'; }, true);
const avatarSrc = a => String(a || '').startsWith('data:image/') || /^\/api\/avatar\/[\w-]{22}$/.test(a) ? a : a === 'default.svg' || !a ? '/asset/avatar-default.svg' : (/^av(0[1-9]|10)\.svg$/.test(a) ? '/asset/avatars/' + a : '/asset/avatar-default.svg');
if (!session?.token || !session?.roomCode) window.location.replace('/?oturum=yok');
const SLOTS = 32, ROW_WIDTH = 16; // Üstte 16, altta 16 YER; oyun yine 21/22 taş dağıtır
const spriteRows = { Mavi: 0, Siyah: 1, Kirmizi: 2, Yesil: 3, Sahte: 4 };
let state = null, slots = Array(SLOTS).fill(null), selected = null, drag = null;
let finished = false, opening = { selected: new Set(), groups: [] };
let autoRack = true, autoRackMode = 'series', flippedTiles = new Set(), lastRackSignature = '';
let pendingDrawDropSlot = null;
let needInitialArrange = true; // yeni elde ilk dağıtılan taşlar bir kez dizilir
const leftRackSlots = new Map(); // ıstakadan çıkan taş → eski yuvası
const soundPrefKey = 'okeySoundsEnabled';
let soundEnabled = localStorage.getItem(soundPrefKey) !== '0';
let rackMeldCache = { key: '', score: 0 };
let uiInfo = { lastSeriesValue: 101, lastPairValue: 5 };
function memoizedRackMeldScore(hand) {
    if (!state?.okey) return 0;
    const key = state.okey.color + ':' + state.okey.number + '|' + hand.map(t => t.id).sort().join(',');
    if (rackMeldCache.key !== key) rackMeldCache = { key, score: melds(hand).score };
    return rackMeldCache.score;
}
const melds = (tiles, requiredId=null, keepOne=false) => OkeyMelds.solve(tiles, state?.okey, requiredId, keepOne);
// Düğme görünürlüğü her çizimde hesaplanır; aynı el için çözümü tekrar kullan.
let openMeldCache = { key: '', result: null };
function memoizedOpenMelds(requiredId) {
    const key = (state.okey?.color + state.okey?.number) + '|' + requiredId + '|' + state.tiles.map(t => t.id).sort().join(',');
    if (openMeldCache.key !== key) openMeldCache = { key, result: melds(state.tiles, requiredId, true) };
    return openMeldCache.result;
}
const previousRack = () => {
    try { const v = JSON.parse(sessionStorage.getItem('okeyRack_' + session.roomCode) || 'null'); return v && Array.isArray(v.ids) ? v : null; } catch { return null; }
};

// Sahte okey, okey taşının (gösterge+1) değerini taşır.
function fakeBaseNumber(tile){ return tile?.isFakeJoker ? (state?.okey?.number ?? tile.number) : tile?.number; }
function fakeBaseColor(tile){ return tile?.isFakeJoker ? (state?.okey?.color ?? tile.color) : tile?.color; }
function playerTotalScore(seat){
    const player = state?.players?.[seat];
    if (!player) return 0;
    return state.teamMode ? (state.scores['team' + (seat % 2 + 1)] || 0) : (state.scores[player.name] || 0);
}
function shortenName(name, max=9){
    name = String(name || '');
    return name.length > max ? name.slice(0, max-1) + '…' : name;
}
function openedGroupValue(group){
    if (!Array.isArray(group) || !group.length) return 0;
    const fixed = group.map(t => t.isFakeJoker ? { ...t, color: state?.okey?.color ?? t.color, number: state?.okey?.number ?? t.number } : t)
        .filter(t => !(state?.okey && !t.isFakeJoker && t.color === state.okey.color && t.number === state.okey.number));
    const naturals = fixed.filter(Boolean);
    if (!naturals.length) return 0;
    if (naturals.every(t => t.number === naturals[0].number) && new Set(naturals.map(t => t.color)).size === naturals.length) return naturals.length * naturals[0].number;
    if (naturals.some(t => t.color !== naturals[0].color)) return 0;
    const nums = naturals.map(t => t.number).sort((a,b)=>a-b);
    const min = nums[0];
    return naturals.length * (2 * min + naturals.length - 1) / 2;
}
function updateLastOpenInfo(nextState){
    const prev = state;
    // Biri el açınca masanın ortasında bildirim
    if (prev && prev.roundId === nextState.roundId) (nextState.players || []).forEach((p, i) => {
        if (!p.openType || prev.players?.[i]?.openType) return;
        const who = i === nextState.playerIndex ? 'SEN' : p.name.toLocaleUpperCase('tr');
        showBanner(p.openType === 'pairs' ? { tone: 'success', title: who + ' · ÇİFT AÇTI', value: (p.openPairs || 5) + ' ÇİFT' } : { tone: 'success', title: who + ' · SERİ AÇTI', value: String(p.openScore || '') });
    });
    if (!nextState?.openedGroups) return;
    if (!prev) { uiInfo = { lastSeriesValue: nextState.minimumOpenScore || 101, lastPairValue: 5 }; return; }
    nextState.openedGroups.forEach((groups, owner) => {
        const prevGroups = prev.openedGroups?.[owner] || [];
        if ((groups?.length || 0) <= (prevGroups?.length || 0)) return;
        const openType = nextState.players?.[owner]?.openType || null;
        if (openType === 'pairs') uiInfo.lastPairValue = Math.max(5, groups.length);
        else uiInfo.lastSeriesValue = Math.max(nextState.minimumOpenScore || 101, Math.round((groups || []).reduce((sum,g)=>sum+openedGroupValue(g),0)) || 0);
    });
}
function renderOpenStatusBadges(){
    // Okey Plus'taki gibi: rozet yalnızca masada o türden açılış varsa, açılış değeriyle görünür.
    const info = state.openInfo || { series: 0, pairs: 0 };
    for (const [id, value, title] of [
        ['minimumOpenBadge', info.series, `Masadaki en yüksek seri açılışı: ${info.series}`],
        ['pairOpenBadge', info.pairs, `Masadaki çift açılışı: ${info.pairs} çift`]]) {
        const badge = $(id);
        if (!badge) continue;
        if (value > 0) badge.style.removeProperty('display'); else badge.style.setProperty('display', 'none', 'important');
        badge.querySelector('.badge-value').textContent = String(value);
        badge.title = title;
    }
}
function renderFancyScoreboard(){
    const board = $('scoreList');
    if (!board || !state) return;
    if (!changed('scoreboard', JSON.stringify([state.roundHistory, state.roundsCompleted, finished, state.playerIndex, state.teamMode, state.roundLimit,
        state.assisted, state.stackingMode, (state.players || []).map(p => [p.name, p.avatar])]))) return;
    // Skor tablosu görseli (asset/ui/skor-tablosu.png) üstüne yerleşim; değerler görseldeki kutulara oturur.
    board.replaceChildren();
    const el = (cls, text, style) => { const e = document.createElement('div'); e.className = cls; if (text != null) e.textContent = text; Object.assign(e.style, style || {}); return e; };
    const colLeft = [17.7, 37.7, 57.7, 77.9];
    [state.teamMode ? 'Eşli' : 'Tek', `${state.roundLimit || 4} El`, state.assisted ? 'Yardımlı' : 'Yardımsız', state.stackingMode ? 'Katlamalı' : 'Katlamasız']
        .forEach((text, i) => board.append(el('sbi-chip', text, { left: colLeft[i] + '%' })));
    const history = Array.isArray(state.roundHistory) ? state.roundHistory : [];
    const current = state.roundsCompleted || 0;
    // Eşli oyunda takım arkadaşları yan yana durur (0-2, 1-3); her satırda o elin TAKIM puanı ve takım toplamı yazar,
    // iki arkadaşın sütunu aynı değeri gösterir. Tekli oyunda her oyuncu kendi puanını toplar.
    const order = state.teamMode ? [0, 2, 1, 3] : [0, 1, 2, 3];
    const partner = seat => (seat + 2) % 4;
    const roundValue = (r, seat) => { const row = history[r]; if (!row || row[seat] == null) return null;
        return state.teamMode ? (row[seat] || 0) + (row[partner(seat)] || 0) : row[seat]; };
    order.forEach((seat, col) => {
        const p = state.players?.[seat];
        const av = el('sbi-avatar', null, { left: (colLeft[col] + 2.9) + '%' });
        const img = document.createElement('img'); img.src = avatarSrc(p?.avatar); img.alt = p?.name || '';
        av.append(img); board.append(av);
        const label = state.teamMode ? `T${seat % 2 + 1} · ${shortenName(p?.name || '-', 8)}` : shortenName(p?.name || '-', 12);
        board.append(el('sbi-name' + (seat === state.playerIndex ? ' is-me' : ''), label, { left: colLeft[col] + '%' }));
        let running = 0;
        for (let r = 0; r < 4; r++) {
            const top = (55.8 + r * 9.6) + '%';
            const v = roundValue(r, seat);
            if (v != null) running += v;
            const live = r === current && !finished;
            board.append(el('sbi-cell ' + (v == null ? 'empty' : v < 0 ? 'good' : 'bad'), v == null ? (live ? '…' : '') : String(v), { left: (colLeft[col] + 0.1) + '%', top }));
            board.append(el('sbi-cell total' + (v == null ? ' empty' : ''), v == null ? '' : String(running), { left: (colLeft[col] + 9) + '%', top }));
        }
    });
    board.title = state.teamMode
        ? 'Eşli: her takımın sol sütunu o elin takım puanı, sağ sütunu takım toplamı. En düşük toplam kazanır.'
        : 'Her oyuncu için: sol sütun o elin puanı, sağ sütun toplam. En düşük toplam kazanır.';
}
// Istaka düzeni el numarasıyla saklanır; sayfa yenilense de aynı eldeki düzen korunur.
function saveRack() { try { sessionStorage.setItem('okeyRack_' + session.roomCode, JSON.stringify({ r: state?.roundId, ids: slots.map(t => t?.id || null) })); } catch {} }
function toast(message, isError = false) {
    const el = $('gameToast');
    el.querySelector('.toast-message').textContent = message;
    el.classList.remove('hidden');
    el.style.borderColor = isError ? '#ef4444' : '#24ce9a';
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add('hidden'), 4000);
}
// Sıra hamleleri sunucu cevap verene kadar (gameState / gameError / gameFinished) tekrar gönderilmez:
// çift tıklama veya hızlı dokunuş iki istek ve "zaten taş aldınız" gibi gereksiz hatalar üretmesin.
const MOVE_EVENTS = new Set(['drawTile', 'discardTile', 'openHand', 'openWithPairs', 'addToGroup', 'processAll', 'retractTurn', 'undoDiscardDraw', 'finishGame']);
let moveInFlight = 0;
function action(event, data = {}) {
    if (!socket.connected) return toast('Bağlantı yok, tekrar bağlanmayı bekleyin.', true);
    if (MOVE_EVENTS.has(event)) {
        if (moveInFlight && Date.now() - moveInFlight < 5000) return;
        moveInFlight = Date.now();
    }
    socket.emit(event, data);
}
const moveAnswered = () => { moveInFlight = 0; };
function joinGameSocket() {
    if (session?.token) socket.emit('rejoinRoom', { roomCode: session.roomCode, token: session.token });
}
socket.on('connect', () => {
    $('connectionBanner').classList.add('hidden');
    if ($('lobbyConnectionAlert')) $('lobbyConnectionAlert').classList.add('hidden');
    if ($('lobbyHomeBtn')) $('lobbyHomeBtn').classList.add('hidden');
    if ($('lobbyLeaveBtn')) $('lobbyLeaveBtn').classList.remove('hidden');
    if ($('lobbyStatusText')) $('lobbyStatusText').textContent = 'Oyuncular bekleniyor...';
    if (document.querySelector('.lobby-waiting')) document.querySelector('.lobby-waiting').classList.remove('hidden');
    joinGameSocket();
});
socket.on('disconnect', () => {
    rollbackDiscard('Bağlantı koptu, atılan taş geri alındı.'); moveAnswered();
    $('connectionBanner').classList.remove('hidden');
    if (!state && session?.roomCode) showLobbyProblem('Sunucu bağlantısı kesildi. Tekrar bağlantı kurulması bekleniyor.');
});
socket.on('gameError', d => {
    rollbackDiscard(); moveAnswered(); // sunucu atışı reddettiyse taş ıstakaya geri döner (sebebi aşağıda gösterilir)
    const message = String(d?.message || 'İşlem gerçekleştirilemedi.');
    if (!state && /oturum bulunamadı|oda kapandı|oturum geçersiz|masada değilsiniz/i.test(message)) {
        sessionStorage.removeItem('okeySession');
        showLobbyProblem('Önceki masa artık mevcut değil. Sunucu yeniden başlamış olabilir. Ana sayfadan yeni bir masa oluşturabilirsiniz.');
        return;
    }
    toast(message, true);
});
function showLobbyProblem(message){
    const alert = $('lobbyConnectionAlert');
    if (!alert) return;
    alert.textContent = message;
    alert.classList.remove('hidden');
    $('lobbyOverlay').classList.add('has-problem'); // hata mesajı klasik kutuda görünsün
    $('lobbyHomeBtn').classList.remove('hidden');
    $('lobbyStatusText').textContent = 'Masa bağlantısı kurulamadı';
    document.querySelector('.lobby-waiting').classList.add('hidden');
    $('lobbyLeaveBtn').classList.add('hidden');
    $('lobbyRoomCode').textContent = session?.roomCode || '------';
    $('lobbyOverlay').classList.remove('hidden');
    $('gameContainer').classList.add('hidden');
}
$('lobbyHomeBtn').addEventListener('click', () => { sessionStorage.removeItem('okeySession'); window.location.assign('/'); });
socket.on('connect_error', () => {
    if (!state) showLobbyProblem('Sunucuya ulaşılamıyor. Node.js uygulamasının çalıştığından ve Socket.IO bağlantısının açık olduğundan emin olun.');
});

socket.on('actionSuccess', d => toast(d.message));
socket.on('sessionReplaced', () => { toast('Oturum başka sekmeden açıldı.', true); socket.disconnect(); });
socket.on('leftGame', () => { sessionStorage.removeItem('okeySession'); if (window.AlemdarTransition) AlemdarTransition.leaveTo('/'); else window.location.assign('/'); });
function leave() {
    if (!window.confirm('Masadan ayrılmak istiyor musun? Oyun devam ediyorsa yerine bot geçer.')) return;
    action('leaveGame');
}
$('lobbyLeaveBtn').addEventListener('click', leave);
$('leaveTableBtn').addEventListener('click', leave);
$('lobbyCopyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(session.roomCode); toast('Oda kodu kopyalandı.'); }
    catch { toast('Oda kodu: ' + session.roomCode); }
});
function showLobby(data) {
    $('lobbyOverlay').classList.remove('hidden');
    document.body.classList.add('waiting-table'); // bekleme panelinin arkasında boş masa görünür
    $('gameContainer').classList.add('hidden');
    $('lobbyRoomCode').textContent = data.code || session.roomCode;
    $('lobbyTeamBadge').classList.toggle('hidden', !data.teamMode);
    $('lobbyPlayerCount').textContent = `(${data.players.length}/4)`;
    document.querySelectorAll('.lobby-player-slot').forEach((element, i) => {
        const player = data.players[i];
        element.classList.toggle('empty', !player);
        element.classList.toggle('filled', !!player);
        element.querySelector('.player-name').textContent = player ? player.name + (player.connected ? '' : ' (bağlanıyor)') : 'Bekleniyor...';
    });
    document.querySelector('.lobby-waiting span').textContent = `${4 - data.players.length} oyuncu bekleniyor...`;
    // Okey Plus masa bekleme paneli
    $('lobbyOverlay').classList.remove('has-problem');
    $('twTop').textContent = 'MASA ' + (data.code || session.roomCode || '------');
    $('twTeam').textContent = data.teamMode ? 'Eşli' : 'Tek';
    $('twRounds').textContent = `${data.roundLimit || 4} El`;
    $('twAssist').textContent = data.assisted === false ? 'Yardımsız' : 'Yardımlı';
    $('twStack').textContent = data.stackingMode ? 'Katlamalı' : 'Katlamasız';
    // Masayı açan kişi (özel masa) bot ekleyip çıkarabilir ve botlarla hemen başlatabilir.
    const isHost = data.hostIndex >= 0 && data.players[data.hostIndex]?.name === session?.playerName;
    const seats = $('twPlayers'); seats.replaceChildren();
    for (let i = 0; i < 4; i++) {
        const p = data.players[i], s = document.createElement('span');
        s.textContent = p ? (p.isBot ? '🤖 ' : '') + p.name + (i === data.hostIndex ? ' 👑' : '') + (p.connected ? '' : ' ⏳') : 'Boş koltuk';
        if (!p) s.className = 'empty';
        if (p?.isBot && isHost) {
            const x = document.createElement('button'); x.type = 'button'; x.className = 'tw-kick'; x.textContent = '✕'; x.title = 'Botu çıkar';
            x.addEventListener('click', () => action('removeBot', { index: i }));
            s.append(x);
        }
        seats.append(s);
    }
    const hostBar = $('twHostBar');
    hostBar.classList.toggle('hidden', !isHost || data.players.length >= 4);
    $('twAddBot').disabled = data.players.length >= 4;
    lobbyWait = { count: data.players.length, botFillAt: data.botFillAt || 0, isPrivate: !data.autoBots, isHost };
    updateWaitStatus();
}
let lobbyWait = { count: 0, botFillAt: 0 };
function updateWaitStatus() {
    const el = $('twStatus'); if (!el) return;
    const left = Math.ceil((lobbyWait.botFillAt - Date.now()) / 1000);
    // Her 500 ms çalışır; metin değişmediyse DOM'a dokunmaz.
    if (lobbyWait.count >= 4) setText(el, 'Oyun başlıyor…');
    else if (lobbyWait.botFillAt && left > 0) setText(el, `${4 - lobbyWait.count} oyuncu bekleniyor · ${left} sn sonra bilgisayar oyuncuları katılacak`);
    else if (lobbyWait.isPrivate) setText(el, lobbyWait.isHost
        ? `${4 - lobbyWait.count} koltuk boş · Arkadaşlarına masa kodunu gönder veya bot ekle`
        : `${4 - lobbyWait.count} koltuk boş · Masayı açan kişi bot ekleyebilir`);
    else setText(el, `${4 - lobbyWait.count} oyuncu bekleniyor…`);
}
setInterval(updateWaitStatus, 500);
$('twLeave').addEventListener('click', leave);
$('twAddBot').addEventListener('click', () => action('addBot'));
$('twStartBots').addEventListener('click', () => action('startWithBots'));
$('twCopy').addEventListener('click', () => $('lobbyCopyBtn').click());
socket.on('lobbyUpdate', data => { if (!data.started && !state && !finished) showLobby(data); });
socket.on('roundCancelled', d => {
    settleDiscard(); moveAnswered();
    finished = false; state = null; slots = Array(SLOTS).fill(null);
    sessionStorage.removeItem('okeyRack_' + session.roomCode);
    $('gameEndModal').classList.add('hidden');
    toast(d.message, true);
});
function restoreSlots(incomingTiles) {
    const valid = new Map(incomingTiles.map(t => [t.id, t]));
    if (slots.every(t => !t)) {
        const saved = previousRack();
        if (saved && saved.r === state?.roundId && saved.ids.length === SLOTS) { slots = Array.from({length:SLOTS}, (_,i) => valid.get(saved.ids[i]) || null); needInitialArrange = false; }
    }
    // Istakadan çıkan taşların yerini hatırla: GERİ TOPLA ile dönerse aynı yerine oturur.
    slots.forEach((tile, i) => { if (tile && !valid.has(tile.id)) leftRackSlots.set(tile.id, i); });
    slots = slots.map(tile => tile && valid.has(tile.id) ? valid.get(tile.id) : null);
    const already = new Set(slots.filter(Boolean).map(t => t.id));
    for (const tile of incomingTiles) {
        const home = leftRackSlots.get(tile.id);
        if (!already.has(tile.id) && home != null && !slots[home]) { slots[home] = tile; already.add(tile.id); }
        leftRackSlots.delete(tile.id);
    }
    const incomingExtras = incomingTiles.filter(t => !already.has(t.id));
    if (incomingExtras.length === 1) pendingFly.newTileId = incomingExtras[0].id; // çekilen taş animasyonu için
    if (pendingDrawDropSlot != null && incomingExtras.length === 1) {
        const desired = Math.max(0, Math.min(SLOTS - 1, pendingDrawDropSlot));
        const free = slots.findIndex(t => !t);
        if (free !== -1 && free !== desired) {
            if (free > desired) {
                for (let i = free; i > desired; i--) slots[i] = slots[i - 1];
            } else {
                for (let i = free; i < desired; i++) slots[i] = slots[i + 1];
            }
            slots[desired] = null;
        }
        if (!slots[desired]) {
            slots[desired] = incomingExtras[0];
            already.add(incomingExtras[0].id);
        }
        pendingDrawDropSlot = null;
    }
    // Birden çok taş birden gelirse (ör. GERİ TOPLA) dağınık değil, sıralı ve bitişik bir blok olarak yerleşir.
    const extrasLeft = incomingTiles.filter(t => !already.has(t.id));
    if (extrasLeft.length >= 2) {
        const sorted = [...extrasLeft].sort((a, b) => fakeBaseNumber(a) - fakeBaseNumber(b) || orderColors.indexOf(fakeBaseColor(a)) - orderColors.indexOf(fakeBaseColor(b)));
        const rowCount = r => slots.slice(r * ROW_WIDTH, (r + 1) * ROW_WIDTH).filter(Boolean).length;
        for (const r of (rowCount(0) <= rowCount(1) ? [0, 1] : [1, 0])) {
            const row = slots.slice(r * ROW_WIDTH, (r + 1) * ROW_WIDTH);
            let last = -1; row.forEach((t, i) => { if (t) last = i; });
            let start = last < 0 ? 0 : (last + 2 + sorted.length <= ROW_WIDTH ? last + 2 : last + 1);
            // Sonda yer yoksa rafta yeterince uzun ilk boş aralığı kullan
            if (!(start + sorted.length <= ROW_WIDTH && row.slice(start, start + sorted.length).every(t => !t))) {
                start = -1;
                for (let s = 0; s + sorted.length <= ROW_WIDTH; s++) if (row.slice(s, s + sorted.length).every(t => !t)) { start = s; break; }
            }
            if (start >= 0) {
                sorted.forEach((t, k) => { slots[r * ROW_WIDTH + start + k] = t; already.add(t.id); });
                break;
            }
        }
    }
    for (const tile of incomingTiles) {
        if (already.has(tile.id)) continue;
        const free = preferredFreeSlot();
        if (free >= 0) slots[free] = tile;
        already.add(tile.id);
    }
    if (selected && !valid.has(selected)) selected = null;
    saveRack();
}
socket.on('gameState', data => {
    settleDiscard(); moveAnswered();
    if (!state || state.roundId !== data.roundId || finished) {
        if (!state || state?.roundId !== data.roundId) {
            slots = Array(SLOTS).fill(null); autoRack = true; autoRackMode = 'series'; flippedTiles.clear(); lastRackSignature = ''; pairsPage = 0; pendingDrawDropSlot = null; tableSlots.clear(); leftRackSlots.clear();
            tomatoesLeft = 5; $('tomatoCounter').textContent = '5';
            needInitialArrange = true;
        }
        finished = false;
        $('gameEndModal').classList.add('hidden');
    }
    updateLastOpenInfo(data);
    state = data;
    setText($('gamebarRoom'), state.roomCode);
    setText($('gamebarAssist'), state.assisted ? 'Yardımlı' : 'Yardımsız');
    setText($('gamebarMode'), (state.teamMode ? 'TAKIM' : 'TEK') + ' · ' + (state.assisted ? 'YARDIMLI' : 'YARDIMSIZ') + ' · ' + (state.stackingMode ? 'KATLAMALI' : 'KATLAMASIZ') + ` · EL ${(state.roundsCompleted || 0) + 1}/${state.roundLimit || 4}`);
    setText($('tableOptions'), `${state.teamMode ? 'Takım' : 'Tek'} · ${state.assisted ? 'Yardımlı' : 'Yardımsız'} · ${state.stackingMode ? `Katlamalı · Açılış ${state.minimumOpenScore}+` : 'Katlamasız'} · ${(state.roundsCompleted || 0) + 1}/${state.roundLimit} El`);
    syncTurnClock(data);
    // Yardımsız masada ıstakayı oyuncu kendisi dizer: SERİ DİZ / ÇİFT DİZ kapalı.
    for (const id of ['sortSeriesBtn', 'sortPairsBtn']) {
        $(id).disabled = !state.assisted;
        $(id).title = state.assisted ? '' : 'Yardımsız masada taşları kendin dizersin';
    }
    const nextSignature = data.tiles.map(t=>t.id).sort().join('|');
    const rackChanged = lastRackSignature !== nextSignature;
    restoreSlots(data.tiles);
    // Yalnızca el başında bir kez dizilir; taş çekince/atınca düzen bozulmaz (SERİ DİZ / ÇİFT DİZ ile yeniden dizilir).
    if (needInitialArrange && data.tiles.length) { if (state.assisted) arrangeRack('series', false); else compactGroups([], slots.filter(Boolean), false); needInitialArrange = false; }
    lastRackSignature = nextSignature;
    $('lobbyOverlay').classList.add('hidden');
    document.body.classList.remove('waiting-table');
    $('gameContainer').classList.remove('hidden');
    // Istakaya kazınan oda adı
    const wood = document.querySelector('.cue-wood');
    if (wood) wood.dataset.room = ({ klasik: 'KLASİK', katlamali: 'KATLAMALI', yardimli: 'YARDIMLI', yardimsiz: 'YARDIMSIZ' })[state.modeKey] || 'ALEMDAR';
    render();
});
socket.on('autoDiscard', data => toast(data.message));
// Ceza: oyuncunun panelinde kırmızı "+101" uçar, herkes sebebini görür.
// Masanın ortasında büyük bildirim kartı (ceza, açılış, okey alma gibi önemli olaylar)
let bannerTimer = null;
function showBanner({ tone = 'info', title, value = '', note = '', ms = 2600 }) {
    let el = $('eventBanner');
    if (!el) { el = document.createElement('div'); el.id = 'eventBanner'; el.setAttribute('role', 'status'); $('gameContainer').append(el); }
    el.className = 'event-banner tone-' + tone;
    el.replaceChildren();
    const t = document.createElement('div'); t.className = 'eb-title'; t.textContent = title;
    el.append(t);
    if (value) { const v = document.createElement('div'); v.className = 'eb-value'; v.textContent = value; el.append(v); }
    if (note) { const n = document.createElement('div'); n.className = 'eb-note'; n.textContent = note; el.append(n); }
    void el.offsetWidth; el.classList.add('show');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => el.classList.remove('show'), ms);
}
socket.on('penalty', data => {
    const me = data.playerIndex === state?.playerIndex;
    const titles = { 'İşlek taş attı': 'İŞLEK TAŞ ATTI', 'Okey attı': 'OKEY ATTI', 'Hatalı açma': 'HATALI AÇMA', 'Eli açıp geri topladı': 'ELİ AÇIP TOPLADI' };
    showBanner({ tone: 'danger', title: (me ? 'SEN · ' : data.name.toLocaleUpperCase('tr') + ' · ') + (titles[data.reason] || 'CEZA'), value: '+' + data.amount, note: 'ceza puanı' });
    if (!state) return;
    const host = $(seatToRelativePos(data.playerIndex) + 'PlayerInfo');
    if (!host) return;
    const float = document.createElement('div');
    float.className = 'penalty-float';
    float.textContent = `+${data.amount}`;
    float.title = data.reason;
    host.append(float);
    setTimeout(() => float.remove(), 2600);
});
let lastCompletedRound = 0;
let nextRoundCountdown = null;
socket.on('gameFinished', data => {
    settleDiscard(); moveAnswered();
    lastCompletedRound = data.completedRounds;
    $('lobbyOverlay').classList.add('hidden');
    $('gameContainer').classList.remove('hidden');
    finished = true;
    $('openPairsModal').classList.add('hidden');
    $('openHandModal').classList.add('hidden');
    $('winnerText').textContent = data.matchEnded ? 'OYUN SONUCU' : `EL SONUCU · ${data.completedRounds}/${data.roundLimit}`;
    // Okey Plus: sağdaki yeşil yuvarlak düğme hep yerinde (simetri). Maç bitince YENİ OYUNA BAŞLA, ara ellerde SONRAKİ EL geri sayımı.
    // Sonuç ekranının üstünde bildirim/mesaj kalmasın
    $('eventBanner')?.classList.remove('show');
    $('gameToast')?.classList.add('hidden');
    const nb = $('newRoundBtn');
    nb.classList.remove('hidden');
    clearInterval(nextRoundCountdown);
    if (data.matchEnded) nb.innerHTML = 'YENİ<br>OYUNA<br>BAŞLA';
    else {
        let left = 5;
        const paint = () => { nb.innerHTML = 'SONRAKİ EL<br><b class="rb-count">' + Math.max(0, left) + '</b>'; };
        paint();
        nextRoundCountdown = setInterval(() => { left--; paint(); if (left <= 0) clearInterval(nextRoundCountdown); }, 1000);
    }
    $('autoRoundNotice').classList.toggle('hidden', false);
    $('autoRoundNotice').textContent = data.matchEnded ? (data.champion ? `Şampiyon: ${data.champion}` : 'Maç bitti.')
        : (data.winner === null ? 'Taşlar bitti, kimse bitiremedi' : `${data.winnerName} eli bitirdi`) + ` · ${data.completedRounds}/${data.roundLimit}. el tamamlandı`;
    $('gameEndModal').classList.remove('peeking');
    $('peekReturnBtn')?.remove();
    nb.disabled = !data.matchEnded;
    nb.classList.toggle('is-countdown', !data.matchEnded);
    nb.dataset.finished = data.matchEnded ? 'true' : 'false';
    renderRoundScores(data);
    $('gameEndModal').classList.remove('hidden');
    refreshGameProfile();
    renderActions();
});
// Okey Plus "OYUN SONUCU": oyuncular toplam puana göre sıralı (az puan önde), kazananlarda taç;
// her satırda bu elin puanı ve toplam. Altında küçük el geçmişi tablosu.
function renderRoundScores(data) {
    const container = $('finalScores'); container.replaceChildren();
    const history = data.roundHistory || [data.points];
    const lastRound = history[history.length - 1] || data.points || [];
    const totals = [0, 1, 2, 3].map(i => history.reduce((n, r) => n + (r?.[i] || 0), 0));
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const list = el('div', 'result-list');
    const groups = data.teamMode ? [[0, 2], [1, 3]] : [[0], [1], [2], [3]];
    const groupTotal = g => g.reduce((n, i) => n + totals[i], 0);
    groups.sort((a, b) => groupTotal(a) - groupTotal(b));
    const best = groupTotal(groups[0]);
    groups.forEach(g => {
        const block = el('div', 'result-block' + (groupTotal(g) === best ? ' is-winner' : ''));
        g.forEach(i => {
            const p = data.players[i] || {};
            const row = el('div', 'result-row' + (i === state?.playerIndex ? ' is-me' : ''));
            const av = el('div', 'result-avatar'); const img = el('img'); img.src = avatarSrc(p.avatar); img.alt = ''; av.append(img);
            if (groupTotal(g) === best) av.append(el('span', 'result-crown', '👑'));
            const info = el('div', 'result-info'); info.append(el('strong', '', p.name || '-'), el('small', '', i === data.winner ? 'Eli bitirdi' : (p.hasOpened ? (p.openType === 'pairs' ? 'Çift açtı' : 'Seri açtı') : 'Açamadı')));
            const round = lastRound[i] ?? 0;
            row.append(av, info, el('span', 'result-round ' + (round < 0 ? 'good' : 'bad'), (round > 0 ? '+' : '') + round));
            block.append(row);
        });
        const tot = el('div', 'result-total');
        if (groupTotal(g) === best) tot.append(el('span', 'result-win-label', g.length > 1 ? 'KAZANANLAR' : 'KAZANAN'));
        tot.append(el('b', '', String(groupTotal(g))));
        block.append(tot);
        list.append(block);
    });
    container.append(list);
    if (history.length > 1 || data.roundLimit > 1) {
        const mini = el('div', 'result-history');
        // Eşli oyunda el geçmişi takım toplamıyla yazılır.
        const line = r => data.teamMode
            ? [[0, 2], [1, 3]].map(g => `${g.map(i => shortenName(data.players[i]?.name, 6)).join(' + ')} ${g.reduce((n, i) => n + (r?.[i] || 0), 0)}`).join(' · ')
            : data.players.map((p, i) => `${shortenName(p.name, 8)} ${r?.[i] ?? 0}`).join(' · ');
        history.forEach((r, k) => mini.append(el('span', '', `${k + 1}. el: ` + line(r))));
        container.append(mini);
    }
    return;
}
function renderRoundScoresTable(data) {
    const container = $('finalScores'); container.replaceChildren();
    const table = document.createElement('table'); table.className = 'round-score-table';
    const thead = document.createElement('thead'), header = document.createElement('tr');
    const headings = ['El', ...data.players.map(p => p.name)];
    headings.forEach(label => { const th=document.createElement('th'); th.textContent=label; header.append(th); });
    thead.append(header); table.append(thead);
    const body = document.createElement('tbody');
    const history = data.roundHistory || [data.points];
    for (let round=0; round<data.roundLimit; round++) {
        const row=document.createElement('tr'), cells=[`${round+1}. El`, ...Array.from({length:4},(_,i) => history[round]?.[i] ?? '—')];
        cells.forEach((value,i) => { const td=document.createElement('td'); td.textContent=String(value); if(i && typeof value==='number') td.className=value<0?'score-good':'score-bad'; row.append(td); });
        body.append(row);
    }
    const totals = document.createElement('tr'); totals.className='total-score-row';
    ['Toplam', ...Array.from({length:4}, (_,i) => history.reduce((n, round) => n+(round?.[i] || 0), 0))].forEach(v => {const td=document.createElement('td');td.textContent=v;totals.append(td);});
    body.append(totals); table.append(body); container.append(table);
    if (data.teamMode) { const div=document.createElement('p'); div.textContent=`Takım 1: ${data.scores.team1} · Takım 2: ${data.scores.team2}`;container.append(div); }
}
let turnClockKey = '', turnClockEnd = 0, turnDurationMs = 45000;
function syncTurnClock(data) {
    const key = `${data.roundId}/${data.currentPlayer}/${data.turnDeadline}`;
    turnDurationMs = data.turnDurationMs || 45000;
    if (key !== turnClockKey) { turnClockKey=key; turnClockEnd=Date.now()+(data.turnRemainingMs ?? turnDurationMs); }
    updateTurnClock();
}
// Süre göstergeleri tarayıcının animasyon motoruyla akar (transform / clip-path: layout yok).
// JS yalnızca sıra, görünürlük veya aktif oyuncu değişince animasyonu baştan kurar.
let turnAnimKey = '', turnAnims = [], turnLowTimer = null;
function updateTurnClock() {
    const bar = $('turnTimerBar');
    const barOn = !!bar && !bar.classList.contains('hidden') && !finished;
    const panels = [...document.querySelectorAll('#gameBoard .player-info')];
    const active = finished ? null : panels.find(el => el.classList.contains('active-turn'));
    const key = `${turnClockKey}|${barOn}|${active?.id || ''}`;
    if (key === turnAnimKey) return;
    turnAnimKey = key;
    turnAnims.forEach(a => a.cancel()); turnAnims = [];
    clearTimeout(turnLowTimer);
    const fills = panels.map(el => {
        let fill = el.querySelector('.turn-fill');
        if (!fill) { fill = document.createElement('span'); fill.className = 'turn-fill'; el.prepend(fill); }
        fill.classList.remove('is-low');
        fill.style.clipPath = 'inset(0 100% 0 0)'; // sırası olmayan kutu boş (aktif kutuda animasyon bunu ezer)
        return fill;
    });
    bar?.classList.remove('is-low');
    const left = Math.max(0, turnClockEnd - Date.now()), fraction = Math.min(1, left / turnDurationMs);
    const run = (el, frames) => { if (el && left > 0) turnAnims.push(el.animate(frames, { duration: left, easing: 'linear', fill: 'forwards' })); };
    // Sıra sendeyken üstteki uzun süre çubuğu (son 10 saniyede kırmızıya döner)
    if (barOn) {
        run(bar.querySelector('.ttb-fill'), [{ transform: `scaleX(${fraction})` }, { transform: 'scaleX(0)' }]);
        run(bar.querySelector('.ttb-rail'), [{ transform: `translateX(${(fraction - 1) * 100}%)` }, { transform: 'translateX(-100%)' }]);
    }
    // Okey Plus sıra göstergesi: aktif oyuncunun kutusu yeşille dolu, süre bittikçe boşalır
    // (üst/alt kutu sağdan sola, sol/sağ kutu aşağıdan yukarı).
    const activeFill = active ? fills[panels.indexOf(active)] : null;
    if (activeFill) {
        const vertical = active.id === 'leftPlayerInfo' || active.id === 'rightPlayerInfo';
        const inset = p => vertical ? `inset(0 0 ${p}% 0 round 6px)` : `inset(0 ${p}% 0 0 round 6px)`;
        run(activeFill, [{ clipPath: inset((1 - fraction) * 100) }, { clipPath: inset(100) }]);
    }
    const setLow = () => { if (barOn) bar.classList.add('is-low'); activeFill?.classList.add('is-low'); };
    if (left < 10000) setLow(); else turnLowTimer = setTimeout(setLow, left - 10000);
}
setInterval(updateTurnClock, 1000); // güvenlik ağı: değişiklik yoksa hiçbir şey yapmaz
// YENİ OYUNA BAŞLA: maç bittiğinde aynı modda yeni masaya otomatik katıl.
$('newRoundBtn').addEventListener('click', () => {
    if ($('newRoundBtn').dataset.finished === 'true') {
        try { sessionStorage.setItem('autoJoinMode', state?.modeKey || 'klasik'); } catch {}
        $('gameEndModal').classList.add('hidden'); action('leaveGame'); return;
    }
    $('newRoundBtn').disabled = true;
});
$('resultLeaveBtn').addEventListener('click', () => { $('gameEndModal').classList.add('hidden'); action('leaveGame'); });
// MASAYA GÖZ AT: sonucu gizle, masaya bak; köşedeki düğmeyle geri aç.
$('peekTableBtn').addEventListener('click', () => {
    $('gameEndModal').classList.add('peeking');
    const back = document.createElement('button');
    back.id = 'peekReturnBtn'; back.type = 'button'; back.className = 'peek-return'; back.textContent = 'SONUCU GÖSTER';
    back.addEventListener('click', () => { $('gameEndModal').classList.remove('peeking'); back.remove(); });
    $('gameContainer').append(back);
});
socket.on('nextRoundReady', data => {
    if (finished && $('newRoundBtn').dataset.finished !== 'true') $('newRoundBtn').textContent = `${lastCompletedRound+1}. ELE GEÇ (${data.ready}/${data.total} hazır)`;
});
let tomatoesLeft = 5;
// Hediye albümü: kimlikler sunucudaki GIFT_IDS ile aynı olmalı. me: alan kişiye okunan cümle, other: masadaki diğerlerine.
const GIFTS = [
    { id: 'cay', emoji: '☕', name: 'Çay', me: f => `${f} size bir çay ısmarladı, demli olsun!`, other: (f, t) => `${f}, ${t} oyuncusuna çay ısmarladı.` },
    { id: 'gul', emoji: '🌹', name: 'Gül', me: f => `${f} size bir gül uzattı.`, other: (f, t) => `${f}, ${t} oyuncusuna gül uzattı.` },
    { id: 'opucuk', emoji: '😘', name: 'Öpücük', me: f => `${f} size öpücük gönderdi.`, other: (f, t) => `${f}, ${t} oyuncusuna öpücük gönderdi.` },
    { id: 'goz', emoji: '👀', name: 'Göz', me: f => `Dikkat! ${f} size göz dikmiş.`, other: (f, t) => `${f}, ${t} oyuncusuna göz dikmiş.` },
    { id: 'kahkaha', emoji: '😂', name: 'Kahkaha', me: f => `${f} size kahkahalarla güldü.`, other: (f, t) => `${f}, ${t} oyuncusuna kahkahalarla güldü.` },
    { id: 'domates', emoji: '🍅', name: 'Domates', me: f => `${f} size domates fırlattı!`, other: (f, t) => `${f}, ${t} oyuncusuna domates fırlattı.` },
    { id: 'alkis', emoji: '👏', name: 'Alkış', me: f => `${f} sizi ayakta alkışlıyor.`, other: (f, t) => `${f}, ${t} oyuncusunu ayakta alkışlıyor.` },
    { id: 'ortaparmak', emoji: '🖕', name: 'Orta Parmak', me: f => `${f} size orta parmak gösterdi. Ayıp ayıp!`, other: (f, t) => `${f}, ${t} oyuncusuna orta parmak gösterdi. Ayıp ayıp!` },
    { id: 'uyku', emoji: '😴', name: 'Uyandır', me: f => `${f} dürttü: uyuyor musun, oyna artık!`, other: (f, t) => `${f}, ${t} oyuncusunu dürttü: uyuma!` },
    { id: 'ates', emoji: '🔥', name: 'Ateş', me: f => `${f} diyor ki: bu masa yanıyor!`, other: (f, t) => `${f}, ${t} için diyor ki: bu masa yanıyor!` },
    { id: 'kalp', emoji: '❤️', name: 'Kalp', me: f => `${f} size kalbini gönderdi.`, other: (f, t) => `${f}, ${t} oyuncusuna kalbini gönderdi.` },
    { id: 'hediye', emoji: '🎁', name: 'Sürpriz', me: f => `${f} size sürpriz bir hediye yolladı.`, other: (f, t) => `${f}, ${t} oyuncusuna sürpriz hediye yolladı.` },
];
const giftById = id => GIFTS.find(g => g.id === id);
let currentGift = 'cay';
const lastGifts = ['', '', '', '']; // koltuk başına son alınan hediye (panelde kalıcı gösterilir)
// Albüm kartları (ana pencere) ve profil penceresindeki küçük ızgara aynı listeden çizilir.
function fillGiftGrid(box, onPick) {
    box.replaceChildren(...GIFTS.map(g => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'gift-card'; b.dataset.gift = g.id; b.title = g.name;
        const e = document.createElement('span'); e.className = 'gift-emoji'; e.textContent = g.emoji;
        const n = document.createElement('span'); n.className = 'gift-name'; n.textContent = g.name;
        b.append(e, n); b.addEventListener('click', () => onPick(g, b)); return b;
    }));
}
fillGiftGrid($('giftIcons'), (g, b) => { currentGift = g.id; $('giftIcons').querySelectorAll('.gift-card').forEach(x => x.classList.toggle('selected', x === b)); });
$('giftIcons').querySelector('.gift-card')?.classList.add('selected');
$('tomatoBtn').addEventListener('click', () => {
    if (!state) return toast('Oyun başlayınca kullanabilirsin.', true);
    if (tomatoesLeft <= 0) return toast('Bu eldeki hediye hakkın bitti.', true);
    const list = $('targetButtons'); list.replaceChildren();
    state.players.forEach((p, i) => {
        if (i === state.playerIndex) return;
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'gift-target';
        const img = document.createElement('img'); img.src = avatarSrc(p.avatar); img.alt = '';
        const name = document.createElement('span'); name.textContent = p.name;
        btn.append(img, name);
        btn.addEventListener('click', () => { action('sendGift', { target: i, kind: currentGift }); $('tomatoSelectOverlay').classList.add('hidden'); });
        list.append(btn);
    });
    setText($('giftAlbumLeft'), `${tomatoesLeft} hak kaldı`);
    $('tomatoSelectOverlay').classList.remove('hidden');
});
$('cancelThrowBtn').addEventListener('click', () => $('tomatoSelectOverlay').classList.add('hidden'));
$('tomatoSelectOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });
function seatToRelativePos(seatIndex){ const positions=['bottom','right','top','left']; return positions[(seatIndex - state.playerIndex + 4) % 4]; }
function showGiftEffect(seatIndex, kind, text){ if(!state) return; const pos=seatToRelativePos(seatIndex); const host=$(pos + 'PlayerInfo'); if(!host) return; const float=document.createElement('div'); float.className='gift-float'; const k=document.createElement('span'); k.className='gift-float-kind'; k.textContent=kind; const t=document.createElement('small'); t.textContent=text; float.append(k,t); host.append(float); setTimeout(()=>float.remove(),2800);}
// Hediye cümlesi sesli okunur (ses kapalıysa okunmaz); yeni hediye gelince öncekini keser.
function speak(text) {
    if (!soundEnabled || !('speechSynthesis' in window)) return;
    try { const u = new SpeechSynthesisUtterance(text); u.lang = 'tr-TR'; u.rate = 1.02; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch {}
}
socket.on('giftSent', data => {
    const gift = giftById(data.kind);
    if (!gift) return;
    lastGifts[data.toIndex] = gift.emoji;
    if (state) renderPlayers();
    const toMe = data.toIndex === state?.playerIndex;
    const line = toMe ? gift.me(data.from) : gift.other(data.from, data.to);
    toast(`${gift.emoji} ${line}`);
    showGiftEffect(data.toIndex, gift.emoji, toMe ? line : `${data.from} → ${gift.name}`);
    speak(line);
    if (data.fromIndex === state?.playerIndex) { tomatoesLeft = data.left; $('tomatoCounter').textContent = tomatoesLeft; }
});
// Tiles use the included 13-column sprite sheet, same dimensions in rack, discards, and on table.
// represent: masadaki okeyin yerine geçtiği taş ({color, number}); verilirse okey o taş olarak çizilir.
function createTile(tile, cls = '', represent = null) {
    const el = document.createElement('div');
    el.className = 'tile-sprite fresh-tile ' + cls;
    el.dataset.tileId = tile.id;
    const isRealOkey = !!state?.okey && !tile.isFakeJoker && tile.color === state.okey.color && tile.number === state.okey.number;
    const face = isRealOkey && represent ? represent : tile;
    el.dataset.color = face.color; // CSS: 4. renk sarı
    if (tile.isFakeJoker) { const clover = document.createElement('span'); clover.className = 'fake-clover'; el.append(clover); }
    const spriteCol = tile.isFakeJoker ? (tile.id === 'Sahte-2' ? 1 : 0) : Math.max(0, Number(face.number) - 1);
    el.style.backgroundPosition = `${(spriteCol / 12) * 100}% ${((spriteRows[face.color] || 0) / 4) * 100}%`;
    if (isRealOkey) {
        el.classList.add('real-okey');
        const star = document.createElement('span'); star.className = 'okey-star'; el.append(star);
        if (represent) {
            el.classList.add('okey-on-table');
            el.title = 'OKEY · bu taşın üstüne yerine geçtiği taşı koyarak okeyi alabilirsin';
        } else if (state.assisted && !flippedTiles.has(tile.id)) {
            // Yardımlı masada okey "ters döner": joker yüzü (çift tıkla / sağ tıkla gerçek yüzü)
            el.classList.add('okey-joker');
            el.title = 'OKEY · gerçek yüzünü görmek için çift tıkla';
        } else el.title = 'OKEY';
    }
    return el;
}
// Masadaki bir gruptaki okeylerin hangi taşın yerine geçtiği (sunucu grubu yuvalarına göre dizer).
function groupRepresentations(tiles) {
    if (!state?.okey) return [];
    const isWild = t => !t.isFakeJoker && t.color === state.okey.color && t.number === state.okey.number;
    const eff = t => t.isFakeJoker ? state.okey : t;
    const fixed = tiles.map((t, p) => ({ t: eff(t), p })).filter(x => !isWild(tiles[x.p]));
    if (!fixed.length) return [];
    const sameNumber = fixed.every(x => x.t.number === fixed[0].t.number) && new Set(fixed.map(x => x.t.color)).size === fixed.length;
    if (sameNumber && tiles.length <= 4) {
        const missing = ['Kirmizi', 'Yesil', 'Mavi', 'Siyah'].filter(c => !fixed.some(x => x.t.color === c));
        return tiles.map(t => isWild(t) ? { color: missing.shift() || state.okey.color, number: fixed[0].t.number } : null);
    }
    const start = fixed[0].t.number - fixed[0].p;
    return tiles.map((t, p) => isWild(t) ? { color: fixed[0].t.color, number: Math.max(1, Math.min(13, start + p)) } : null);
}
function miniTile(tile) { return createTile(tile, 'table-tile'); }
function moveRack(from, to) {
    if (from === to || from < 0 || to < 0 || !slots[from]) return;
    [slots[from], slots[to]] = [slots[to], slots[from]];
    autoRack = false;
    saveRack();
    renderRack();
}
function pointerStart(e, from, element) {
    if (e.button !== undefined && e.button !== 0) return;
    const bounds=element.getBoundingClientRect();
    drag = { from, startX: e.clientX, startY: e.clientY, tile: element, width:bounds.width, height:bounds.height, pointerId: e.pointerId, ghost: null };
    element.setPointerCapture?.(e.pointerId);
}
// Sürükleme akıcılığı: taş transform ile taşınır (layout yok) ve kare başına en fazla bir kez çizilir;
// masa taşlarının konumu sürükleme başında bir kez ölçülür, hareket sırasında yeniden ölçülmez.
function pointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.ghost && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 8) {
        drag.ghost = drag.tile.cloneNode(true);
        drag.ghost.classList.remove('selected', 'drop-target');
        drag.ghost.classList.add('pointer-ghost');
        // Ölçü tutunduğu taşın ekrandaki boyutu (sayfa gövdesinde ıstaka kuralları geçmez); tam opak.
        for (const [k, v] of Object.entries({ 'pointer-events': 'none', left: '0', top: '0', width: drag.width + 'px', height: drag.height + 'px', margin: '0', opacity: '1', 'will-change': 'transform' }))
            drag.ghost.style.setProperty(k, v, 'important');
        placeGhost();
        document.body.append(drag.ghost);
        // Tutulan taşın yeri boş görünür (yarı saydam kopyası başka taşların üstünde çift görüntü yapmasın).
        drag.tile.classList.add('drag-source');
    }
    if (drag.ghost && !drag.frame) drag.frame = requestAnimationFrame(paintDrag);
}
function placeGhost() {
    drag.ghost.style.transform = `translate3d(${drag.x - drag.width / 2}px, ${drag.y - drag.height / 2}px, 0) scale(1.06) rotate(-2deg)`;
}
function paintDrag() {
    if (!drag?.ghost) return;
    drag.frame = 0;
    placeGhost();
    // Istakadan sürüklenen taş masadaki bir grubun üstüne/yakınına gelince o grup parlar
    if (typeof drag.from === 'number') highlightDropGroup(findDropGroup(drag.x, drag.y, true));
}
// Masa ve masa taşlarının ekran konumları; masa yeniden çizilince (renderGroups) sıfırlanır.
function dropTileRects() {
    if (drag && drag.tableRects) return drag.tableRects;
    const rects = { box: $('compactOpenGroups')?.getBoundingClientRect() || null,
        tiles: [...document.querySelectorAll('#compactOpenGroups .grid-table-tile')].map(el => ({ el, r: el.getBoundingClientRect() })) };
    if (drag) drag.tableRects = rects;
    return rects;
}
// Bırakılan noktadaki ya da en yakın (1,5 taş mesafesindeki) masa grubu ve eklenecek kenar (sol/sağ).
// fast: sürüklerken her karede DOM isabet testi (elementFromPoint, sayfayı yeniden hesaplatır) yerine
// ölçülmüş dikdörtgenler kullanılır; bırakma anında gerçek isabet testi yapılır.
function findDropGroup(x, y, fast = false) {
    const inside = r => r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    let hitTile, inTable;
    if (fast) {
        const m = dropTileRects();
        hitTile = m.tiles.find(({ r }) => inside(r))?.el || null;
        inTable = !!hitTile || inside(m.box);
    } else {
        const hit = document.elementFromPoint(x, y);
        hitTile = hit?.closest?.('.grid-table-tile') || null;
        inTable = !!hitTile || !!hit?.closest?.('#compactOpenGroups');
    }
    let tile = hitTile;
    const all = inTable ? dropTileRects().tiles : null;
    if (!tile && all) {
        let best = null, bestD = Infinity;
        for (const { el, r } of all) {
            const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
            const d = Math.hypot(dx, dy), limit = r.width * 1.5;
            if (d < bestD && d <= limit) { best = el; bestD = d; }
        }
        tile = best;
    }
    if (!tile) return null;
    const members = all.filter(({ el }) => el.dataset.owner === tile.dataset.owner && el.dataset.group === tile.dataset.group);
    const mid = (Math.min(...members.map(m => m.r.left)) + Math.max(...members.map(m => m.r.right))) / 2;
    return { tile, tiles: members.map(m => m.el), position: x < mid ? 'left' : 'right', onOkey: hitTile === tile && tile.classList.contains('real-okey') };
}
let lastDropTiles = [];
function highlightDropGroup(target) {
    const next = target ? target.tiles : [];
    // Aynı grup üstünde gezinirken sınıfları tekrar değiştirme (her karede stil hesabı olmasın).
    if (next.length === lastDropTiles.length && next.every((t, i) => t === lastDropTiles[i])) return;
    lastDropTiles.forEach(t => t.classList.remove('drop-target'));
    lastDropTiles = next;
    lastDropTiles.forEach(t => t.classList.add('drop-target'));
}
// Çift dokunuş: aynı taşa 350 ms içinde iki kez dokunulursa taş atılır (okeyde yüzü çevrilir).
// dblclick olayı kullanılamaz: ilk dokunuş seçimi değiştirip ıstakayı yeniden çizdiği için ikinci dokunuş yeni elemana düşer.
let lastTap = null;
function doubleTapTile(tile) {
    if (state?.okey && !tile.isFakeJoker && tile.color === state.okey.color && tile.number === state.okey.number) {
        if (flippedTiles.has(tile.id)) flippedTiles.delete(tile.id); else flippedTiles.add(tile.id);
        saveRack(); renderRack(); return;
    }
    discard(tile.id);
}
function pointerEnd(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const from = drag.from;
    const moved = !!drag.ghost;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const dropGroup = moved && typeof from === 'number' ? findDropGroup(e.clientX, e.clientY) : null;
    const ghostRect = drag.ghost?.getBoundingClientRect();
    if (drag.frame) cancelAnimationFrame(drag.frame);
    drag.ghost?.remove();
    drag.tile.classList.remove('drag-source');
    drag = null;
    if (!moved) {
        if (typeof from === 'number') {
            const tile = slots[from], now = Date.now();
            if (tile && lastTap?.id === tile.id && now - lastTap.at < 350) { lastTap = null; doubleTapTile(tile); return; }
            lastTap = tile ? { id: tile.id, at: now } : null;
            selected = tile?.id || null; renderRack();
        }
        else if (from === 'pile') draw(false);
        else if (from === 'left') draw(true);
        return;
    }
    lastTap = null;
    const slot = target?.closest('.tile-slot');
    const throwZone = target?.closest('#rightDiscardTiles, #myRightDiscard');
    highlightDropGroup(null);
    if (typeof from === 'number') {
        if (slot) {
            // Bırakılan taş parmağın altından yeni yuvasına yumuşakça oturur.
            const movedId = slots[from]?.id;
            moveRack(from, Number(slot.dataset.slot));
            const placed = movedId && document.querySelector(`.cue-row .tile-sprite[data-tile-id="${CSS.escape(movedId)}"]`);
            if (placed && ghostRect) flyTile(placed, ghostRect, 140);
        }
        else if (throwZone) discard(slots[from]?.id);
        else if (dropGroup) processGroup(slots[from]?.id, dropGroup.tile, dropGroup.onOkey ? null : dropGroup.position);
    } else if (from === 'left' || from === 'pile') {
        if (slot) pendingDrawDropSlot = Number(slot.dataset.slot);
        draw(from === 'left');
    }
}
function bindPointer(el, from) {
    el.addEventListener('pointerdown', e => pointerStart(e, from, el));
    el.addEventListener('pointermove', pointerMove);
    el.addEventListener('pointerup', pointerEnd);
    el.addEventListener('pointercancel', () => { if (drag?.frame) cancelAnimationFrame(drag.frame); drag?.ghost?.remove(); drag?.tile.classList.remove('drag-source'); drag = null; highlightDropGroup(null); });
}
function draw(fromDiscard) {
    if (!canPlay() || state.hasDrawn) return toast('Taş çekme sırası sizde değil veya zaten taş aldınız.', true);
    if (fromDiscard && state.leftLocked) return toast('Geri bıraktığın taşı bu tur tekrar alamazsın. Ortadan taş çek.', true);
    // Animasyon: taş desteden (veya soldaki atık taştan) ıstakaya kayar
    const src = fromDiscard ? $('leftDiscardTiles').querySelector('.tile-sprite:last-of-type') : $('drawPile');
    if (src) pendingFly.draw = { rect: src.getBoundingClientRect(), at: Date.now() };
    action('drawTile', { fromDiscard });
}
function discard(tileId) {
    if (!tileId) return toast('Önce bir taş seçin.', true);
    if (!canPlay() || !state.hasDrawn) return toast('Önce sıranız gelmeli ve taş çekmiş olmalısınız.', true);
    if (moveInFlight && Date.now() - moveInFlight < 5000) return; // önceki hamlenin cevabı bekleniyor
    // Sunucu zaten reddeder; sormadan hemen söyle (gidip gelen istek ve bekleme olmasın).
    if (state.mustOpenThisTurn) return toast('Yerden aldığın taşı açılışta veya işlemekte kullanmalısın; istersen GERİ BIRAK.', true);
    const src = document.querySelector(`.cue-row .tile-sprite[data-tile-id="${CSS.escape(tileId)}"]`);
    if (src) pendingFly.discard = { id: tileId, rect: src.getBoundingClientRect(), at: Date.now() };
    // Yerden alınan taş kullanılmadıysa sunucu reddedecek; o durumda iyimser gösterim yapma (titreme olmasın).
    if (socket.connected && !state.mustOpenThisTurn) applyOptimisticDiscard(tileId);
    action('discardTile', { tileId });
}
// İyimser arayüz: atılan taş sunucu cevabını beklemeden ıstakadan kalkar, atık alanına uçar ve sıra
// sonraki oyuncuya geçmiş görünür. Sunucu reddederse, bağlantı koparsa veya cevap gelmezse eski hale dönülür.
// Sunucudan gelen her gameState gerçek durumdur ve bu geçici görünümün yerini alır.
let pendingDiscard = null;
function applyOptimisticDiscard(tileId) {
    const slot = slots.findIndex(t => t?.id === tileId), tile = slots[slot] || state.tiles.find(t => t.id === tileId);
    if (!tile) return;
    pendingDiscard = { state, slots: [...slots], selected, clockKey: turnClockKey, clockEnd: turnClockEnd, clockMs: turnDurationMs };
    const me = state.playerIndex;
    state = { ...state, tiles: state.tiles.filter(t => t.id !== tileId), hasDrawn: false, currentPlayer: (me + 1) % 4, canRetract: false,
        discards: state.discards.map((p, s) => s === me ? [...p, tile] : p),
        players: state.players.map((p, s) => s === me ? { ...p, tileCount: Math.max(0, p.tileCount - 1) } : p) };
    if (slot >= 0) slots[slot] = null;
    selected = null;
    // Sıradaki oyuncunun göstergesi tam süreyle başlar; sunucunun gerçek süresi gelince düzeltilir.
    turnClockKey = 'optimistic'; turnClockEnd = Date.now() + turnDurationMs;
    render();
    pendingDiscard.timer = setTimeout(() => rollbackDiscard('Sunucu yanıt vermedi, taş geri alındı.'), 8000);
}
function rollbackDiscard(message) {
    if (!pendingDiscard) return;
    clearTimeout(pendingDiscard.timer);
    ({ state, slots, selected } = pendingDiscard);
    turnClockKey = pendingDiscard.clockKey; turnClockEnd = pendingDiscard.clockEnd; turnDurationMs = pendingDiscard.clockMs;
    pendingDiscard = null;
    render();
    if (message) toast(message, true);
}
function settleDiscard() { if (pendingDiscard) { clearTimeout(pendingDiscard.timer); pendingDiscard = null; } }
// ---------- Taş hareket animasyonları ----------
// Hedef taşın bir kopyası sayfanın üst katmanında kaynaktan hedefe kayar; hedef bu sırada gizli kalır.
const pendingFly = { draw: null, discard: null, place: null, newTileId: null };
let lastDiscardTops = null;
function flyTile(target, fromRect, ms = 420) {
    if (!target || !fromRect || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const to = target.getBoundingClientRect();
    if (!to.width || !fromRect.width) return;
    const ghost = target.cloneNode(true);
    ghost.classList.add('fly-ghost');
    // Ölçüler !important ile verilir: masa taşının "genişlik %100 !important" kuralı sayfa gövdesinde
    // ekran genişliği demektir; yoksa işlenen taş uçarken bir an bütün ekranı kaplıyordu.
    for (const [k, v] of Object.entries({ position: 'fixed', left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px',
        margin: '0', 'z-index': '9000', 'pointer-events': 'none', 'grid-column': 'auto', 'grid-row': 'auto' })) ghost.style.setProperty(k, v, 'important');
    document.body.append(ghost);
    const dx = (fromRect.left + fromRect.width / 2) - (to.left + to.width / 2);
    const dy = (fromRect.top + fromRect.height / 2) - (to.top + to.height / 2);
    const s = Math.max(0.35, Math.min(2.2, fromRect.width / to.width));
    target.style.visibility = 'hidden';
    const anim = ghost.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${s})`, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.4))' },
        { transform: `translate(${dx * 0.08}px, ${dy * 0.08 - 18}px) scale(1.08)`, filter: 'drop-shadow(0 16px 18px rgba(0,0,0,.45))', offset: 0.75 },
        { transform: 'translate(0, 0) scale(1)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' }
    ], { duration: ms, easing: 'cubic-bezier(.22,.9,.3,1)' });
    const done = () => { ghost.remove(); target.style.visibility = ''; };
    anim.onfinish = done; anim.oncancel = done;
}
function runPendingFlights() {
    const fresh = f => f && Date.now() - f.at < 4000;
    if (fresh(pendingFly.draw) && pendingFly.newTileId) {
        flyTile(document.querySelector(`.cue-row .tile-sprite[data-tile-id="${CSS.escape(pendingFly.newTileId)}"]`), pendingFly.draw.rect);
        pendingFly.draw = null;
    }
    if (fresh(pendingFly.discard)) {
        const t = $('rightDiscardTiles').querySelector(`.tile-sprite[data-tile-id="${CSS.escape(pendingFly.discard.id)}"]`);
        if (t) { flyTile(t, pendingFly.discard.rect, 380); pendingFly.discard = null; }
    }
    if (fresh(pendingFly.place)) {
        const t = document.querySelector(`#compactOpenGroups .tile-sprite[data-tile-id="${CSS.escape(pendingFly.place.id)}"]`);
        if (t) { flyTile(t, pendingFly.place.rect, 380); pendingFly.place = null; }
    }
    pendingFly.newTileId = null;
    // Rakiplerin attığı taş: panelinden atık yerine kayar
    const tops = (state.discards || []).map(p => p?.[p.length - 1]?.id || null);
    if (lastDiscardTops && lastDiscardTops.roundId === state.roundId) {
        tops.forEach((id, seat) => {
            if (!id || id === lastDiscardTops.ids[seat] || seat === state.playerIndex) return;
            const pos = seatToRelativePos(seat);
            const target = seat === (state.playerIndex + 3) % 4
                ? $('leftDiscardTiles').querySelector(`.tile-sprite[data-tile-id="${CSS.escape(id)}"]`)
                : $(pos === 'top' ? 'topDiscardTiles' : 'other' + pos[0].toUpperCase() + pos.slice(1) + 'DiscardTiles')?.querySelector('.tile-sprite');
            const from = $(pos + 'PlayerInfo')?.getBoundingClientRect();
            if (target && from) flyTile(target, from, 460);
        });
    }
    lastDiscardTops = { roundId: state.roundId, ids: tops };
}
function canPlay() { return state && !finished && state.currentPlayer === state.playerIndex; }
function updateIndicator() {
    if (changed('indicator', [state.roundId, state.indicator?.id || '', state.okey?.color, state.okey?.number].join('#')))
        $('indicatorTile').replaceChildren(state.indicator ? miniTile(state.indicator) : document.createTextNode('-'));
    // Orta mod kolonu (referanstaki gibi) + kalan taş sayacı
    const setMode = (id, text, on) => { const el = $(id); if (!el) return; setText(el, text); el.classList.toggle('mode-on', !!on); };
    setMode('modeTeam', state.teamMode ? 'Eşli' : 'Tek', state.teamMode);
    setMode('modeAssist', state.assisted ? 'Yardımlı' : 'Yardımsız', state.assisted);
    setMode('modeStack', state.stackingMode ? 'Katlamalı' : 'Katlamasız', state.stackingMode);
    setMode('modeRound', `${(state.roundsCompleted || 0) + 1}/${state.roundLimit || 4} El`, false);
    const odo = $('pileOdometer');
    setText(odo, String(state.pileCount ?? 0).padStart(3, '0').split('').join(' '));
}
function getScore(group) {
    if (group.length < 3) return 0;
    const fixed = group.map(t => t.isFakeJoker ? { ...t, color: state.okey?.color ?? t.color, number: state.okey?.number ?? t.number } : t)
        .filter(t => !(t.color === state.okey.color && t.number === state.okey.number && !t.isFakeJoker));
    const jokers = group.length - fixed.length;
    if (group.length <= 4 && fixed.length && fixed.every(t => t.number === fixed[0].number) &&
        new Set(fixed.map(t => t.color)).size === fixed.length) return group.length * fixed[0].number;
    if (fixed.some(t => t.color !== fixed[0]?.color) || new Set(fixed.map(t => t.number)).size !== fixed.length) return 0;
    for (let start = 14 - group.length; start >= 1; start--) {
        if (fixed.every(t => t.number >= start && t.number < start + group.length))
            return group.length * (2 * start + group.length - 1) / 2;
    }
    return 0;
}
// Istakada yan yana dizilmiş bir grubun puanı (Okey Plus gibi dizilim sırası önemli):
// per = aynı sayı farklı renk (3-4 taş); seri = aynı renk ardışık (artan veya azalan), okey boşluğu doldurur.
function arrangedGroupScore(group) {
    if (!state?.okey || group.length < 3 || !OkeyMelds.isValidGroup(group, state.okey)) return 0;
    const isWild = t => !t.isFakeJoker && t.color === state.okey.color && t.number === state.okey.number;
    const num = t => t.isFakeJoker ? state.okey.number : t.number;
    const fixed = group.filter(t => !isWild(t));
    if (group.length <= 4 && fixed.every(t => num(t) === num(fixed[0]))) return group.length * num(fixed[0]);
    for (const list of [group, [...group].reverse()]) {
        let start = null, ok = true;
        list.forEach((t, p) => { if (isWild(t)) return; const s = num(t) - p; if (start === null) start = s; else if (s !== start) ok = false; });
        if (ok && start >= 1 && start + list.length - 1 <= 13) return list.length * (2 * start + list.length - 1) / 2;
    }
    return 0;
}
// Istakadaki dizilime göre en yüksek puanlı grup bölümlemesi (her satırda bitişik taşlar).
function rackArrangement() {
    let score = 0; const groups = [];
    for (let row = 0; row < 2; row++) {
        const list = slots.slice(row * ROW_WIDTH, (row + 1) * ROW_WIDTH);
        const dp = Array(ROW_WIDTH + 1).fill(0), pick = Array(ROW_WIDTH + 1).fill(-1);
        for (let i = ROW_WIDTH - 1; i >= 0; i--) {
            dp[i] = dp[i + 1];
            const group = [];
            for (let j = i; j < ROW_WIDTH && list[j]; j++) {
                group.push(list[j]);
                if (group.length >= 3) { const v = arrangedGroupScore(group); if (v && v + dp[j + 1] > dp[i]) { dp[i] = v + dp[j + 1]; pick[i] = j; } }
            }
        }
        for (let i = 0; i < ROW_WIDTH;) {
            if (pick[i] >= 0 && dp[i] !== dp[i + 1]) { groups.push(list.slice(i, pick[i] + 1)); i = pick[i] + 1; } else i++;
        }
        score += dp[0];
    }
    return { score, groups };
}
function rackScore() {
    let total = 0;
    // Adjacent, correctly grouped runs/pers count towards the displayed rack score.
    for (let row = 0; row < 2; row++) {
        const list = slots.slice(row * ROW_WIDTH, (row + 1) * ROW_WIDTH);
        const dp = Array(ROW_WIDTH + 1).fill(0);
        for (let i = ROW_WIDTH - 1; i >= 0; i--) {
            dp[i] = dp[i + 1];
            const group = [];
            for (let j = i; j < ROW_WIDTH && list[j]; j++) {
                group.push(list[j]);
                if (group.length >= 3) dp[i] = Math.max(dp[i], getScore(group) + dp[j + 1]);
            }
        }
        total += dp[0];
    }
    return total;
}
// Yardımlı masada masaya işlenebilen (işlek) taşlar Okey Plus'taki gibi kırmızı hedefle işaretlenir.
function isIslekTile(tile) {
    if (!state?.okey || (!tile.isFakeJoker && tile.color === state.okey.color && tile.number === state.okey.number)) return false;
    return (state.openedGroups || []).some((groups, owner) => state.players?.[owner]?.openType !== 'pairs' &&
        (groups || []).some(g => OkeyMelds.isValidGroup([...g, tile], state.okey)));
}
// Parça parça çizim: her bölümün girdisinden bir imza üretilir; imza aynıysa o bölümün DOM'una dokunulmaz.
// (Önceden rakibin her hamlesinde ıstaka, masa, atıklar ve skor tablosu baştan oluşturuluyordu.)
const renderSigs = new Map();
function changed(part, sig) {
    if (renderSigs.get(part) === sig) return false;
    renderSigs.set(part, sig);
    return true;
}
const idsSig = list => (list || []).map(t => t?.id || '-').join(',');
const tableSig = () => (state.openedGroups || []).map((groups, owner) => (state.players?.[owner]?.openType || '') + ':' + (groups || []).map(idsSig).join('/')).join('|');
// Aynı metni tekrar yazmak da DOM'u değiştirir (stil hesabı tetikler); yalnızca farklıysa yaz.
function setText(el, value) { if (el && el.textContent !== String(value)) el.textContent = value; }
function renderRack() {
    if (!changed('rack', [state?.roundId, idsSig(slots), idsSig(state?.tiles), selected, state?.assisted, state?.okey?.color, state?.okey?.number,
        state?.myOpenType, autoRackMode, state?.minimumPairs, [...flippedTiles].sort().join(','), state?.assisted ? tableSig() : ''].join('#'))) return;
    const top = $('playerHandTop'), bottom = $('playerHandBottom');
    top.replaceChildren(); bottom.replaceChildren();
    for (let i = 0; i < SLOTS; i++) {
        const slot = document.createElement('div');
        slot.className = 'tile-slot';
        slot.dataset.slot = i;
        if (slots[i]) {
            const tile = createTile(slots[i]);
            if (slots[i].id === selected) tile.classList.add('selected');
            if (state?.assisted && isIslekTile(slots[i])) {
                const mark = document.createElement('span'); mark.className = 'islek-mark'; mark.title = 'Bu taş masaya işlenebilir';
                tile.append(mark);
            }
            bindPointer(tile, i);
            if(tile.classList.contains('real-okey')){
                const flip=()=>{if(flippedTiles.has(slots[i].id))flippedTiles.delete(slots[i].id);else flippedTiles.add(slots[i].id);tile.classList.toggle('okey-joker', state.assisted && !flippedTiles.has(slots[i].id)); saveRack();};
                // Çift dokunuş pointerEnd'de (doubleTapTile); sağ tık / uzun basış da yüzü çevirir.
                tile.addEventListener('contextmenu',e=>{e.preventDefault();flip();});
            }
            slot.append(tile);
        }
        (i < ROW_WIDTH ? top : bottom).append(slot);
    }
    const tileCount = state?.tiles.length || 0;
    // Sade gösterim: sadece elin puanı (referanstaki gibi minimal)
    $('rackCount').textContent = '';
    // Açmadan önce: ıstakada yan yana dizdiğin seri/perlerin toplamı (Okey Plus gibi).
    // Açtıktan sonra: elde kalan taşların toplamı = el biterse yazılacak ceza (okey 101, sahte okey okeyin sayısı).
    $('rackStatus').classList.toggle('is-open', !!state?.myOpenType); // açtıktan sonra kırmızı (elde kalan)
    if (state?.myOpenType) {
        const isWild = t => !t.isFakeJoker && t.color === state.okey?.color && t.number === state.okey?.number;
        // Çift açan oyuncunun elde kalan cezası iki katı yazılır (sunucu da el sonunda böyle hesaplar).
        const pairs = state.myOpenType === 'pairs';
        const left = state.tiles.reduce((n, t) => n + (isWild(t) ? 101 : fakeBaseNumber(t)), 0) * (pairs ? 2 : 1);
        $('rackScore').textContent = String(left);
        $('rackStatus').title = pairs ? 'Elde kalan taşların toplamı × 2 (çift açtın; el biterse yazılacak ceza)' : 'Elde kalan taşların toplamı (el biterse yazılacak ceza)';
    } else if (autoRackMode === 'pairs') {
        // Çift dizili ıstakada sayaç çift sayısını gösterir.
        $('rackScore').textContent = findAvailablePairs().length + ' çift';
        $('rackStatus').title = `Elindeki çift sayısı (açmak için ${state?.minimumPairs || 5})`;
    } else {
        $('rackScore').textContent = String(rackArrangement().score);
        $('rackStatus').title = 'Istakada dizili seri/per toplamı (açmak için 101)';
    }
    $('rackScore').parentElement.title = 'El puanı: ' + $('rackScore').textContent;
    $('bottomTileCount').textContent = tileCount;
}
function renderPlayers() {
    const positions = ['bottom', 'right', 'top', 'left'];
    for (let i = 0; i < 4; i++) {
        const relative = (i - state.playerIndex + 4) % 4;
        const pos = positions[relative];
        const player = state.players[i];
        if (!player) continue;
        setText($(pos + 'PlayerName'), (player.isBot ? '🤖 ' : '') + (relative === 0 ? player.name + ' (Sen)' : player.name + (player.connected ? '' : ' ⏳')));
        const avatar = $(pos + 'PlayerAvatar');
        const playerAvatarSrc = avatarSrc(player.avatar);
        if (avatar.getAttribute('src') !== playerAvatarSrc) avatar.src = playerAvatarSrc;
        const frameWrap = avatar.closest('.avatar-wrapper');
        if (frameWrap) frameWrap.className = 'avatar-wrapper frame-' + (['gold','silver','royal','emerald','neon','rose'].includes(player.frame) ? player.frame : 'gold');
        if (avatar.style.display !== 'block') avatar.style.display = 'block';
        const info = $(pos + 'PlayerInfo');
        if (info.dataset.seat !== String(i)) info.dataset.seat = i;
        info.classList.toggle('active-turn', state.currentPlayer === i);
        if (!info.querySelector('.player-turn-clock')) {
            const clock = document.createElement('div'); clock.className='player-turn-clock';
            const fill = document.createElement('div'); fill.className='player-turn-fill';
            const seconds = document.createElement('span'); seconds.className='player-turn-seconds';
            clock.append(fill, seconds); info.append(clock);
        }
        if (pos === 'bottom') {
            setText($('gamebarName'), player.name);
            if ($('gamebarAvatar').getAttribute('src') !== playerAvatarSrc) $('gamebarAvatar').src = playerAvatarSrc;
            setText($('gamebarLevel'), 'Seviye ' + (player.level || 1));
        }
        setText($(pos + 'TileCount'), player.tileCount);
        setText(info.querySelector('.player-score'), player.hasOpened ? ((player.openType === 'pairs' ? 'Çift Açtı' : 'Açtı')) : 'Kapalı');
        // Okey Plus: açan oyuncunun panelinde 55 (çift) / 123 (seri) ikonu, yanında son aldığı hediye.
        // Okey Plus: açılış puanı minik taşlarla (141 → 1·4·1); çift açılışta çift sayısı iki taşla (5·5).
        let icon = info.querySelector('.open-score-tiles');
        if (!icon) { icon = document.createElement('span'); icon.className = 'open-score-tiles'; info.append(icon); }
        const digits = player.openType === 'pairs' ? [player.openPairs || 5, player.openPairs || 5] : player.openType ? String(player.openScore || '').split('') : [];
        if (icon.dataset.v !== digits.join('|')) {
            icon.dataset.v = digits.join('|');
            icon.replaceChildren(...digits.map(d => { const s = document.createElement('span'); s.textContent = d; return s; }));
        }
        icon.classList.toggle('hidden', !digits.length);
        const iconTitle = player.openType === 'pairs' ? `${player.openPairs} çift açtı` : player.openType ? `${player.openScore} ile seri açtı` : '';
        if (icon.title !== iconTitle) icon.title = iconTitle;
        // Bu eldeki cezalar isim panelinde kırmızı
        let pen = info.querySelector('.panel-penalty');
        if (!pen) { pen = document.createElement('span'); pen.className = 'panel-penalty'; info.append(pen); }
        setText(pen, player.roundPenalty ? String(player.roundPenalty) : '');
        const penTitle = player.roundPenalty ? `Bu eldeki ceza: ${player.roundPenalty}` : '';
        if (pen.title !== penTitle) pen.title = penTitle;
        let gift = info.querySelector('.player-gift-badge');
        if (!gift) { gift = document.createElement('span'); gift.className = 'player-gift-badge'; info.append(gift); }
        if (gift.textContent !== (lastGifts[i] || '')) gift.textContent = lastGifts[i] || '';
    }
    setText($('currentPlayerName'), state.players[state.currentPlayer]?.name || '-');
    $('turnIndicator').classList.toggle('my-turn', canPlay());
    setText($('pileCount'), state.pileCount);
    setText($('pileCountCenter'), state.pileCount);
    const selfPlayer = state.players[state.playerIndex];
    if (selfPlayer) setText($('refHudScore'), Number(playerTotalScore(state.playerIndex)).toLocaleString('tr-TR'));
    renderFancyScoreboard();
    renderOpenStatusBadges();
}
function showDiscards(container, pile, clickable) {
    if (!changed('discard:' + container, [state.roundId, idsSig(pile.slice(-8)), pile.length, clickable].join('#'))) return;
    const el = $(container);
    el.replaceChildren();
    // Display actual chronological stack; each tile offsets upwards but remains tile sized.
    const show = pile.slice(-8);
    show.forEach((tile, index) => {
        const child = miniTile(tile);
        child.classList.add('discard-stacked');
        child.style.bottom = `${index * 12}px`;
        child.style.zIndex = index + 1;
        if (clickable && index === show.length - 1) bindPointer(child, 'left');
        el.append(child);
    });
    if (!pile.length) { const p = document.createElement('span'); p.className = 'empty-pile-text'; p.textContent = 'Boş'; el.append(p); }
}
function showOpponentDiscard(pos, pile) {
    if (!changed('opp:' + pos, [state.roundId, pile[pile.length - 1]?.id || ''].join('#'))) return;
    const element=$(pos==='top' ? 'topDiscardTiles' : ('other'+pos[0].toUpperCase()+pos.slice(1)+'DiscardTiles'));element.replaceChildren();
    if (pile.length) { const tile=miniTile(pile[pile.length-1]);element.append(tile); }
    else { const empty=document.createElement('span');empty.className='opponent-empty';empty.textContent='—';element.append(empty); }
}
function processGroup(tileId, group, position = null) {
    if (!tileId) return toast('Önce işlenecek taşı seç.', true);
    if (!canPlay()) return toast('Sıranın size gelmesini bekleyin.', true);
    const targetPlayerIndex = Number(group.dataset.owner), targetGroupIndex = Number(group.dataset.group);
    const src = document.querySelector(`.cue-row .tile-sprite[data-tile-id="${CSS.escape(tileId)}"]`);
    if (src) pendingFly.place = { id: tileId, rect: src.getBoundingClientRect(), at: Date.now() };
    // Masadaki okeyin üstüne bırakılırsa sunucu okey değişimini dener.
    // position: sürükle-bırakta grubun hangi kenarına bırakıldığı; okeyin üstüne bırakılırsa okey değişimi denenir
    action('addToGroup', { tileId, targetPlayerIndex, targetGroupIndex, targetTileId: position ? null : (group.dataset.tileId || null), position: position || undefined });
}
let pairsPage = 0;
const tableSlots = new Map(); // masadaki grupların sabit satırları (el boyunca)
let tableCellsCreated = false;
function initializeTableCells() {
    if (tableCellsCreated) return;
    for (let i = 0; i < 3; i++) {
        const grid = $('pairsZoneSection' + i);
        if (!grid) continue;
        for (let n = 0; n < 4; n++) {
            const cell = document.createElement('div'); cell.className = 'pair-grid-cell';
            cell.dataset.slot = n;
            grid.append(cell);
        }
    }
    tableCellsCreated = true;
}
function renderGroups() {
    if (!changed('groups', [state.roundId, state.okey?.color, state.okey?.number, tableSig(), (state.players || []).map(p => p.name).join(',')].join('#'))) return;
    const compact = $('compactOpenGroups');
    if (compact) compact.replaceChildren();
    const normal = [], pairs = [];
    (state.openedGroups || []).forEach((groups, owner) => {
        const pairMode = state.players?.[owner]?.openType === 'pairs';
        (groups || []).forEach((tiles, groupIndex) => {
            if (pairMode) pairs.push({owner, groupIndex, tiles});
            else normal.push({owner, groupIndex, tiles});
        });
    });
    // SERİ/PER: iki 13x13 ızgara board; her grup ızgara hücrelerine oturur (tableGrid)
    const boards = [0, 1].map(i => { const b = document.createElement('div'); b.className = 'sboard'; b.dataset.board = i; compact?.append(b); return b; });
    const layout = (window.OkeyTableGrid && OkeyTableGrid.layoutByNumber) ? OkeyTableGrid.layoutByNumber(normal, tableSlots, state.okey) : { placements: [], overflow: normal };
    for (const pl of layout.placements) {
        const name = state.players[pl.group.owner]?.name || 'Oyuncu';
        // Sunucu grubu okeyin temsil ettiği yuvaya göre dizer; sıra korunur.
        const reps = groupRepresentations(pl.group.tiles);
        pl.group.tiles.forEach((tile, k) => {
            const face = createTile(tile, 'grid-table-tile', reps[k] || null);
            face.style.gridColumn = String(pl.col + k + 1);
            face.style.gridRow = String(pl.row + 1);
            face.dataset.owner = pl.group.owner;
            face.dataset.group = pl.group.groupIndex;
            face.title = `${name} · taşı işlemek için tıkla`;
            face.addEventListener('click', () => processGroup(selected, face));
            boards[pl.board].append(face);
        });
    }
    const overflow = $('seriesOverflow');
    if (overflow) {
        const n = layout.overflow ? layout.overflow.length : 0;
        overflow.textContent = n ? `+${n} grup` : '';
        overflow.classList.toggle('hidden', !n);
    }
    // ÇİFT: her çift YAN YANA 2 taş (bir satır); çiftler alt alta, sütun dolunca yanına sarar
    const pg = $('pairsGrid');
    if (pg) {
        pg.replaceChildren();
        pairs.forEach(pair => {
            const rowEl = document.createElement('div');
            rowEl.className = 'pair-row';
            rowEl.dataset.owner = pair.owner;
            rowEl.title = `${state.players[pair.owner]?.name || 'Oyuncu'} · çift`;
            // Okeyle kurulan çiftte okey, eşinin yüzüyle (altın kenar + yıldız) görünür
            const isWild = t => !t.isFakeJoker && t.color === state.okey?.color && t.number === state.okey?.number;
            const partner = pair.tiles.find(t => !isWild(t));
            const partnerFace = partner ? { color: partner.isFakeJoker ? state.okey.color : partner.color, number: partner.isFakeJoker ? state.okey.number : partner.number } : null;
            orderedGroupTiles(pair.tiles).forEach(tile => rowEl.append(createTile(tile, 'pair-mini-tile', isWild(tile) ? partnerFace : null)));
            pg.append(rowEl);
        });
    }
    if ($('pairsPager')) $('pairsPager').classList.add('hidden');
    if ($('refPairCount')) $('refPairCount').textContent = String(pairs.length);
    if (drag) drag.tableRects = null; // sürükleme sürerken masa değişti: konumlar yeniden ölçülsün
}
$('pairsPrev').addEventListener('click', () => { pairsPage = Math.max(0, pairsPage - 1); if(state)renderGroups(); });
$('pairsNext').addEventListener('click', () => { pairsPage += 1; if(state)renderGroups(); });

// kind: 'normal' (seri/per) veya 'pairs' (çift). Açmış oyuncu kendi türünde yeni grup indirebilir.
function getOpenBlockReason(kind) {
    if (!state || finished) return 'Oyun henüz başlamadı veya el tamamlandı.';
    if (kind && state.myOpenType && state.myOpenType !== kind) return state.myOpenType === 'pairs' ? 'Çift açtınız; yalnızca çift indirip açık serilere taş işleyebilirsiniz.' : 'Seri/per ile açtınız; çift indiremezsiniz.';
    if (!canPlay()) return 'Sıra size geldiğinde el açabilirsiniz.';
    if (!state.hasDrawn) return 'Önce ortadan veya soldan bir taş çekmelisiniz.';
    return '';
}
function renderActions() {
    if (!state) return;
    const block = getOpenBlockReason(), opened = state.myOpenType;
    const canTakeAction = canPlay() && !finished;
    for (const [id, kind] of [['openHandBtn', 'normal'], ['openPairsBtn', 'pairs']]) {
        const blocked = !!getOpenBlockReason(kind);
        $(id).disabled = false;
        $(id).classList.toggle('action-unavailable', blocked);
        $(id).setAttribute('aria-disabled', String(blocked));
    }
    $('openCentralBtn').disabled = !!getOpenBlockReason('normal');
    // Okey Plus'taki gibi işlem düğmeleri yalnızca o an yapılabiliyorsa görünür.
    const ready = canTakeAction && state.hasDrawn;
    let canSeries = false, canPairs = false;
    if (ready && !getOpenBlockReason('normal')) {
        const required = state.mustOpenThisTurn ? state.drawnFromDiscardTileId : null;
        const best = memoizedOpenMelds(required);
        canSeries = opened === 'normal' ? best.groups.length > 0 || (!!required && memoizedOpenMelds(null).groups.length > 0) : best.score >= (state.stackingMode ? state.minimumOpenScore : 101);
    }
    if (ready && !getOpenBlockReason('pairs')) {
        const pairCount = findAvailablePairs().length;
        canPairs = opened === 'pairs' ? pairCount > 0 && state.tiles.length > 2 : pairCount >= (state.minimumPairs || 5);
    }
    const canProcess = ready && state.assisted && !!opened && state.tiles.length > 1 && state.tiles.some(isIslekTile);
    // Okey Plus: sıra sendeyken işlem düğmeleri ve üstte süre çubuğu çıkar, rakip panelleri gizlenir.
    // Sıranda yapılamayan işlem soluk durur; tıklayınca nedeni söylenir.
    document.body.classList.toggle('my-turn', canTakeAction);
    $('turnTimerBar').classList.toggle('hidden', !canTakeAction);
    const showWhen = (id, usable) => {
        if (canTakeAction) $(id).style.removeProperty('display'); else $(id).style.setProperty('display', 'none', 'important');
        $(id).classList.toggle('is-unavailable', !usable);
        $(id).disabled = false;
    };
    showWhen('openHandBtn', canSeries);
    showWhen('openPairsBtn', canPairs);
    showWhen('undoDiscardBtn', !!state.canRetract);
    showWhen('finishBtn', canProcess);
    if (!state.assisted) $('finishBtn').style.setProperty('display', 'none', 'important'); // Yardımsız masada Hızlı İşle yok
    $('undoDiscardBtn').classList.remove('hidden');
    $('finishBtn').classList.remove('hidden');
    // Yandan alınan taş: sol köşede "GERİ BIRAK" kartı
    const taken = canTakeAction && state.mustOpenThisTurn ? state.tiles.find(t => t.id === state.drawnFromDiscardTileId) : null;
    $('returnTakenBtn').classList.toggle('hidden', !taken);
    if (taken) $('returnTakenBtn').querySelector('.rt-tile').replaceChildren(createTile(taken, 'table-tile'));
    $('turnActions').classList.remove('hidden');
    $('myLeftDiscard').classList.toggle('can-draw', canPlay() && !state?.hasDrawn && !state?.leftLocked);
    $('myLeftDiscard').classList.toggle('is-locked', canPlay() && !state?.hasDrawn && !!state?.leftLocked);
    $('drawPile').classList.toggle('can-draw', canPlay() && !state?.hasDrawn);
    $('actionStateDot').classList.toggle('ready', canPlay());
    const help = [];
    if (!canPlay()) help.push('Sıra sende değil.');
    else if (!state.hasDrawn) help.push('Taş çek ve istediğin yuvaya sürükle.');
    else if (!opened) help.push('Önce seri/çift açabilir veya taş atabilirsin.');
    else help.push('Açık serilere taş işle veya bitiş taşıyla bitir.');
    $('actionHelp').textContent = help.join(' ');
    $('actionHelp').style.display = 'none';
}

function render() {
    if (!state) return;
    updateIndicator();
    renderPlayers();
    renderRack();
    renderActions();
    const prev = (state.playerIndex + 3) % 4;
    showDiscards('leftDiscardTiles', state.discards[prev] || [], true);
    showDiscards('rightDiscardTiles', state.discards[state.playerIndex] || [], false);
    for (const [pos, seat] of [['top',(state.playerIndex+2)%4],['left',(state.playerIndex+3)%4],['right',(state.playerIndex+1)%4]]) {
        showOpponentDiscard(pos, state.discards[seat] || []);
    }
    renderGroups();
    updateTurnClock();
    runPendingFlights();
}
// The pile is handled by pointer events for both mouse and touch.
$('leftDiscardTiles').addEventListener('click', e => { if (e.target === e.currentTarget) draw(true); });
$('myRightDiscard').addEventListener('click', () => discard(selected));
// Çift açma, butona basınca önce doğrulanabilir bir önizleme açar.
function findAvailablePairs(tiles = state?.tiles) {
    if (!tiles || !state?.okey) return [];
    const isWild = t => !t.isFakeJoker && t.color === state.okey.color && t.number === state.okey.number;
    const bucket = new Map();
    for (const tile of tiles) {
        if (isWild(tile)) continue;
        const key = fakeBaseColor(tile) + ':' + fakeBaseNumber(tile);
        if (!bucket.has(key)) bucket.set(key, []);
        bucket.get(key).push(tile);
    }
    const pairs = [], singles = [];
    for (const list of bucket.values()) {
        for (let i = 0; i + 1 < list.length; i += 2) pairs.push(list.slice(i, i + 2));
        if (list.length % 2) singles.push(list[list.length - 1]);
    }
    // Sunucu kuralıyla aynı: okey eşi olmayan bir taşın yanına konunca çift olur (önce yüksek taş), artan iki okey de çift.
    const okeys = tiles.filter(isWild);
    singles.sort((a, b) => fakeBaseNumber(b) - fakeBaseNumber(a));
    while (okeys.length && singles.length) pairs.push([singles.shift(), okeys.shift()]);
    while (okeys.length >= 2) pairs.push([okeys.shift(), okeys.shift()]);
    return pairs;
}function showPairsModal() {
    const block = getOpenBlockReason('pairs');
    if (block) return toast(block, true);
    // Çift açmış oyuncu: yeni çiftleri doğrudan indir (sunucu elde 1 taş bırakır).
    if (state.myOpenType === 'pairs') {
        if (!findAvailablePairs().length) return toast('İndirilecek yeni çiftiniz yok.', true);
        return action('openWithPairs');
    }
    const pairs = findAvailablePairs();
    const needPairs = state.minimumPairs || 5;
    $('pairsCountText').textContent = `Bulunan çift: ${pairs.length} / ${needPairs} ${pairs.length >= needPairs ? '✅ Açmaya hazır!' : `· En az ${needPairs} çift gerekli.`}`;
    const preview = $('pairPreview'); preview.replaceChildren();
    pairs.forEach((pair, i) => {
        const group = document.createElement('div'); group.className = 'pair-preview-group';
        if (i < needPairs) group.classList.add('pair-counted');
        pair.forEach(tile => group.append(miniTile(tile)));
        preview.append(group);
    });
    if (!pairs.length) {
        const label = document.createElement('p'); label.className = 'pair-empty';
        label.textContent = 'Henüz aynı renk ve aynı sayıdan bir çiftiniz yok.';
        preview.append(label);
    }
    $('confirmPairsBtn').disabled = pairs.length < needPairs;
    $('confirmPairsBtn').textContent = `✅ ${Math.max(needPairs, pairs.length)} ÇİFTİ AÇ`;
    $('openPairsModal').classList.remove('hidden');
}
$('openPairsBtn').addEventListener('click', showPairsModal);
$('cancelPairsBtn').addEventListener('click', () => $('openPairsModal').classList.add('hidden'));
$('confirmPairsBtn').addEventListener('click', () => {
    if ($('confirmPairsBtn').disabled) return;
    const block = getOpenBlockReason('pairs');
    if (block) return toast(block, true);
    $('openPairsModal').classList.add('hidden');
    action('openWithPairs');
});
// GERİ TOPLA: bu tur masaya indirilenleri geri al (açılış geri alınırsa 101 ceza).
$('undoDiscardBtn').addEventListener('click', () => {
    if (!canPlay()) return toast('Sıra sizde değil.', true);
    if (!state.canRetract) return toast('Bu tur masaya indirdiğiniz taş yok.', true);
    if (state.retractPenalty && !window.confirm('Bu tur açtığınız eli geri toplarsanız 101 ceza yazılır. Devam edilsin mi?')) return;
    action('retractTurn');
});
// GERİ BIRAK: yandan alınan taşı sol oyuncunun atık yerine geri koy (Okey Plus'taki köşe kartı).
$('returnTakenBtn').addEventListener('click', () => action('undoDiscardDraw'));
// TAŞLARI İŞLE: işlek taşların hepsini masaya işler (bitiş, son taşı atınca olur).
$('finishBtn').addEventListener('click', () => {
    if (!canPlay() || !state.hasDrawn) return toast('Sıranızda ve taş çektikten sonra işleyebilirsiniz.', true);
    if (!state.myOpenType) return toast('Taş işlemek için önce el açmalısınız.', true);
    action('processAll');
});
// Sunucunun puan kurallarıyla aynı per hesaplaması; artan sayılı serileri her zaman sırayla dizer.
const orderColors = ['Kirmizi','Yesil','Mavi','Siyah','Sahte'];
const naturalNumber = t => fakeBaseNumber(t);
const naturalColor = t => fakeBaseColor(t);
const displayColorOrder = ['Kirmizi','Sari','Yesil','Mavi','Siyah','Sahte'];
function tileDisplayNumber(t){ return fakeBaseNumber(t); }
function tileDisplayColor(t){ return fakeBaseColor(t); }
function orderedGroupTiles(tiles){
    const list = [...(tiles || [])];
    if (list.length < 2) return list;
    const naturals = list.filter(t => !t.isFakeJoker);
    const sameNumber = naturals.length && naturals.every(t => tileDisplayNumber(t) === tileDisplayNumber(naturals[0]));
    if (sameNumber) {
        return list.sort((a,b) => displayColorOrder.indexOf(tileDisplayColor(a)) - displayColorOrder.indexOf(tileDisplayColor(b)) || tileDisplayNumber(a) - tileDisplayNumber(b));
    }
    return list.sort((a,b) => tileDisplayNumber(a) - tileDisplayNumber(b) || displayColorOrder.indexOf(tileDisplayColor(a)) - displayColorOrder.indexOf(tileDisplayColor(b)));
}

// Istakayı simetrik diz: gruplar iki rafa taş sayısı dengeli dağıtılır, aralarında birer boşluk kalır,
// her raf soldan başlar. Grupsuz taşlar kısa kalan rafa eklenir.
function compactGroups(groups,rest,render=true){
    const blocks=[...groups.map(g=>[...g])];
    const rows=[[],[]], used=[0,0];
    const cost=(r,b)=>used[r]+(rows[r].length?1:0)+b.length;
    // Grupsuz taşlar: her seferinde kısa kalan rafa, o rafta bitişik dursun (önlerinde bir boşluk)
    const placeRest=()=>{
        // Sıralı grupsuz taşları iki parçaya böl: ilk parça kısa rafa, kalan öbür rafa (sıra bozulmaz, raflar dengelenir)
        const a=used[0]<=used[1]?0:1, b=1-a, n=rest.length;
        const gapA=rows[a].length?1:0, gapB=rows[b].length?1:0;
        let k=Math.ceil((used[b]+gapB-used[a]-gapA+n)/2);
        k=Math.max(0,Math.min(n,k,ROW_WIDTH-used[a]-gapA));
        const put=(r,list,gap)=>{ if(!list.length)return; if(gap&&used[r]+1+list.length<=ROW_WIDTH){rows[r].push(null);used[r]++;} for(const t of list){rows[r].push(t);used[r]++;} };
        put(a,rest.slice(0,k),gapA); put(b,rest.slice(k),gapB);
    };
    for(const b of blocks){
        const order=used[0]<=used[1]?[0,1]:[1,0];
        let r=order.find(k=>cost(k,b)<=ROW_WIDTH);
        if(r===undefined)r=order.find(k=>used[k]+b.length<=ROW_WIDTH);
        if(r===undefined)r=order[0];
        if(rows[r].length&&used[r]+1+b.length<=ROW_WIDTH){rows[r].push(null);used[r]++;}
        for(const t of b){rows[r].push(t);used[r]++;}
    }
    placeRest();
    const result=Array(SLOTS).fill(null), overflow=[];
    rows.forEach((items,r)=>{
        // Sığmayan taşlar varsa önce boşlukları at
        let list=items; if(list.length>ROW_WIDTH)list=list.filter(Boolean);
        list.slice(ROW_WIDTH).forEach(t=>t&&overflow.push(t));
        list=list.slice(0,ROW_WIDTH);
        const start=0; // Okey Plus gibi: taşlar rafın solundan başlar
        list.forEach((t,k)=>{result[r*ROW_WIDTH+start+k]=t;});
    });
    overflow.forEach(t=>{const f=result.findIndex(x=>!x);if(f>=0)result[f]=t;});
    slots=result;
    saveRack();if(render)renderRack();
}
// Yeni gelen taş için yer: taşı az olan rafta son taşın hemen sağı (yoksa solu), dizilim bozulmaz.
function preferredFreeSlot(){
    const rowCount=r=>slots.slice(r*ROW_WIDTH,(r+1)*ROW_WIDTH).filter(Boolean).length;
    const order=rowCount(0)<=rowCount(1)?[0,1]:[1,0];
    for(const r of order){
        const base=r*ROW_WIDTH, row=slots.slice(base,base+ROW_WIDTH);
        let last=-1; row.forEach((t,i)=>{if(t)last=i;});
        for(let i=last+1;i<ROW_WIDTH;i++)if(!row[i])return base+i;
        const first=row.findIndex(Boolean);
        for(let i=(first<0?ROW_WIDTH:first)-1;i>=0;i--)if(!row[i])return base+i;
    }
    return slots.findIndex(t=>!t);
}
function arrangeRack(mode='series',render=true){
    if(!state?.okey)return;
    const hand=slots.filter(Boolean),used=new Set(),groups=[];
    if(mode==='pairs'){
        for(const pair of findAvailablePairs(hand)){groups.push(pair);pair.forEach(t=>used.add(t.id));}
        groups.sort((a,b)=>naturalNumber(a[0])-naturalNumber(b[0]));
    }else{
        const result=melds(hand);
        groups.push(...result.groups);
        groups.sort((a,b)=>Math.min(...a.map(naturalNumber))-Math.min(...b.map(naturalNumber)));
        groups.forEach(g=>g.forEach(t=>used.add(t.id)));
    }
    const rest=hand.filter(t=>!used.has(t.id)).sort((a,b)=>naturalNumber(a)-naturalNumber(b)||orderColors.indexOf(naturalColor(a))-orderColors.indexOf(naturalColor(b)));
    compactGroups(groups,rest,render);
}
// SERİ DİZ / ÇİFT DİZ her masada çalışır (yalnızca ıstaka düzeni); sonuç kısa bildirimle söylenir.
$('sortPairsBtn').addEventListener('click',()=>{
    if(!state)return toast('Oyun başlayınca dizebilirsin.',true);
    if(!state.assisted)return toast('Yardımsız masada taşları kendin dizersin.',true);
    autoRack=!!state.assisted;autoRackMode='pairs';arrangeRack('pairs');
    const n=findAvailablePairs().length;
    toast(n?`${n} çift yan yana dizildi${state.myOpenType?'':` (açmak için ${state.minimumPairs||5} çift gerekir)`}.`:'Elinde çift yok.');
});
$('sortSeriesBtn').addEventListener('click',()=>{
    if(!state)return toast('Oyun başlayınca dizebilirsin.',true);
    if(!state.assisted)return toast('Yardımsız masada taşları kendin dizersin.',true);
    autoRack=!!state.assisted;autoRackMode='series';arrangeRack('series');
    const r=rackArrangement();
    toast(r.groups.length?`${r.groups.length} seri/per dizildi: ${r.score} puan.`:'Elinde seri veya per yok.');
});
// Open-hand modal: explicit tile ownership and group selection. Scores are advisory; server computes the real result.
const modal = $('openHandModal');
function closeOpen() { modal.classList.add('hidden'); opening = { selected: new Set(), groups: [] }; }
$('openCentralBtn').addEventListener('click', () => $('openHandBtn').click());
$('openHandBtn').addEventListener('click', () => {
    const block = getOpenBlockReason('normal');
    if (block) return toast(block, true);
    const need=state.stackingMode?state.minimumOpenScore:101;
    const required=state.mustOpenThisTurn ? state.drawnFromDiscardTileId : null;
    // Önce oyuncunun ıstakada dizdiği gruplar açılır (Okey Plus gibi); yetmezse en iyi dizilim.
    const arranged=rackArrangement();
    const arrangedIds=new Set(arranged.groups.flat().map(t=>t.id));
    const arrangedOk=arranged.groups.length&&arrangedIds.size<state.tiles.length&&(!required||arrangedIds.has(required))&&
        (state.myOpenType==='normal'||arranged.score>=need);
    if(arrangedOk) return action('openHand',{groups:arranged.groups.map(g=>g.map(t=>t.id))});
    // Elde atılacak en az bir taş bırakılır (bitiş taşı).
    let best=melds(state.tiles,required,true);
    if(state.myOpenType==='normal'){
        if(!best.groups.length&&required)best=melds(state.tiles,null,true);
        if(!best.groups.length)return toast('Elinizde masaya indirilecek yeni seri/per yok.',true);
    }else if(best.score<need)return toast(`Geçerli per toplamın ${best.score}. Açmak için en az ${need} puan gerekli.`,true);
    const groups=best.groups.map(g=>g.map(t=>t.id));
    action('openHand', { groups });

});
$('cancelOpenBtn').addEventListener('click', closeOpen);
function renderOpening() {
    const list = $('openHandTiles'); list.replaceChildren();
    const used = new Set(opening.groups.flat());
    state.tiles.forEach(tile => {
        const element = miniTile(tile);
        element.classList.add('open-choice');
        element.classList.toggle('selected-for-group', opening.selected.has(tile.id));
        element.classList.toggle('in-group', used.has(tile.id));
        element.addEventListener('click', () => {
            if (used.has(tile.id)) return;
            if (opening.selected.has(tile.id)) opening.selected.delete(tile.id);
            else opening.selected.add(tile.id);
            renderOpening();
        });
        list.append(element);
    });
    const selectedTiles = [...opening.selected].map(id => state.tiles.find(t => t.id === id)).filter(Boolean);
    $('addGroupBtn').disabled = getScore(selectedTiles) <= 0;
    const groups = $('selectedGroupsDisplay'); groups.replaceChildren();
    let total = 0;
    opening.groups.forEach((ids, i) => {
        const tiles = ids.map(id => state.tiles.find(t => t.id === id)).filter(Boolean);
        total += getScore(tiles);
        const group = document.createElement('div'); group.className = 'selected-group';
        tiles.forEach(t => group.append(miniTile(t)));
        const badge = document.createElement('span'); badge.textContent = `${getScore(tiles)}p`; group.append(badge);
        const remove = document.createElement('button'); remove.textContent = '×'; remove.className = 'remove-group';
        remove.addEventListener('click', () => { opening.groups.splice(i, 1); renderOpening(); });
        group.append(remove); groups.append(group);
    });
    const need = state.stackingMode ? state.minimumOpenScore : 101;
    $('selectedScore').textContent = total;
    $('scoreProgress').style.width = Math.min(100, total / need * 100) + '%';
    $('confirmOpenBtn').disabled = total < need;
    document.querySelector('.open-hand-score').firstChild.textContent = `Seçilen Puan: `;
}
$('addGroupBtn').addEventListener('click', () => {
    const ids = [...opening.selected];
    const tiles = ids.map(id => state.tiles.find(t => t.id === id));
    if (getScore(tiles) <= 0) return;
    opening.groups.push(ids); opening.selected.clear(); renderOpening();
});
$('confirmOpenBtn').addEventListener('click', () => {
    const groups = opening.groups;
    if (!groups.length) return;
    action('openHand', { groups }); closeOpen();
});
// Oda sohbeti: metin yalnızca aynı odadaki oyunculara Socket.IO üzerinden gider.
let unreadChat=0;
const chatPanel=$('tableChatPanel'),messages=$('tableChatMessages');
$('toggleTableChat').addEventListener('click', toggleTableChatPanel);
$('closeTableChat')?.addEventListener('click', toggleTableChatPanel);
function addChatMessage(data){
    const el=document.createElement('div');el.className='chat-entry';
    const name=document.createElement('strong');name.textContent=data.from+': ';
    const message=document.createElement('span');message.textContent=data.message;
    el.append(name,message);messages.append(el);
    while(messages.children.length>65)messages.firstElementChild.remove();
    messages.scrollTop=messages.scrollHeight;
    if(chatPanel.classList.contains('collapsed')){$('chatUnread').textContent=String(++unreadChat);$('chatUnread').classList.remove('hidden');}
}

function toggleTableChatPanel() {
    chatPanel.classList.toggle('collapsed');
    const open = !chatPanel.classList.contains('collapsed');
    $('toggleTableChat').setAttribute('aria-expanded', String(open));
    if (open) {
        unreadChat = 0;
        $('chatUnread').classList.add('hidden');
        $('tableChatInput').focus();
        messages.scrollTop = messages.scrollHeight;
    }
}
function syncQuickMenuState() {
    const soundBtn = $('menuToggleSound');
    if (soundBtn) { soundBtn.querySelector('.qm-label').textContent = soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'; soundBtn.classList.toggle('is-muted', !soundEnabled); }
}
function setMenuOpen(open) {
    const panel = $('quickMenuPanel');
    const trigger = $('gamebarLeaveBtn');
    if (!panel || !trigger) return;
    panel.classList.toggle('hidden', !open);
    trigger.setAttribute('aria-expanded', String(open));
}
$('gamebarLeaveBtn').addEventListener('click', e => {
    e.stopPropagation();
    setMenuOpen($('quickMenuPanel').classList.contains('hidden'));
});
document.addEventListener('click', e => {
    const panel = $('quickMenuPanel');
    if (panel?.classList.contains('hidden')) return;
    if (panel.contains(e.target) || $('gamebarLeaveBtn')?.contains(e.target)) return;
    setMenuOpen(false);
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        setMenuOpen(false);
        $('rulesModal')?.classList.add('hidden');
    }
});
$('menuToggleScore')?.addEventListener('click', () => { toggleScorePanel(); setMenuOpen(false); });
$('menuToggleSound')?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem(soundPrefKey, soundEnabled ? '1' : '0');
    syncQuickMenuState();
    toast(soundEnabled ? 'Masa sesi açıldı.' : 'Masa sesi kapatıldı.');
});
$('menuLeaveTable')?.addEventListener('click', () => { setMenuOpen(false); leave(); });
$('menuShowRules')?.addEventListener('click', () => { $('rulesModal')?.classList.remove('hidden'); setMenuOpen(false); });
$('closeRulesModal')?.addEventListener('click', () => $('rulesModal')?.classList.add('hidden'));
$('rulesModal')?.addEventListener('click', e => { if (e.target === $('rulesModal')) $('rulesModal').classList.add('hidden'); });
// Audio settings drive a real short UI feedback tone. No sound is played while muted.
let uiAudioContext = null;
function uiClickSound() {
    if (!soundEnabled) return;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    try {
        if (!uiAudioContext) uiAudioContext = new AudioCtor();
        const ctx = uiAudioContext;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const tone = ctx.createOscillator(), gain = ctx.createGain();
        tone.type = 'sine';
        tone.frequency.setValueAtTime(540, ctx.currentTime);
        tone.frequency.exponentialRampToValueAtTime(370, ctx.currentTime + 0.045);
        gain.gain.setValueAtTime(0.023, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
        tone.connect(gain).connect(ctx.destination);
        tone.start(ctx.currentTime);
        tone.stop(ctx.currentTime + 0.075);
    } catch (_) { /* Browser audio permission may be disabled. */ }
}
document.addEventListener('click', e => {
    const target = e.target.closest('button');
    if (target && !target.disabled) uiClickSound();
});
syncQuickMenuState();

const scoreboardPanel = $('scoreboard');
if (scoreboardPanel) scoreboardPanel.classList.add('hidden');
$('scoreboardClose')?.addEventListener('click', () => scoreboardPanel?.classList.add('hidden'));
function toggleScorePanel(){
    if (!scoreboardPanel) return;
    scoreboardPanel.classList.toggle('hidden');
    $('toggleScoreBtn')?.classList.toggle('is-active', !scoreboardPanel.classList.contains('hidden'));
    $('toggleScoreTop')?.classList.toggle('is-active', !scoreboardPanel.classList.contains('hidden'));
}
$('toggleScoreBtn')?.addEventListener('click', toggleScorePanel);
$('toggleScoreTop')?.addEventListener('click', toggleScorePanel);
// Görünür sayaç: gerçek oturum başlangıcından geçen süre; bakiyeyi taklit etmez.
const sessionStartedAt = Date.now();
setInterval(() => {
    const seconds = Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000));
    const pad = n => String(n).padStart(2, '0');
    if ($('refHudClock')) $('refHudClock').textContent = `${pad(Math.floor(seconds/3600))}:${pad(Math.floor(seconds/60)%60)}:${pad(seconds%60)}`;
}, 1000);

socket.on('tableChatMessage',d=>{addChatMessage(d);showChatBubble(d);});
// Okey Plus: mesaj gönderenin panelinin yanında konuşma balonu olarak da görünür.
function showChatBubble(d){
    if(!state||d.from==='Sistem')return;
    const seat=state.players.findIndex(p=>p.name===d.from);
    if(seat<0)return;
    const host=$(seatToRelativePos(seat)+'PlayerInfo');
    if(!host)return;
    host.querySelector('.chat-bubble')?.remove();
    const b=document.createElement('div');b.className='chat-bubble';b.textContent=d.message.length>40?d.message.slice(0,39)+'…':d.message;
    host.append(b);setTimeout(()=>b.remove(),4500);
}
// Hazır cümleler
document.querySelectorAll('#quickPhrases button').forEach(b=>b.addEventListener('click',()=>action('tableChatSend',{message:b.textContent})));
socket.on('chatHistory',data=>{messages.replaceChildren();unreadChat=0;$('chatUnread').classList.add('hidden');data.forEach(addChatMessage);unreadChat=0;$('chatUnread').classList.add('hidden');});
$('tableChatForm').addEventListener('submit',e=>{
    e.preventDefault();const input=$('tableChatInput'),msg=input.value.trim();
    if(!msg)return;action('tableChatSend',{message:msg});input.value='';
});
// Attach draw gestures to actual deck area, not only to small graphic.
bindPointer($('drawPile'), 'pile');
// Istakada uzun basış tarayıcı menüsü açmasın (okeyde yüzü çevirme kendi contextmenu dinleyicisinde).
for (const id of ['playerHandTop', 'playerHandBottom']) $(id).addEventListener('contextmenu', e => e.preventDefault());
// Initial lobby until the server returns a snapshot.
if (!socketAvailable) {
    showLobbyProblem('Socket.IO dosyası yüklenemedi. Oyunu doğrudan HTML dosyasından açmayın; npm start ile Node.js sunucusunu çalıştırın.');
} else if (session?.roomCode) {
    showLobby({ code: session.roomCode, players: [], teamMode: false });
    setTimeout(() => { if (!state && !finished && !socket.connected) showLobbyProblem('Sunucuya bağlanılamadı. Masa için uygulama sunucusunun çalışması gerekiyor.'); }, 6000);
} else {
    showLobbyProblem('Geçerli masa oturumu yok. Ana sayfadan yeni bir masa oluşturun.');
}

// PRO: atılan taş kutularını transform'suz bir katmana taşı (4 köşe yerleşimi için)
(function relocateDiscards(){
    const board = document.getElementById('gameBoard');
    if (!board) return;
    let layer = document.getElementById('discardLayer');
    if (!layer) { layer = document.createElement('div'); layer.id = 'discardLayer'; board.appendChild(layer); }
    ['topDiscard','rightDiscard','myLeftDiscard','myRightDiscard','leftDiscard'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.parentElement !== layer) layer.appendChild(el);
    });
    // DİZ butonlarını da transform'suz konteynere taşı (fixed konum doğru çalışsın)
    const gc = document.getElementById('gameContainer');
    ['sortSeriesBtn','sortPairsBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el && gc && el.parentElement !== gc) gc.appendChild(el);
    });
    // Rack açma puanı artık oyuncu toplam skorunun kopyası değildir;
    // SERİ DİZ kontrolünün hemen yanında kendi küçük göstergesidir.
    // Skor paneli masa katmanlarının üstünde açılsın (ui-layer masanın altında kalıyordu).
    const scorePanel = document.getElementById('scoreboard');
    if (scorePanel && gc && scorePanel.parentElement !== gc) gc.appendChild(scorePanel);
    const rackStatus = document.getElementById('rackStatus');
    if (rackStatus && gc && rackStatus.parentElement !== gc) gc.appendChild(rackStatus);
})();

// PRO: Oyuncu profili popup'ı (profile tıkla → seviye/taş/durum + hediye gönder)
(function profilePopupSetup(){
    let profileTarget = null;
    const pop = document.getElementById('profilePopup');
    if (!pop) return;
    function openProfile(seat){
        if (!state || !state.players) return;
        const pl = state.players[seat]; if (!pl) return;
        profileTarget = seat;
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        set('profilePopupName', pl.name || 'Oyuncu');
        set('profileLevel', 'Lv.' + (pl.level || 1));
        set('profileTiles', (pl.tileCount != null ? pl.tileCount : '-'));
        set('profileState', pl.hasOpened ? 'Açtı' : 'Kapalı');
        const img = document.getElementById('profilePopupAvatar');
        if (img && typeof avatarSrc === 'function') img.src = avatarSrc(pl.avatar);
        // Kendi profiline hediye gönderilemez (sunucu reddediyordu); düğmeler gizlenir.
        document.getElementById('profileGiftIcons')?.classList.toggle('hidden', seat === state.playerIndex);
        pop.classList.remove('hidden');
    }
    const closeBtn = document.getElementById('profileClose');
    if (closeBtn) closeBtn.addEventListener('click', () => pop.classList.add('hidden'));
    pop.addEventListener('click', e => { if (e.target === pop) pop.classList.add('hidden'); });
    fillGiftGrid(document.getElementById('profileGiftIcons'), g => {
        if (profileTarget == null) return;
        if (tomatoesLeft <= 0) return toast('Bu eldeki hediye hakkın bitti.', true);
        action('sendGift', { target: profileTarget, kind: g.id });
        pop.classList.add('hidden');
        // Sunucudan onay geldiğinde giftSent bildirimi görünür ve sesli okunur.
    });
    // Profillere tıklama: pos → seat
    ['top','left','right','bottom'].forEach(pos => {
        const el = document.getElementById(pos + 'PlayerInfo');
        if (!el) return;
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
            if (!state) return;
            const offset = { bottom:0, right:1, top:2, left:3 }[pos];
            const seat = (state.playerIndex + offset + 4) % 4;
            openProfile(seat);
        });
    });
})();
