'use strict';
// Arkadaşlar, mesajlar ve masaya davet (lobi ve masa sayfası ortak). Yalnızca hesabı olanlar kullanabilir.
// Sayfa Social.init({...}) ile başlatır; pencere ve davet kartı bu dosya tarafından oluşturulur.
// Kullanıcıdan gelen metinler her zaman textContent ile yazılır.
window.Social = (function () {
  let opt = null, data = { friends: [], incoming: [], outgoing: [], unread: 0 }, chatWith = null, inviteMode = false, pollTimer = null;
  const invited = new Set(); // bu pencere açıkken davet edilenler
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const btn = (cls, text, onClick, title) => { const b = el('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', onClick); return b; };
  const fmt = n => Number(n || 0).toLocaleString('tr-TR');
  async function api(url, body, method = body ? 'POST' : 'GET') {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + opt.token() },
      ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw Error(out.error || 'İşlem başarısız.');
    return out;
  }

  // ---------- pencere ----------
  let root, titleEl, bodyEl;
  function build() {
    root = el('div', 'soc-overlay hidden'); root.id = 'socialPanel';
    root.addEventListener('click', e => { if (e.target === root) close(); });
    const panel = el('div', 'soc-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    const head = el('header', 'soc-head'); titleEl = el('b', 'soc-title', 'ARKADAŞLAR');
    head.append(titleEl, btn('soc-x', '✕', close, 'Kapat'));
    bodyEl = el('div', 'soc-body');
    panel.append(head, bodyEl); root.append(panel); document.body.append(root);
    addEventListener('keydown', e => { if (e.key === 'Escape' && !root.classList.contains('hidden')) close(); });
  }
  function open(asInvite = false) {
    if (!opt.token()) return opt.needAccount();
    inviteMode = asInvite; chatWith = null; invited.clear();
    root.classList.remove('hidden');
    paint(); refresh();
    clearInterval(pollTimer); pollTimer = setInterval(refresh, 20000); // çevrimiçi durumu tazelensin
  }
  function close() { root.classList.add('hidden'); chatWith = null; clearInterval(pollTimer); }
  const isOpen = () => root && !root.classList.contains('hidden');

  async function refresh() {
    if (!opt.token()) { data = { friends: [], incoming: [], outgoing: [], unread: 0 }; badge(); return; }
    try { data = await api('/api/friends'); } catch (_) { return; }
    badge();
    if (isOpen() && !chatWith) paint();
  }
  function badge() {
    const n = data.unread + data.incoming.length;
    for (const b of opt.buttons()) {
      let s = b.querySelector('.soc-badge');
      if (!s) { s = el('i', 'soc-badge'); b.append(s); }
      s.textContent = n > 99 ? '99+' : String(n); s.hidden = !n;
    }
  }
  function statusOf(f) {
    const game = f.table?.game === 'batak' ? 'Batak' : 'Okey';
    if (f.table) return { cls: 'at-table', text: f.table.started ? `${game} oynuyor` : `${game} masasında bekliyor (${f.table.seats}/4)` };
    return f.online ? { cls: 'online', text: 'Çevrimiçi' } : { cls: 'offline', text: 'Çevrimdışı' };
  }
  function avatar(u) { const i = el('img', 'soc-av'); i.src = opt.avatarSrc(u.avatar); i.alt = ''; return i; }

  // Arkadaş ekleme formu bir kez kurulur; liste tazelenirken yazılan ad ve odak kaybolmasın.
  let addForm = null, listEl = null;
  function buildAdd() {
    addForm = el('form', 'soc-add');
    const input = el('input'); input.maxLength = 18; input.placeholder = 'Kullanıcı adı yaz…'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Arkadaş kullanıcı adı');
    const add = el('button', 'soc-btn green', 'EKLE'); add.type = 'submit';
    addForm.append(input, add);
    addForm.addEventListener('submit', async e => {
      e.preventDefault(); const name = input.value.trim(); if (!name) return;
      add.disabled = true;
      try { const r = await api('/api/friends/request', { username: name }); opt.toast(r.result === 'accepted' ? `${r.user.username} ile artık arkadaşsınız.` : `${r.user.username} kişisine arkadaşlık isteği gönderildi.`); input.value = ''; await refresh(); paint(); }
      catch (err) { opt.toast(err.message); }
      finally { add.disabled = false; }
    });
    listEl = el('div', 'soc-list');
  }
  function paint() {
    if (chatWith) return paintChat();
    titleEl.textContent = inviteMode ? 'ARKADAŞINI DAVET ET' : 'ARKADAŞLAR';
    if (!addForm) buildAdd();
    if (addForm.parentNode !== bodyEl) bodyEl.replaceChildren(addForm, listEl);
    const out = []; // listEl içeriği
    const bodyAppend = (...n) => out.push(...n);
    // Gelen istekler
    if (data.incoming.length) {
      bodyAppend(el('h4', 'soc-sub', `ARKADAŞLIK İSTEKLERİ (${data.incoming.length})`));
      for (const u of data.incoming) {
        const row = el('div', 'soc-row request');
        row.append(avatar(u), info(u.username, `Seviye ${u.level} · seni arkadaş eklemek istiyor`),
          btn('soc-btn green', 'KABUL', () => respond(u.username, true)), btn('soc-btn red', 'RED', () => respond(u.username, false)));
        bodyAppend(row);
      }
    }
    // Arkadaşlar: davet modunda önce davet edilebilenler
    const list = [...data.friends];
    if (inviteMode) list.sort((a, b) => (b.online && !b.table?.started) - (a.online && !a.table?.started));
    else list.sort((a, b) => (b.unread > 0) - (a.unread > 0) || (b.online - a.online));
    bodyAppend(el('h4', 'soc-sub', `ARKADAŞLARIM (${list.length})`));
    if (!list.length) bodyAppend(el('p', 'soc-empty', 'Henüz arkadaşın yok. Yukarıya kullanıcı adını yazıp EKLE\'ye bas.'));
    for (const f of list) {
      const st = statusOf(f), row = el('div', 'soc-row ' + st.cls);
      const tools = el('div', 'soc-tools');
      if (inviteMode) {
        const sent = () => { inv.disabled = true; inv.textContent = 'GÖNDERİLDİ'; };
        const inv = btn('soc-btn green', 'DAVET ET', () => { opt.socket.emit('inviteFriend', { username: f.username }); invited.add(f.username); sent(); });
        if (invited.has(f.username)) sent();
        else if (!f.online) { inv.disabled = true; inv.title = 'Çevrimdışı arkadaş davet edilemez'; }
        tools.append(inv);
      } else if (f.table && opt.onJoin) {
        tools.append(btn('soc-btn blue', 'MASAYA GİT', () => { close(); opt.onJoin(f.table.code, f.table.game || 'okey'); }, 'Arkadaşının masasına otur'));
      }
      const msg = btn('soc-btn', '💬', () => { chatWith = f; paint(); }, 'Mesaj yaz');
      if (f.unread) msg.append(el('i', 'soc-badge', String(f.unread)));
      tools.append(msg);
      if (!inviteMode) tools.append(btn('soc-btn ghost', '✕', () => removeFriend(f.username), 'Arkadaşlıktan çıkar'));
      row.append(avatar(f), info(f.username, `Seviye ${f.level} · ${st.text}`), tools);
      bodyAppend(row);
    }
    if (data.outgoing.length) bodyAppend(el('p', 'soc-empty', 'Yanıt bekleyen istekler: ' + data.outgoing.map(u => u.username).join(', ')));
    listEl.replaceChildren(...out);
  }
  function info(name, sub) { const d = el('div', 'soc-info'); d.append(el('strong', null, name), el('small', null, sub)); return d; }
  async function respond(username, accept) {
    try { await api('/api/friends/respond', { username, accept }); opt.toast(accept ? `${username} ile artık arkadaşsınız.` : 'İstek reddedildi.'); await refresh(); paint(); }
    catch (err) { opt.toast(err.message); }
  }
  async function removeFriend(username) {
    if (!confirm(`${username} arkadaş listenden çıkarılsın mı?`)) return;
    try { await api('/api/friends/remove', { username }); await refresh(); paint(); }
    catch (err) { opt.toast(err.message); }
  }

  // ---------- sohbet ----------
  let logEl = null;
  async function paintChat() {
    const f = chatWith;
    titleEl.textContent = f.username;
    bodyEl.replaceChildren();
    const top = el('div', 'soc-chat-top');
    top.append(btn('soc-btn ghost', '‹ GERİ', () => { chatWith = null; refresh(); paint(); }), avatar(f), info(f.username, statusOf(f).text));
    logEl = el('div', 'soc-log');
    const form = el('form', 'soc-send');
    const input = el('input'); input.maxLength = 300; input.placeholder = 'Mesaj yaz…'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Mesaj');
    const send = el('button', 'soc-btn green', 'GÖNDER'); send.type = 'submit';
    form.append(input, send);
    form.addEventListener('submit', async e => {
      e.preventDefault(); const body = input.value.trim(); if (!body) return;
      send.disabled = true;
      try { const r = await api('/api/messages', { to: f.username, body }); input.value = ''; addLine(r.message, true); }
      catch (err) { opt.toast(err.message); }
      finally { send.disabled = false; input.focus(); }
    });
    bodyEl.append(top, logEl, form);
    setTimeout(() => input.focus(), 30);
    await loadThread();
  }
  async function loadThread() {
    const f = chatWith; if (!f || !logEl) return;
    try {
      const { messages } = await api('/api/messages?with=' + encodeURIComponent(f.username));
      if (chatWith !== f) return;
      logEl.replaceChildren();
      if (!messages.length) logEl.append(el('p', 'soc-empty', 'Henüz mesaj yok. İlk mesajı sen yaz!'));
      for (const m of messages) addLine(m, m.from !== f.username);
      f.unread = 0; refresh();
    } catch (err) { opt.toast(err.message); }
  }
  function addLine(m, mine) {
    if (!logEl) return;
    logEl.querySelector('.soc-empty')?.remove();
    const line = el('div', 'soc-msg ' + (mine ? 'mine' : 'theirs'));
    const t = new Date(m.created);
    line.append(el('span', null, m.body), el('time', null, `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`));
    logEl.append(line); logEl.scrollTop = logEl.scrollHeight;
  }

  // ---------- davet kartı ----------
  let inviteEl = null, inviteTimer = null;
  function showInvite(d) {
    if (opt.currentRoom?.() === d.roomCode) return;
    inviteEl?.remove(); clearTimeout(inviteTimer);
    inviteEl = el('div', 'soc-invite'); inviteEl.setAttribute('role', 'alert');
    const BATAK = { ihaleli: 'İHALELİ', kozmaca: 'KOZ MAÇA', esli: 'EŞLİ' };
    const rules = d.game === 'batak' ? ['BATAK', BATAK[d.batakType] || '', `${d.roundLimit || 5} EL`].join(' · ')
      : ['101 OKEY', `${fmt(d.bet)} ÇİP`, d.teamMode ? 'EŞLİ' : 'TEK', `${d.roundLimit || 4} EL`, d.assisted ? 'YARDIMLI' : 'YARDIMSIZ', d.stackingMode ? 'KATLAMALI' : 'KATLAMASIZ'].join(' · ');
    const text = el('div', 'soc-info');
    text.append(el('strong', null, `${d.from} seni masasına çağırıyor!`), el('small', null, `${rules} · ${d.started ? 'oyun başladı' : `${d.seats}/4 oyuncu`}`));
    const hide = () => { inviteEl?.remove(); inviteEl = null; clearTimeout(inviteTimer); };
    inviteEl.append(el('i', 'soc-invite-icon', d.game === 'batak' ? '♠' : '🎴'), text,
      btn('soc-btn green', 'KATIL', () => { hide(); close(); opt.onJoin?.(d.roomCode, d.game || 'okey'); }),
      btn('soc-btn ghost', 'HAYIR', hide));
    document.body.append(inviteEl);
    inviteTimer = setTimeout(hide, 30000);
    opt.sound?.();
  }

  // ---------- bağlantı ----------
  const hello = () => opt.socket.emit('hello', { authToken: opt.token() });
  function init(options) {
    opt = { buttons: () => [], toast: m => console.log(m), needAccount: () => {}, avatarSrc: a => a, ...options };
    build();
    for (const b of opt.buttons()) b.addEventListener('click', () => open(false));
    opt.socket.on('connect', () => { hello(); refresh(); });
    if (opt.socket.connected) hello();
    opt.socket.on('social', d => {
      if (d.type === 'message') {
        if (isOpen() && chatWith?.username === d.from) return loadThread(); // açık sohbet: yeniden yüklenir, okundu sayılır
        opt.toast(`💬 ${d.from}: ${d.message.body}`);
      } else if (d.type === 'request') opt.toast(`👋 ${d.from} sana arkadaşlık isteği gönderdi.`);
      else if (d.type === 'accepted') opt.toast(`🤝 ${d.from} arkadaşlık isteğini kabul etti.`);
      refresh();
    });
    opt.socket.on('invite', showInvite);
    refresh();
  }
  // Giriş/çıkış yapıldığında sayfa çağırır.
  function accountChanged() { hello(); if (!opt.token()) close(); refresh(); }
  return { init, open, close, refresh, accountChanged };
})();
