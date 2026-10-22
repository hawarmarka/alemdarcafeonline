'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'okey-accounts-test-'));
// Eski sürümün accounts.json dosyası: ilk açılışta SQLite'a aktarılmalı.
const salt = 'ab'.repeat(16);
fs.writeFileSync(path.join(process.env.DATA_DIR, 'accounts.json'), JSON.stringify({ users: [{ id: 'eski-1', username: 'EskiOyuncu', salt,
  passwordHash: crypto.scryptSync('eskisifre123', salt, 64).toString('hex'), avatar: 'james.jpg', frame: 'royal', xp: 500, games: 3, wins: 2 }], sessions: {} }));
let Accounts;
(async () => {
  Accounts = require('../server/accounts');
  // Şifre hash'i event loop'u bloke etmemeli: giriş sürerken başka işler (setImmediate) çalışabilmeli.
  let ticked = false;
  setImmediate(() => { ticked = true; });
  const legacy = await Accounts.login('eskioyuncu', 'eskisifre123');
  assert.equal(ticked, true, 'login event loop\'u bloke etmemeli');
  assert.equal(legacy.user.username, 'EskiOyuncu');
  assert.equal(legacy.user.xp, 500);
  assert.equal(legacy.user.frame, 'royal');
  const { token, user } = await Accounts.register('TestOyuncu', 'uzunsifre123');
  assert.equal(user.username, 'TestOyuncu');
  assert.equal(Accounts.fromToken(token).username, 'TestOyuncu');
  await assert.rejects(Accounts.login('TestOyuncu', 'yanlisSifre'), /yanlış/);
  await assert.rejects(Accounts.login('TestOyuncu', undefined), /yanlış/);
  await assert.rejects(Accounts.register('TestOyuncu', 'baskaSifre123'), /kullanımda/);
  await assert.rejects(Accounts.register('testoyuncu', 'baskaSifre123'), /kullanımda/);
  // Aynı adla eşzamanlı iki kayıt: yalnızca biri başarılı olmalı.
  const race = await Promise.allSettled([Accounts.register('Yaris', 'uzunsifre123'), Accounts.register('yaris', 'uzunsifre456')]);
  assert.deepEqual(race.map(r => r.status).sort(), ['fulfilled', 'rejected']);
  assert.throws(() => Accounts.updateAvatar(Accounts.fromToken(token), 'javascript:alert(1)'), /Profil resmi/);
  Accounts.award(user.id, true);
  assert.equal(Accounts.cleanUser(Accounts.fromToken(token)).xp, 200);
  assert.equal(Accounts.cleanUser(Accounts.fromToken(token)).wins, 1);
  assert.deepEqual(Accounts.leaderboard(5).map(u => u.username), ['EskiOyuncu', 'TestOyuncu']);
  Accounts.logout(token);
  assert.equal(Accounts.fromToken(token), null);
  // Bozuk eski dosya: sunucu açılmalı, dosyaya dokunulmamalı, hiçbir hesap silinmemeli.
  const brokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okey-accounts-broken-'));
  try {
    fs.writeFileSync(path.join(brokenDir, 'accounts.json'), '{"users": [ bozuk');
    execFileSync(process.execPath, ['-e', "const A=require(process.argv[1]);A.register('YeniOyuncu','uzunsifre123').then(()=>A.close())", path.join(__dirname, '../server/accounts')],
      { env: { ...process.env, DATA_DIR: brokenDir }, stdio: 'pipe' });
    assert.equal(fs.readFileSync(path.join(brokenDir, 'accounts.json'), 'utf8'), '{"users": [ bozuk');
  } finally { fs.rmSync(brokenDir, { recursive: true, force: true }); }
  console.log('accounts: SQLite, eski JSON aktarımı, bozuk dosya korunur, asenkron şifre, register, login, session, avatar validation, XP, logout passed');
})().catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => { Accounts?.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });
