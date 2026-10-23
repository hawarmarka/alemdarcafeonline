'use strict';
// Batak masası (istemci). Sunucu her değişiklikte 'batak:state' ile bu oyuncunun görüntüsünü yollar; burada yalnızca çizilir.
// Kural denetimi sunucudadır; istemci oynanabilir kartları (state.legal) öne çıkarır. Kart çizimi: js/batak-cards.js.
const socket = typeof io === 'function' ? io() : { on() {}, emit() {}, connected: false };
const $ = id => document.getElementById(id);
const Cards = window.BatakCards;
Cards.install(); // renk simgeleri (koz kutusu, koz seçimi) ilk karttan önce de görünsün
const SUIT_NAME = Cards.SUIT_NAME, RANK = Cards.RANK;
const TYPE_NAME = { ihaleli: 'İHALELİ BATAK', kozmaca: 'KOZ MAÇA', esli: 'EŞLİ BATAK' };
const POS = ['bottom', 'right', 'top', 'left']; // koltuk farkı → ekrandaki yer (saatin tersi: sıradaki sağda)
const SEAT_ID = { bottom: 'seatBottom', top: 'seatTop', left: 'seatLeft', right: 'seatRight' };
const QUICK = ['Selam 👋', 'Bol şans!', 'Güzel oyun 👏', 'Hadi bakalım!', 'Tebrikler 🎉', 'Az kalsın 😅', 'Ellerine sağlık', 'Görüşürüz'];
const isRed = s => s === 'H' || s === 'D';
let session = null;
try { session = JSON.parse(sessionStorage.getItem('batakSession') || 'null'); } catch (_) {}
if (!session?.code || !(session?.token || session?.watch)) location.replace('/');
const spectating = !!session?.watch; // canlı izleme: el yok, hamle ve sohbet yazma yok
let state = null, prev = null, sent = false, shownResultRound = 0, chatUnread = 0;
const avatarSrc = a => /^\/api\/avatar\/[\w-]{22}$/.test(a || '') ? a : /^av(0[1-9]|10)\.svg$/.test(a || '') ? '/asset/avatars/' + a : '/asset/avatar-default.svg';
document.addEventListener('error', e => { if (e.target.tagName === 'IMG' && !e.target.src.endsWith('avatar-default.svg')) e.target.src = '/asset/avatar-default.svg'; }, true);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
function toast(msg, info = false) { const t = $('bkToast'); t.textContent = msg; t.classList.toggle('info', info); t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3200); }
const posOf = seat => POS[(seat - Math.max(0, state.me) + 4) % 4]; // izleyici (me = -1) 0 numaralı koltuktan bakar
const suitIcon = suit => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 100 100');
  s.innerHTML = `<use href="#bk-${suit}" fill="${isRed(suit) ? '#c4161c' : '#161616'}"/>`; return s; };
const cardName = c => `${SUIT_NAME[c.suit]} ${RANK[c.rank] || c.rank}`;

// ---------- Ses (WebAudio ile üretilir; dosya yok). Lobideki ses tercihiyle aynı ayar. ----------
let audio = null;
const soundOn = () => localStorage.getItem('okeySoundsEnabled') !== '0';
function beep(freq, ms, type = 'sine', gain = .08, slide = 0) {
  if (!soundOn()) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + ms / 1000);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + ms / 1000);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + ms / 1000);
  } catch (_) {}
}
const sfx = { card: () => beep(520, 70, 'triangle', .07, .6), win: () => { beep(660, 120); setTimeout(() => beep(880, 160), 110); },
  turn: () => beep(740, 140, 'sine', .06, 1.3), bad: () => beep(180, 160, 'square', .04) };
function paintSound() { $('bkSoundWave').classList.toggle('hidden', !soundOn()); $('bkSoundOff').classList.toggle('hidden', soundOn()); }

