'use strict';
const socketAvailable = typeof io === 'function';
const socket = socketAvailable ? io() : {connected:false,on(){return this;},emit(){}};
const $ = id => document.getElementById(id);
let authToken = localStorage.getItem('okeyAuthToken') || '';
let currentUser = null, pendingJoin = null, authMode = 'login';
let selectedAvatar = localStorage.getItem('okeyPlayerAvatar') || 'default.svg';
let selectedFrame = localStorage.getItem('okeyPlayerFrame') || 'gold';
let selectedIstaka = localStorage.getItem('okeyPlayerIstaka') || 'istaka.jpg';
// Hazır avatarlar (sunucudaki Avatars.BUILTIN ile aynı). Eski fotoğraf avatarları kaldırıldı; kayıtlı eski adlar varsayılana döner.
const presetAvatars = Array.from({ length: 10 }, (_, i) => `av${String(i + 1).padStart(2, '0')}.svg`);
// Sunucu yüklenen resimleri /api/avatar/<id> adresiyle gönderir; bulunamazsa varsayılana dönülür.
document.addEventListener('error', e => { if (e.target.tagName === 'IMG' && e.target.src.includes('/api/avatar/')) e.target.src = '/asset/avatar-default.svg'; }, true);
const avatarSrc = a => a?.startsWith('data:image/') || /^\/api\/avatar\/[\w-]{22}$/.test(a || '') ? a : presetAvatars.includes(a) ? '/asset/avatars/' + a : '/asset/avatar-default.svg';
if (!presetAvatars.includes(selectedAvatar) && !selectedAvatar.startsWith('data:image/')) selectedAvatar = 'default.svg';
function toast(message) { const node = $('errorToast'); node.querySelector('.toast-message').textContent = message; node.classList.remove('hidden'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.add('hidden'), 5000); }
async function api(url, body, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken }, ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}) });
  const data = await res.json(); if (!res.ok) throw Error(data.error || 'İşlem başarısız.'); return data;
}
function applyProfile() {
  const avatar = currentUser?.avatar || selectedAvatar;
  $('headerAvatar').src = avatarSrc(avatar); $('previewAvatar').src = avatarSrc(avatar);
  selectedFrame = currentUser?.frame || selectedFrame;
  for (const elem of [$('profileImage'), $('avatarPreviewFrame')]) { elem.className = elem.className.replace(/frame-(gold|silver|royal|emerald|neon|rose)/g, '').trim() + ' frame-' + selectedFrame; }
  document.querySelectorAll('#frameOptions button').forEach(b => b.classList.toggle('selected', b.dataset.frame === selectedFrame));
  $('topUsername').textContent = currentUser?.username || $('playerNameInput').value.trim() || 'Misafir Oyuncu';
  $('headerLevel').textContent = currentUser?.level || 1;
  const xp = currentUser?.xp || 0;
  const level = currentUser?.level || 1;
  const base = 120 * (level - 1) ** 2;
  const next = 120 * level ** 2;
  $('xpLabel').textContent = `${xp - base} / ${next - base} XP`;
  $('xpFill').style.width = Math.max(0, Math.min(100, 100 * (xp - base) / (next - base))) + '%';
  $('headerGames').textContent = currentUser?.games || 0;
  $('headerWins').textContent = currentUser?.wins || 0;
  // Sanal çip: yalnızca hesabı olanlarda; misafir çipsiz oynar.
  $('headerChips').textContent = currentUser ? Number(currentUser.chips || 0).toLocaleString('tr-TR') : 'Misafir';
  paintBonus();
  $('logoutBtn').classList.toggle('hidden', !currentUser);
  $('loginOpenBtn').classList.toggle('hidden', !!currentUser);
  $('registerOpenBtn').classList.toggle('hidden', !!currentUser);
  $('playerNameInput').disabled = !!currentUser;
  $('playerNameInput').value = currentUser?.username || localStorage.getItem('okeyPlayerName') || '';
  $('accountStatus').textContent = currentUser ? '✅ Profilin kayıtlı · Oyun kazan, XP topla!' : 'Misafir hesabının ilerlemesi kaydedilmez.';

}
// Ücretsiz hediye çip düğmesi: hazırsa "TOPLA" (parlar), değilse kalan süre; misafire hesap açmayı önerir.
function paintBonus() {
  const btn = $('bonusBtn'), label = $('bonusLabel'); if (!btn) return;
  if (!currentUser) { label.textContent = 'HESAP AÇ'; btn.classList.remove('ready'); return; }
  const left = (currentUser.nextBonusAt || 0) - Date.now();
  btn.classList.toggle('ready', left <= 0);
  if (left <= 0) { label.textContent = 'TOPLA'; return; }
  const s = Math.ceil(left / 1000), pad = n => String(n).padStart(2, '0');
  label.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
setInterval(paintBonus, 1000);
$('bonusBtn')?.addEventListener('click', async () => {
  if (!currentUser) { toast('Hediye çip ve çip kazanmak için ücretsiz hesap aç.'); return openAuth('register'); }
  try { const r = await api('/api/bonus'); currentUser = r.user; applyProfile(); toast(`🎁 +${r.amount.toLocaleString('tr-TR')} hediye çip!`); }
  catch (err) { toast(err.message); }
});
async function recoverSession() {
  if (authToken) {
    try { currentUser = (await api('/api/me', undefined, 'GET')).user; }
    catch { authToken = ''; localStorage.removeItem('okeyAuthToken'); Social.accountChanged(); }
  }
  applyProfile();
}
// Arkadaşlar ve mesajlar (js/social.js). Davet veya arkadaşın masası: kodla o masaya otur.
const joinRoom = (code, game = 'okey') => {
  if (game === 'batak') return batakJoin('code', { code });
  if (game === 'pisti') return pistiJoin('code', { code });
  if (game === 'isimsehir') return isimJoin('code', { code });
  $('roomCodeInput').value = code; start('code');
};
// Canlı izleme: masa sayfası izleyici oturumuyla açılır (koltuk yok, el yok).
function watchTable(code, game = 'okey') {
  code = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return toast('İzlemek için 6 karakterli masa kodunu yaz.');
  const page = { okey: '/game', batak: '/batak', pisti: '/pisti', isimsehir: '/isim-sehir' }[game] || '/game';
  if (game === 'okey') sessionStorage.setItem('okeySession', JSON.stringify({ roomCode: code, watch: true }));
  else sessionStorage.setItem(`${game}Session`, JSON.stringify({ code, watch: true }));
  if (window.AlemdarTransition) AlemdarTransition.leaveTo(page); else location.assign(page);
}
Social.init({ socket, token: () => authToken, toast, avatarSrc, onJoin: joinRoom, onWatch: watchTable,
  buttons: () => [$('friendsBtn')].filter(Boolean),
  needAccount: () => { toast('Arkadaş eklemek ve mesajlaşmak için ücretsiz hesap aç.'); openAuth('register'); } });
function showModal(id) { $(id).classList.remove('hidden'); }
function hideModal(id) { $(id).classList.add('hidden'); }
document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => hideModal(el.dataset.close)));
document.querySelectorAll('.premium-modal').forEach(el => el.addEventListener('click', e => { if (e.target === el) hideModal(el.id); }));
function openAuth(mode) {
  authMode = mode; $('authTitle').textContent = mode === 'login' ? 'Hesabına Giriş Yap' : 'Ücretsiz Hesap Oluştur';
  $('authSubmit').textContent = mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol';
  $('authSwitch').textContent = mode === 'login' ? 'Hesabın yok mu? Kayıt ol' : 'Hesabın var mı? Giriş yap';
  $('authPassword').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  showModal('authModal');
}
$('loginOpenBtn').onclick = () => openAuth('login');
$('registerOpenBtn').onclick = () => openAuth('register');
$('profileOpenBtn').onclick = () => showModal('settingsModal');
$('authSwitch').onclick = () => openAuth(authMode === 'login' ? 'register' : 'login');
$('authForm').onsubmit = async e => {
  e.preventDefault();
  $('authSubmit').disabled = true;
  try {
    const payload = { username: $('authName').value.trim(), password: $('authPassword').value };
    const data = await api(authMode === 'register' ? '/api/register' : '/api/login', payload);
    authToken = data.token; localStorage.setItem('okeyAuthToken', authToken);
    currentUser = data.user; applyProfile(); hideModal('authModal'); toast('Hoş geldin ' + currentUser.username + '!');
    Social.accountChanged();
  } catch (err) { toast(err.message); }
  finally { $('authSubmit').disabled = false; }
};
$('logoutBtn').onclick = async () => {
  try { await api('/api/logout'); } catch (_) {}
  authToken = ''; currentUser = null; localStorage.removeItem('okeyAuthToken'); applyProfile(); toast('Hesaptan çıkış yapıldı.');
  Social.accountChanged();
};
$('playerNameInput').addEventListener('input', () => { localStorage.setItem('okeyPlayerName', $('playerNameInput').value); applyProfileNameOnly(); });
function applyProfileNameOnly() { if (!currentUser) $('topUsername').textContent = $('playerNameInput').value.trim() || 'Misafir Oyuncu'; }
$('profileImage').onclick = () => showModal('avatarModal');
$('sidebarAvatarBtn').onclick = () => showModal('avatarModal');
document.querySelectorAll('#frameOptions button').forEach(btn => btn.onclick = async () => {
  const frame = btn.dataset.frame;
  try {
    if (currentUser) currentUser = (await api('/api/frame', {frame})).user;
    else { selectedFrame = frame; localStorage.setItem('okeyPlayerFrame', frame); }
    applyProfile();
  } catch (err) { toast(err.message); }
});
$('avatarUpload').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) return toast('En fazla 5 MB JPG/PNG/WEBP seç.');
  try {
    const picture = await createImageBitmap(file);
    const scale = Math.min(1, 180 / Math.max(picture.width, picture.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(picture.width * scale)); canvas.height = Math.max(1, Math.round(picture.height * scale));
    const ctx = canvas.getContext('2d'); ctx.drawImage(picture, 0, 0, canvas.width, canvas.height); picture.close?.();
    const avatar = canvas.toDataURL('image/jpeg', .76);
    if (currentUser) currentUser = (await api('/api/avatar', { avatar })).user;
    else { selectedAvatar = avatar; localStorage.setItem('okeyPlayerAvatar', avatar); }
    applyProfile(); toast('Profil fotoğrafı kaydedildi.');
  } catch (err) { toast('Fotoğraf yüklenemedi: ' + err.message); }
  e.target.value = '';
};
// Hazır avatar seçimi (profil penceresi): hesaplıysa sunucuya, misafirse tarayıcıya kaydedilir.
(function presetAvatarPicker() {
  const box = $('avatarOptions'); if (!box) return;
  const paint = () => box.querySelectorAll('button').forEach(b => b.classList.toggle('selected', b.dataset.avatar === (currentUser?.avatar || selectedAvatar)));
  for (const name of presetAvatars) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.avatar = name; b.title = 'Bu avatarı seç';
    const img = document.createElement('img'); img.src = '/asset/avatars/' + name; img.alt = ''; b.append(img);
    b.addEventListener('click', async () => {
      try {
        if (currentUser) currentUser = (await api('/api/avatar', { avatar: name })).user;
        else { selectedAvatar = name; localStorage.setItem('okeyPlayerAvatar', name); }
        applyProfile(); paint();
      } catch (err) { toast(err.message); }
    });
    box.append(b);
  }
  paint();
  $('avatarModal')?.addEventListener('click', paint, true);
})();
document.querySelectorAll('.rack-options button').forEach(btn => btn.onclick = () => {
  selectedIstaka = btn.dataset.istaka; localStorage.setItem('okeyPlayerIstaka', selectedIstaka);
  document.querySelectorAll('.rack-options button').forEach(b => b.classList.toggle('selected', b === btn));
});
document.querySelectorAll('.rack-options button').forEach(b => b.classList.toggle('selected', b.dataset.istaka === selectedIstaka));
const modes = { klasik: { stackingMode: false, assisted: true }, katlamali: { stackingMode: true, assisted: true }, yardimli: { stackingMode: false, assisted: true }, yardimsiz: { stackingMode: false, assisted: false } };
function start(mode, modeKey = 'klasik', extra = {}) {
  if (!socketAvailable || !socket.connected) return toast('Oyun sunucusuna bağlanılamadı. Uygulamayı npm start ile çalıştırın ve bağlantınızı kontrol edin.');
  if (pendingJoin) return;
  const playerName = currentUser?.username || $('playerNameInput').value.trim() || 'Oyuncu' + Math.floor(10000 + Math.random() * 89999);
  const roomCode = $('roomCodeInput').value.trim().toUpperCase();
  if (mode === 'code' && !/^[A-Z0-9]{6}$/.test(roomCode)) return toast('6 karakterli geçerli bir oda kodu gir.');
  const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  const setting = mode === 'create' ? {stackingMode: $('roomStack').value === 'true', assisted: $('roomAssist').value === 'true'} : (modes[modeKey] || modes.klasik);
  // Masa bahsi: Masa Aç'ta seçilen; HEMEN OYNA en düşük bahisli masaya (1.000 çip) oturur.
  const bet = mode === 'create' ? Number($('roomBet').value) || 1000 : 1000;
  pendingJoin = { mode, modeKey, ...setting, bet, playerName, token, roomCode, seat: Number.isInteger(extra.seat) ? extra.seat : undefined, isPublic: mode === 'create' ? createPublic : undefined,
    authToken, avatar: currentUser?.avatar || selectedAvatar,
    frame: currentUser?.frame || selectedFrame, roundLimit: Number($('roundLimit').value), teamMode: mode === 'create' && $('roomTeam').value === 'takim', penaltyMode: mode === 'create' ? $('penaltyModeToggle').checked : true };
  localStorage.setItem('okeyPlayerName', playerName);
  sessionStorage.setItem('selectedIstaka', selectedIstaka);
  sessionStorage.removeItem('okeySession');
  document.querySelectorAll('.join-mode, #randomJoinBtn, #createRoomBtn, #joinCodeBtn, #confirmCreateBtn').forEach(b => b.disabled = true);
  socket.emit('joinGame', pendingJoin);
}
function reenable() {
  pendingJoin = null;
  document.querySelectorAll('.join-mode, #randomJoinBtn, #createRoomBtn, #joinCodeBtn, #confirmCreateBtn').forEach(b => b.disabled = false);
}
document.querySelectorAll('.join-mode').forEach(btn => btn.onclick = () => start('random', btn.dataset.mode));
// ODA SEÇ: bekleyen masalar tek tek, oval masa üstünde 4 koltukla gösterilir. Boş koltuğa OTUR ile o koltuğa oturulur.
// Pencere açıkken liste 4 sn'de bir tazelenir; gösterilen masa (kodla) korunur.
// Okey ve Batak ortak: tp.game hangi oyunun masalarının gösterildiğini söyler (kaynak, süzgeç, kurallar, katılma farklı).
const tp = { list: [], code: null, filter: 'all', timer: null, game: 'okey' };
const TP_SEAT_CLASS = ['s-bottom', 's-right', 's-top', 's-left']; // sunucudaki koltuk sırası
const TP_FILTERS = { okey: [['all', 'TÜMÜ'], ['tek', 'TEK'], ['esli', 'EŞLİ'], ['katlamali', 'KATLAMALI'], ['yardimsiz', 'YARDIMSIZ']],
  batak: [['all', 'TÜMÜ'], ['ihaleli', 'İHALELİ'], ['kozmaca', 'KOZ MAÇA'], ['esli', 'EŞLİ']],
  pisti: [['all', 'TÜMÜ'], ['ikili', '2 KİŞİ'], ['dortlu', '4 KİŞİ'], ['esli', 'EŞLİ'], ['blof', 'BLÖFLÜ']],
  isimsehir: [['all', 'TÜMÜ'], ['tek', 'TEKLİ'], ['esli', 'EŞLİ'], ['kucuk', '2–4 KİŞİ'], ['buyuk', '6–10 KİŞİ']] };
