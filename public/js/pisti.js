'use strict';
// Pişti masası (istemci). Sunucu her değişiklikte 'pisti:state' ile bu oyuncunun görüntüsünü yollar; burada yalnızca çizilir.
// Kural denetimi sunucudadır. Ortak parçalar: kartlar js/batak-cards.js, ikram ve sesli sohbet js/batak-extras.js,
// arkadaşlar js/social.js; görünüm css/batak.css + css/pisti.css. Animasyonlar yalnızca transform/opacity ile.
const socket = typeof io === 'function' ? io() : { on() {}, emit() {}, connected: false };
const $ = id => document.getElementById(id);
const Cards = window.BatakCards;
Cards.install();
const SUIT_NAME = Cards.SUIT_NAME, RANK = { ...Cards.RANK, 11: 'Vale', 14: 'As' };
const TYPE_NAME = { ikili: 'PİŞTİ · 2 KİŞİ', dortlu: 'PİŞTİ · 4 KİŞİ', esli: 'EŞLİ PİŞTİ' };
const POS = ['bottom', 'right', 'top', 'left']; // koltuk farkı → ekrandaki yer (saatin tersi: sıradaki sağda)
const SEAT_ID = { bottom: 'seatBottom', top: 'seatTop', left: 'seatLeft', right: 'seatRight' };
const QUICK = ['Selam 👋', 'Bol şans!', 'Pişti! 😎', 'Güzel oyun 👏', 'İlk elin günahı olmaz', 'Dördüncüyü bul senin olsun', 'Tebrikler 🎉', 'Görüşürüz'];
let session = null;
try { session = JSON.parse(sessionStorage.getItem('pistiSession') || 'null'); } catch (_) {}
if (!session?.code || !session?.token) location.replace('/');
let state = null, prev = null, sent = false, shownResult = '', chatUnread = 0, seenSeq = 0, seenDeal = 0, bluffArmed = false, playRect = null;
const avatarSrc = a => /^\/api\/avatar\/[\w-]{22}$/.test(a || '') ? a : /^av(0[1-9]|10)\.svg$/.test(a || '') ? '/asset/avatars/' + a : '/asset/avatar-default.svg';
document.addEventListener('error', e => { if (e.target.tagName === 'IMG' && !e.target.src.endsWith('avatar-default.svg')) e.target.src = '/asset/avatar-default.svg'; }, true);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
function toast(msg, info = false) { const t = $('bkToast'); t.textContent = msg; t.classList.toggle('info', info); t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3200); }
const cardName = c => `${SUIT_NAME[c.suit]} ${RANK[c.rank] || c.rank}`;
const active = () => ['playing', 'capture', 'bluff', 'roundEnd', 'matchEnd'].includes(state.phase);
// Ekrandaki yer: oyun sırasında herkes kendini altta görür; beklerken koltuklar sabit yerinde (OTUR için).
const posOf = i => (state.phase === 'waiting' ? POS[state.players[i].seat] : POS[(state.players[i].seat - state.players[state.me].seat + 4) % 4]);
const sideName = k => { const ps = state.players.filter(p => p.side === k); const mine = ps.some(p => p === state.players[state.me]);
  return state.team ? (mine ? 'Siz' : 'Rakip') + ` (${ps.map(p => p.name).join(' & ')})` : ps[0]?.name || ''; };
const sides = () => [...new Set(state.players.map(p => p.side))].sort((a, b) => a - b);
// Canlı puan: maç toplamı + bu eldeki pişti/blöf puanları (kart puanları el sonunda eklenir).
const liveTotal = p => p.total + (['playing', 'capture', 'bluff'].includes(state.phase) ? p.pistis.reduce((n, x) => n + x.points, 0) : 0);

// ---------- Ses (WebAudio ile üretilir; dosya yok). Lobideki ses tercihiyle aynı ayar. ----------
let audio = null;
const soundOn = () => localStorage.getItem('okeySoundsEnabled') !== '0';
function beep(freq, ms, type = 'sine', gain = .08, slide = 0, delay = 0) {
  if (!soundOn()) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + delay / 1000;
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + ms / 1000);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + ms / 1000);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + ms / 1000);
  } catch (_) {}
}
const sfx = { card: () => beep(520, 70, 'triangle', .07, .6), capture: () => beep(420, 220, 'sine', .06, .45), turn: () => beep(740, 140, 'sine', .06, 1.3),
  bad: () => beep(180, 160, 'square', .04), deal: () => { for (let i = 0; i < 4; i++) beep(900, 40, 'triangle', .03, .8, i * 70); },
  pisti: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 180, 'triangle', .08, 0, i * 95)) };
