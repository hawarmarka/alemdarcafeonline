'use strict';
// Hesaplar ve oturumlar SQLite'ta (DATA_DIR/accounts.db). Her işlem yalnızca ilgili satırı yazar;
// önceki sürüm her kayıtta bütün accounts.json dosyasını senkron olarak baştan yazıyordu.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const Avatars = require('./avatars');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'accounts.db');
const LEGACY_FILE = path.join(DATA_DIR, 'accounts.json');
const SESSION_MS = 30 * 86400000;
let storageMode = 'disk';
function openDb() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    return new DatabaseSync(DB_FILE);
  } catch (err) {
    // Coolify'da kalıcı depolama yazılamıyorsa oyun çökmesin; hesaplar bu çalışma boyunca bellekte tutulur.
    console.error(`UYARI: ${DB_FILE} açılamadı; hesaplar kalıcı olmaz (${err.message}). Coolify'da /app/data için kalıcı depolama ekleyin.`);
    storageMode = 'memory';
    return new DatabaseSync(':memory:');
  }
}
const db = openDb();
// Veri klasörü gerçekten kalıcı bir diske mi bağlı? Docker'da kalıcı depolama (volume) yoksa klasör container'ın
// kendi katmanındadır ve her güncellemede (yeni container) hesaplar silinir. Linux'ta bağlama noktalarından anlaşılır.
function detectStorage() {
  if (storageMode === 'memory') return 'memory';
  try {
    const target = path.resolve(DATA_DIR);
    const mounts = fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n').map(l => l.split(' ')[4]).filter(Boolean);
    const best = mounts.filter(m => target === m || target.startsWith(m.endsWith('/') ? m : m + '/')).sort((a, b) => b.length - a.length)[0];
    return best && best !== '/' ? 'persistent' : 'ephemeral';
  } catch { return 'unknown'; } // Linux değil (ör. Windows'ta geliştirme): kontrol edilemez
}
const storage = detectStorage();
if (storage === 'ephemeral' && process.env.NODE_ENV === 'production') {
  console.error(`!!! DİKKAT: ${DATA_DIR} kalıcı depolamaya bağlı DEĞİL. Bir sonraki güncellemede BÜTÜN HESAPLAR SİLİNİR. ` +
    `Coolify → uygulama → Storages → Add → Volume, Destination Path: ${DATA_DIR}`);
}
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 3000;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    username_key TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT 'default.svg',
    frame TEXT NOT NULL DEFAULT 'gold',
    xp INTEGER NOT NULL DEFAULT 0,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS users_rank ON users(xp DESC, wins DESC);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