const BATAK_TYPE_NAME = { ihaleli: 'İhaleli', kozmaca: 'Koz Maça', esli: 'Eşli' };
const PISTI_TYPE_NAME = { ikili: '2 Kişi', dortlu: '4 Kişi', esli: 'Eşli' };
const tpMatch = r => tp.filter === 'all' || (tp.game === 'batak' ? r.type === tp.filter
  : tp.game === 'pisti' ? (tp.filter === 'blof' ? r.bluff : r.type === tp.filter)
  : tp.game === 'isimsehir' ? ({ tek: !r.team, esli: r.team, kucuk: r.size <= 4, buyuk: r.size >= 6 })[tp.filter]
  : (tp.filter === 'tek' && !r.teamMode) || (tp.filter === 'esli' && r.teamMode) || (tp.filter === 'katlamali' && r.stackingMode) || (tp.filter === 'yardimsiz' && !r.assisted));
function tpVisible() { return tp.list.filter(tpMatch); }
function tpPaint() {
  const list = tpVisible(), box = $('tpTable');
  let i = Math.max(0, list.findIndex(r => r.code === tp.code));
  const room = list[i]; tp.code = room?.code || null;
  $('tpPrev').disabled = $('tpNext').disabled = list.length < 2;
  box.replaceChildren();
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  if (!room) {
    box.append(el('p', 'tp-empty', 'Şu an bekleyen masa yok. MASA AÇ ile kendi masanı kur ya da HEMEN OYNA ile hemen eşleş.'));
    $('tpCount').textContent = ''; return;
  }
  const rules = el('div', 'tp-rules');
  if (tp.game === 'batak') {
    box.classList.add('batak');
    rules.append(el('span', 'wide g', 'BATAK'), el('span', null, BATAK_TYPE_NAME[room.type] || room.type), el('span', null, `${room.rounds} El`));
  } else if (tp.game === 'isimsehir') {
    box.classList.add('batak');
    rules.append(el('span', 'wide g', 'İSİM ŞEHİR'), el('span', null, `${room.size} Kişi`), el('span', null, room.team ? 'Eşli' : 'Tekli'), el('span', null, `${room.rounds} Tur · ${room.time} sn`));
  } else if (tp.game === 'pisti') {
    box.classList.add('batak');
    rules.append(el('span', 'wide g', 'PİŞTİ'), el('span', null, PISTI_TYPE_NAME[room.type] || room.type), el('span', null, `${room.target}'e`),
      el('span', 'wide ' + (room.bluff ? 'r' : ''), room.bluff ? 'Blöflü' : 'Blöfsüz'));
  } else {
    box.classList.remove('batak');
    box.append(el('div', 'tp-bet', `🪙 ${Number(room.bet || 1000).toLocaleString('tr-TR')}`));
    rules.append(el('span', null, room.teamMode ? 'Eşli' : 'Tek'), el('span', null, `${room.roundLimit || 4} El`),
      el('span', 'wide ' + (room.assisted ? 'g' : ''), room.assisted ? 'Yardımlı' : 'Yardımsız'),
      el('span', 'wide ' + (room.stackingMode ? 'r' : ''), room.stackingMode ? 'Katlamalı' : 'Katlamasız'));
  }
  box.append(rules);
  // İsim Şehir: 2–10 koltuk ızgarada; diğer oyunlar oval masada 4 koltuk.
  const many = (room.seats || []).length > 4, seatBox = many ? el('div', 'tp-seats') : box;
  box.classList.toggle('grid', many); if (many) box.append(seatBox);
  (room.seats || []).forEach((p, s) => {
    if (room.valid && !room.valid.includes(s)) return; // 2 kişilik Pişti: yalnızca karşılıklı koltuklar
    const seat = el('div', 'tp-seat ' + (many ? '' : TP_SEAT_CLASS[s]));
    if (p) {
      const img = el('img'); img.src = avatarSrc(p.avatar); img.alt = '';
      seat.append(img, el('b', null, (p.isBot ? '🤖 ' : '') + p.name));
    } else {
      const b = el('button', 'tp-sit', 'OTUR'); b.type = 'button';
      b.addEventListener('click', () => {
        hideModal('modeListModal');
        if (tp.game === 'batak') return batakJoin('code', { code: room.code, seat: s });
        if (tp.game === 'pisti') return pistiJoin('code', { code: room.code, seat: s });
        if (tp.game === 'isimsehir') return isimJoin('code', { code: room.code, seat: s });
        $('roomCodeInput').value = room.code; start('code', 'klasik', { seat: s });
      });
      seat.append(b);
    }
    seatBox.append(seat);
  });
  $('tpCount').textContent = `Masa ${i + 1} / ${list.length} · ${room.host ? room.host + ' · ' : ''}${room.code}`;
}
async function tpLoad() {
  try { tp.list = (await api({ batak: '/api/batak', pisti: '/api/pisti', isimsehir: '/api/isimsehir' }[tp.game] || '/api/rooms', null, 'GET')).waiting || []; } catch (e) { toast(e.message); }
  tpPaint();
}
function tpStep(d) {
  const list = tpVisible(); if (!list.length) return;
  const i = Math.max(0, list.findIndex(r => r.code === tp.code));
  tp.code = list[(i + d + list.length) % list.length].code; tpPaint();
}
async function showRoomList(game = 'okey') {
  tp.game = game; tp.filter = 'all'; tp.code = null;
  $('modeListTitle').textContent = { batak: 'BATAK · MASA SEÇ', pisti: 'PİŞTİ · MASA SEÇ', isimsehir: 'İSİM ŞEHİR · MASA SEÇ' }[game] || 'ODA SEÇ';
  const f = $('tpFilter'); f.replaceChildren();
  for (const [key, label] of TP_FILTERS[game]) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.f = key; b.textContent = label; b.classList.toggle('on', key === 'all');
    b.addEventListener('click', () => { tp.filter = key; tp.code = null; f.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); tpPaint(); });
    f.append(b);
  }
  showModal('modeListModal');
  await tpLoad();
  clearInterval(tp.timer);
  tp.timer = setInterval(() => { if ($('modeListModal').classList.contains('hidden')) clearInterval(tp.timer); else tpLoad(); }, 4000);
}
$('tpPrev').onclick = () => tpStep(-1);
$('tpNext').onclick = () => tpStep(1);
$('tpCreate').onclick = () => { hideModal('modeListModal'); if (tp.game === 'batak') showModal('batakModal'); else if (tp.game === 'pisti') showModal('pistiModal'); else if (tp.game === 'isimsehir') showModal('isimModal'); else openCreate(true); };
addEventListener('keydown', e => { if ($('modeListModal').classList.contains('hidden')) return; if (e.key === 'ArrowLeft') tpStep(-1); if (e.key === 'ArrowRight') tpStep(1); });
document.querySelectorAll('.select-mode').forEach(btn => btn.onclick = () => showRoomList());
$('modeAutoJoinBtn').onclick = () => { hideModal('modeListModal'); if (tp.game === 'batak') batakJoin('quick'); else if (tp.game === 'pisti') pistiJoin('quick'); else if (tp.game === 'isimsehir') isimJoin('quick'); else start('random', quickMode()); };
$('randomJoinBtn').onclick = () => start('random', quickMode());
// MASA AÇ: KLASİK kartında herkese açık (Oda Seç listesinde), ÖZEL kartında yalnızca kodla katılınan masa
let createPublic = true;
function openCreate(isPublic) {
  createPublic = isPublic;
  $('roomTitle').textContent = isPublic ? 'MASA AÇ' : 'ÖZEL MASA AÇ';
  $('roomSubtitle').textContent = isPublic ? 'Masa herkese açık olur, Oda Seç listesinde görünür' : 'Yalnızca masa kodunu verdiğin arkadaşların katılabilir';
  showModal('roomModal');
}
$('createRoomBtn').onclick = () => openCreate(true);
$('privateOptionsBtn').onclick = () => { showModal('codeModal'); setTimeout(() => $('codeModalInput').focus(), 50); };
$('confirmCreateBtn').onclick = () => { hideModal('roomModal'); start('create', $('roomStack').value === 'true' ? 'katlamali' : ($('roomAssist').value === 'true' ? 'klasik' : 'yardimsiz')); };
$('joinCodeBtn').onclick = () => start('code');
$('roomCodeInput').oninput = e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
$('roomCodeInput').onkeydown = e => { if (e.key === 'Enter') start('code'); };
socket.on('joinedGame', data => {
  if (!pendingJoin) return;
  sessionStorage.setItem('okeySession', JSON.stringify({ roomCode: data.code, token: pendingJoin.token, playerName: pendingJoin.playerName }));
  // Okey Plus gibi: ekranı taşlar kaplar, masa açılınca dağılır
  if (window.AlemdarTransition) AlemdarTransition.leaveTo('/game'); else window.location.assign('/game');
});
socket.on('gameError', data => { reenable(); toast(data.message || 'Odaya katılınamadı.'); });
socket.on('disconnect', () => { if (pendingJoin) { reenable(); toast('Sunucuyla bağlantı kesildi.'); } });
async function loadRoomCounts() {
  try { const data = await api('/api/rooms', null, 'GET');
    Object.entries(data.modes).forEach(([mode, stats]) => { const el = document.querySelector(`[data-count="${mode}"]`); if (el) el.textContent = stats.players.toLocaleString('tr-TR'); });
    if ($('onlineCount')) $('onlineCount').textContent = Number(data.online || 0).toLocaleString('tr-TR');
  } catch (_) {}
}
recoverSession(); loadRoomCounts(); setInterval(loadRoomCounts, 15000);

