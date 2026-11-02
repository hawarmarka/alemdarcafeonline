'use strict';
// WebRTC ICE ayarı: STUN her zaman, TURN varsa geçici kimlik bilgisiyle (coturn "use-auth-secret" / REST API).
// TURN_URLS: virgülle ayrılmış adresler (ör. "turn:turn.alanadi.com:3478,turns:turn.alanadi.com:5349?transport=tcp")
// TURN_SECRET: coturn'deki static-auth-secret ile aynı. Kimlik 6 saat geçerli.
const crypto = require('crypto');

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];
const TTL_SEC = 6 * 3600;

function config(id = 'oyuncu', now = Date.now()) {
  const urls = String(process.env.TURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  const secret = process.env.TURN_SECRET || '';
  if (!urls.length || !secret) return { iceServers: STUN };
  const username = `${Math.floor(now / 1000) + TTL_SEC}:${String(id).replace(/[^\w-]/g, '').slice(0, 32) || 'oyuncu'}`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  return { iceServers: [...STUN, { urls, username, credential }] };
}

// Yalnızca bir masada oturan (ya da izleyen) bağlantı TURN bilgisi alır; başkası TURN'ü aktarıcı olarak kullanamasın.
function onSocket(socket) {
  socket.on('rtc:ice', ack => {
    if (typeof ack !== 'function') return;
    const d = socket.data || {};
    const atTable = d.roomCode || d.batakCode || d.pistiCode || d.isimCode || d.watchCode || d.batakWatch || d.pistiWatch || d.isimWatch;
    // Kullanıcı adına oyuncu jetonu konmaz (TURN loglarına düşerdi); bağlantı kimliği yeterli.
    ack(atTable ? config(socket.id) : { iceServers: STUN });
  });
}

module.exports = { config, onSocket, STUN };