// ---------- Bağlantı ----------
socket.on('connect', () => socket.emit(spectating ? 'batak:watch' : 'batak:rejoin', { code: session.code, token: session.token }));
// İzleyici şeridi; oyunculara kaç kişinin izlediğini gösterir.
const watchBar = (() => {
  const bar = el('div', 'watch-bar hidden'), text = el('span'), exit = el('button', null, 'İZLEMEYİ BIRAK'); exit.type = 'button';
  exit.onclick = () => { socket.emit('batak:unwatch'); goLobby(); };
  bar.append(text, exit); document.body.append(bar);
  if (spectating) document.body.classList.add('spectator');
  return n => { text.textContent = spectating ? `👁 İZLEYİCİ MODU · masa ${session.code}${n > 1 ? ` · ${n} izleyici` : ''}` : `👁 ${n} kişi masanı izliyor`;
    exit.classList.toggle('hidden', !spectating); bar.classList.toggle('hidden', !spectating && !n); };
})();
socket.on('batak:state', s => { prev = state; state = s; sent = false; render(); });
socket.on('batak:error', d => { sent = false; sfx.bad(); toast(d.message || 'İşlem yapılamadı.'); if (/bulunamadı|kapandı/.test(d.message || '')) setTimeout(goLobby, 2500); });
socket.on('batak:replaced', () => toast('Masa başka bir sekmede açıldı.'));
socket.on('batak:left', goLobby);
socket.on('batak:chat', m => addChat(m));
socket.on('batak:info', d => toast(d.message, true));
socket.on('disconnect', () => toast('Bağlantı koptu, yeniden bağlanılıyor…', true));
function goLobby() { sessionStorage.removeItem('batakSession'); location.assign('/'); }
const send = (event, data) => { if (sent) return; sent = true; socket.emit(event, data); setTimeout(() => { sent = false; }, 3000); };