// Oyun sonundaki "YENİ OYUNA BAŞLA": aynı modda yeni masaya otomatik katıl.
(function autoJoinAfterMatch() {
  let mode = null, invite = null;
  try { mode = sessionStorage.getItem('autoJoinMode'); sessionStorage.removeItem('autoJoinMode'); } catch {}
  // Masadayken kabul edilen davet: masa sayfası ayrılıp buraya döner, davet edilen masaya oturulur.
  let inviteGame = 'okey';
  try { invite = sessionStorage.getItem('inviteJoin'); inviteGame = sessionStorage.getItem('inviteGame') || 'okey'; sessionStorage.removeItem('inviteJoin'); sessionStorage.removeItem('inviteGame'); } catch {}
  if ((!mode && !invite) || !socketAvailable) return;
  const go = () => invite ? joinRoom(invite, inviteGame) : start('random', mode);
  if (socket.connected) go(); else socket.on('connect', function once() { socket.off?.('connect', once); go(); });
})();

// ================= Batak =================
// Masaya oturunca /batak sayfasına geçilir; oyuncu jetonu sessionStorage'da (sayfa yenilenince aynı koltuğa döner).
let batakPending = false;
const BATAK_NOTES = { ihaleli: 'İhale en az 5; kimse girmezse dağıtanın sağındaki 4 el almak zorunda. İhaleyi alan kozu seçer.',
  kozmaca: 'Koz her zaman maça. Herkes kaç el alacağını söyler; 0 = el almaz (tutarsa +50, tutmazsa −50).',
  esli: 'Karşılıklı oturanlar takım. İhale en az 8; kimse girmezse dağıtan 7 almak zorunda. İhaleyi alanın eşi kartlarını açar.' };
