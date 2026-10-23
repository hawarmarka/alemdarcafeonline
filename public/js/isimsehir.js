'use strict';
// İsim Şehir masası (istemci). Sunucu her değişiklikte 'isim:state' ile görüntüyü yollar; burada çizilir.
// Cevaplar yazılırken gecikmeli olarak sunucuya taslak gider (süre dolunca o sayılır). Doğrulama ve puan sunucuda.
// Ortak parçalar: ikram ve sesli sohbet js/batak-extras.js, arkadaşlar js/social.js; görünüm css/batak.css + css/isimsehir.css.
const socket = typeof io === 'function' ? io() : { on() {}, emit() {}, connected: false };
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const QUICK = ['Selam 👋', 'Bol şans!', 'Hadi bakalım!', 'Zor harf geldi 😅', 'Bu kabul mü? 🤔', 'Güzel oyun 👏', 'Tebrikler 🎉', 'Görüşürüz'];
const LETTERS = ['A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'G', 'H', 'I', 'İ', 'K', 'L', 'M', 'N', 'O', 'Ö', 'P', 'R', 'S', 'Ş', 'T', 'U', 'Ü', 'V', 'Y', 'Z'];
let session = null;
try { session = JSON.parse(sessionStorage.getItem('isimsehirSession') || 'null'); } catch (_) {}
if (!session?.code || !(session?.token || session?.watch)) location.replace('/');
const spectating = !!session?.watch;
let state = null, prev = null, chatUnread = 0, draftTimer = null, roundKey = '', finishedSent = false, shownResult = '';
const avatarSrc = a => /^\/api\/avatar\/[\w-]{22}$/.test(a || '') ? a : /^av(0[1-9]|10)\.svg$/.test(a || '') ? '/asset/avatars/' + a : '/asset/avatar-default.svg';
document.addEventListener('error', e => { if (e.target.tagName === 'IMG' && !e.target.src.endsWith('avatar-default.svg')) e.target.src = '/asset/avatar-default.svg'; }, true);
function toast(msg, info = false) { const t = $('bkToast'); t.textContent = msg; t.classList.toggle('info', info); t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3200); }
const teamName = t => `Takım ${t + 1}`;

// ---------- Ses ----------
let audio = null;
const soundOn = () => localStorage.getItem('okeySoundsEnabled') !== '0';
function beep(freq, ms, type = 'sine', gain = .07, slide = 0, delay = 0) {
  if (!soundOn()) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + delay / 1000;
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + ms / 1000);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + ms / 1000);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + ms / 1000);
  } catch (_) {}
}
const sfx = { tick: () => beep(1200, 30, 'square', .02), letter: () => [660, 880].forEach((f, i) => beep(f, 160, 'triangle', .07, 0, i * 110)),
  warn: () => beep(440, 120, 'square', .04), done: () => [523, 659, 784].forEach((f, i) => beep(f, 160, 'triangle', .07, 0, i * 90)), bad: () => beep(180, 160, 'square', .04) };
function paintSound() { $('isSoundWave').classList.toggle('hidden', !soundOn()); $('isSoundOff').classList.toggle('hidden', soundOn()); }