// ---------- Çizim ----------
function render() {
  const s = state;
  $('bkType').textContent = TYPE_NAME[s.type] || s.type;
  $('bkRound').textContent = s.phase === 'waiting' ? `${s.roundLimit} el · masa ${s.code}` : `El ${s.round} / ${s.roundLimit}`;
  const trump = $('bkTrumpSuit'); trump.replaceChildren(s.trump ? suitIcon(s.trump) : suitIcon('S'));
  $('bkTrump').classList.toggle('none', !s.trump);
  $('bkTrump').title = s.trump ? `Koz: ${SUIT_NAME[s.trump]}${s.trumpBroken ? '' : ' (henüz oynanmadı)'}` : 'Koz henüz seçilmedi';
  $('bkContract').textContent = s.contract ? `İhale: ${s.players[s.contract.seat].name} · ${s.contract.bid} el${s.contract.forced ? ' (zorunlu)' : ''}`
    : s.declare && s.phase === 'playing' ? 'Herkes söylediği kadar el almaya çalışıyor' : s.phase === 'bidding' ? 'İhale sürüyor…' : '';
  renderSeats(); renderTrick(); renderHand(); renderPanels(); renderWait(); renderDummy();
  window.BatakExtras?.update();
  watchBar(s.watchers || 0);
  const notice = $('bkNotice'); notice.textContent = s.notice || ''; notice.classList.toggle('hidden', !s.notice);
  // Sesler: sıra bana geldi, el bitti
  if (prev && s.turn === s.me && prev.turn !== s.me && ['bidding', 'trump', 'playing'].includes(s.phase)) sfx.turn();
  if (prev && s.phase === 'trickEnd' && prev.phase !== 'trickEnd') sfx.win();
  if ((s.phase === 'roundEnd' || s.phase === 'matchEnd') && shownResultRound !== s.round + (s.phase === 'matchEnd' ? 100 : 0)) { shownResultRound = s.round + (s.phase === 'matchEnd' ? 100 : 0); showScores(); }
  if (s.phase === 'bidding' && $('bkScoreModal').dataset.auto === '1') closeModal('bkScoreModal');
}
// Beklerken koltuklar sabit yerinde (0 alt, 1 sağ, 2 üst, 3 sol) ve boş koltukta OTUR var; oyun başlayınca herkes
// kendini altta görür. Oyun sırasında oyuncu dizisi koltuk sırasındadır (sunucu maç başında dizer).
const waitingSeat = s => state.players.findIndex(p => p.seat === s);
let seatSig = '';
function renderSeats() {
  const s = state, active = ['bidding', 'trump', 'playing'].includes(s.phase), waiting = s.phase === 'waiting';
  // Kutular yalnızca gösterdikleri bir şey değişince yeniden kurulur (avatar resimleri her hamlede yeniden çözülmesin).
  const sig = JSON.stringify([s.phase, s.me, s.turn, s.deadline, s.dealer, s.contract, s.players]);
  if (sig === seatSig) return; seatSig = sig;
  for (let place = 0; place < 4; place++) {
    const seat = waiting ? waitingSeat(place) : place;
    const slot = $(SEAT_ID[waiting ? POS[place] : posOf(place)]), p = seat >= 0 ? s.players[seat] : null;
    const keep = [...slot.querySelectorAll('.bk-bubble')]; // balon yeniden çizimde kaybolmasın (ikramları batak-extras.js yeniden koyar)
    slot.replaceChildren(); slot.dataset.seat = seat >= 0 ? String(seat) : '';
    if (!p) {
      const empty = el('div', 'bk-empty');
      const sit = el('button', 'bk-sit', 'OTUR'); sit.type = 'button'; sit.title = 'Bu koltuğa geç';
      sit.onclick = () => socket.emit('batak:changeSeat', { seat: place });
      empty.append(el('span', null, 'Boş koltuk'), sit);
      slot.append(empty);
      continue;
    }
    slot.append(playerBox(p, seat, active, waiting), ...keep);
  }
}
// Oyuncu kutusu: avatar (seviye, dağıtan), ad ve etiketler, SÖZ / ALDI / PUAN, kalan kart sayısı, sıra süresi.
function playerBox(p, seat, active, waiting) {
  const s = state, mine = seat === s.me, turn = active && s.turn === seat;
  const box = el('div', 'bk-pbox' + (mine ? ' me' : '') + (turn ? ' turn' : '') + (p.connected ? '' : ' away'));
  box.dataset.seat = String(seat);
  const av = el('button', 'pb-av'); av.type = 'button'; av.title = `${p.name} · profili gör`;
  const img = el('img'); img.src = avatarSrc(p.avatar); img.alt = ''; av.append(img, el('span', 'pb-lv', String(p.level || 1)));
  if (s.dealer === seat && !waiting) { const d = el('span', 'pb-dealer', 'D'); d.title = 'Dağıtan'; av.append(d); }
  av.onclick = () => showProfile(p);
  const main = el('div', 'pb-main');
  const name = el('div', 'pb-name'); name.append(document.createTextNode(p.name));
  if (mine) name.append(el('i', 'pb-tag me', 'SEN'));
  else if (p.isBot) name.append(el('i', 'pb-tag', 'BOT'));
  if (s.team && !waiting && !mine && s.me >= 0) name.append(el('i', 'pb-tag team', seat % 2 === s.me % 2 ? 'EŞİN' : 'RAKİP'));
  if (!p.connected) name.append(el('i', 'pb-tag', 'BAĞLANIYOR'));
  main.append(name);
  const stats = el('div', 'pb-stats');
  const stat = (cls, label, value) => { const sp = el('span', cls); sp.append(el('small', null, label), el('b', null, String(value))); stats.append(sp); };
  if (s.contract?.seat === seat) stat('contract bid', 'İHALE', s.contract.bid);
  else if (p.passed) stat('pass', 'SÖZ', 'PAS');
  else stat('bid', s.declare ? 'SÖZ' : 'İHALE', p.bid == null ? '–' : s.declare && p.bid === 0 ? '0' : p.bid);
  stat('won', 'ALDI', ['waiting', 'bidding'].includes(s.phase) ? '–' : p.tricks);
  stat('', 'PUAN', p.total);
  main.append(stats);
  if (turn) main.append(el('div', 'pb-turn', mine ? (s.phase === 'playing' ? 'SIRA SENDE · KART AT' : s.phase === 'trump' ? 'KOZU SEÇ' : 'İHALE SIRASI SENDE') : 'DÜŞÜNÜYOR…'));
  else if (!mine && p.cards && !waiting) { const c = el('div', 'pb-cards'); c.append(el('i'), document.createTextNode(`${p.cards} kart`)); main.append(c); }
  box.append(av, main);
  if (turn) { const t = el('div', 'pb-timer'), fill = el('b'); t.append(fill); box.append(t); runTimer(fill); }
  return box;
}
// Sıra süresi: kalan süreye göre bir kez akar (her karede JS çalışmaz).
function runTimer(fill) {
  const total = state.turnMs || 25000, left = state.remainingMs || 0;
  fill.animate([{ transform: `scaleX(${left / total})` }, { transform: 'scaleX(0)' }], { duration: Math.max(0, left), fill: 'forwards' });
}
// Ortadaki el: yeni kart oyuncunun yönünden kayarak gelir; el bitince kartlar alan oyuncuya doğru toplanır.
const TRICK_AT = { bottom: [0, .55], top: [0, -.55], left: [-.78, 0], right: [.78, 0] };
const FROM_AT = { bottom: [0, 3.4], top: [0, -3.2], left: [-5, 0], right: [5, 0] };
const at = (pos, table, rot = 0) => { const [x, y] = table[pos]; return `translate(calc(var(--card-w) * ${x * 1.4}), calc(var(--card-h) * ${y * 1.15})) rotate(${rot}deg)`; };
function renderTrick() {
  const s = state, box = $('bkTrick');
  const shown = new Map([...box.children].map(c => [c.dataset.id, c]));
  if (!s.trick.length) {
    // El toplandı: kalan kartlar kazanana doğru kayıp kaybolur.
    if (shown.size && s.lastTrick) {
      const to = posOf(s.lastTrick.winner);
      for (const c of shown.values()) { c.style.transform = at(to, FROM_AT); c.style.opacity = '0'; }
      setTimeout(() => { if (!state.trick.length) box.replaceChildren(); }, 360);
    } else box.replaceChildren();
    return;
  }
  const win = s.phase === 'trickEnd' ? s.turn : -1, ids = new Set(s.trick.map(t => t.card.id));
  for (const [id, c] of shown) if (!ids.has(id)) c.remove();
  s.trick.forEach((t, i) => {
    const pos = posOf(t.seat), rot = ((t.card.rank * 7 + i * 13) % 11) - 5;
    let c = shown.get(t.card.id);
    if (!c) {
      c = Cards.el(t.card, s.trump === t.card.suit ? 'trump' : ''); c.dataset.id = t.card.id;
      c.style.transform = at(pos, FROM_AT, rot); c.style.opacity = '0'; c.style.zIndex = String(i + 1);
      box.append(c); c.getBoundingClientRect();
      requestAnimationFrame(() => { c.style.transform = at(pos, TRICK_AT, rot); c.style.opacity = '1'; });
      if (t.seat !== s.me) sfx.card();
    }
    c.classList.toggle('win', t.seat === win);
  });
}
function renderHand() {
  const s = state, box = $('bkHand');
  const mine = s.phase === 'playing' && s.turn === s.me;
  box.classList.toggle('myturn', mine);
  const n = s.hand.length, spread = Math.min(2.4, 30 / Math.max(n, 1));
  const sig = JSON.stringify([s.hand.map(c => c.id), mine ? s.legal : [], s.trump]);
  if (box.dataset.sig === sig) return; box.dataset.sig = sig;
  box.replaceChildren();
  let prevSuit = null;
  s.hand.forEach((c, i) => {
    const d = Cards.el(c, (s.legal.includes(c.id) ? 'legal ' : '') + (prevSuit && prevSuit !== c.suit ? 'gap ' : '') + (s.trump === c.suit ? 'trump' : ''));
    prevSuit = c.suit;
    const off = i - (n - 1) / 2;
    d.style.rotate = `${off * spread}deg`;
    d.style.transform = `translateY(${Math.abs(off) ** 2 * .45}px)`;
    d.tabIndex = mine && s.legal.includes(c.id) ? 0 : -1;
    d.title = cardName(c);
    const play = () => {
      if (!mine) return;
      if (!s.legal.includes(c.id)) { sfx.bad(); return toast(illegalHint(c)); }
      d.classList.add('leaving'); sfx.card();
      send('batak:play', { cardId: c.id });
    };
    d.addEventListener('click', play);
    d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
    box.append(d);
  });
  layoutHand(box, n);
}
// Kartlar arası bindirme ekran genişliğine göre: geniş ekranda açık, darda sık; renk arası boşluk için pay bırakılır.
function layoutHand(box, n) {
  const w = box.querySelector('.card')?.offsetWidth || 80;
  const side = innerHeight <= 560 ? 230 : 40; // kısa ekranda solda kendi kutun var
  const avail = Math.min(box.clientWidth - side, w * 9.5), step = n > 1 ? (avail - w - w * .18 * 3) / (n - 1) : w;
  box.style.setProperty('--overlap', `${Math.min(-w * .18, Math.max(-w * .72, step - w))}px`);
}
addEventListener('resize', () => { const box = $('bkHand'); if (state) { box.dataset.sig = ''; renderHand(); } });
function illegalHint(c) {
  const s = state;
  if (!s.trick.length) return 'Koz henüz oynanmadı; başka bir renkle açmalısın.';
  const led = s.trick[0].card.suit;
  if (c.suit !== led && s.hand.some(h => h.suit === led)) return `${SUIT_NAME[led]} takip etmek zorundasın.`;
  if (c.suit !== led && s.hand.some(h => h.suit === s.trump)) return 'Açılan renk yoksa koz atmak zorundasın.';
  return 'Yerdeki kartı geçebiliyorsan büyütmek zorundasın.';
}
function renderPanels() {
  const s = state, myBid = s.phase === 'bidding' && s.turn === s.me, myTrump = s.phase === 'trump' && s.turn === s.me;
  $('bkBidPanel').classList.toggle('hidden', !myBid && !s.canCancel);
  $('bkTrumpPanel').classList.toggle('hidden', !myTrump);
  $('bkCancelBtn').classList.toggle('hidden', !s.canCancel);
  const row = $('bkBidButtons'); row.replaceChildren();
  if (myBid && s.bidding) {
    const high = s.bidding.high;
    $('bkBidTitle').textContent = s.declare ? 'KAÇ EL ALIRSIN?' : 'İHALE';
    $('bkBidInfo').textContent = s.declare ? '0 = el almaz (tutarsa +50, tutmazsa −50)' : high ? `En yüksek: ${s.players[high.seat].name} · ${high.bid}. En az ${s.bidding.minNext} demelisin.` : `İhaleye en az ${s.bidding.minNext} ile girilir.`;
    if (!s.declare) { const pass = el('button', 'bk-btn red', 'PAS'); pass.type = 'button'; pass.onclick = () => send('batak:bid', { value: null }); row.append(pass); }
    for (let v = s.bidding.minNext; v <= 13; v++) {
      const b = el('button', 'bk-btn ' + (v === 0 ? 'orange' : 'green'), v === 0 ? 'EL ALMAZ' : String(v)); b.type = 'button';
      b.onclick = () => send('batak:bid', { value: v }); row.append(b);
    }
  } else if (s.canCancel) { $('bkBidTitle').textContent = 'ELİN ÇOK ZAYIF'; $('bkBidInfo').textContent = 'Elinde 10\'dan büyük kart yok; istersen kartlar yeniden dağıtılır.'; }
  const trow = $('bkTrumpButtons'); trow.replaceChildren();
  if (myTrump) {
    const count = suit => s.hand.filter(c => c.suit === suit).length, best = ['S', 'H', 'D', 'C'].sort((a, b) => count(b) - count(a))[0];
    for (const suit of ['S', 'H', 'D', 'C']) {
      const b = el('button', 'bk-suit' + (suit === best ? ' best' : '')); b.type = 'button'; b.title = `${SUIT_NAME[suit]} (${count(suit)} kart)`;
      b.append(suitIcon(suit), el('span', null, `${SUIT_NAME[suit]} · ${count(suit)}`));
      b.onclick = () => send('batak:trump', { suit }); trow.append(b);
    }
  }
}
function renderWait() {
  const s = state, waiting = s.phase === 'waiting';
  $('bkWait').classList.toggle('hidden', !waiting);
  if (!waiting) return;
  $('bkCode').textContent = s.code;
  const free = 4 - s.players.length;
  $('bkWaitText').textContent = s.autoBots ? `${free} koltuk boş · birkaç saniye içinde botlar oturacak`
    : s.isPublic ? `${free} koltuk boş · masa, masa listesinde görünüyor` : `${free} koltuk boş · arkadaşlarına masa kodunu gönder`;
  $('bkHostBtns').classList.toggle('hidden', !s.isHost || s.autoBots);
}
function renderDummy() {
  const s = state, box = $('bkDummy');
  box.classList.toggle('hidden', !s.revealed);
  if (!s.revealed) return;
  box.dataset.pos = posOf(s.revealed.seat);
  box.replaceChildren(...s.revealed.cards.map(c => Cards.el(c, s.trump === c.suit ? 'trump' : '')));
  box.title = `${s.players[s.revealed.seat].name} kartlarını açtı`;
}