// extra: { code } (davet, masa gezgini) ve { seat } (masa gezgininde seçilen koltuk).
function batakJoin(mode, extra = {}) {
  if (!socket.connected) return toast('Oyun sunucusuna bağlanılamadı.');
  if (batakPending) return;
  const code = (extra.code || $('batakCodeInput').value).trim().toUpperCase();
  if (mode === 'code' && !/^[A-Z0-9]{6}$/.test(code)) return toast('6 karakterli Batak masa kodunu yaz.');
  const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  batakPending = { token };
  socket.emit('batak:join', { mode, code, token, seat: Number.isInteger(extra.seat) ? extra.seat : undefined, isPublic: extra.isPublic === true, type: $('batakType').value, rounds: Number($('batakRounds').value), authToken,
    playerName: currentUser?.username || $('playerNameInput').value.trim() || 'Oyuncu' + Math.floor(10000 + Math.random() * 89999),
    avatar: currentUser?.avatar || selectedAvatar });
  setTimeout(() => { batakPending = false; }, 5000);
}
socket.on('batak:joined', d => {
  if (!batakPending) return;
  sessionStorage.setItem('batakSession', JSON.stringify({ code: d.code, token: batakPending.token }));
  if (window.AlemdarTransition) AlemdarTransition.leaveTo('/batak'); else location.assign('/batak');
});
socket.on('batak:error', d => { batakPending = false; toast(d.message || 'Batak masasına katılınamadı.'); });
$('batakQuickBtn')?.addEventListener('click', () => showRoomList('batak'));
$('batakOpenBtn')?.addEventListener('click', () => showModal('batakModal'));
$('batakPlayBtn')?.addEventListener('click', () => { hideModal('batakModal'); batakJoin('quick'); });
$('batakPrivateBtn')?.addEventListener('click', () => { hideModal('batakModal'); batakJoin('create'); });
$('batakPublicBtn')?.addEventListener('click', () => { hideModal('batakModal'); batakJoin('create', { isPublic: true }); });
$('batakCodeBtn')?.addEventListener('click', () => batakJoin('code'));
$('batakWatchBtn')?.addEventListener('click', () => watchTable($('batakCodeInput').value, 'batak'));
$('batakCodeInput')?.addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
document.querySelectorAll('[data-target=batakType] button').forEach(b => b.addEventListener('click', () => { $('batakRuleNote').textContent = BATAK_NOTES[b.dataset.value]; }));
async function loadBatakCount() { try { const r = await api('/api/batak', null, 'GET'); if ($('batakCount')) $('batakCount').textContent = r.players.toLocaleString('tr-TR'); } catch (_) {} }
loadBatakCount(); setInterval(loadBatakCount, 15000);