// Sanal çip ekonomisi (gerçek para yok): başlangıç çipi, birkaç saatte bir ücretsiz hediye çip, seviye ödülü.
// Eski veritabanlarına sütunlar burada eklenir; mevcut hesaplar başlangıç çipiyle başlar.
const START_CHIPS = 10000, BONUS_EVERY_MS = 4 * 3600000, BONUS_BASE = 1000, SUPPORT_CHIPS = 5000;
const userCols = new Set(db.prepare('PRAGMA table_info(users)').all().map(c => c.name));
if (!userCols.has('chips')) db.exec(`ALTER TABLE users ADD COLUMN chips INTEGER NOT NULL DEFAULT ${START_CHIPS}`);
if (!userCols.has('bonus_at')) db.exec('ALTER TABLE users ADD COLUMN bonus_at INTEGER NOT NULL DEFAULT 0');
const levelOf = xp => Math.floor(Math.sqrt((xp || 0) / 120)) + 1;
const usernameKey = s => String(s).toLocaleLowerCase('tr');
const q = {
  byKey: db.prepare('SELECT * FROM users WHERE username_key = ?'),
  insertUser: db.prepare('INSERT INTO users (id, username, username_key, salt, password_hash, avatar, frame, xp, games, wins) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  insertSession: db.prepare('INSERT OR REPLACE INTO sessions (token_hash, uid, expires) VALUES (?, ?, ?)'),
  bySession: db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.uid WHERE s.token_hash = ? AND s.expires >= ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  setAvatar: db.prepare('UPDATE users SET avatar = ? WHERE id = ?'),
  setFrame: db.prepare('UPDATE users SET frame = ? WHERE id = ?'),
  award: db.prepare('UPDATE users SET games = games + 1, wins = wins + ?, xp = xp + ? WHERE id = ?'),
  leaderboard: db.prepare('SELECT * FROM users WHERE games > 0 ORDER BY xp DESC, wins DESC LIMIT ?'),
  leaderboardChips: db.prepare('SELECT * FROM users WHERE games > 0 ORDER BY chips DESC, xp DESC LIMIT ?'),
  byId: db.prepare('SELECT * FROM users WHERE id = ?'),
  takeChips: db.prepare('UPDATE users SET chips = chips - ? WHERE id = ? AND chips >= ?'),
  addChips: db.prepare('UPDATE users SET chips = chips + ? WHERE id = ?'),
  claimBonus: db.prepare('UPDATE users SET chips = chips + ?, bonus_at = ? WHERE id = ? AND bonus_at = ?'),
};
function transaction(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (err) { db.exec('ROLLBACK'); throw err; }
}
// Eski accounts.json bir kez içe aktarılır. Dosya okunamıyorsa hiçbir şey silinmez ve üzerine yazılmaz;
// düzeltilip sunucu yeniden başlatılınca aktarma tekrar denenir. Dosya yedek olarak yerinde bırakılır.
function migrateLegacy() {
  if (!fs.existsSync(LEGACY_FILE)) return;
  if (db.prepare("SELECT value FROM meta WHERE key = 'legacy_json_imported'").get()) return;
  let legacy;
  try { legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8')); }
  catch (err) { console.error(`UYARI: ${LEGACY_FILE} okunamadı (${err.message}). Eski hesaplar aktarılmadı; dosyaya dokunulmadı.`); return; }
  let users = 0, skipped = 0, sessions = 0;
  transaction(() => {
    for (const u of Array.isArray(legacy?.users) ? legacy.users : []) {
      if (!u?.id || !u.username || !u.salt || !u.passwordHash || q.byKey.get(usernameKey(u.username))) { skipped++; continue; }
      q.insertUser.run(String(u.id), String(u.username), usernameKey(u.username), String(u.salt), String(u.passwordHash),
        String(u.avatar || 'default.svg'), String(u.frame || 'gold'), Number(u.xp) || 0, Number(u.games) || 0, Number(u.wins) || 0);
      users++;
    }
    const known = new Set(db.prepare('SELECT id FROM users').all().map(r => r.id));
    for (const [hash, s] of Object.entries(legacy?.sessions || {})) {
      if (/^[a-f0-9]{64}$/.test(hash) && known.has(s?.uid) && s.expires >= Date.now()) { q.insertSession.run(hash, s.uid, Number(s.expires)); sessions++; }
    }
    db.prepare("INSERT INTO meta (key, value) VALUES ('legacy_json_imported', ?)").run(new Date().toISOString());
  });
  console.log(`Eski hesaplar SQLite'a aktarıldı: ${users} hesap, ${sessions} oturum${skipped ? `, ${skipped} kayıt atlandı` : ''}. ${LEGACY_FILE} yedek olarak bırakıldı.`);
}
migrateLegacy();
// Süresi dolan oturumlar açılışta ve sunucu açık kaldıkça 6 saatte bir silinir.
const purgeSessions = () => { try { db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()); } catch (err) { console.error('Oturum temizliği başarısız:', err.message); } };
purgeSessions();
setInterval(purgeSessions, 6 * 3600000).unref();
// Günlük yedek: DATA_DIR/backups/accounts-YYYY-MM-DD.db (son 7 gün tutulur). Bozulma veya yanlış silmeye karşı;
// kalıcı depolama yoksa yedek de kaybolur, asıl koruma volume'dur.
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
function dailyBackup() {
  if (storageMode === 'memory') return;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `accounts-${new Date().toISOString().slice(0, 10)}.db`);
    if (!fs.existsSync(file)) db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const old = fs.readdirSync(BACKUP_DIR).filter(f => /^accounts-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -7);
    for (const f of old) fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
  } catch (err) { console.error('Hesap yedeği alınamadı:', err.message); }
}
dailyBackup();
setInterval(dailyBackup, 6 * 3600000).unref();
// Asenkron: şifre hash'i libuv iş parçacığında hesaplanır, event loop (ve masalardaki oyuncular) beklemez.
function hash(password, salt) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key.toString('hex'))));
}
function rowToUser(r) {
  return r ? { id: r.id, username: r.username, avatar: r.avatar, frame: r.frame, xp: r.xp, games: r.games, wins: r.wins, chips: r.chips, bonusAt: r.bonus_at } : null;
}
function cleanUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, avatar: Avatars.ref(u.avatar || 'default.svg'), frame: u.frame || 'gold', xp: u.xp || 0,
    level: levelOf(u.xp), games: u.games || 0, wins: u.wins || 0,
    chips: u.chips ?? START_CHIPS, nextBonusAt: (u.bonusAt || 0) + BONUS_EVERY_MS };
}
// ---------- Çip ----------
const userById = id => rowToUser(q.byId.get(String(id)));
const chipsOf = id => userById(id)?.chips ?? 0;
// Bahis alma: yeterli çip yoksa hiçbir şey düşülmez ve false döner (tek SQL cümlesi, eşzamanlı isteklerde eksiye düşmez).
function takeChips(id, amount) { return amount <= 0 || q.takeChips.run(amount, id, amount).changes === 1; }
function addChips(id, amount) { if (amount > 0) q.addChips.run(Math.floor(amount), id); }
// Ücretsiz hediye çip: 4 saatte bir, seviyeyle artar; çipi azalan oyuncuya destek miktarı verilir.
function bonusAmount(u) { return Math.max(BONUS_BASE + 100 * (levelOf(u.xp) - 1), (u.chips ?? 0) < BONUS_BASE ? SUPPORT_CHIPS : 0); }
function claimBonus(user) {
  const u = userById(user.id);
  if (!u) throw Error('Hesap bulunamadı.');
  const now = Date.now(), next = (u.bonusAt || 0) + BONUS_EVERY_MS;
  if (now < next) throw Error(`Sonraki hediye çip ${Math.ceil((next - now) / 60000)} dakika sonra.`);
  const amount = bonusAmount(u);
  if (q.claimBonus.run(amount, now, u.id, u.bonusAt || 0).changes !== 1) throw Error('Hediye zaten alındı.');
  return { amount, user: cleanUser(userById(u.id)) };
}
function usernameValid(s) { return typeof s === 'string' && /^[\p{L}\p{N}_-]{3,18}$/u.test(s); }
async function register(username, password) {
  if (!usernameValid(username)) throw Error('Kullanıcı adı 3-18 harf/rakam olmalıdır.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw Error('Şifre en az 8 karakter olmalıdır.');
  if (q.byKey.get(usernameKey(username))) throw Error('Bu kullanıcı adı kullanımda.');
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = await hash(password, salt);
  // Hash beklenirken aynı adla başka kayıt yapılmış olabilir; UNIQUE kısıtı bunu yakalar.
  try { q.insertUser.run(crypto.randomUUID(), username, usernameKey(username), salt, passwordHash, 'default.svg', 'gold', 0, 0, 0); }
  catch (err) { if (/UNIQUE/i.test(err.message)) throw Error('Bu kullanıcı adı kullanımda.'); throw err; }
  return login(username, password);
}
async function login(username, password) {
  if (typeof password !== 'string' || password.length > 128) throw Error('Kullanıcı adı veya şifre yanlış.');
  const u = q.byKey.get(usernameKey(username));
  // Constant-time compare even for missing user.
  const digest = await hash(password, u?.salt || '00000000000000000000000000000000');
  if (!u || !crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(u.password_hash, 'hex'))) throw Error('Kullanıcı adı veya şifre yanlış.');
  const token = crypto.randomBytes(32).toString('hex');
  q.insertSession.run(crypto.createHash('sha256').update(token).digest('hex'), u.id, Date.now() + SESSION_MS);
  return { token, user: cleanUser(rowToUser(u)) };
}
function fromToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  return rowToUser(q.bySession.get(crypto.createHash('sha256').update(token).digest('hex'), Date.now()));
}
function logout(token) {
  if (typeof token !== 'string') return;
  q.deleteSession.run(crypto.createHash('sha256').update(token).digest('hex'));
}
function updateAvatar(user, avatar) {
  // Allow only the bundled avatars or small, actual image data URI content.
  if (!Avatars.BUILTIN.includes(avatar)) {
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(avatar));
    if (!match || match[2].length > 180000 || Buffer.from(match[2], 'base64').length > 135000) throw Error('Profil resmi PNG/JPG/WEBP ve en fazla 135 KB olmalı.');
    const raw = Buffer.from(match[2], 'base64');
    const png = raw.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    const jpeg = raw.subarray(0, 3).toString('hex') === 'ffd8ff';
    const webp = raw.subarray(0, 4).toString() === 'RIFF' && raw.subarray(8, 12).toString() === 'WEBP';
    if (!png && !jpeg && !webp) throw Error('Geçerli bir resim seç.');
    if ((match[1] === 'png' && !png) || (match[1] === 'jpeg' && !jpeg) || (match[1] === 'webp' && !webp)) throw Error('Dosya türü uyuşmuyor.');
  }
  q.setAvatar.run(avatar, user.id);
  user.avatar = avatar; return cleanUser(user);
}
// Oyun sonu XP; seviye atlayan oyuncuya yeni seviye × 500 çip ödülü. Seviye atladıysa { level, reward } döner.
function award(id, won) {
  const before = userById(id);
  q.award.run(won ? 1 : 0, won ? 200 : 40, id);
  const after = userById(id);
  if (!before || !after || levelOf(after.xp) <= levelOf(before.xp)) return null;
  const level = levelOf(after.xp), reward = level * 500;
  addChips(id, reward);
  return { level, reward };
}
function updateFrame(user, frame) {
  if (!['gold', 'silver', 'royal', 'emerald', 'neon', 'rose'].includes(frame)) throw Error('Geçersiz çerçeve.');
  q.setFrame.run(frame, user.id);
  user.frame = frame; return cleanUser(user);
}
// Lobi sıralaması: XP'ye veya çipe göre ilk N oyuncu (şifre/oturum bilgisi dönmez).
function leaderboard(n = 25, by = 'xp') {
  const chips = by === 'chips';
  return (chips ? q.leaderboardChips : q.leaderboard).all(n).map(r => cleanUser(rowToUser(r)))
    .sort((a, b) => (chips ? b.chips - a.chips : 0) || b.xp - a.xp || b.wins - a.wins || a.username.localeCompare(b.username, 'tr'))
    .map(u => ({ username: u.username, avatar: u.avatar, frame: u.frame, level: u.level, xp: u.xp, wins: u.wins, games: u.games, chips: u.chips }));
}
function close() { try { db.close(); } catch {} }
// /health için: hesaplar kalıcı diskte mi ('persistent'), container içinde mi ('ephemeral'), bellekte mi ('memory')?
const storageStatus = () => storage;
const userByName = name => rowToUser(q.byKey.get(usernameKey(name)));
module.exports = { register, login, cleanUser, fromToken, logout, updateAvatar, updateFrame, award, leaderboard, close, storageStatus,
  chipsOf, takeChips, addChips, claimBonus, START_CHIPS,
  // social.js aynı veritabanını kullanır (arkadaşlık ve mesaj tabloları)
  db, userById, userByName };
