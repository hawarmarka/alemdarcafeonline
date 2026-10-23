'use strict';
// Batak masası ekleri: ikram (çay, kahve, oralet…) ve sesli sohbet (WebRTC).
// batak.js init({...}) ile bağlar ve her çizimden sonra update() çağırır.
// Batak ve Pişti ortak (init'te prefix: 'batak' | 'pisti'; olaylar '<önek>:treat' gibi). Sunucu tarafı: server/tableExtras.js.
// İkram: sunucu '<önek>:treat' ile herkese duyurur; ikram uçarak gelir ve bir süre alanın kutusunun yanında durur.
// Sesli sohbet: sunucu yalnızca kimlerin sesli sohbette olduğunu ('<önek>:voice') ve teklif/cevap/ICE iletilerini ('<önek>:signal') aktarır;
// ses doğrudan tarayıcılar arasında akar. Eşler oyuncu adıyla tutulur (koltuk numarası maç başında değişebilir).
window.BatakExtras = (function () {
  let ctx = null;
  const ev = name => `${ctx?.prefix || 'batak'}:${name}`; // olay öneki: 'batak', 'pisti'…
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const $ = id => document.getElementById(id);

  // ---------- İkramlar (sunucudaki TREATS listesiyle aynı) ----------
  const TREATS = {
    cay: { name: 'Çay', svg: '<ellipse cx="32" cy="57" rx="20" ry="4" fill="#c9302c"/><ellipse cx="32" cy="55.5" rx="15" ry="3" fill="#e9e3d6"/><path d="M22 14h20c0 8-6 12-6 18s6 10 6 18c0 3-4 5-10 5s-10-2-10-5c0-8 6-12 6-18s-6-10-6-18z" fill="rgba(255,255,255,.35)" stroke="#d9d4c7" stroke-width="1.5"/><path d="M24 22h16c-1 5-5 7-5 10s4 6 5 10c0 2-3 4-8 4s-8-2-8-4c1-4 5-7 5-10s-4-5-5-10z" fill="#b6361a"/><path d="M25 22h14" stroke="#e7a04a" stroke-width="1.5"/>' },
    kahve: { name: 'Türk kahvesi', svg: '<ellipse cx="32" cy="52" rx="22" ry="5" fill="#f4efe4" stroke="#c9b48a" stroke-width="1.5"/><path d="M18 26h28l-3 20c-1 4-5 6-11 6s-10-2-11-6z" fill="#fbf7ee" stroke="#c9b48a" stroke-width="1.5"/><path d="M46 31c6 0 7 9 0 10" fill="none" stroke="#c9b48a" stroke-width="3"/><ellipse cx="32" cy="26" rx="14" ry="3" fill="#6b3d1e"/><ellipse cx="31" cy="25.6" rx="8" ry="1.6" fill="#b8865a"/><path d="M22 36h20" stroke="#1d5f9a" stroke-width="2"/><path d="M26 14c0 3 3 3 3 6M34 12c0 3 3 3 3 6" fill="none" stroke="#bbb" stroke-width="1.6" stroke-linecap="round"/>' },
    oralet: { name: 'Oralet', svg: '<path d="M20 12h24l-3 42c0 3-4 4-9 4s-9-1-9-4z" fill="rgba(255,255,255,.35)" stroke="#d9d4c7" stroke-width="1.5"/><path d="M22 22h20l-2 31c0 2-3 3-8 3s-8-1-8-3z" fill="#f28c1e"/><circle cx="44" cy="14" r="8" fill="#f6a623" stroke="#d27a0e" stroke-width="1.5"/><path d="M44 6v16M36 14h16M38 8l12 12M50 8 38 20" stroke="#ffd07a" stroke-width="1"/>' },
    ayran: { name: 'Ayran', svg: '<path d="M18 12h28l-4 42c0 3-4 4-10 4s-10-1-10-4z" fill="rgba(255,255,255,.4)" stroke="#d9d4c7" stroke-width="1.5"/><path d="M20 18h24l-3 35c0 2-4 3-9 3s-9-1-9-3z" fill="#f7f6f0"/><path d="M20 18q4-4 8 0t8 0 8 0" fill="#fff" stroke="#e6e3d8" stroke-width="1"/>' },
    su: { name: 'Su', svg: '<path d="M18 12h28l-4 42c0 3-4 4-10 4s-10-1-10-4z" fill="rgba(255,255,255,.35)" stroke="#cfe3f2" stroke-width="1.5"/><path d="M20 24h24l-3 29c0 2-4 3-9 3s-9-1-9-3z" fill="#7cc4f0" opacity=".8"/><circle cx="28" cy="38" r="1.8" fill="#fff"/><circle cx="35" cy="45" r="1.4" fill="#fff"/>' },
    lokum: { name: 'Lokum', svg: '<ellipse cx="32" cy="50" rx="26" ry="7" fill="#e9e3d6" stroke="#c9b48a" stroke-width="1.5"/><g stroke="#d77a9a" stroke-width="1"><rect x="14" y="34" width="14" height="13" rx="2" fill="#f5a9c4"/><rect x="30" y="32" width="14" height="14" rx="2" fill="#f7c1d4"/><rect x="22" y="22" width="14" height="13" rx="2" fill="#f5a9c4"/><rect x="38" y="22" width="12" height="12" rx="2" fill="#fbe1ea"/></g><g fill="#fff"><circle cx="18" cy="37" r=".9"/><circle cx="35" cy="35" r=".9"/><circle cx="27" cy="25" r=".9"/><circle cx="43" cy="26" r=".9"/><circle cx="24" cy="41" r=".9"/></g>' },
    simit: { name: 'Simit', svg: '<circle cx="32" cy="34" r="20" fill="none" stroke="#b5651d" stroke-width="12"/><circle cx="32" cy="34" r="20" fill="none" stroke="#d98b3a" stroke-width="7" stroke-dasharray="6 4"/><g fill="#f6e7c1">' + [[18, 22], [30, 15], [44, 20], [50, 33], [44, 47], [30, 53], [17, 45], [13, 33]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.4" ry=".8"/>`).join('') + '</g>' },
    kola: { name: 'Kola', svg: '<path d="M20 12h24l-3 42c0 3-4 4-9 4s-9-1-9-4z" fill="rgba(255,255,255,.3)" stroke="#d9d4c7" stroke-width="1.5"/><path d="M21.5 20h21l-2.6 33c0 2-3 3-7.9 3s-7.9-1-7.9-3z" fill="#3a1408"/><rect x="34" y="4" width="3" height="30" rx="1.5" fill="#e43b3b" transform="rotate(12 35 20)"/><g fill="#a76b4d"><circle cx="27" cy="30" r="1.2"/><circle cx="33" cy="40" r="1"/><circle cx="29" cy="46" r="1.3"/></g>' },
  };
  const treatSvg = id => `<svg viewBox="0 0 64 64" aria-hidden="true">${TREATS[id].svg}</svg>`;
  const treats = new Map(); // koltuk → [{ item, until }]
  let pick = 'cay';
  function openTreat(target = null) {
    const s = ctx.getState(); if (!s) return;
    const items = $('bkTreatItems'); items.replaceChildren();
    for (const [id, t] of Object.entries(TREATS)) {
      const b = el('button'); b.type = 'button'; b.className = id === pick ? 'on' : ''; b.innerHTML = treatSvg(id); b.append(el('span', null, t.name));
      b.onclick = () => { pick = id; items.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
      items.append(b);
    }
    const targets = $('bkTreatTargets'); targets.replaceChildren();
    const send = to => { ctx.socket.emit(ev('treat'), { item: pick, to }); ctx.closeModal('bkTreatModal'); };
    s.players.forEach((p, i) => {
      if (i === s.me) return;
      const b = el('button', 'bk-btn ' + (i === target ? 'primary' : 'ghost'), p.name); b.type = 'button'; b.onclick = () => send(i); targets.append(b);
    });
    const all = el('button', 'bk-btn ghost', 'Bütün masaya'); all.type = 'button'; all.onclick = () => send(-1); targets.append(all);
    ctx.openModal('bkTreatModal');
  }
  // Uçan ikram: gönderenin kutusundan alanın kutusuna
  const boxOf = seat => { const slot = ctx.slotOf(seat); return slot?.querySelector('.bk-pbox') || slot; };
  function fly(item, fromSeat, toSeat) {
    const a = boxOf(fromSeat)?.getBoundingClientRect(), b = boxOf(toSeat)?.getBoundingClientRect();
    if (!a || !b) return;
    const f = el('div', 'bk-fly'); f.innerHTML = treatSvg(item);
    f.style.left = `${a.left + a.width / 2 - 22}px`; f.style.top = `${a.top + a.height / 2 - 22}px`;
    document.body.append(f); f.getBoundingClientRect();
    requestAnimationFrame(() => { f.style.transform = `translate(${b.left - a.left + b.width / 2 - a.width / 2}px, ${b.top - a.top + b.height / 2 - a.height / 2}px) scale(1.15)`; });
    setTimeout(() => { f.style.opacity = '0'; setTimeout(() => f.remove(), 320); }, 950);
  }
  function onTreat(d) {
    const s = ctx.getState(); if (!s) return;
    const targets = d.to === -1 ? s.players.map((_, i) => i).filter(i => i !== d.from) : [d.to];
    for (const t of targets) {
      fly(d.item, d.from, t);
      const list = (treats.get(t) || []).filter(x => x.until > Date.now()).slice(-2);
      list.push({ item: d.item, until: Date.now() + 90000 }); treats.set(t, list);
    }
    const who = d.to === -1 ? 'bütün masa' : s.players[d.to]?.name;
    ctx.log(`${d.name}, ${who} için ${TREATS[d.item].name.toLowerCase()} ısmarladı.`);
    if (d.to === s.me) ctx.toast(`${d.name} sana ${TREATS[d.item].name.toLowerCase()} ikram etti.`, true);
    setTimeout(paintTreats, 900);
  }
  function paintTreats() {
    const now = Date.now();
    document.querySelectorAll('.pb-treats').forEach(n => n.remove());
    for (const [seat, list] of treats) {
      const live = list.filter(x => x.until > now); if (!live.length) { treats.delete(seat); continue; }
      const slot = boxOf(seat); if (!slot) continue;
      const box = el('div', 'pb-treats');
      for (const t of live) { const i = el('i'); i.innerHTML = treatSvg(t.item); i.title = TREATS[t.item].name; box.append(i); }
      slot.append(box);
    }
  }

  // ---------- Sesli sohbet ----------
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] };
  const voice = { on: false, stream: null, list: [], peers: new Map(), audio: null, meters: new Map() };
  const myName = () => { const s = ctx.getState(); return s?.players[s.me]?.name; };
  const seatOfName = name => ctx.getState()?.players.findIndex(p => p.name === name) ?? -1;
  async function toggleVoice() {
    if (voice.on) return stopVoice();
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) return ctx.toast('Tarayıcın sesli sohbeti desteklemiyor.');
    try {
      voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (_) { return ctx.toast('Mikrofon izni verilmedi. Tarayıcının adres çubuğundan mikrofona izin ver.'); }
    voice.on = true; paintVoiceBtn();
    meter(myName(), voice.stream);
    ctx.socket.emit(ev('voiceJoin'));
    ctx.toast('Sesli sohbete katıldın. Masadaki diğer sesli oyuncuları duyacaksın.', true);
  }
  function stopVoice() {
    voice.on = false; paintVoiceBtn();
    for (const name of [...voice.peers.keys()]) closePeer(name);
    voice.stream?.getTracks().forEach(t => t.stop()); voice.stream = null;
    voice.meters.clear();
    ctx.socket.emit(ev('voiceLeave'));
  }
  function paintVoiceBtn() {
    const b = $('bkVoiceBtn'); b.setAttribute('aria-pressed', String(voice.on));
    $('bkVoiceSlash').classList.toggle('hidden', voice.on);
    b.title = voice.on ? 'Sesli sohbetten çık' : 'Sesli sohbete katıl';
  }
  function peerFor(name, initiator) {
    if (voice.peers.has(name)) return voice.peers.get(name);
    const pc = new RTCPeerConnection(ICE), peer = { pc, audio: null, initiator };
    voice.peers.set(name, peer);
    voice.stream.getTracks().forEach(t => pc.addTrack(t, voice.stream));
    pc.onicecandidate = e => { if (e.candidate) signal(name, { candidate: e.candidate }); };
    pc.ontrack = e => {
      if (!peer.audio) { peer.audio = el('audio'); peer.audio.autoplay = true; $('bkAudio').append(peer.audio); }
      peer.audio.srcObject = e.streams[0];
      peer.audio.play?.().catch(() => {});
      meter(name, e.streams[0]);
    };
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) closePeer(name); };
    if (initiator) pc.onnegotiationneeded = async () => {
      try { await pc.setLocalDescription(await pc.createOffer()); signal(name, { description: pc.localDescription }); } catch (_) {}
    };
    return peer;
  }
  function closePeer(name) {
    const p = voice.peers.get(name); if (!p) return;
    try { p.pc.close(); } catch (_) {}
    p.audio?.remove(); voice.peers.delete(name); voice.meters.delete(name);
  }
  function signal(name, data) {
    const to = seatOfName(name); if (to < 0) return;
    ctx.socket.emit(ev('signal'), { to, data: JSON.parse(JSON.stringify(data)) });
  }
  async function onSignal({ from, data }) {
    if (!voice.on) return;
    const name = ctx.getState()?.players[from]?.name; if (!name) return;
    const peer = peerFor(name, false), pc = peer.pc;
    try {
      if (data.description) {
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') { await pc.setLocalDescription(await pc.createAnswer()); signal(name, { description: pc.localDescription }); }
      } else if (data.candidate) await pc.addIceCandidate(data.candidate);
    } catch (_) {}
  }
  function onVoiceList({ list }) {
    const s = ctx.getState(); if (!s) return;
    voice.list = list.map(i => s.players[i]?.name).filter(Boolean);
    if (voice.on) {
      const me = myName();
      for (const name of voice.list) if (name !== me && !voice.peers.has(name)) peerFor(name, me < name); // adı küçük olan teklif eder
      for (const name of [...voice.peers.keys()]) if (!voice.list.includes(name)) closePeer(name);
    }
    update();
  }
  // Konuşan kişiyi göster: ses seviyesi eşiği aşınca kutusu yeşil parlar.
  function meter(name, stream) {
    try {
      voice.audio = voice.audio || new (window.AudioContext || window.webkitAudioContext)();
      const src = voice.audio.createMediaStreamSource(stream), an = voice.audio.createAnalyser(); an.fftSize = 512;
      src.connect(an); voice.meters.set(name, { an, buf: new Uint8Array(an.fftSize), talking: false });
    } catch (_) {}
  }
  setInterval(() => {
    if (!voice.meters.size) return;
    for (const [name, m] of voice.meters) {
      m.an.getByteTimeDomainData(m.buf);
      let peak = 0; for (const v of m.buf) peak = Math.max(peak, Math.abs(v - 128));
      m.talking = peak > 14;
    }
    update();
  }, 200);
  function update() {
    const s = ctx?.getState(); if (!s) return;
    document.querySelectorAll('.bk-pbox').forEach(box => {
      const name = s.players[Number(box.dataset.seat)]?.name;
      box.classList.toggle('voice', voice.list.includes(name));
      box.classList.toggle('talking', !!voice.meters.get(name)?.talking);
    });
    if (treats.size) paintTreats();
  }

  function init(options) {
    ctx = options;
    $('bkTreatBtn').onclick = () => openTreat();
    $('bkVoiceBtn').onclick = toggleVoice;
    paintVoiceBtn();
    ctx.socket.on(ev('treat'), onTreat);
    ctx.socket.on(ev('voice'), onVoiceList);
    ctx.socket.on(ev('signal'), onSignal);
    ctx.socket.on('connect', () => { if (voice.on) { for (const n of [...voice.peers.keys()]) closePeer(n); ctx.socket.emit(ev('voiceJoin')); } });
    addEventListener('beforeunload', () => { if (voice.on) ctx.socket.emit(ev('voiceLeave')); });
  }
  return { init, update, openTreat, TREATS };
})();