function paintSound() { $('ptSoundWave').classList.toggle('hidden', !soundOn()); $('ptSoundOff').classList.toggle('hidden', soundOn()); }

// ---------- Bağlantı ----------
socket.on('connect', () => socket.emit('pisti:rejoin', { code: session.code, token: session.token }));
socket.on('pisti:state', s => { prev = state; state = s; sent = false; render(); });
socket.on('pisti:error', d => { sent = false; sfx.bad(); toast(d.message || 'İşlem yapılamadı.'); if (/bulunamadı|kapandı/.test(d.message || '')) setTimeout(goLobby, 2500); });
socket.on('pisti:replaced', () => toast('Masa başka bir sekmede açıldı.'));
socket.on('pisti:left', goLobby);
socket.on('pisti:chat', m => addChat(m));
socket.on('pisti:info', d => toast(d.message, true));
socket.on('disconnect', () => toast('Bağlantı koptu, yeniden bağlanılıyor…', true));
function goLobby() { sessionStorage.removeItem('pistiSession'); location.assign('/'); }
const send = (event, data) => { if (sent) return; sent = true; socket.emit(event, data); setTimeout(() => { sent = false; }, 3000); };

// ---------- Çizim ----------
function render() {
  const s = state;
  $('ptType').textContent = TYPE_NAME[s.type] || 'PİŞTİ';
  $('ptRound').textContent = s.phase === 'waiting' ? `masa ${s.code}${s.bluff ? ' · blöflü' : ''}` : `El ${s.round}${s.bluff ? ' · blöflü' : ''}`;
  $('ptTarget').querySelector('b').textContent = s.target;
  $('ptScoreLine').textContent = active() ? sides().map(k => `${sideName(k).replace(/ \(.*\)$/, '')} ${liveTotal(s.players.find(p => p.side === k))}`).join('  ·  ') : '';
  $('ptArena').classList.toggle('two', s.n === 2);
  renderSeats(); renderOpp(); renderWon(); renderDeck(); renderPile(); renderHand(); renderWait(); renderBluff(); renderPeek();
  window.BatakExtras?.update();
  const notice = $('ptNotice'); notice.textContent = s.notice || ''; notice.classList.toggle('hidden', !s.notice || s.phase === 'waiting');
  if (prev && s.turn === s.me && prev.turn !== s.me && ['playing', 'bluff'].includes(s.phase)) sfx.turn();
  if (s.dealSeq !== seenDeal) { if (seenDeal && s.phase === 'playing') sfx.deal(); seenDeal = s.dealSeq; }
  const key = s.phase + s.round + (s.history?.length || 0);
  if ((s.phase === 'roundEnd' || s.phase === 'matchEnd') && shownResult !== key) { shownResult = key; setTimeout(showScores, 900); }
  if (s.phase === 'playing' && $('ptScoreModal').dataset.auto === '1') closeModal('ptScoreModal');
}
function renderSeats() {
  const s = state, waiting = s.phase === 'waiting';
  const byPos = new Map(s.players.map((p, i) => [posOf(i), i]));
  const used = s.n === 2 ? ['bottom', 'top'] : POS;
  for (const pos of POS) {
    const slot = $(SEAT_ID[pos]), i = byPos.get(pos);
    const keep = [...slot.querySelectorAll('.bk-bubble')];
    slot.replaceChildren(); slot.dataset.seat = i != null ? String(i) : '';
    if (!used.includes(pos)) continue;
    if (i == null) {
      if (!waiting) continue;
      const empty = el('div', 'bk-empty'), sit = el('button', 'bk-sit', 'OTUR'); sit.type = 'button'; sit.title = 'Bu koltuğa geç';
      sit.onclick = () => socket.emit('pisti:changeSeat', { seat: POS.indexOf(pos) });
      empty.append(el('span', null, 'Boş koltuk'), sit); slot.append(empty); continue;
    }
    slot.append(playerBox(s.players[i], i), ...keep);
  }
}
// Oyuncu kutusu: avatar (seviye, dağıtan), ad ve etiketler, PUAN / KART / PİŞTİ, sıra süresi.
function playerBox(p, i) {
  const s = state, mine = i === s.me, turn = ['playing', 'bluff'].includes(s.phase) && s.turn === i, waiting = s.phase === 'waiting';
  const box = el('div', 'bk-pbox' + (mine ? ' me' : '') + (turn ? ' turn' : '') + (p.connected ? '' : ' away'));
  box.dataset.seat = String(i);
  const av = el('button', 'pb-av'); av.type = 'button'; av.title = `${p.name} · profili gör`;
  const img = el('img'); img.src = avatarSrc(p.avatar); img.alt = ''; av.append(img, el('span', 'pb-lv', String(p.level || 1)));
  if (s.dealer === i && !waiting) { const d = el('span', 'pb-dealer', 'D'); d.title = 'Dağıtan'; av.append(d); }
  av.onclick = () => showProfile(p);
  const main = el('div', 'pb-main'), name = el('div', 'pb-name');
  name.append(document.createTextNode(p.name));
  if (mine) name.append(el('i', 'pb-tag me', 'SEN')); else if (p.isBot) name.append(el('i', 'pb-tag', 'BOT'));
  if (s.team && !waiting && !mine) name.append(el('i', 'pb-tag team', p.side === s.players[s.me].side ? 'EŞİN' : 'RAKİP'));
  if (!p.connected) name.append(el('i', 'pb-tag', 'BAĞLANIYOR'));
  main.append(name);
  if (!waiting) {
    const stats = el('div', 'pb-stats');
    const stat = (cls, label, value) => { const sp = el('span', cls); sp.append(el('small', null, label), el('b', null, String(value))); stats.append(sp); };
    stat('bid', 'PUAN', liveTotal(p)); stat('won', 'KART', p.captured); stat('', 'PİŞTİ', p.pistis.filter(x => x.kind !== 'yakaladi').length);
    main.append(stats);
  }
  if (turn) main.append(el('div', 'pb-turn', mine ? (s.phase === 'bluff' ? 'İNAN YA DA AÇ' : 'SIRA SENDE · KART AT') : s.phase === 'bluff' ? 'KARAR VERİYOR…' : 'DÜŞÜNÜYOR…'));
  box.append(av, main);
  if (turn) { const t = el('div', 'pb-timer'), fill = el('b'); t.append(fill); box.append(t);
    fill.animate([{ transform: `scaleX(${(s.remainingMs || 0) / (s.turnMs || 15000)})` }, { transform: 'scaleX(0)' }], { duration: Math.max(0, s.remainingMs || 0), fill: 'forwards' }); }
  return box;
}
// Rakiplerin kapalı kartları masanın kenarında yelpaze.
function renderOpp() {
  const s = state, box = $('ptOpp');
  const list = active() ? s.players.map((p, i) => [i, p.cards]).filter(([i, n]) => i !== s.me && n) : [];
  const sig = JSON.stringify(list.map(([i, n]) => [posOf(i), n]));
  if (box.dataset.sig === sig) return; box.dataset.sig = sig;
  box.replaceChildren(...list.map(([i, n]) => { const f = el('div', 'pt-ohand'); f.dataset.pos = posOf(i);
    for (let k = 0; k < n; k++) { const c = Cards.el(null); c.style.setProperty('--k', String(k - (n - 1) / 2)); f.append(c); } return f; }));
}
// Her tarafın aldığı kartlar (kapalı deste) ve piştileri (açık, puanıyla); eşlide takımın birinin önünde.
function renderWon() {
  const s = state, box = $('ptWon');
  if (!active()) { box.replaceChildren(); box.dataset.sig = ''; return; }
  const items = sides().map(k => { const at = s.players.findIndex((p, i) => p.side === k && (i === s.me || p.side !== s.players[s.me].side));
    const p = s.players[at]; return { pos: posOf(at), n: p.captured, pistis: p.pistis }; });
  const sig = JSON.stringify(items);
  if (box.dataset.sig === sig) return; box.dataset.sig = sig;
  box.replaceChildren(...items.map(it => {
    const w = el('div', 'pt-won'); w.dataset.pos = it.pos;
    if (it.n) { const st = el('div', 'pt-won-stack'); st.style.setProperty('--h', String(Math.min(6, Math.ceil(it.n / 6)))); st.append(Cards.el(null), el('b', null, String(it.n))); w.append(st); }
    if (it.pistis.length) {
      const ps = el('div', 'pt-pistis');
      for (const x of it.pistis.slice(-6)) { const f = el('figure', x.kind); f.append(Cards.el(x.card), el('figcaption', null, '+' + x.points)); f.title = x.kind === 'yakaladi' ? 'Blöf yakaladı' : x.kind === 'vale' ? 'Vale pişti' : x.kind === 'blof' ? 'Kapalı pişti' : 'Pişti'; ps.append(f); }
      w.append(ps);
    }
    return w;
  }));
}
// Deste: altındaki açık kart (son dağıtımda dağıtana gelir) yan durur, üstünde kalan kart sayısı.
function renderDeck() {
  const s = state, box = $('ptDeck'), on = active() && s.deckCount > 0;
  box.classList.toggle('hidden', !on); if (!on) return;
  const sig = `${s.deckCount}:${s.deckBottom?.id}`;
  if (box.dataset.sig === sig) return; box.dataset.sig = sig;
  $('ptDeckBottom').replaceChildren(s.deckBottom ? Cards.el(s.deckBottom) : '');
  const st = $('ptDeckStack'); st.replaceChildren(Cards.el(null)); st.style.setProperty('--h', String(Math.min(6, Math.ceil(s.deckCount / 6))));
  $('ptDeckCount').textContent = String(s.deckCount);
  $('ptDeck').title = `Destede ${s.deckCount} kart · alttaki açık kart: ${s.deckBottom ? cardName(s.deckBottom) : ''}`;
}
// Yerdeki kartlar: en çok son 9 kart çizilir; her kartın küçük, sabit bir eğimi var (kart kimliğinden).
const tilt = (key, i) => { let h = i * 31; for (const ch of key) h = (h * 33 + ch.charCodeAt(0)) % 997; return { r: (h % 23) - 11, x: (h % 13) - 6, y: ((h >> 2) % 11) - 5 }; };
const place = (c, t) => `translate(${t.x}px, ${t.y}px) rotate(${t.r}deg)`;
function renderPile() {
  const s = state, box = $('ptPile');
  const entries = active() ? [...s.pile] : [];
  if (s.bluffState) entries.push({ closed: true, bluff: true, mine: s.bluffState.mine });
  const shown = entries.slice(-9), base = entries.length - shown.length;
  box.replaceChildren();
  box.style.setProperty('--h', String(Math.min(6, Math.ceil(base / 3))));
  box.classList.toggle('deep', base > 0);
  shown.forEach((x, k) => {
    const idx = base + k, c = x.mine ? Cards.el(x.mine, 'peek') : Cards.el(x.closed ? null : x.card);
    const t = tilt(x.card?.id || 'kapali' + idx, idx); c.style.transform = place(c, t); c.style.zIndex = String(k + 1);
    if (x.bluff) c.classList.add('bluffing');
    box.append(c);
  });
  const cnt = $('ptPileCount'); cnt.textContent = `${entries.length} kart`; cnt.classList.toggle('hidden', entries.length < 2);
  // Yeni hamle: son kart atanın yerinden uçarak gelir; alma ise yığın alanın önüne süpürülür.
  const lp = s.lastPlay;
  if (!lp || lp.seq === seenSeq) return;
  const first = !seenSeq; seenSeq = lp.seq;
  if (first) return;
  const top = box.lastElementChild;
  if (top && !lp.response) flyIn(top, lp.seat);
  else if (top && lp.response === 'challenge') top.animate([{ transform: top.style.transform + ' rotateY(90deg)' }, { transform: top.style.transform }], { duration: 320, easing: 'ease-out' }); // açılan kart döner
  if (lp.seat !== s.me || lp.response) sfx.card();
  if (lp.capture || lp.caught) setTimeout(() => celebrate(lp), 260);
  if (s.phase === 'capture') setTimeout(() => sweep(lp.seat), 520);
}
function sourceRect(seat) {
  if (seat === state.me && playRect) { const r = playRect; playRect = null; return r; }
  const pos = posOf(seat);
  return (document.querySelector(`.pt-ohand[data-pos="${pos}"]`) || $(SEAT_ID[pos]))?.getBoundingClientRect();
}
function flyIn(card, seat) {
  const a = sourceRect(seat), b = card.getBoundingClientRect(); if (!a) return;
  const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2), end = card.style.transform;
  card.style.transition = 'none'; card.style.transform = `translate(${dx}px, ${dy}px) rotate(-14deg) scale(1.05)`;
  card.getBoundingClientRect();
  card.style.transition = ''; card.style.transform = end;
}
function sweep(seat) {
  const s = state, side = s.players[seat]?.side;
  const target = [...document.querySelectorAll('.pt-won')].find(w => w.dataset.pos === posOf(s.players.findIndex((p, i) => p.side === side && (i === s.me || p.side !== s.players[s.me].side))))
    || $(SEAT_ID[posOf(seat)]);
  const box = $('ptPile'), a = box.getBoundingClientRect(), b = target.getBoundingClientRect();
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  sfx.capture();
  for (const c of box.children) { c.style.transition = 'transform .42s cubic-bezier(.5,0,.8,.4), opacity .42s'; c.style.transform = `translate(${dx}px, ${dy}px) rotate(0deg) scale(.55)`; c.style.opacity = '0'; }
}
function celebrate(lp) {
  const s = state, who = s.players[lp.seat]?.name || '', by = s.players[lp.by]?.name || '';
  if (lp.caught) { sfx.bad(); return burst('BLÖF YAKALANDI!', `${by} +${lp.points}`, 'red'); }
  if (!lp.pisti) return;
  sfx.pisti();
  if (lp.response === 'believe') return burst('PİŞTİ!', `${who} +${lp.pisti} · inanıldı`, 'gold');
  if (lp.response === 'challenge') return burst('GERÇEK PİŞTİ!', `${who} +${lp.pisti}`, 'gold');
  burst(lp.pisti === 20 ? 'VALE PİŞTİ!' : 'PİŞTİ!', `${who} +${lp.pisti}`, lp.pisti === 20 ? 'jack' : 'gold');
}
function burst(title, sub, tone) {
  const b = $('ptBurst'); $('ptBurstTitle').textContent = title; $('ptBurstSub').textContent = sub;
  b.className = 'pt-burst ' + tone; void b.offsetWidth; b.classList.add('show');
  clearTimeout(burst.t); burst.t = setTimeout(() => b.classList.add('hidden'), 1700);
}
function renderHand() {
  const s = state, box = $('ptHand'), mine = s.phase === 'playing' && s.turn === s.me;
  if (!s.canBluff) bluffArmed = false;
  box.classList.toggle('myturn', mine); box.classList.toggle('armed', bluffArmed);
  const tog = $('ptBluffToggle'); tog.classList.toggle('hidden', !s.canBluff); tog.setAttribute('aria-pressed', String(bluffArmed));
  const sig = JSON.stringify([s.hand.map(c => c.id), mine, bluffArmed, s.dealSeq]);
  if (box.dataset.sig === sig) return;
  const dealt = box.dataset.deal !== String(s.dealSeq); box.dataset.sig = sig; box.dataset.deal = String(s.dealSeq);
  box.replaceChildren();
  const n = s.hand.length;
  s.hand.forEach((c, i) => {
    const d = Cards.el(c, 'legal'); d.style.rotate = `${(i - (n - 1) / 2) * 3}deg`;
    d.tabIndex = mine ? 0 : -1; d.title = cardName(c);
    const play = () => {
      if (!mine) { sfx.bad(); return toast(state.phase === 'bluff' ? 'Önce blöf kararı bekleniyor.' : 'Sıra sende değil.', true); }
      playRect = d.getBoundingClientRect(); d.classList.add('leaving'); sfx.card();
      send('pisti:play', { cardId: c.id, closed: bluffArmed }); bluffArmed = false;
    };
    d.addEventListener('click', play);
    d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
    box.append(d);
  });
  if (dealt && n) requestAnimationFrame(() => dealIn([...box.children]));
}
// Dağıtım: yeni kartlar desteden sırayla gelir.
function dealIn(cards) {
  const deck = $('ptDeck'); const a = (!deck.classList.contains('hidden') ? deck : $('ptPile')).getBoundingClientRect();
  cards.forEach((c, i) => {
    const b = c.getBoundingClientRect();
    c.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(.6)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 380, delay: i * 90, easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'backwards' });
  });
}
function renderWait() {
  const s = state, waiting = s.phase === 'waiting';
  $('ptWait').classList.toggle('hidden', !waiting);
  if (!waiting) return;
  $('ptCode').textContent = s.code;
  const free = s.n - s.players.length;
  $('ptWaitText').textContent = s.autoBots ? `${free} koltuk boş · birkaç saniye içinde botlar oturacak`
    : s.isPublic ? `${free} koltuk boş · masa, masa listesinde görünüyor` : `${free} koltuk boş · arkadaşlarına masa kodunu gönder`;
  $('ptWaitHint').textContent = s.team ? 'Boş koltuktaki OTUR ile istediğin koltuğa geç. Karşındaki eşindir.' : 'Boş koltuktaki OTUR ile istediğin koltuğa geçebilirsin.';
  $('ptHostBtns').classList.toggle('hidden', !s.isHost || s.autoBots);
}
function renderBluff() {
  const s = state, mine = s.phase === 'bluff' && s.turn === s.me && s.bluffState;
  $('ptBluffPanel').classList.toggle('hidden', !mine);
  if (!mine) return;
  const b = s.bluffState, jack = b.top.rank === 11, x = jack ? 2 : 1;
  $('ptBluffTitle').textContent = `${s.players[b.seat].name}: "PİŞTİ!"`;
  $('ptBluffInfo').textContent = `Yerdeki kart ${cardName(b.top)}. İnanırsan o +${10 * x} alır. Açarsan: gerçek piştiyse o +${20 * x}, blöfse sen +${20 * x} alırsın.${jack ? ' (Vale: puanlar 2 kat)' : ''}`;
}
function renderPeek() {
  const s = state, on = !!s.closedSeen && ['playing', 'capture', 'bluff'].includes(s.phase);
  $('ptPeek').classList.toggle('hidden', !on); if (!on) return;
  const sig = s.closedSeen.map(c => c.id).join();
  if ($('ptPeek').dataset.sig === sig) return; $('ptPeek').dataset.sig = sig;
  $('ptPeekCards').replaceChildren(...s.closedSeen.map(c => Cards.el(c)));
}

