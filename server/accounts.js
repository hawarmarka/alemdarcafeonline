'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'accounts.json');
let db = { users: [], sessions: {} };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) {}
db.users ||= []; db.sessions ||= {};
function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
  } catch (err) {
    // Coolify'da kalıcı depolama yazılamıyorsa oyun çökmesin; hata günlüğe yazılsın.
    console.error(`Hesap verisi kaydedilemedi (${DATA_DIR}): ${err.message}. Coolify'da /app/data için kalıcı depolama ekleyin.`);
  }
}
// Başlangıçta veri klasörünün yazılabildiğini kontrol et
try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.accessSync(DATA_DIR, fs.constants.W_OK); }
catch (err) { console.error(`UYARI: ${DATA_DIR} yazılamıyor; hesaplar kalıcı olmaz (${err.message}).`); }
function hash(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }
function cleanUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, avatar: u.avatar || 'default.svg', frame: u.frame || 'gold', xp: u.xp || 0,
    level: Math.floor(Math.sqrt((u.xp || 0) / 120)) + 1,
    games: u.games || 0, wins: u.wins || 0 };
}
function usernameValid(s) { return typeof s === 'string' && /^[\p{L}\p{N}_-]{3,18}$/u.test(s); }
function register(username, password) {
  if (!usernameValid(username)) throw Error('Kullanıcı adı 3-18 harf/rakam olmalıdır.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw Error('Şifre en az 8 karakter olmalıdır.');
  if (db.users.some(u => u.username.toLocaleLowerCase('tr') === username.toLocaleLowerCase('tr'))) throw Error('Bu kullanıcı adı kullanımda.');
  const salt = crypto.randomBytes(16).toString('hex');
  const u = { id: crypto.randomUUID(), username, salt, passwordHash: hash(password, salt), avatar: 'default.svg', frame: 'gold', xp: 0, games: 0, wins: 0 };
  db.users.push(u); save(); return login(username, password);
}
function login(username, password) {
  const u = db.users.find(u => u.username.toLocaleLowerCase('tr') === String(username).toLocaleLowerCase('tr'));
  // Constant-time compare even for missing user.
  const digest = hash(String(password || ''), u?.salt || '00000000000000000000000000000000');
  if (!u || !crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(u.passwordHash, 'hex'))) throw Error('Kullanıcı adı veya şifre yanlış.');
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[crypto.createHash('sha256').update(token).digest('hex')] = { uid: u.id, expires: Date.now() + 30 * 86400000 };
  save(); return { token, user: cleanUser(u) };
}
function fromToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const key = crypto.createHash('sha256').update(token).digest('hex');
  const s = db.sessions[key];
  if (!s || s.expires < Date.now()) return null;
  return db.users.find(u => u.id === s.uid) || null;
}
function logout(token) {
  if (typeof token !== 'string') return;
  delete db.sessions[crypto.createHash('sha256').update(token).digest('hex')]; save();
}
function updateAvatar(user, avatar) {
  // Allow only the bundled avatars or small, actual image data URI content.
  const builtin = ['default.svg', 'alibicim.png', 'egefitness.png', 'james.jpg', 'lvblc5.jpg'];
  if (!builtin.includes(avatar)) {
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(avatar));
    if (!match || match[2].length > 180000 || Buffer.from(match[2], 'base64').length > 135000) throw Error('Profil resmi PNG/JPG/WEBP ve en fazla 135 KB olmalı.');
    const raw = Buffer.from(match[2], 'base64');
    const png = raw.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    const jpeg = raw.subarray(0, 3).toString('hex') === 'ffd8ff';
    const webp = raw.subarray(0, 4).toString() === 'RIFF' && raw.subarray(8, 12).toString() === 'WEBP';
    if (!png && !jpeg && !webp) throw Error('Geçerli bir resim seç.');
    if ((match[1] === 'png' && !png) || (match[1] === 'jpeg' && !jpeg) || (match[1] === 'webp' && !webp)) throw Error('Dosya türü uyuşmuyor.');
  }
  user.avatar = avatar; save(); return cleanUser(user);
}
function award(id, won) {
  const user = db.users.find(u => u.id === id);
  if (!user) return;
  user.games = (user.games || 0) + 1;
  if (won) user.wins = (user.wins || 0) + 1;
  user.xp = (user.xp || 0) + (won ? 200 : 40);
  save();
}
function updateFrame(user, frame) {
  if (!['gold', 'silver', 'royal', 'emerald', 'neon', 'rose'].includes(frame)) throw Error('Geçersiz çerçeve.');
  user.frame = frame; save(); return cleanUser(user);
}
// Lobi sıralaması: XP'ye göre ilk N oyuncu (şifre/oturum bilgisi dönmez).
function leaderboard(n = 25) {
  return db.users.filter(u => (u.games || 0) > 0).map(cleanUser)
    .sort((a, b) => b.xp - a.xp || b.wins - a.wins || a.username.localeCompare(b.username, 'tr')).slice(0, n)
    .map(u => ({ username: u.username, avatar: u.avatar, frame: u.frame, level: u.level, xp: u.xp, wins: u.wins, games: u.games }));
}
module.exports = { register, login, cleanUser, fromToken, logout, updateAvatar, updateFrame, award, leaderboard };