// ---------- Pencereler ----------
const openModal = id => $(id).classList.remove('hidden');
const closeModal = id => { $(id).classList.add('hidden'); $(id).dataset.auto = ''; };
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
document.querySelectorAll('.bk-modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && !(m.id === 'bkScoreModal' && state?.phase === 'matchEnd')) closeModal(m.id); }));
function showScores() {
  const s = state, t = $('bkScoreTable'); t.replaceChildren();
  const best = Math.max(...s.players.map(p => p.total)), over = s.phase === 'matchEnd';
  const head = el('tr'); head.append(el('th', null, 'EL'));
  s.players.forEach(p => head.append(el('th', over && p.total === best ? 'win' : '', (over && p.total === best ? '🏆 ' : '') + p.name))); t.append(head);
  for (const h of s.history) {
    const tr = el('tr'); const first = el('td', null, String(h.round));
    if (h.trump) first.append(el('small', null, SUIT_NAME[h.trump])); tr.append(first);
    h.scores.forEach((v, i) => {
      const td = el('td', v < 0 ? 'neg' : 'pos', (v > 0 ? '+' : '') + v);
      const bid = s.declare ? (h.bids[i] === 0 ? 'el almaz' : `söz ${h.bids[i]}`) : (h.contract?.seat === i ? `ihale ${h.contract.bid}` : '');
      td.append(el('small', null, `${bid}${bid ? ' · ' : ''}aldı ${h.tricks[i]}`)); tr.append(td);
    });
    t.append(tr);
  }
  if (!s.history.length) { const tr = el('tr'); const td = el('td', null, 'Henüz biten el yok.'); td.colSpan = 5; tr.append(td); t.append(tr); }
  const tot = el('tr', 'total'); tot.append(el('td', null, 'TOPLAM')); s.players.forEach(p => tot.append(el('td', p.total < 0 ? 'neg' : '', String(p.total)))); t.append(tot);
  $('bkScoreTitle').textContent = over ? 'MAÇ SONU' : s.phase === 'roundEnd' ? `EL ${s.round} SONUCU` : 'PUAN TABLOSU';
  const winners = s.players.filter(p => p.total === best).map(p => p.name);
  $('bkScoreNote').textContent = over ? `🏆 Kazanan: ${winners.join(s.team ? ' & ' : ', ')} (${best} puan)` : s.phase === 'roundEnd' ? 'Yeni el birkaç saniye içinde başlayacak.' : '';
  const btns = $('bkScoreBtns'); btns.replaceChildren();
  const mk = (cls, text, fn) => { const b = el('button', 'bk-btn ' + cls, text); b.type = 'button'; b.onclick = fn; btns.append(b); };
  if (over) { mk('green', '↻ YENİDEN OYNA', () => { socket.emit('batak:rematch'); closeModal('bkScoreModal'); }); mk('red', 'LOBİYE DÖN', () => socket.emit('batak:leave')); }
  else mk('blue', 'KAPAT', () => closeModal('bkScoreModal'));
  openModal('bkScoreModal');
  $('bkScoreModal').dataset.auto = s.phase === 'roundEnd' ? '1' : '';
}
function showLast() {
  if (!state?.lastTrick) return toast('Henüz tamamlanan el yok.', true);
  const lt = state.lastTrick, box = $('bkLastCards'); box.replaceChildren();
  for (const t of lt.cards) {
    const f = el('figure', t.seat === lt.winner ? 'win' : '');
    f.append(Cards.el(t.card, state.trump === t.card.suit ? 'trump' : ''), el('figcaption', null, (t.seat === lt.winner ? '✓ ' : '') + state.players[t.seat].name));
    box.append(f);
  }
  $('bkLastTitle').textContent = `SON EL · ${state.players[lt.winner].name} aldı`;
  openModal('bkLastModal');
}
const RULES = {
  common: ['Saatin tersine oynanır; sıradaki oyuncu sağındadır. Her oyuncuya 13 kart dağıtılır.',
    'Açılan rengi takip etmek zorunludur. Yer kozlanmadıysa ve geçebiliyorsan büyütmek zorundasın.',
    'Elinde açılan renk yoksa koz atmak zorundasın; yerde koz varsa ve geçebiliyorsan kozu büyütmelisin.',
    'Ne renk ne koz varsa herhangi bir kart (çöp) atılır.',
    'Koz bir kez oynanmadan (kırılmadan) kozla el açılamaz; elinde yalnızca koz varsa açabilirsin.',
    'Eli en büyük koz, koz yoksa açılan renkten en büyük kart alır. Eli alan sıradaki eli açar.',
    'Elinde 10\'dan büyük kart yoksa ihale başlamadan EL İPTAL ile yeniden dağıtım isteyebilirsin.'],
  ihaleli: ['İhale dağıtanın sağından başlar, en az 5. Her söz öncekinden büyük olmalı; pas diyen bir daha giremez.',
    'Kimse ihaleye girmezse dağıtanın sağındaki 4 el almak zorundadır.', 'İhaleyi alan kozu seçer ve ilk eli açar.',
    'Puan: ihaleyi tutarsan 10 × ihale + fazla el; tutmazsan −10 × ihale. Diğerleri aldığı el kadar puan alır, hiç el almayan −10 × ihale yazar.'],
  kozmaca: ['Koz her zaman maçadır. Herkes sırayla kaç el alacağını söyler (0 = el almaz).', 'İlk eli dağıtanın sağındaki açar.',
    'Puan: sözünü tutarsan 10 × söz + fazla el; tutmazsan −10 × söz. El almaz tutarsa +50, tutmazsa −50.'],
  esli: ['Karşılıklı oturanlar takımdır. İhale en az 8; kimse girmezse dağıtan 7 almak zorundadır.',
    'İhaleyi alan kozu seçer ve ilk eli açar; ilk kart oynanınca eşinin kartları herkese açılır.',
    'Puan takımın toplam eline göre: tutarsa 10 × ihale + fazla; tutmazsa −10 × ihale. Karşı takım aldığı el kadar, hiç almazsa −10 × ihale.'],
};
function showRules() {
  const box = $('bkRulesText'); box.replaceChildren();
  const sec = (title, items) => { box.append(el('h3', null, title)); const ul = el('ul'); items.forEach(t => ul.append(el('li', null, t))); box.append(ul); };
  sec(TYPE_NAME[state?.type] || 'BATAK', RULES[state?.type] || RULES.ihaleli);
  sec('OYNAMA', RULES.common);
  openModal('bkRulesModal');
}

// ---------- Profil, arkadaşlar, davet (js/social.js) ----------
const authToken = () => localStorage.getItem('okeyAuthToken') || '';
async function showProfile(p) {
  $('bkProfileAvatar').src = avatarSrc(p.avatar);
  $('bkProfileName').textContent = p.name;
  const stats = $('bkProfileStats'); stats.replaceChildren();
  const stat = (label, value) => { const d = el('div'); d.append(el('b', null, String(value)), el('small', null, label)); stats.append(d); };
  const add = $('bkProfileAdd'), mine = state && state.players[state.me]?.name === p.name;
  add.classList.toggle('hidden', p.isBot || !p.account || mine);
  add.disabled = false; add.textContent = 'ARKADAŞ EKLE';
  $('bkProfileSub').textContent = p.isBot ? 'Bilgisayar oyuncusu' : p.account ? `Seviye ${p.level || 1}` : 'Misafir oyuncu (hesabı yok)';
  $('bkProfileTreat').classList.toggle('hidden', !!mine);
  $('bkProfileTreat').onclick = () => { closeModal('bkProfileModal'); window.BatakExtras?.openTreat(state.players.indexOf(p)); };
  stat('Bu maçta puan', p.total ?? 0);
  openModal('bkProfileModal');
  if (!p.account || p.isBot) return;
  try {
    const r = await fetch('/api/profile?name=' + encodeURIComponent(p.name)).then(x => x.ok ? x.json() : null);
    if (!r) return;
    $('bkProfileSub').textContent = `Seviye ${r.level} · ${Number(r.xp).toLocaleString('tr-TR')} XP`;
    stat('Oyun', r.games); stat('Zafer', r.wins); stat('Çip', Number(r.chips || 0).toLocaleString('tr-TR'));
    // Zaten arkadaşsa ya da istek bekliyorsa düğme bunu söyler.
    if (authToken() && !mine) {
      const f = await fetch('/api/friends', { headers: { Authorization: 'Bearer ' + authToken() } }).then(x => x.ok ? x.json() : null);
      if (f?.friends?.some(u => u.username === p.name)) { add.textContent = 'ARKADAŞSINIZ'; add.disabled = true; }
      else if (f?.outgoing?.some(u => u.username === p.name)) { add.textContent = 'İSTEK GÖNDERİLDİ'; add.disabled = true; }
    }
  } catch (_) {}
}
$('bkProfileAdd').onclick = async () => {
  if (!authToken()) return toast('Arkadaş eklemek için lobiden hesabınla giriş yap.');
  const btn = $('bkProfileAdd'); btn.disabled = true;
  try {
    const res = await fetch('/api/friends/request', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken() }, body: JSON.stringify({ username: $('bkProfileName').textContent }) });
    const out = await res.json();
    if (!res.ok) throw Error(out.error || 'İstek gönderilemedi.');
    btn.textContent = out.result === 'accepted' ? 'ARTIK ARKADAŞSINIZ' : 'İSTEK GÖNDERİLDİ';
  } catch (err) { btn.disabled = false; toast(err.message); }
};
$('bkMenuProfile').onclick = () => { menu.classList.add('hidden'); if (state?.players[state.me]) showProfile(state.players[state.me]); };
if (window.Social) Social.init({ socket, token: authToken, toast: m => toast(m, true), avatarSrc, buttons: () => [$('bkFriendsBtn')],
  currentRoom: () => session?.code,
  needAccount: () => toast('Arkadaşlar ve davet için lobiden hesabınla giriş yap.'),
  onJoin: (code, game) => {
    if (state && state.phase !== 'waiting' && state.phase !== 'matchEnd' && !confirm('Bu masadan ayrılıp davet edilen masaya geçilsin mi? Yerine bot geçer.')) return;
    try { sessionStorage.setItem('inviteJoin', code); sessionStorage.setItem('inviteGame', game || 'okey'); } catch (_) {}
    socket.emit('batak:leave');
  } });