// ---------- Bağlantı ----------
socket.on('connect', () => socket.emit(spectating ? 'isim:watch' : 'isim:rejoin', { code: session.code, token: session.token }));
socket.on('isim:state', s => { prev = state; state = s; render(); });
socket.on('isim:error', d => { sfx.bad(); toast(d.message || 'İşlem yapılamadı.'); if (/bulunamadı|kapandı/.test(d.message || '')) setTimeout(goLobby, 2500); });
socket.on('isim:replaced', () => toast('Masa başka bir sekmede açıldı.'));
socket.on('isim:left', goLobby);
socket.on('isim:chat', m => addChat(m));
socket.on('isim:info', d => toast(d.message, true));
socket.on('disconnect', () => toast('Bağlantı koptu, yeniden bağlanılıyor…', true));
function goLobby() { sessionStorage.removeItem('isimsehirSession'); location.assign('/'); }
const watchBar = (() => {
  const bar = el('div', 'watch-bar hidden'), text = el('span'), exit = el('button', null, 'İZLEMEYİ BIRAK'); exit.type = 'button';
  exit.onclick = () => { socket.emit('isim:unwatch'); goLobby(); };
  bar.append(text, exit); document.body.append(bar);
  if (spectating) document.body.classList.add('spectator');
  return n => { text.textContent = spectating ? `👁 İZLEYİCİ MODU · masa ${session.code}${n > 1 ? ` · ${n} izleyici` : ''}` : `👁 ${n} kişi masanı izliyor`;
    exit.classList.toggle('hidden', !spectating); bar.classList.toggle('hidden', !spectating && !n); };
})();

// ---------- Defter satırları (bir kez kurulur) ----------
const inputs = {};
function buildRows(s) {
  if (Object.keys(inputs).length) return;
  for (const cat of s.categories) {
    const row = el('label', 'is-row'), name = el('span', 'is-cat', s.catNames[cat]), input = el('input');
    input.maxLength = 30; input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('autocapitalize', 'words'); input.setAttribute('aria-label', s.catNames[cat]);
    input.addEventListener('input', () => { scheduleDraft(); paintFinish(); });
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return; e.preventDefault();
      const order = s.categories, next = inputs[order[order.indexOf(cat) + 1]];
      if (next) next.focus(); else if (!$('isFinish').disabled) $('isForm').requestSubmit();
    });
    row.append(name, input, el('i', 'is-ok'));
    inputs[cat] = input; $('isRows').append(row);
  }
}
const myAnswers = () => Object.fromEntries(Object.entries(inputs).map(([c, i]) => [c, i.value.trim()]));
const writing = () => state?.phase === 'writing' && !spectating && !state.players[state.me]?.finished && !finishedSent;
function scheduleDraft() { clearTimeout(draftTimer); draftTimer = setTimeout(() => { if (writing()) socket.emit('isim:answers', { answers: myAnswers() }); }, 450); }
function paintFinish() {
  const all = Object.values(inputs).every(i => i.value.trim());
  $('isFinish').disabled = !writing() || !all;
  for (const [, i] of Object.entries(inputs)) i.parentElement.classList.toggle('filled', !!i.value.trim());
}
$('isForm').addEventListener('submit', e => {
  e.preventDefault(); if ($('isFinish').disabled) return;
  clearTimeout(draftTimer); finishedSent = true;
  socket.emit('isim:finish', { answers: myAnswers() }); sfx.done(); paintInputs();
});

