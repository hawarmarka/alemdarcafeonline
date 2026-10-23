'use strict';
// Batak masası (istemci). Sunucu her değişiklikte 'batak:state' ile bu oyuncunun görüntüsünü yollar; burada yalnızca çizilir.
// Kural denetimi sunucudadır; istemci oynanabilir kartları (state.legal) öne çıkarır.
const socket = typeof io === 'function' ? io() : { on() {}, emit() {}, connected: false };
const $ = id => document.getElementById(id);
const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' }, SUIT_NAME = { S: 'Maça', H: 'Kupa', D: 'Karo', C: 'Sinek' };
const RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const TYPE_NAME = { ihaleli: 'İHALELİ', kozmaca: 'KOZ MAÇA', esli: 'EŞLİ' };
const POS = ['bottom', 'right', 'top', 'left']; // koltuk farkı → ekrandaki yer (saatin tersi: sıradaki sağda)
const isRed = s => s === 'H' || s === 'D';
let session = null;
try { session = JSON.parse(sessionStorage.getItem('batakSession') || 'null'); } catch (_) {}
if (!session?.code || !session?.token) location.replace('/');
let state = null, lastSig = '', sent = false;
const avatarSrc = a => /^\/api\/avatar\/[\w-]{22}$/.test(a || '') ? a : /^av(0[1-9]|10)\.svg$/.test(a || '') ? '/asset/avatars/' + a : '/asset/avatar-default.svg';
document.addEventListener('error', e => { if (e.target.tagName === 'IMG' && !e.target.src.endsWith('avatar-default.svg')) e.target.src = '/asset/avatar-default.svg'; }, true);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
function toast(msg) { const t = $('bkToast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3500); }
const posOf = seat => POS[(seat - state.me + 4) % 4];
function cardEl(c, extra = '') {
  const d = el('div', `card ${isRed(c.suit) ? 'red' : ''} ${state?.trump === c.suit ? 'trump' : ''} ${extra}`);
  d.dataset.id = c.id; d.title = `${SUIT_NAME[c.suit]} ${RANK[c.rank] || c.rank}`;
  const r = el('span', 'cr', RANK[c.rank] || String(c.rank)); r.append(el('small', null, SUIT[c.suit]));
  d.append(r, el('span', 'cs', SUIT[c.suit]));
  return d;
}

// ---------- Bağlantı ----------
socket.on('connect', () => socket.emit('batak:rejoin', { code: session.code, token: session.token }));
socket.on('batak:state', s => { state = s; sent = false; render(); });
socket.on('batak:error', d => { sent = false; toast(d.message || 'İşlem yapılamadı.'); if (/bulunamadı|kapandı/.test(d.message || '')) setTimeout(() => goLobby(), 2500); });
socket.on('batak:replaced', () => { toast('Masa başka bir sekmede açıldı.'); });
socket.on('batak:left', () => goLobby());
function goLobby() { sessionStorage.removeItem('batakSession'); location.assign('/'); }
const send = (event, data) => { if (sent) return; sent = true; socket.emit(event, data); setTimeout(() => { sent = false; }, 3000); };

// ---------- Çizim ----------
function render() {
  const s = state;
  $('bkType').textContent = TYPE_NAME[s.type] || s.type;
  $('bkRound').textContent = s.phase === 'waiting' ? `${s.roundLimit} el` : `El ${s.round} / ${s.roundLimit}`;
  const trump = $('bkTrump'); trump.classList.toggle('red', !!s.trump && isRed(s.trump));
  $('bkTrumpSuit').textContent = s.trump ? SUIT[s.trump] : '?';
  trump.title = s.trump ? `Koz: ${SUIT_NAME[s.trump]}${s.trumpBroken ? '' : ' (henüz oynanmadı)'}` : 'Koz henüz seçilmedi';
  $('bkContract').textContent = s.contract ? `İhale: ${s.players[s.contract.seat].name} · ${s.contract.bid} el${s.contract.forced ? ' (zorunlu)' : ''}` : (s.declare && s.phase === 'playing' ? 'Herkes söylediği kadar el almaya çalışıyor' : '');
  renderSeats(); renderTrick(); renderHand(); renderPanels(); renderWait(); renderDummy();
  const notice = $('bkNotice'); notice.textContent = s.notice || ''; notice.classList.toggle('hidden', !s.notice);
  if (s.phase === 'roundEnd' || s.phase === 'matchEnd') showScores(true); else if (lastResultShown && s.phase !== 'trickEnd') { closeScores(); lastResultShown = false; }
}
function renderSeats() {
  const s = state;
  for (let seat = 0; seat < 4; seat++) {
    const box = $({ bottom: 'seatBottom', top: 'seatTop', left: 'seatLeft', right: 'seatRight' }[posOf(seat)]);
    const p = s.players[seat]; box.replaceChildren(); box.classList.toggle('turn', s.turn === seat && ['bidding', 'trump', 'playing'].includes(s.phase));
    if (!p) { box.append(el('div', 'bk-plate', 'Boş koltuk')); continue; }
    const av = el('div', 'bk-avatar'); const img = el('img'); img.src = avatarSrc(p.avatar); img.alt = ''; av.append(img);
    if (s.turn === seat && ['bidding', 'trump', 'playing'].includes(s.phase)) { const ring = el('div', 'bk-ring'); av.append(ring); runRing(ring); }
    if (s.dealer === seat && s.phase !== 'waiting') av.append(el('span', 'bk-dealer', 'D'));
    const plate = el('div', 'bk-plate');
    plate.append(el('b', null, (seat === s.me ? 'SEN · ' : '') + (p.isBot ? '🤖 ' : '') + p.name + (p.connected ? '' : ' ⏳')));
    const stats = el('div', 'bk-stats');
    if (s.contract?.seat === seat) stats.append(el('span', 'bk-chip contract', `İHALE ${s.contract.bid}`));
    else if (p.passed) stats.append(el('span', 'bk-chip pass', 'PAS'));
    else if (p.bid != null) stats.append(el('span', 'bk-chip bid', s.declare ? (p.bid === 0 ? 'EL ALMAZ' : `SÖZ ${p.bid}`) : `${p.bid}`));
    if (s.phase !== 'waiting' && s.phase !== 'bidding') stats.append(el('span', 'bk-chip won', `EL ${p.tricks}`));
    stats.append(el('span', 'bk-chip', `${p.total} P`));
    plate.append(stats);
    box.append(av, plate);
    if (seat !== s.me && p.cards) { const backs = el('div', 'bk-backs'); for (let i = 0; i < Math.min(p.cards, 13); i++) backs.append(el('span', 'bk-back')); box.append(backs); }
  }
}
// Sıra halkası: kalan süreye göre bir kez CSS ile akar (her karede JS çalışmaz).
function runRing(ring) {
  const total = state.phase === 'playing' ? 25000 : 20000, left = state.remainingMs || 0;
  ring.style.setProperty('--p', `${100 * (1 - left / total)}%`);
  ring.animate([{ '--p': `${100 * (1 - left / total)}%` }, { '--p': '100%' }], { duration: Math.max(0, left), fill: 'forwards' });
}
CSS.registerProperty?.({ name: '--p', syntax: '<percentage>', inherits: false, initialValue: '0%' });
function renderTrick() {
  const s = state, box = $('bkTrick');
  const sig = JSON.stringify([s.trick.map(t => t.card.id), s.phase === 'trickEnd' ? s.turn : -1]);
  if (sig === lastSig) return; lastSig = sig;
  box.replaceChildren();
  const win = s.phase === 'trickEnd' ? s.turn : -1;
  for (const t of s.trick) { const c = cardEl(t.card, t.seat === win ? 'win' : ''); c.dataset.pos = posOf(t.seat); box.append(c); }
}
function renderHand() {
  const s = state, box = $('bkHand');
  const mine = s.phase === 'playing' && s.turn === s.me;
  box.classList.toggle('myturn', mine);
  box.replaceChildren();
  let prev = null;
  for (const c of s.hand) {
    const d = cardEl(c, (s.legal.includes(c.id) ? 'legal ' : '') + (prev && prev !== c.suit ? 'gap' : ''));
    prev = c.suit;
    d.addEventListener('click', () => {
      if (!mine) return;
      if (!s.legal.includes(c.id)) return toast(illegalHint(c));
      send('batak:play', { cardId: c.id });
    });
    box.append(d);
  }
}
function illegalHint(c) {
  const s = state;
  if (!s.trick.length) return 'Koz henüz oynanmadı; başka renkle açmalısın.';
  const led = s.trick[0].card.suit;
  if (c.suit !== led && s.hand.some(h => h.suit === led)) return `${SUIT_NAME[led]} takip etmek zorundasın.`;
  if (c.suit !== led && s.hand.some(h => h.suit === s.trump)) return 'Rengin yoksa koz atmak zorundasın.';
  return 'Yerdeki kartı geçebiliyorsan büyütmek zorundasın.';
}
function renderPanels() {
  const s = state, myBid = s.phase === 'bidding' && s.turn === s.me, myTrump = s.phase === 'trump' && s.turn === s.me;
  $('bkBidPanel').classList.toggle('hidden', !myBid && !s.canCancel);
  $('bkTrumpPanel').classList.toggle('hidden', !myTrump);
  $('bkCancelBtn').classList.toggle('hidden', !s.canCancel);
  const row = $('bkBidButtons'); row.replaceChildren();
  if (myBid && s.bidding) {
    $('bkBidTitle').textContent = s.declare ? 'KAÇ EL ALIRSIN? (0 = EL ALMAZ)' : `İHALE · en az ${s.bidding.minNext}`;
    if (!s.declare) { const pass = el('button', 'bk-btn red', 'PAS'); pass.type = 'button'; pass.onclick = () => send('batak:bid', { value: null }); row.append(pass); }
    for (let v = s.bidding.minNext; v <= 13; v++) {
      const b = el('button', 'bk-btn ' + (v === 0 ? 'orange' : 'green'), v === 0 ? 'EL ALMAZ' : String(v)); b.type = 'button';
      b.onclick = () => send('batak:bid', { value: v }); row.append(b);
    }
  } else $('bkBidTitle').textContent = 'Elinde 10\'dan büyük kart yok';
  const trow = $('bkTrumpButtons'); trow.replaceChildren();
  if (myTrump) for (const suit of ['S', 'H', 'D', 'C']) {
    const b = el('button', 'bk-btn suit ' + (isRed(suit) ? 'red' : ''), SUIT[suit]); b.type = 'button'; b.title = SUIT_NAME[suit];
    b.onclick = () => send('batak:trump', { suit }); trow.append(b);
  }
}
function renderWait() {
  const s = state, waiting = s.phase === 'waiting';
  $('bkWait').classList.toggle('hidden', !waiting);
  if (!waiting) return;
  $('bkCode').textContent = s.code;
  const free = 4 - s.players.length;
  $('bkWaitText').textContent = s.isPublic ? `${free} koltuk boş · birkaç saniye içinde botlar oturacak` : `${free} koltuk boş · arkadaşlarına kodu gönder: ${s.code}`;
  $('bkHostBtns').classList.toggle('hidden', !s.isHost || s.isPublic);
}
function renderDummy() {
  const s = state, box = $('bkDummy');
  box.classList.toggle('hidden', !s.revealed);
  if (!s.revealed) return;
  box.dataset.pos = posOf(s.revealed.seat);
  box.replaceChildren(...s.revealed.cards.map(c => cardEl(c)));
}

// ---------- Puan tablosu ----------
let lastResultShown = false;
function showScores(auto = false) {
  const s = state, t = $('bkScoreTable'); t.replaceChildren();
  const head = el('tr'); head.append(el('th', null, 'EL'));
  s.players.forEach(p => head.append(el('th', null, p.name))); t.append(head);
  for (const h of s.history) {
    const tr = el('tr'); const first = el('td', null, String(h.round));
    if (h.trump) first.append(el('small', null, SUIT[h.trump])); tr.append(first);
    h.scores.forEach((v, i) => {
      const td = el('td', v < 0 ? 'neg' : 'pos', String(v));
      const bid = s.declare ? (h.bids[i] === 0 ? 'el almaz' : `söz ${h.bids[i]}`) : (h.contract?.seat === i ? `ihale ${h.contract.bid}` : '');
      td.append(el('small', null, `${bid}${bid ? ' · ' : ''}aldı ${h.tricks[i]}`)); tr.append(td);
    });
    t.append(tr);
  }
  const tot = el('tr', 'total'); tot.append(el('td', null, 'TOPLAM')); s.players.forEach(p => tot.append(el('td', p.total < 0 ? 'neg' : '', String(p.total)))); t.append(tot);
  const over = s.phase === 'matchEnd';
  $('bkScoreTitle').textContent = over ? 'MAÇ SONU' : s.phase === 'roundEnd' ? `EL ${s.round} SONUCU` : 'PUAN TABLOSU';
  const best = Math.max(...s.players.map(p => p.total));
  const winners = s.players.filter(p => p.total === best).map(p => p.name);
  $('bkScoreNote').textContent = over ? `🏆 Kazanan: ${s.team ? winners.join(' & ') : winners.join(', ')} (${best} puan)` : s.phase === 'roundEnd' ? 'Yeni el birkaç saniye içinde başlayacak.' : '';
  const btns = $('bkScoreBtns'); btns.replaceChildren();
  const mk = (cls, text, fn) => { const b = el('button', 'bk-btn ' + cls, text); b.type = 'button'; b.onclick = fn; btns.append(b); };
  if (over) { mk('green', 'YENİDEN OYNA', () => { socket.emit('batak:rematch'); closeScores(); }); mk('red', 'LOBİYE DÖN', () => socket.emit('batak:leave')); }
  else mk('blue', 'KAPAT', closeScores);
  $('bkScoreModal').classList.remove('hidden');
  if (auto) lastResultShown = true;
}
function closeScores() { $('bkScoreModal').classList.add('hidden'); }

// ---------- Düğmeler ----------
$('bkScoreBtn').onclick = () => state && showScores();
$('bkLastBtn').onclick = () => {
  if (!state?.lastTrick) return toast('Henüz tamamlanan el yok.');
  const lt = state.lastTrick, names = lt.cards.map(t => `${state.players[t.seat].name}: ${SUIT[t.card.suit]}${RANK[t.card.rank] || t.card.rank}`);
  toast(`Son el (${state.players[lt.winner].name} aldı) — ${names.join(' · ')}`);
};
$('bkLeaveBtn').onclick = () => { if (confirm('Masadan ayrılmak istiyor musun? Oyun sürüyorsa yerine bot geçer.')) socket.emit('batak:leave'); };
$('bkCancelBtn').onclick = () => send('batak:cancel');
$('bkAddBot').onclick = () => socket.emit('batak:addBot');
$('bkStartBots').onclick = () => socket.emit('batak:startBots');
$('bkScoreClose').onclick = closeScores;
$('bkScoreModal').addEventListener('click', e => { if (e.target.id === 'bkScoreModal' && state?.phase !== 'matchEnd') closeScores(); });