$('bkInviteBtn').onclick = () => window.Social ? Social.open(true) : null;
// İkram ve sesli sohbet (js/batak-extras.js): masadaki oyuncu kutularını ve sohbet günlüğünü kullanır.
window.BatakExtras?.init({ socket, toast, getState: () => state, openModal, closeModal,
  slotOf: seat => [...document.querySelectorAll('.bk-slot')].find(s => s.dataset.seat === String(seat)),
  log: text => { const p = el('p', 'sys', text); $('bkChatLog').append(p); } });

// ---------- Sohbet ----------
function addChat(m) {
  const log = $('bkChatLog'), p = el('p'); p.append(el('b', null, m.name + ': '), document.createTextNode(m.text));
  log.append(p); log.scrollTop = log.scrollHeight;
  while (log.children.length > 60) log.firstChild.remove();
  if (state) {
    const place = state.phase === 'waiting' ? POS[state.players[m.seat]?.seat ?? 0] : posOf(m.seat);
    const box = $(SEAT_ID[place]); box.querySelector('.bk-bubble')?.remove();
    const b = el('div', 'bk-bubble', m.text); box.append(b); setTimeout(() => b.remove(), 4500);
  }
  if ($('bkChat').classList.contains('hidden') && m.seat !== state?.me) { chatUnread++; paintChatDot(); }
}
function paintChatDot() {
  const btn = $('bkChatBtn'); let d = btn.querySelector('.dot');
  if (!chatUnread) { d?.remove(); return; }
  if (!d) { d = el('i', 'dot'); btn.append(d); } d.textContent = String(chatUnread);
}
QUICK.forEach(q => { const b = el('button', null, q); b.type = 'button'; b.onclick = () => socket.emit('batak:chat', { text: q }); $('bkQuick').append(b); });
$('bkChatForm').addEventListener('submit', e => { e.preventDefault(); const v = $('bkChatInput').value.trim(); if (!v) return; socket.emit('batak:chat', { text: v }); $('bkChatInput').value = ''; });
$('bkChatBtn').onclick = () => { $('bkChat').classList.toggle('hidden'); chatUnread = 0; paintChatDot(); if (!$('bkChat').classList.contains('hidden')) $('bkChatInput').focus(); };
$('bkChatClose').onclick = () => $('bkChat').classList.add('hidden');