// ================= Pişti =================
// Batak ile aynı akış: masaya oturunca /pisti sayfasına geçilir; oyuncu jetonu sessionStorage'da.
let pistiPending = false;
const PISTI_NOTES = { ikili: 'İki kişi karşılıklı oynar. Yerdeki kartın aynısı ya da Vale yerdekileri alır; tek karta aynısı PİŞTİ (10), Vale\'ye Vale 20 puan.',
  dortlu: 'Dört kişi, herkes kendi için oynar. En çok kart toplayan 3 puan alır.',
  esli: 'Karşılıklı oturanlar takım; aldığınız kartlar ve piştiler birlikte sayılır.' };
function pistiJoin(mode, extra = {}) {
  if (!socket.connected) return toast('Oyun sunucusuna bağlanılamadı.');
  if (pistiPending) return;
  const code = (extra.code || $('pistiCodeInput').value).trim().toUpperCase();
  if (mode === 'code' && !/^[A-Z0-9]{6}$/.test(code)) return toast('6 karakterli Pişti masa kodunu yaz.');
  const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  pistiPending = { token };
  socket.emit('pisti:join', { mode, code, token, seat: Number.isInteger(extra.seat) ? extra.seat : undefined, isPublic: extra.isPublic === true,
    type: $('pistiType').value, target: Number($('pistiTarget').value), bluff: $('pistiBluff').value === 'true', authToken,
    playerName: currentUser?.username || $('playerNameInput').value.trim() || 'Oyuncu' + Math.floor(10000 + Math.random() * 89999),
    avatar: currentUser?.avatar || selectedAvatar });
  setTimeout(() => { pistiPending = false; }, 5000);
}
socket.on('pisti:joined', d => {
  if (!pistiPending) return;
  sessionStorage.setItem('pistiSession', JSON.stringify({ code: d.code, token: pistiPending.token }));
  if (window.AlemdarTransition) AlemdarTransition.leaveTo('/pisti'); else location.assign('/pisti');
});
socket.on('pisti:error', d => { pistiPending = false; toast(d.message || 'Pişti masasına katılınamadı.'); });
$('pistiQuickBtn')?.addEventListener('click', () => showRoomList('pisti'));
$('pistiOpenBtn')?.addEventListener('click', () => showModal('pistiModal'));
$('pistiPlayBtn')?.addEventListener('click', () => { hideModal('pistiModal'); pistiJoin('quick'); });
$('pistiPrivateBtn')?.addEventListener('click', () => { hideModal('pistiModal'); pistiJoin('create'); });
$('pistiPublicBtn')?.addEventListener('click', () => { hideModal('pistiModal'); pistiJoin('create', { isPublic: true }); });
$('pistiCodeBtn')?.addEventListener('click', () => pistiJoin('code'));
$('pistiWatchBtn')?.addEventListener('click', () => watchTable($('pistiCodeInput').value, 'pisti'));
$('pistiCodeInput')?.addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
document.querySelectorAll('[data-target=pistiType] button').forEach(b => b.addEventListener('click', () => { $('pistiRuleNote').textContent = PISTI_NOTES[b.dataset.value]; }));
// ================= İsim Şehir (EKSTRA) =================
let isimPending = false;
function isimJoin(mode, extra = {}) {
  if (!socket.connected) return toast('Oyun sunucusuna bağlanılamadı.');
  if (isimPending) return;
  const code = (extra.code || $('isimCodeInput').value).trim().toUpperCase();
  if (mode === 'code' && !/^[A-Z0-9]{6}$/.test(code)) return toast('6 karakterli İsim Şehir masa kodunu yaz.');
  const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  isimPending = { token };
  socket.emit('isim:join', { mode, code, token, seat: Number.isInteger(extra.seat) ? extra.seat : undefined, isPublic: extra.isPublic === true,
    size: Number($('isimSize').value), team: $('isimTeam').value === 'true', rounds: Number($('isimRounds').value), time: Number($('isimTime').value), authToken,
    playerName: currentUser?.username || $('playerNameInput').value.trim() || 'Oyuncu' + Math.floor(10000 + Math.random() * 89999),
    avatar: currentUser?.avatar || selectedAvatar });
  setTimeout(() => { isimPending = false; }, 5000);
}
socket.on('isim:joined', d => {
  if (!isimPending) return;
  sessionStorage.setItem('isimsehirSession', JSON.stringify({ code: d.code, token: isimPending.token }));
  if (window.AlemdarTransition) AlemdarTransition.leaveTo('/isim-sehir'); else location.assign('/isim-sehir');
});
socket.on('isim:error', d => { isimPending = false; toast(d.message || 'İsim Şehir masasına katılınamadı.'); });
$('isimQuickBtn')?.addEventListener('click', () => showRoomList('isimsehir'));
$('isimOpenBtn')?.addEventListener('click', () => showModal('isimModal'));
$('isimPlayBtn')?.addEventListener('click', () => { hideModal('isimModal'); isimJoin('quick'); });
$('isimPrivateBtn')?.addEventListener('click', () => { hideModal('isimModal'); isimJoin('create'); });
$('isimPublicBtn')?.addEventListener('click', () => { hideModal('isimModal'); isimJoin('create', { isPublic: true }); });
$('isimCodeBtn')?.addEventListener('click', () => isimJoin('code'));
$('isimWatchBtn')?.addEventListener('click', () => watchTable($('isimCodeInput').value, 'isimsehir'));
$('isimCodeInput')?.addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
// Eşli yalnızca 4 kişi ve üstünde.
document.querySelectorAll('[data-target=isimSize] button').forEach(b => b.addEventListener('click', () => { if (b.dataset.value === '2' && $('isimTeam').value === 'true') document.querySelector('[data-target=isimTeam] [data-value=false]')?.click(); }));
document.querySelectorAll('[data-target=isimTeam] button').forEach(b => b.addEventListener('click', () => { if (b.dataset.value === 'true' && $('isimSize').value === '2') document.querySelector('[data-target=isimSize] [data-value="4"]')?.click(); }));
async function loadIsimCount() { try { const r = await api('/api/isimsehir', null, 'GET'); if ($('isimCount')) $('isimCount').textContent = r.players.toLocaleString('tr-TR'); } catch (_) {} }
loadIsimCount(); setInterval(loadIsimCount, 15000);

