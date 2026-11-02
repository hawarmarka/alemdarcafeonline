// Okey masası sesli + görüntülü sohbet (WebRTC, eşler arası). Sunucu yalnızca kimin sohbette olduğunu duyurur
// ve teklif/cevap/ICE iletilerini aynı masadaki hedefe aktarır ('okey:voiceJoin', 'okey:signal'…).
// 3D masa görüntüyü karakterin üstündeki çerçevede gösterir (OkeyAV.videoFor); 3D kapalıysa oyuncu panelinde.
window.OkeyAV = (() => {
  const $ = id => document.getElementById(id);
  const ev = name => 'okey:' + name;
  const st = () => window.okeyLastState;
  const myName = () => { const s = st(); return s?.players?.[s.playerIndex]?.name; };
  const seatOfName = name => st()?.players?.findIndex(p => p.name === name) ?? -1;
  let ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] };
  const VIDEO = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 }, facingMode: 'user' };
  const av = { mic: false, cam: false, stream: null, list: [], peers: new Map(), ctx: null, meters: new Map(), joined: false };

  function toast(msg) { if (typeof window.toast === 'function') window.toast(msg); else console.log(msg); }

  // Sunucudan TURN dahil ICE ayarı (geçici kimlik bilgisi). Yoksa yalnızca STUN.
  function loadIce() {
    return new Promise(done => {
      const t = setTimeout(done, 1500);
      socket.emit('rtc:ice', cfg => { clearTimeout(t); if (cfg?.iceServers?.length) ICE = cfg; done(); });
    });
  }

  async function ensureStream(kind) {
    av.stream = av.stream || new MediaStream();
    const has = av.stream.getTracks().some(t => t.kind === kind && t.readyState === 'live');
    if (has) return true;
    try {
      const got = await navigator.mediaDevices.getUserMedia(kind === 'audio'
        ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } } : { video: VIDEO });
      for (const t of got.getTracks()) { av.stream.addTrack(t); for (const p of av.peers.values()) addTrack(p, t); }
      return true;
    } catch (_) {
      toast(kind === 'audio' ? 'Mikrofon izni verilmedi.' : 'Kamera açılamadı ya da izin verilmedi.');
      return false;
    }
  }
  function dropTrack(kind) {
    for (const t of av.stream?.getTracks() || []) if (t.kind === kind) {
      t.stop(); av.stream.removeTrack(t);
      for (const p of av.peers.values()) { const s = p.senders.get(kind); if (s) { try { p.pc.removeTrack(s); } catch (_) {} p.senders.delete(kind); } }
    }
  }

  async function toggleMic() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) return toast('Bu cihaz sesli sohbeti desteklemiyor.');
    if (av.mic) { av.mic = false; dropTrack('audio'); }
    else if (await ensureStream('audio')) { av.mic = true; meter(myName(), av.stream); }
    sync();
  }
  async function toggleCam() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) return toast('Bu cihaz görüntülü sohbeti desteklemiyor.');
    if (av.cam) { av.cam = false; dropTrack('video'); }
    else if (await ensureStream('video')) av.cam = true;
    sync();
  }
  // Mikrofon ya da kamera açıksa sohbetteyiz; ikisi de kapanınca çıkılır.
  async function sync() {
    const want = av.mic || av.cam;
    if (want && !av.joined) { av.joined = true; await loadIce(); socket.emit(ev('voiceJoin')); }
    if (!want && av.joined) {
      av.joined = false; socket.emit(ev('voiceLeave'));
      for (const n of [...av.peers.keys()]) closePeer(n);
      av.stream = null;
    }
    for (const p of av.peers.values()) send(p.name, { cam: av.cam });
    const self = $('avSelf');
    if (self) { self.srcObject = av.cam ? av.stream : null; self.classList.toggle('hidden', !av.cam); }
    paintButtons(); paint();
  }
  function paintButtons() {
    for (const [id, on, onT, offT] of [['avMicBtn', av.mic, 'Mikrofonu kapat', 'Sesli sohbete katıl'], ['avCamBtn', av.cam, 'Kamerayı kapat', 'Kamerayı aç']]) {
      const b = $(id); if (!b) continue;
      b.setAttribute('aria-pressed', String(on)); b.title = on ? onT : offT; b.classList.toggle('on', on);
    }
  }

  // ---------- Eşler ("perfect negotiation": iki taraf da yeniden anlaşma başlatabilir) ----------
  function addTrack(peer, track) {
    if (peer.senders.has(track.kind)) return;
    const sender = peer.pc.addTrack(track, av.stream);
    peer.senders.set(track.kind, sender);
    if (track.kind === 'video') {
      const prm = sender.getParameters(); prm.encodings = prm.encodings?.length ? prm.encodings : [{}];
      prm.encodings[0].maxBitrate = 300000; prm.encodings[0].maxFramerate = 15;
      sender.setParameters(prm).catch(() => {});
    }
  }
  function peerFor(name) {
    if (av.peers.has(name)) return av.peers.get(name);
    const pc = new RTCPeerConnection(ICE);
    const peer = { name, pc, senders: new Map(), polite: myName() > name, making: false, ignore: false, cam: false, media: null, panel: null, iceOut: [], iceTimer: 0 };
    av.peers.set(name, peer);
    for (const t of av.stream?.getTracks() || []) addTrack(peer, t);
    pc.onicecandidate = e => {
      if (!e.candidate) return;
      peer.iceOut.push(e.candidate.toJSON());
      // Adaylar toplu gider: sunucunun olay hız sınırına takılmasın.
      if (!peer.iceTimer) peer.iceTimer = setTimeout(() => { peer.iceTimer = 0; send(name, { candidates: peer.iceOut.splice(0) }); }, 250);
    };
    pc.ontrack = e => {
      if (!peer.media) {
        peer.media = document.createElement('video'); peer.media.autoplay = true; peer.media.playsInline = true;
        $('avAudio').append(peer.media);
      }
      peer.media.srcObject = e.streams[0] || new MediaStream([e.track]);
      peer.media.play?.().catch(() => {});
      if (e.track.kind === 'audio') meter(name, peer.media.srcObject);
      paint();
    };
    pc.onnegotiationneeded = async () => {
      try { peer.making = true; await pc.setLocalDescription(); send(name, { description: pc.localDescription }); }
      catch (_) { /* yeniden denenir */ } finally { peer.making = false; }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce?.();
      if (pc.connectionState === 'closed') closePeer(name);
    };
    send(name, { cam: av.cam });
    return peer;
  }
  function closePeer(name) {
    const p = av.peers.get(name); if (!p) return;
    try { p.pc.close(); } catch (_) {}
    clearTimeout(p.iceTimer); p.media?.remove(); p.panel?.remove();
    av.peers.delete(name); av.meters.delete(name);
  }
  function send(name, data) {
    const to = seatOfName(name); if (to < 0) return;
    socket.emit(ev('signal'), { to, data: JSON.parse(JSON.stringify(data)) });
  }
  async function onSignal({ from, data }) {
    if (!av.joined) return;
    const name = st()?.players?.[from]?.name; if (!name || !data) return;
    const peer = peerFor(name), pc = peer.pc;
    try {
      if ('cam' in data) { peer.cam = !!data.cam; paint(); }
      if (data.description) {
        const collision = data.description.type === 'offer' && (peer.making || pc.signalingState !== 'stable');
        peer.ignore = !peer.polite && collision;
        if (peer.ignore) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') { await pc.setLocalDescription(); send(name, { description: pc.localDescription }); }
      }
      for (const c of data.candidates || []) { try { await pc.addIceCandidate(c); } catch (err) { if (!peer.ignore) throw err; } }
    } catch (_) { /* bozuk ileti */ }
  }
  function onVoiceList({ list }) {
    const s = st(); if (!s) return;
    av.list = list.map(i => s.players[i]?.name).filter(Boolean);
    if (av.joined) {
      const me = myName();
      // Bağlantıyı adı küçük olan başlatır; diğer taraf ilk teklif gelince eşi kurar.
      for (const name of av.list) if (name !== me && !av.peers.has(name) && me < name) peerFor(name);
      for (const name of [...av.peers.keys()]) if (!av.list.includes(name)) closePeer(name);
    }
    paint();
  }

  // ---------- Konuşma seviyesi ----------
  function meter(name, stream) {
    if (!name || !stream?.getAudioTracks().length) return;
    try {
      av.ctx = av.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const an = av.ctx.createAnalyser(); an.fftSize = 256;
      av.ctx.createMediaStreamSource(stream).connect(an);
      av.meters.set(name, { an, buf: new Uint8Array(an.fftSize), level: 0, talking: false });
    } catch (_) { /* ses bağlamı yok */ }
  }
  setInterval(() => {
    if (!av.meters.size) return;
    let changed = false;
    for (const m of av.meters.values()) {
      m.an.getByteTimeDomainData(m.buf);
      let peak = 0; for (const v of m.buf) peak = Math.max(peak, Math.abs(v - 128));
      m.level = Math.min(1, Math.max(0, (peak - 8) / 40));
      if (m.talking !== peak > 14) { m.talking = peak > 14; changed = true; }
    }
    if (changed) paint();
  }, 80);

  // ---------- Gösterim (3D kapalıyken panelde görüntü; her durumda konuşan işareti) ----------
  function paint() {
    const s = st(); if (!s?.players) return;
    document.querySelectorAll('.player-info[data-seat]').forEach(info => {
      const name = s.players[Number(info.dataset.seat)]?.name;
      info.classList.toggle('av-in', av.list.includes(name));
      info.classList.toggle('talking', !!av.meters.get(name)?.talking);
      const peer = av.peers.get(name), showPanel = !window.Okey3D?.on && peer?.cam && peer.media;
      if (showPanel && !peer.panel) { peer.panel = document.createElement('video'); peer.panel.className = 'av-panel-video'; peer.panel.muted = true; peer.panel.autoplay = true; peer.panel.playsInline = true; }
      if (peer?.panel) {
        if (showPanel) { if (peer.panel.srcObject !== peer.media.srcObject) peer.panel.srcObject = peer.media.srcObject; if (peer.panel.parentNode !== info) info.append(peer.panel); peer.panel.play?.().catch(() => {}); }
        else peer.panel.remove();
      }
    });
  }

  function init() {
    // game.js'teki `const socket` ortak global kapsamda ama window özelliği değil.
    if (typeof socket === 'undefined' || !socket.on) return;
    $('avMicBtn')?.addEventListener('click', toggleMic);
    $('avCamBtn')?.addEventListener('click', toggleCam);
    socket.on(ev('voice'), onVoiceList);
    socket.on(ev('signal'), onSignal);
    socket.on('connect', () => { if (av.joined) { for (const n of [...av.peers.keys()]) closePeer(n); socket.emit(ev('voiceJoin')); } });
    document.addEventListener('okey:render', paint);
    addEventListener('beforeunload', () => { if (av.joined) socket.emit(ev('voiceLeave')); });
    paintButtons();
  }

  init();
  return {
    level: name => av.meters.get(name)?.level || 0,
    videoFor: name => { const p = av.peers.get(name); return p?.cam && p.media ? p.media : null; },
    get mic() { return av.mic; }, get cam() { return av.cam; },
  };
})();
