'use strict';
const socketAvailable = typeof io === 'function';
const socket = socketAvailable ? io() : {connected:false,on(){return this;},emit(){}};
const $ = id => document.getElementById(id);
let authToken = localStorage.getItem('okeyAuthToken') || '';
let currentUser = null, pendingJoin = null, authMode = 'login';
let selectedAvatar = localStorage.getItem('okeyPlayerAvatar') || 'default.svg';
let selectedFrame = localStorage.getItem('okeyPlayerFrame') || 'gold';
let selectedIstaka = localStorage.getItem('okeyPlayerIstaka') || 'istaka.jpg';
const builtins = ['default.svg', 'alibicim.png', 'egefitness.png', 'james.jpg', 'lvblc5.jpg'];
const avatarSrc = a => a?.startsWith('data:image/') ? a : a === 'default.svg' || !a ? '/asset/avatar-default.svg' : '/asset/avatars/' + (builtins.includes(a) ? a : builtins[0]);
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
  $('logoutBtn').classList.toggle('hidden', !currentUser);
  $('loginOpenBtn').classList.toggle('hidden', !!currentUser);
  $('registerOpenBtn').classList.toggle('hidden', !!currentUser);
  $('playerNameInput').disabled = !!currentUser;
  $('playerNameInput').value = currentUser?.username || localStorage.getItem('okeyPlayerName') || '';
  $('accountStatus').textContent = currentUser ? '✅ Profilin kayıtlı · Oyun kazan, XP topla!' : 'Misafir hesabının ilerlemesi kaydedilmez.';

}
async function recoverSession() {
  if (authToken) {
    try { currentUser = (await api('/api/me', undefined, 'GET')).user; }
    catch { authToken = ''; localStorage.removeItem('okeyAuthToken'); }
  }
  applyProfile();
}
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
  } catch (err) { toast(err.message); }
  finally { $('authSubmit').disabled = false; }
};
$('logoutBtn').onclick = async () => {
  try { await api('/api/logout'); } catch (_) {}
  authToken = ''; currentUser = null; localStorage.removeItem('okeyAuthToken'); applyProfile(); toast('Hesaptan çıkış yapıldı.');
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
document.querySelectorAll('.rack-options button').forEach(btn => btn.onclick = () => {
  selectedIstaka = btn.dataset.istaka; localStorage.setItem('okeyPlayerIstaka', selectedIstaka);
  document.querySelectorAll('.rack-options button').forEach(b => b.classList.toggle('selected', b === btn));
});
document.querySelectorAll('.rack-options button').forEach(b => b.classList.toggle('selected', b.dataset.istaka === selectedIstaka));
const modes = { klasik: { stackingMode: false, assisted: true }, katlamali: { stackingMode: true, assisted: true }, yardimli: { stackingMode: false, assisted: true }, yardimsiz: { stackingMode: false, assisted: false } };
function start(mode, modeKey = 'klasik') {
  if (!socketAvailable || !socket.connected) return toast('Oyun sunucusuna bağlanılamadı. Uygulamayı npm start ile çalıştırın ve bağlantınızı kontrol edin.');
  if (pendingJoin) return;
  const playerName = currentUser?.username || $('playerNameInput').value.trim() || 'Oyuncu' + Math.floor(10000 + Math.random() * 89999);
  const roomCode = $('roomCodeInput').value.trim().toUpperCase();
  if (mode === 'code' && !/^[A-Z0-9]{6}$/.test(roomCode)) return toast('6 karakterli geçerli bir oda kodu gir.');
  const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  const setting = mode === 'create' ? {stackingMode: $('roomStack').value === 'true', assisted: $('roomAssist').value === 'true'} : (modes[modeKey] || modes.klasik);
  pendingJoin = { mode, modeKey, ...setting, playerName, token, roomCode, isPublic: mode === 'create' ? createPublic : undefined,
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
let selectedModeList = 'klasik';
async function showRoomList(mode) {
  selectedModeList = mode;
  $('modeListTitle').textContent = 'ODA SEÇ';
  const rows = $('modeListRows'); rows.replaceChildren();
  try {
    const data = await api('/api/rooms', null, 'GET');
    const waiting = data.waiting || [];
    if (!waiting.length) { const p = document.createElement('p'); p.className = 'mode-list-empty'; p.textContent = 'Şu an bekleyen masa yok. MASA AÇ ile kendi masanı kurabilir veya ✓ ile hızlı eşleşmeye girebilirsin.'; rows.append(p); }
    waiting.forEach(room => {
      const row = document.createElement('div'); row.className = 'mode-list-row';
      const info = document.createElement('div'); info.className = 'ml-info';
      const title = document.createElement('strong'); title.textContent = (room.host ? room.host + ' · ' : '') + 'Masa ' + room.code;
      const chips = document.createElement('div'); chips.className = 'ml-chips';
      [room.teamMode ? 'EŞLİ' : 'TEK', `${room.roundLimit || 4} EL`, room.assisted ? 'YARDIMLI' : 'YARDIMSIZ', room.stackingMode ? 'KATLAMALI' : 'KATLAMASIZ']
        .forEach(t => { const s = document.createElement('span'); s.textContent = t; chips.append(s); });
      const seats = document.createElement('small'); seats.textContent = room.players + '/4 oyuncu';
      info.append(title, chips, seats);
      const btn = document.createElement('button'); btn.className = 'lb-btn green'; btn.type = 'button'; btn.textContent = 'OTUR';
      btn.addEventListener('click', () => { $('roomCodeInput').value = room.code; hideModal('modeListModal'); start('code'); });
      row.append(info, btn); rows.append(row);
    });
  } catch (e) { toast(e.message); }
  showModal('modeListModal');
}document.querySelectorAll('.select-mode').forEach(btn => btn.onclick = () => showRoomList(btn.dataset.mode));
$('modeAutoJoinBtn').onclick = () => { hideModal('modeListModal'); start('random', quickMode()); };
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
  let mode = null;
  try { mode = sessionStorage.getItem('autoJoinMode'); sessionStorage.removeItem('autoJoinMode'); } catch {}
  if (!mode || !socketAvailable) return;
  const go = () => start('random', mode);
  if (socket.connected) go(); else socket.on('connect', function once() { socket.off?.('connect', once); go(); });
})();

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
const joinByCode = () => { $('roomCodeInput').value = $('codeModalInput').value; hideModal('codeModal'); start('code'); };
$('codeModalJoin').onclick = joinByCode;
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
// Sıralama: En İyi 25
$('leaderboardBtn')?.addEventListener('click', async () => {
  const list = $('leaderList'); list.replaceChildren();
  try {
    const { top } = await api('/api/leaderboard', null, 'GET');
    if (!top.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Henüz kayıtlı oyuncu yok. Hesap açıp oynayan oyuncular burada görünür.'; list.append(li); }
    top.forEach((u, i) => {
      const li = document.createElement('li');
      const rank = document.createElement('b'); rank.className = 'rank'; rank.textContent = (i + 1) + '.';
      const img = document.createElement('img'); img.src = avatarSrc(u.avatar); img.alt = '';
      const info = document.createElement('div'); const n = document.createElement('strong'); n.textContent = u.username;
      const s = document.createElement('small'); s.textContent = `Seviye ${u.level} · ${u.xp.toLocaleString('tr-TR')} XP · ${u.wins} zafer`;
      info.append(n, s); li.append(rank, img, info); list.append(li);
    });
  } catch (e) { toast(e.message); }
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