async function loadPistiCount() { try { const r = await api('/api/pisti', null, 'GET'); if ($('pistiCount')) $('pistiCount').textContent = r.players.toLocaleString('tr-TR'); } catch (_) {} }
loadPistiCount(); setInterval(loadPistiCount, 15000);

// ================= Okey Plus düzeni: lobi ekleri =================
// Lobi sahnesini (1600×735) ekrana sığdır
(function fitLobby() {
  const stage = $('lobbyStage'); if (!stage) return;
  const fit = () => { const s = Math.min(innerWidth / 1600, innerHeight / 735); stage.style.setProperty('--s', String(s)); };
  addEventListener('resize', fit, { passive: true }); fit();
})();
// Ek düğmeler
$('profileEditBtn')?.addEventListener('click', () => showModal('avatarModal'));
$('createRoomBtn2')?.addEventListener('click', () => openCreate(false));
$('rulesBannerBtn')?.addEventListener('click', () => showModal('rulesModal'));
// ÖZEL ODA SEÇ: kodla katıl
$('codeModalInput').oninput = e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
// Kodla katıl / izle: kodun hangi oyunun masası olduğunu sunucu söyler (okey, Batak, Pişti, İsim Şehir).
async function gameOfCode(code) {
  try { return (await api('/api/where?code=' + encodeURIComponent(code), null, 'GET')).game; } catch (_) { return null; }
}
const joinByCode = async () => {
  const code = $('codeModalInput').value.trim().toUpperCase(), game = await gameOfCode(code);
  if (!game) return toast('Bu kodda açık masa bulunamadı.');
  hideModal('codeModal');
  if (game === 'okey') { $('roomCodeInput').value = code; start('code'); } else joinRoom(code, game);
};
$('codeModalJoin').onclick = joinByCode;
$('codeModalWatch').onclick = async () => {
  const code = $('codeModalInput').value.trim().toUpperCase(), game = await gameOfCode(code);
  if (!game) return toast('Bu kodda izlenecek masa bulunamadı.');
  hideModal('codeModal'); watchTable(code, game);
};
$('codeModalInput').onkeydown = e => { if (e.key === 'Enter') joinByCode(); };
// Masa Aç seçenekleri: segmentli düğmeler gizli form alanlarını günceller
document.querySelectorAll('.seg').forEach(seg => {
  const target = $(seg.dataset.target);
  const read = () => target.type === 'checkbox' ? String(target.checked) : target.value;
  const paint = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.value === read()));
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    if (target.type === 'checkbox') target.checked = b.dataset.value === 'true'; else target.value = b.dataset.value;
    paint();
  }));
  paint();
});
// Oyun kartları: farenle sürükleyerek veya tekerlekle sağa sola kaydır
(function dragScroll() {
  const el = $('lbCards'); if (!el) return;
  let down = null, moved = false;
  el.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = { x: e.clientX, left: el.scrollLeft }; moved = false; });
  addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - down.x; if (Math.abs(dx) > 6) { moved = true; el.classList.add('dragging'); } if (moved) el.scrollLeft = down.left - dx / (parseFloat(getComputedStyle($('lobbyStage')).getPropertyValue('--s')) || 1); });
  addEventListener('pointerup', () => { if (!down) return; down = null; setTimeout(() => el.classList.remove('dragging'), 0); });
  el.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  el.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
})();
$('rulesBtn')?.addEventListener('click', () => showModal('rulesModal'));
$('settingsBtn')?.addEventListener('click', () => showModal('settingsModal'));
$('settingsRulesBtn')?.addEventListener('click', () => { hideModal('settingsModal'); showModal('rulesModal'); });
// Ses (oyun sayfasıyla aynı tercih)
function syncSound() { const on = localStorage.getItem('okeySoundsEnabled') !== '0'; const b = $('soundToggle'); if (b) { b.textContent = on ? 'AÇIK' : 'KAPALI'; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('off', !on); } }
$('soundToggle')?.addEventListener('click', () => { const on = localStorage.getItem('okeySoundsEnabled') !== '0'; localStorage.setItem('okeySoundsEnabled', on ? '0' : '1'); syncSound(); });
syncSound();
// HEMEN OYNA tercihi
const QUICK = [['klasik', 'KLASİK'], ['katlamali', 'KATLAMALI'], ['yardimli', 'YARDIMLI'], ['yardimsiz', 'YARDIMSIZ']];
function quickMode() { const m = localStorage.getItem('okeyQuickMode'); return QUICK.some(q => q[0] === m) ? m : 'klasik'; }
function syncQuick() { const label = $('quickModeLabel'); if (label) label.textContent = QUICK.find(q => q[0] === quickMode())[1]; }
document.querySelectorAll('.set-stepper [data-step]').forEach(b => b.addEventListener('click', () => {
  const i = QUICK.findIndex(q => q[0] === quickMode()), n = (i + Number(b.dataset.step) + QUICK.length) % QUICK.length;
  localStorage.setItem('okeyQuickMode', QUICK[n][0]); syncQuick();
}));
syncQuick();
// Sıralama: En İyi 25, çipe (varsayılan) veya seviyeye göre
async function loadLeaderboard(by = 'chips') {
  const list = $('leaderList'); list.replaceChildren();
  document.querySelectorAll('.leader-tabs .lb-tab').forEach(b => b.classList.toggle('on', b.dataset.by === by));
  try {
    const { top } = await api('/api/leaderboard?by=' + by, null, 'GET');
    if (!top.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Henüz kayıtlı oyuncu yok. Hesap açıp oynayan oyuncular burada görünür.'; list.append(li); }
    top.forEach((u, i) => {
      const li = document.createElement('li');
      const rank = document.createElement('b'); rank.className = 'rank'; rank.textContent = (i + 1) + '.';
      const img = document.createElement('img'); img.src = avatarSrc(u.avatar); img.alt = '';
      const info = document.createElement('div'); const n = document.createElement('strong'); n.textContent = u.username;
      const s = document.createElement('small'); s.textContent = `🪙 ${Number(u.chips || 0).toLocaleString('tr-TR')} çip · Seviye ${u.level} · ${u.wins} zafer`;
      info.append(n, s); li.append(rank, img, info); list.append(li);
    });
  } catch (e) { toast(e.message); }
}
document.querySelectorAll('.leader-tabs .lb-tab').forEach(b => b.addEventListener('click', () => loadLeaderboard(b.dataset.by)));
$('leaderboardBtn')?.addEventListener('click', async () => {
  await loadLeaderboard('chips');
  showModal('leaderboardModal');
});
// Açılış ekranı (oturumda bir kez): yükleme çubuğu bağlantı kurulunca dolar, ardından taş geçişiyle lobiye
(function splash() {
  const el = $('splash'); if (!el) return;
  let seen = false; try { seen = sessionStorage.getItem('splashShown') === '1'; } catch (_) {}
  if (seen || sessionStorage.getItem('autoJoinMode')) return;
  el.classList.remove('hidden');
  // asılı ampuller ve yapraklar
  const LEAF = 'M50 2 L58 26 L74 16 L70 40 L92 36 L80 54 L96 62 L72 68 L76 86 L56 76 L52 98 L48 98 L44 76 L24 86 L28 68 L4 62 L20 54 L8 36 L30 40 L26 16 L42 26 Z';
  const COLORS = ['#e2531e', '#c8241f', '#f2a127', '#e9c12b', '#8bb83a', '#d9772a'];
  const leaf = (color, size) => `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><path d="${LEAF}" fill="${color}" stroke="rgba(0,0,0,.25)" stroke-width="2"/><path d="M50 98 L50 30 M50 60 L30 44 M50 60 L70 44 M50 78 L34 70 M50 78 L66 70" stroke="rgba(0,0,0,.25)" stroke-width="2" fill="none"/></svg>`;
  const lights = $('splashLights');
  for (let i = 0; i < 10; i++) {
    const x = 4 + i * 10 + Math.random() * 3, len = 20 + Math.random() * 120, isLeaf = i % 3 !== 1;
    const h = document.createElement('div'); h.className = 'hang ' + (isLeaf ? 'leaf' : 'bulb');
    h.style.left = x + '%'; h.style.setProperty('--len', len + 'px'); h.style.animationDelay = (-Math.random() * 4) + 's';
    h.innerHTML = '<i class="string"></i>' + (isLeaf ? leaf(COLORS[i % COLORS.length], 60 + Math.random() * 40) : '<b class="bulb-glass"></b>');
    lights.append(h);
  }
  const pile = $('splashLeafPile');
  for (let i = 0; i < 16; i++) { const s = document.createElement('span'); s.style.left = (i / 16 * 100 + Math.random() * 5) + '%'; s.style.bottom = (-30 + Math.random() * 70) + 'px'; s.style.transform = `rotate(${Math.random() * 360}deg)`; s.innerHTML = leaf(COLORS[i % COLORS.length], 90 + Math.random() * 70); pile.append(s); }
  const fill = $('splashFill'); let p = 8; const started = Date.now();
  const tick = setInterval(() => { p = Math.min(socket.connected ? 100 : 88, p + (socket.connected ? 6 : 2.5)); fill.style.width = p + '%';
    if (p >= 100 && Date.now() - started > 1700) { clearInterval(tick); finish(); } }, 60);
  setTimeout(() => { if (!socket.connected) $('splashText').textContent = 'Sunucuya bağlanılamadı. Yeniden deneniyor…'; }, 8000);
  async function finish() {
    try { sessionStorage.setItem('splashShown', '1'); } catch (_) {}
    if (window.AlemdarTransition) await AlemdarTransition.cover();
    el.classList.add('hidden');
    window.AlemdarTransition?.uncover();
  }
})();