// ---------- Düğmeler ----------
const menu = $('bkMenu');
$('bkMenuBtn').onclick = e => { e.stopPropagation(); menu.classList.toggle('hidden'); $('bkMenuBtn').setAttribute('aria-expanded', String(!menu.classList.contains('hidden'))); };
document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.classList.add('hidden'); });
$('bkRulesBtn').onclick = () => { menu.classList.add('hidden'); showRules(); };
$('bkMenuScore').onclick = () => { menu.classList.add('hidden'); state && showScores(); };
$('bkScoreBtn').onclick = () => state && showScores();
$('bkLastBtn').onclick = showLast;
$('bkSoundBtn').onclick = () => { localStorage.setItem('okeySoundsEnabled', soundOn() ? '0' : '1'); paintSound(); if (soundOn()) sfx.turn(); };
$('bkLeaveBtn').onclick = () => { menu.classList.add('hidden'); if (confirm('Masadan ayrılmak istiyor musun? Oyun sürüyorsa yerine bot geçer.')) socket.emit('batak:leave'); };
$('bkCancelBtn').onclick = () => send('batak:cancel');
$('bkAddBot').onclick = () => socket.emit('batak:addBot');
$('bkStartBots').onclick = () => socket.emit('batak:startBots');
$('bkCopyCode').onclick = async () => { try { await navigator.clipboard.writeText(state.code); toast('Masa kodu kopyalandı: ' + state.code, true); } catch { toast('Masa kodu: ' + state?.code, true); } };
addEventListener('keydown', e => { if (e.key === 'Escape') { menu.classList.add('hidden'); ['bkLastModal', 'bkRulesModal'].forEach(closeModal); if (state?.phase !== 'matchEnd') closeModal('bkScoreModal'); } });
paintSound();