// ---------- Pencereler ----------
const openModal = id => $(id).classList.remove('hidden');
const closeModal = id => { $(id).classList.add('hidden'); $(id).dataset.auto = ''; };
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
document.querySelectorAll('.bk-modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && !(m.id === 'ptScoreModal' && state?.phase === 'matchEnd')) closeModal(m.id); }));
// Tabela: her 10 puan bir çizgi, 5 çizgi bir demet; 10'dan küçük kalan sayı olarak yazılır.
function tally(total) {
  const lines = Math.floor(total / 10), rest = total % 10, svg = [];
  for (let g = 0; g * 5 < lines; g++) {
    const n = Math.min(5, lines - g * 5), x0 = g * 34;
    for (let k = 0; k < Math.min(4, n); k++) svg.push(`<path d="M${x0 + 4 + k * 6} 4v26"/>`);
    if (n === 5) svg.push(`<path d="M${x0} 26 L${x0 + 26} 8"/>`);
  }
  const w = Math.max(30, Math.ceil(lines / 5) * 34);
  const box = el('span', 'pt-tally-marks'); box.innerHTML = `<svg viewBox="0 0 ${w} 34" width="${w}" height="34" aria-hidden="true">${svg.join('')}</svg>`;
  box.append(el('b', null, rest || !lines ? String(rest) : '')); box.title = `${total} puan`;
  return box;
}
function showScores() {
  const s = state; if (!s || !active()) return;
  const t = $('ptScoreTable'); t.replaceChildren();
  const ks = sides(), over = s.phase === 'matchEnd', last = s.history.at(-1);
  const total = k => s.players.find(p => p.side === k).total;
  const head = el('tr'); head.append(el('th', null, ''));
  ks.forEach(k => head.append(el('th', over && s.winners?.includes(k) ? 'win' : '', (over && s.winners?.includes(k) ? '🏆 ' : '') + sideName(k)))); t.append(head);
  const row = (label, f, cls = '') => { const tr = el('tr', cls); tr.append(el('td', null, label)); ks.forEach(k => tr.append(el('td', null, String(f(k))))); t.append(tr); };
  if (last && s.phase !== 'playing') {
    const r = k => last.rows[k];
    row('Aldığı kart', k => r(k).cards); row('Kart puanı (A, J, ♣2, ♦10)', k => r(k).cardPts); row('Pişti / blöf', k => r(k).pistiPts);
    row('Kart fazlası', k => r(k).most ? '+3' : '–'); row(`El ${last.round} toplamı`, k => r(k).total, 'sub');
  }
  if (s.history.length > 1) for (const h of s.history.slice(0, -1).slice(-6)) row(`El ${h.round}`, k => h.rows[k].total, 'old');
  row('TOPLAM', total, 'total');
  const tl = $('ptTally'); tl.replaceChildren();
  ks.forEach(k => { const d = el('div'); d.append(el('small', null, sideName(k)), tally(total(k))); tl.append(d); });
  $('ptScoreTitle').textContent = over ? 'MAÇ SONU' : s.phase === 'roundEnd' ? `EL ${s.round} SONUCU` : 'PUAN TABELASI';
  $('ptScoreNote').textContent = over ? `🏆 Kazanan: ${s.winners.map(sideName).join(', ')} (${total(s.winners[0])} puan)`
    : s.phase === 'roundEnd' ? `Hedef ${s.target}. Yeni el birkaç saniye içinde başlayacak.` : `Hedef ${s.target} puan.`;
  const btns = $('ptScoreBtns'); btns.replaceChildren();
  const mk = (cls, text, fn) => { const b = el('button', 'bk-btn ' + cls, text); b.type = 'button'; b.onclick = fn; btns.append(b); };
  if (over) { mk('green', '↻ YENİDEN OYNA', () => { socket.emit('pisti:rematch'); closeModal('ptScoreModal'); }); mk('red', 'LOBİYE DÖN', () => socket.emit('pisti:leave')); }
  else mk('blue', 'KAPAT', () => closeModal('ptScoreModal'));
  openModal('ptScoreModal');
  $('ptScoreModal').dataset.auto = s.phase === 'roundEnd' ? '1' : '';
}
const RULES = [
  ['OYUN', ['52 kartla 2 ya da 4 kişi oynanır; eşlide karşılıklı oturanlar takımdır. Saatin tersine oynanır, sıradaki oyuncu sağındadır.',
    'Ortaya 4 kart konur: 3\'ü kapalı, en üstteki açık (Vale açılmaz). Herkese 4\'er kart dağıtılır; eller bitince deste bitene kadar yeniden 4\'er dağıtılır.',
    'Destenin altındaki kart açık durur ve son dağıtımda dağıtana gelir. Bir oyuncuya aynı sayıdan 3 kart gelirse dağıtım yenilenir.',
    'Yerdeki en üst kartın aynısını atan ya da Vale atan, yerdeki bütün kartları alır. İlk alan kapalı kartları da alır ve onlara bakabilir.',
    'El bitince yerde kalan kartları en son alan alır.']],
  ['PİŞTİ', ['Yerde tek kart varken aynısını atmak pişti: 10 puan. Vale üstüne Vale: 20 puan.', 'Vale ile başka karta pişti yapılmaz (yalnızca alır). İlk elde kapalı kartlar varken pişti olmaz.']],
  ['PUAN', ['As 1, Vale 1, Sinek 2 (güzel ikili) 2, Karo 10 (güzel onlu) 3 puan; toplam 13.', 'En çok kart alan 3 puan alır; kart sayısı eşitse puanı fazla olan alır.',
    'Belirlenen sayıya (101, 151, 171, 201) ilk ulaşan kazanır. Eşitlikte bir el daha oynanır.']],
  ['BLÖFLÜ', ['Yerde tek açık kart varken kartını KAPALI AT · PİŞTİ DE ile kapalı atıp pişti iddia edebilirsin.',
    'Sıradaki oyuncu inanırsa iddia eden 10 puan alır ve kartlar açılmaz. Açarsa: kartlar eşleşiyorsa iddia eden, eşleşmiyorsa açan 20 puan alır.',
    'Yerdeki kart Vale ise blöf puanları 2 katıdır.']],
];
function showRules() {
  const box = $('ptRulesText'); box.replaceChildren();
  for (const [title, items] of RULES) { box.append(el('h3', null, title)); const ul = el('ul'); items.forEach(x => ul.append(el('li', null, x))); box.append(ul); }
  openModal('ptRulesModal');
}

// ---------- Profil, arkadaşlar, davet (js/social.js) ----------
const authToken = () => localStorage.getItem('okeyAuthToken') || '';
async function showProfile(p) {
  $('bkProfileAvatar').src = avatarSrc(p.avatar); $('bkProfileName').textContent = p.name;
  const stats = $('bkProfileStats'); stats.replaceChildren();
  const stat = (label, value) => { const d = el('div'); d.append(el('b', null, String(value)), el('small', null, label)); stats.append(d); };
  const add = $('bkProfileAdd'), mine = state && state.players[state.me]?.name === p.name;
  add.classList.toggle('hidden', p.isBot || !p.account || mine); add.disabled = false; add.textContent = 'ARKADAŞ EKLE';
  $('bkProfileSub').textContent = p.isBot ? 'Bilgisayar oyuncusu' : p.account ? `Seviye ${p.level || 1}` : 'Misafir oyuncu (hesabı yok)';
  $('bkProfileTreat').classList.toggle('hidden', !!mine);
  $('bkProfileTreat').onclick = () => { closeModal('bkProfileModal'); window.BatakExtras?.openTreat(state.players.indexOf(p)); };
  stat('Bu maçta puan', p.total ?? 0); if (active()) stat('Pişti', p.pistis?.filter(x => x.kind !== 'yakaladi').length || 0);
  openModal('bkProfileModal');
  if (!p.account || p.isBot) return;
  try {
    const r = await fetch('/api/profile?name=' + encodeURIComponent(p.name)).then(x => x.ok ? x.json() : null);
    if (!r) return;
    $('bkProfileSub').textContent = `Seviye ${r.level} · ${Number(r.xp).toLocaleString('tr-TR')} XP`;
    stat('Oyun', r.games); stat('Zafer', r.wins); stat('Çip', Number(r.chips || 0).toLocaleString('tr-TR'));
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
if (window.Social) Social.init({ socket, token: authToken, toast: m => toast(m, true), avatarSrc, buttons: () => [$('bkFriendsBtn')],
  currentRoom: () => session?.code,
  needAccount: () => toast('Arkadaşlar ve davet için lobiden hesabınla giriş yap.'),
  onJoin: (code, game) => {
    if (state && state.phase !== 'waiting' && state.phase !== 'matchEnd' && !confirm('Bu masadan ayrılıp davet edilen masaya geçilsin mi? Yerine bot geçer.')) return;
    try { sessionStorage.setItem('inviteJoin', code); sessionStorage.setItem('inviteGame', game || 'okey'); } catch (_) {}
    socket.emit('pisti:leave');
  } });
$('ptInviteBtn').onclick = () => window.Social ? Social.open(true) : null;
window.BatakExtras?.init({ prefix: 'pisti', socket, toast, getState: () => state, openModal, closeModal,
  slotOf: seat => [...document.querySelectorAll('.bk-slot')].find(s => s.dataset.seat === String(seat)),
  log: text => { $('bkChatLog').append(el('p', 'sys', text)); } });

// ---------- Sohbet ----------
function addChat(m) {
  const log = $('bkChatLog'), p = el('p'); p.append(el('b', null, m.name + ': '), document.createTextNode(m.text));
  log.append(p); log.scrollTop = log.scrollHeight;
  while (log.children.length > 60) log.firstChild.remove();
  if (state && state.players[m.seat]) {
    const box = $(SEAT_ID[posOf(m.seat)]); box.querySelector('.bk-bubble')?.remove();
    const b = el('div', 'bk-bubble', m.text); box.append(b); setTimeout(() => b.remove(), 4500);
  }
  if ($('bkChat').classList.contains('hidden') && m.seat !== state?.me) { chatUnread++; paintChatDot(); }
}
function paintChatDot() {
  const btn = $('bkChatBtn'); let d = btn.querySelector('.dot');
  if (!chatUnread) { d?.remove(); return; }
  if (!d) { d = el('i', 'dot'); btn.append(d); } d.textContent = String(chatUnread);
}
QUICK.forEach(q => { const b = el('button', null, q); b.type = 'button'; b.onclick = () => socket.emit('pisti:chat', { text: q }); $('bkQuick').append(b); });
$('bkChatForm').addEventListener('submit', e => { e.preventDefault(); const v = $('bkChatInput').value.trim(); if (!v) return; socket.emit('pisti:chat', { text: v }); $('bkChatInput').value = ''; });
$('bkChatBtn').onclick = () => { $('bkChat').classList.toggle('hidden'); chatUnread = 0; paintChatDot(); if (!$('bkChat').classList.contains('hidden')) $('bkChatInput').focus(); };
$('bkChatClose').onclick = () => $('bkChat').classList.add('hidden');

// ---------- Düğmeler ----------
const menu = $('ptMenu');
$('ptMenuBtn').onclick = e => { e.stopPropagation(); menu.classList.toggle('hidden'); $('ptMenuBtn').setAttribute('aria-expanded', String(!menu.classList.contains('hidden'))); };
document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.classList.add('hidden'); });
$('ptRulesBtn').onclick = () => { menu.classList.add('hidden'); showRules(); };
$('ptMenuScore').onclick = () => { menu.classList.add('hidden'); showScores(); };
$('ptMenuProfile').onclick = () => { menu.classList.add('hidden'); if (state) showProfile(state.players[state.me]); };
$('ptScoreBtn').onclick = () => (state && active() ? showScores() : toast('Puan tabelası oyun başlayınca açılır.', true));
$('ptSoundBtn').onclick = () => { localStorage.setItem('okeySoundsEnabled', soundOn() ? '0' : '1'); paintSound(); if (soundOn()) sfx.turn(); };
$('ptLeaveBtn').onclick = () => { menu.classList.add('hidden'); if (confirm('Masadan ayrılmak istiyor musun? Oyun sürüyorsa yerine bot geçer.')) socket.emit('pisti:leave'); };
$('ptBluffToggle').onclick = () => { bluffArmed = !bluffArmed; $('ptHand').dataset.sig = ''; renderHand(); if (bluffArmed) toast('Şimdi atacağın kart kapalı gider ve pişti iddia edersin.', true); };
$('ptBelieve').onclick = () => send('pisti:respond', { choice: 'believe' });
$('ptChallenge').onclick = () => send('pisti:respond', { choice: 'challenge' });
$('ptAddBot').onclick = () => socket.emit('pisti:addBot');
$('ptStartBots').onclick = () => socket.emit('pisti:startBots');
$('ptCopyCode').onclick = async () => { try { await navigator.clipboard.writeText(state.code); toast('Masa kodu kopyalandı: ' + state.code, true); } catch { toast('Masa kodu: ' + state?.code, true); } };
addEventListener('keydown', e => { if (e.key === 'Escape') { menu.classList.add('hidden'); closeModal('ptRulesModal'); if (state?.phase !== 'matchEnd') closeModal('ptScoreModal'); } });
paintSound();
