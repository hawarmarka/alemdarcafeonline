'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'okey-accounts-test-'));
try {
  const Accounts = require('../server/accounts');
  const { token, user } = Accounts.register('TestOyuncu', 'uzunsifre123');
  assert.equal(user.username, 'TestOyuncu');
  assert.equal(Accounts.fromToken(token).username, 'TestOyuncu');
  assert.throws(() => Accounts.login('TestOyuncu', 'yanlisSifre'), /yanlış/);
  assert.throws(() => Accounts.register('TestOyuncu', 'baskaSifre123'), /kullanımda/);
  assert.throws(() => Accounts.updateAvatar(Accounts.fromToken(token), 'javascript:alert(1)'), /Profil resmi/);
  Accounts.award(user.id, true);
  assert.equal(Accounts.cleanUser(Accounts.fromToken(token)).xp, 200);
  assert.equal(Accounts.cleanUser(Accounts.fromToken(token)).wins, 1);
  Accounts.logout(token);
  assert.equal(Accounts.fromToken(token), null);
  console.log('accounts: register, login, session, avatar validation, XP, logout passed');
} finally { fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); }