// ---------- Çizim ----------
function render() {
  const s = state;
  buildRows(s);
  $('isRound').textContent = s.phase === 'waiting' ? `${s.size} kişi · ${s.team ? 'eşli' : 'tekli'} · ${s.rounds} tur · ${s.time} sn` : `Tur ${s.round} / ${s.rounds} · ${s.time} sn${s.team ? ' · eşli' : ''}`;
  $('isAi').textContent = s.ai ? '🤖 Yapay zekâ hakem' : '📖 Sözlük hakem';
  $('isAi').title = s.ai ? 'Sözlükte olmayan cevapları yapay zekâ araştırıp doğrular' : 'Cevaplar oyunun sözlüğüyle kontrol edilir';
  const key = `${s.round}:${s.used.length}`;
  if (key !== roundKey && ['letter', 'writing'].includes(s.phase)) { roundKey = key; finishedSent = false; for (const i of Object.values(inputs)) i.value = ''; }
  // Yeniden bağlanınca yazdıklarım sunucudan geri gelir.
  if (s.phase === 'writing' && s.myAnswers && Object.values(inputs).every(i => !i.value)) for (const [c, i] of Object.entries(inputs)) i.value = s.myAnswers[c] || '';
  renderPlayers(); renderLetter(); paintInputs(); renderWait(); renderResult(); runTimer();
  window.BatakExtras?.update(); watchBar(s.watchers || 0);
  const n = $('isNotice'); n.textContent = s.notice || ''; n.classList.toggle('hidden', !s.notice || !['writing'].includes(s.phase));
  $('isJudging').classList.toggle('hidden', s.phase !== 'judging'); $('isJudgingText').textContent = s.notice || 'Cevaplar kontrol ediliyor…';
  if (prev?.phase !== 'writing' && s.phase === 'writing') { sfx.letter(); if (!spectating) setTimeout(() => inputs[s.categories[0]]?.focus(), 60); }
  if (prev && prev.notice !== s.notice && /Son 10 saniye/.test(s.notice || '')) sfx.warn();
}
let playersSig = '';
function renderPlayers() {
  const s = state, box = $('isPlayers');
  const sig = JSON.stringify([s.phase, s.me, s.players]);
  if (sig === playersSig) return; playersSig = sig;
  box.replaceChildren();
  const order = s.players.map((p, i) => i).sort((a, b) => (s.team ? (s.players[a].team ?? 0) - (s.players[b].team ?? 0) : 0) || s.players[b].total - s.players[a].total);
  let lastTeam = null;
  for (const i of order) {
    const p = s.players[i];
    if (s.team && s.phase !== 'waiting' && p.team !== lastTeam) { lastTeam = p.team; box.append(el('div', 'is-team-head', teamName(p.team))); }
    const slot = el('div', 'bk-slot is-slot'); slot.dataset.seat = String(i);
    const pbox = el('div', 'bk-pbox' + (i === s.me ? ' me' : '') + (p.connected ? '' : ' away') + (p.finished ? ' done' : '')); pbox.dataset.seat = String(i);
    const av = el('button', 'pb-av'); av.type = 'button'; av.title = `${p.name} · profili gör`;
    const img = el('img'); img.src = avatarSrc(p.avatar); img.alt = ''; av.append(img, el('span', 'pb-lv', String(p.level || 1)));
    av.onclick = () => showProfile(p, i);
    const main = el('div', 'pb-main'), name = el('div', 'pb-name');
    name.append(document.createTextNode(p.name));
    if (i === s.me) name.append(el('i', 'pb-tag me', 'SEN')); else if (p.isBot) name.append(el('i', 'pb-tag', 'BOT'));
    if (!p.connected) name.append(el('i', 'pb-tag', 'BAĞLANIYOR'));
    const st = el('div', 'is-status');
    if (s.phase === 'writing') st.append(p.finished ? el('b', 'ok', '✓ BİTİRDİ') : el('span', 'typing', `yazıyor… ${p.filled}/5`));
    st.append(el('b', 'pts', `${p.total} puan`));
    main.append(name, st); pbox.append(av, main); slot.append(pbox); box.append(slot);
  }
}
let spin = null;
function renderLetter() {
  const s = state, box = $('isLetter');
  box.classList.toggle('spinning', s.phase === 'letter');
  if (s.phase === 'letter') {
    if (!spin) { let k = 0; spin = setInterval(() => { box.firstChild.textContent = LETTERS[(k++ * 7) % LETTERS.length]; sfx.tick(); }, 90); }
    return;
  }
  clearInterval(spin); spin = null;
  const l = s.letter || '?';
  if (box.firstChild.textContent !== l) { box.firstChild.textContent = l; box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); }
}
function paintInputs() {
  const s = state, w = writing();
  $('isForm').classList.toggle('hidden', ['waiting'].includes(s.phase) || spectating);
  for (const i of Object.values(inputs)) { i.disabled = !w; i.placeholder = s.phase === 'writing' && s.letter ? `${s.letter}…` : ''; }
  const me = s.players[s.me];
  $('isHint').textContent = s.phase === 'letter' ? 'Harf seçiliyor…' : me?.finished || finishedSent ? 'Bitirdin. Diğerleri bekleniyor…'
    : s.phase === 'writing' ? 'Enter ile alttaki satıra geç. Bütün satırlar dolunca BİTİRDİM; diğerlerine 10 saniye kalır.' : '';
  paintFinish();
}
// Süre çubuğu: transform ile tek seferlik animasyon; yazı saniyede 4 kez güncellenir.
let clockTimer = null, lastAnim = '';
function runTimer() {
  const s = state, fill = $('isTimerFill');
  const on = ['writing', 'letter', 'results'].includes(s.phase) && s.remainingMs > 0;
  const total = s.phase === 'writing' ? s.turnMs : s.phase === 'results' ? 14000 : 2600;
  const sig = `${s.phase}:${s.deadline}`;
  if (sig !== lastAnim) {
    lastAnim = sig; fill.getAnimations().forEach(a => a.cancel());
    if (on) fill.animate([{ transform: `scaleX(${Math.min(1, s.remainingMs / total)})` }, { transform: 'scaleX(0)' }], { duration: s.remainingMs, fill: 'forwards' });
    else fill.style.transform = 'scaleX(0)';
  }
  clearInterval(clockTimer);
  const end = Date.now() + s.remainingMs;
  const tick = () => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    $('isTimerText').textContent = on ? (s.phase === 'results' ? `sonraki tur ${left}` : `${left} sn`) : s.phase === 'judging' ? 'hakem' : '--';
    $('isBook').classList.toggle('hurry', s.phase === 'writing' && left <= 10);
    if (s.phase === 'writing' && left <= 5 && left > 0 && left !== tick.last) { tick.last = left; sfx.tick(); }
    if (!left) clearInterval(clockTimer);
  };
  tick(); if (on) clockTimer = setInterval(tick, 250);
}
function renderWait() {
  const s = state, waiting = s.phase === 'waiting';
  $('isWait').classList.toggle('hidden', !waiting);
  if (!waiting) return;
  $('isCode').textContent = s.code;
  const free = s.size - s.players.length;
  $('isWaitText').textContent = s.autoBots ? `${free} koltuk boş · birkaç saniye içinde botlar oturacak`
    : `${s.players.length}/${s.size} oyuncu · ${s.isHost ? 'hazır olunca OYUNU BAŞLAT' : 'masayı açanın başlatması bekleniyor'}${s.team ? ' · eşlide boş koltuklara bot oturur' : ''}`;
  const seats = $('isSeats'); seats.replaceChildren();
  for (let k = 0; k < s.size; k++) {
    const i = s.players.findIndex(p => p.seat === k), p = s.players[i], cell = el('div', 'is-seat' + (i === s.me ? ' me' : ''));
    if (s.team) cell.append(el('small', null, teamName(k % (s.size / 2))));
    if (p) { const img = el('img'); img.src = avatarSrc(p.avatar); img.alt = ''; cell.append(img, el('b', null, p.name)); }
    else { const b = el('button', 'bk-sit', 'OTUR'); b.type = 'button'; b.onclick = () => socket.emit('isim:changeSeat', { seat: k }); cell.append(el('span', null, 'Boş'), b); }
    seats.append(cell);
  }
  $('isHostBtns').classList.toggle('hidden', !s.isHost || s.autoBots);
  $('isStart').disabled = !s.team && s.players.length < 2;
}
function renderResult() {
  const s = state, show = ['results', 'matchEnd'].includes(s.phase) && s.results;
  $('isResult').classList.toggle('hidden', !show);
  if (!show) return;
  const key = `${s.phase}:${s.results.round}`;
  if (shownResult === key) return; shownResult = key;
  const t = $('isTable'); t.replaceChildren();
  const head = el('tr'); head.append(el('th', null, 'OYUNCU'));
  s.categories.forEach(c => head.append(el('th', null, s.catNames[c]))); head.append(el('th', null, 'TUR'), el('th', null, 'TOPLAM')); t.append(head);
  const rows = [...s.results.rows].sort((a, b) => b.total - a.total);
  for (const r of rows) {
    const p = s.players[r.seat], tr = el('tr', r.seat === s.me ? 'me' : '');
    tr.append(el('td', 'who', p?.name || ''));
    for (const c of s.categories) {
      const cell = r.cells[c], td = el('td', 'cell ' + (cell.valid ? 'ok' : cell.text ? 'bad' : 'empty'));
      td.append(el('span', 'ans', cell.valid ? cell.canonical || cell.text : cell.text || '—'));
      td.append(el('b', 'pt', cell.valid ? '+' + cell.pts : '0'));
      if (!cell.valid && cell.text) td.append(el('small', null, cell.reason || 'Geçersiz'));
      if (cell.valid && cell.by === 'ai') td.append(el('small', 'ai', '🤖 doğrulandı'));
      td.title = cell.valid ? (cell.by === 'ai' ? `Yapay zekâ doğruladı${cell.reason ? ': ' + cell.reason : ''}` : 'Sözlükte var') : (cell.reason || '');
      tr.append(td);
    }
    tr.append(el('td', 'sum', '+' + r.total), el('td', 'sum total', String(p?.total ?? 0)));
    t.append(tr);
  }
  if (s.team) {
    const teams = new Map(); s.players.forEach(p => teams.set(p.team, (teams.get(p.team) || 0) + p.total));
    const tr = el('tr', 'teams'); const td = el('td', null, [...teams].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${teamName(k)}: ${v}`).join('   ·   ')); td.colSpan = s.categories.length + 3; tr.append(td); t.append(tr);
  }
  const over = s.phase === 'matchEnd';
  $('isResultTitle').textContent = over ? 'OYUN BİTTİ' : `TUR ${s.results.round} · HARF ${s.results.letter}`;
  const winners = (s.winners || []).map(i => s.players[i]?.name);
  $('isResultNote').textContent = over ? `🏆 Kazanan: ${s.team ? teamName(s.players[s.winners[0]].team) + ' (' + winners.join(' & ') + ')' : winners.join(', ')}`
    : 'Aynı cevap 5, farklı cevap 10, o satırı tek doğru yazan 20 puan alır.';
  const btns = $('isResultBtns'); btns.replaceChildren();
  const mk = (cls, text, fn) => { const b = el('button', 'bk-btn ' + cls, text); b.type = 'button'; b.onclick = fn; btns.append(b); };
  if (over && !spectating) { mk('green', '↻ YENİDEN OYNA', () => socket.emit('isim:rematch')); mk('red', 'LOBİYE DÖN', () => socket.emit('isim:leave')); }
  else if (s.isHost) mk('primary', 'SONRAKİ TUR ›', () => socket.emit('isim:next'));
  if (over) sfx.done();
}

// ---------- Pencereler ----------
const openModal = id => $(id).classList.remove('hidden');
const closeModal = id => $(id).classList.add('hidden');
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
document.querySelectorAll('.bk-modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); }));
function showScores() {
  const s = state; if (!s) return;
  const t = $('isScoreTable'); t.replaceChildren();
  const head = el('tr'); head.append(el('th', null, 'TUR')); s.players.forEach(p => head.append(el('th', null, p.name))); t.append(head);
  for (const h of s.history) { const tr = el('tr'); tr.append(el('td', null, `${h.round} · ${h.letter}`)); h.points.forEach(v => tr.append(el('td', 'pos', '+' + v))); t.append(tr); }
  if (!s.history.length) { const tr = el('tr'); const td = el('td', null, 'Henüz biten tur yok.'); td.colSpan = s.players.length + 1; tr.append(td); t.append(tr); }
  const tot = el('tr', 'total'); tot.append(el('td', null, 'TOPLAM')); s.players.forEach(p => tot.append(el('td', null, String(p.total)))); t.append(tot);
  openModal('isScoreModal');
}
const RULES = [
  ['OYUN', ['Her turda bir harf seçilir (Ğ ve J çıkmaz, aynı harf bir oyunda iki kez gelmez).', 'O harfle başlayan bir İsim, Şehir, Hayvan, Bitki ve Eşya yaz. Türkçe karakter zorunlu değil: "semsiye" de olur.',
    'Bütün satırları ilk dolduran BİTİRDİM der; diğerlerine 10 saniye kalır. Herkes bitirirse tur hemen biter.', 'Şehir: Türkiye\'nin il ve ilçeleri ile dünya şehirleri. Bitki ve hayvanda "elma ağacı" gibi ekler kabul edilir.']],
  ['HAKEM', ['Cevaplar önce oyunun sözlüğünde aranır. Sözlükte olmayan cevabı yapay zekâ araştırır; gerçekten var olan ve kategoriye uyan kelimeyi kabul eder.',
    'Uydurma kelimeler (ör. "yksd"), yanlış harfle başlayanlar ve kategori dışı cevaplar geçersizdir; sonuç tablosunda nedeni yazar.']],
  ['PUAN', ['O satırda doğru cevabı olan tek kişiysen 20 puan.', 'Doğru ve başkalarınınkinden farklıysa 10 puan; başkasıyla aynıysa 5 puan.', 'Boş ya da geçersiz cevap 0 puan. Eşlide takım puanı iki oyuncunun toplamıdır.',
    'Bütün turlar bitince en çok puanı olan (eşlide takım) kazanır.']],
];
function showRules() { const box = $('isRulesText'); box.replaceChildren(); for (const [h, items] of RULES) { box.append(el('h3', null, h)); const ul = el('ul'); items.forEach(x => ul.append(el('li', null, x))); box.append(ul); } openModal('isRulesModal'); }

// ---------- Profil, arkadaşlar, davet ----------
const authToken = () => localStorage.getItem('okeyAuthToken') || '';
async function showProfile(p, i) {
  $('bkProfileAvatar').src = avatarSrc(p.avatar); $('bkProfileName').textContent = p.name;
  const stats = $('bkProfileStats'); stats.replaceChildren();
  const stat = (label, value) => { const d = el('div'); d.append(el('b', null, String(value)), el('small', null, label)); stats.append(d); };
  const add = $('bkProfileAdd'), mine = i === state?.me;
  add.classList.toggle('hidden', p.isBot || !p.account || mine); add.disabled = false; add.textContent = 'ARKADAŞ EKLE';
  $('bkProfileSub').textContent = p.isBot ? 'Bilgisayar oyuncusu' : p.account ? `Seviye ${p.level || 1}` : 'Misafir oyuncu (hesabı yok)';
  $('bkProfileTreat').classList.toggle('hidden', mine || spectating);
  $('bkProfileTreat').onclick = () => { closeModal('bkProfileModal'); window.BatakExtras?.openTreat(i); };
  stat('Bu oyunda puan', p.total ?? 0);
  openModal('bkProfileModal');
  if (!p.account || p.isBot) return;
  try {
    const r = await fetch('/api/profile?name=' + encodeURIComponent(p.name)).then(x => x.ok ? x.json() : null);
    if (!r) return;
    $('bkProfileSub').textContent = `Seviye ${r.level} · ${Number(r.xp).toLocaleString('tr-TR')} XP`;
    stat('Oyun', r.games); stat('Zafer', r.wins);
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
    const out = await res.json(); if (!res.ok) throw Error(out.error || 'İstek gönderilemedi.');
    btn.textContent = out.result === 'accepted' ? 'ARTIK ARKADAŞSINIZ' : 'İSTEK GÖNDERİLDİ';
  } catch (err) { btn.disabled = false; toast(err.message); }
};
if (window.Social) Social.init({ socket, token: authToken, toast: m => toast(m, true), avatarSrc, buttons: () => [$('bkFriendsBtn')], currentRoom: () => session?.code,
  needAccount: () => toast('Arkadaşlar ve davet için lobiden hesabınla giriş yap.'),
  onJoin: (code, game) => {
    if (state && !['waiting', 'matchEnd'].includes(state.phase) && !confirm('Bu masadan ayrılıp davet edilen masaya geçilsin mi? Yerine bot geçer.')) return;
    try { sessionStorage.setItem('inviteJoin', code); sessionStorage.setItem('inviteGame', game || 'okey'); } catch (_) {}
    if (spectating) goLobby(); else socket.emit('isim:leave');
  } });
$('isInviteBtn').onclick = () => window.Social ? Social.open(true) : null;
window.BatakExtras?.init({ prefix: 'isim', socket, toast, getState: () => state, openModal, closeModal,
  slotOf: seat => document.querySelector(`.is-slot[data-seat="${seat}"]`), log: text => { $('bkChatLog').append(el('p', 'sys', text)); } });

// ---------- Sohbet ----------
function addChat(m) {
  const log = $('bkChatLog'), p = el('p'); p.append(el('b', null, m.name + ': '), document.createTextNode(m.text));
  log.append(p); log.scrollTop = log.scrollHeight;
  while (log.children.length > 60) log.firstChild.remove();
  const slot = document.querySelector(`.is-slot[data-seat="${m.seat}"]`);
  if (slot) { slot.querySelector('.bk-bubble')?.remove(); const b = el('div', 'bk-bubble', m.text); slot.append(b); setTimeout(() => b.remove(), 4500); }
  if ($('bkChat').classList.contains('hidden') && m.seat !== state?.me) { chatUnread++; paintChatDot(); }
}
function paintChatDot() { const btn = $('bkChatBtn'); let d = btn.querySelector('.dot'); if (!chatUnread) { d?.remove(); return; } if (!d) { d = el('i', 'dot'); btn.append(d); } d.textContent = String(chatUnread); }
QUICK.forEach(q => { const b = el('button', null, q); b.type = 'button'; b.onclick = () => socket.emit('isim:chat', { text: q }); $('bkQuick').append(b); });
$('bkChatForm').addEventListener('submit', e => { e.preventDefault(); const v = $('bkChatInput').value.trim(); if (!v) return; socket.emit('isim:chat', { text: v }); $('bkChatInput').value = ''; });
$('bkChatBtn').onclick = () => { $('bkChat').classList.toggle('hidden'); chatUnread = 0; paintChatDot(); };
$('bkChatClose').onclick = () => $('bkChat').classList.add('hidden');

// ---------- Düğmeler ----------
const menu = $('isMenu');
$('isMenuBtn').onclick = e => { e.stopPropagation(); menu.classList.toggle('hidden'); };
document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.classList.add('hidden'); });
$('isRulesBtn').onclick = () => { menu.classList.add('hidden'); showRules(); };
$('isMenuScore').onclick = () => { menu.classList.add('hidden'); showScores(); };
$('isMenuProfile').onclick = () => { menu.classList.add('hidden'); if (state?.players[state.me]) showProfile(state.players[state.me], state.me); };
$('isScoreBtn').onclick = showScores;
$('isSoundBtn').onclick = () => { localStorage.setItem('okeySoundsEnabled', soundOn() ? '0' : '1'); paintSound(); };
$('isLeaveBtn').onclick = () => { menu.classList.add('hidden'); if (spectating) return goLobby(); if (confirm('Masadan ayrılmak istiyor musun? Oyun sürüyorsa yerine bot geçer.')) socket.emit('isim:leave'); };
$('isAddBot').onclick = () => socket.emit('isim:addBot');
$('isStart').onclick = () => socket.emit('isim:start');
$('isCopyCode').onclick = async () => { try { await navigator.clipboard.writeText(state.code); toast('Masa kodu kopyalandı: ' + state.code, true); } catch { toast('Masa kodu: ' + state?.code, true); } };
addEventListener('keydown', e => { if (e.key === 'Escape') { menu.classList.add('hidden'); ['isRulesModal', 'isScoreModal'].forEach(closeModal); } });
paintSound();
