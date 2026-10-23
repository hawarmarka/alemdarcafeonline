'use strict';
// Bot hesabı için küçük worker_threads havuzu. Her iş en az boş olan worker'a gider.
// decide() hiçbir zaman hata fırlatmaz: worker çökerse, süre dolarsa veya havuz kapalıysa null döner
// (çağıran sezgisel karara geçer, masa beklemez). Çöken worker kendiliğinden yeniden kurulur.
const path = require('node:path');
const os = require('node:os');
const { Worker } = require('node:worker_threads');
const Logger = require('./logger');

const SIZE = Math.max(1, Math.min(Number(process.env.BOT_WORKERS) || Math.max(1, (os.availableParallelism?.() || os.cpus().length) - 1), 4));
const workers = [];
let nextId = 1, closed = false;

function spawn(slot) {
  const w = new Worker(path.join(__dirname, 'botWorker.js'));
  const entry = { w, jobs: new Map() };
  w.on('message', ({ id, result, error }) => {
    const job = entry.jobs.get(id); if (!job) return;
    entry.jobs.delete(id); clearTimeout(job.timer);
    if (error) Logger.warn?.('Bot worker hatası: ' + error);
    job.resolve(error ? null : result);
  });
  // 'error' ardından 'exit' de gelir; yalnızca ilki işlenir (worker bir kez yeniden kurulur).
  const fail = err => {
    if (entry.dead) return; entry.dead = true;
    if (err && !closed) Logger.warn?.('Bot worker durdu: ' + (err.message || err));
    for (const job of entry.jobs.values()) { clearTimeout(job.timer); job.resolve(null); }
    entry.jobs.clear();
    if (!closed && workers[slot] === entry) workers[slot] = spawn(slot);
  };
  w.on('error', fail);
  w.on('exit', code => fail(new Error('çıkış kodu ' + code)));
  w.unref(); // açık worker sunucunun kapanmasını engellemesin
  return entry;
}
function decide(input, timeoutMs = 2500) {
  if (closed) return Promise.resolve(null);
  if (!workers.length) for (let i = 0; i < SIZE; i++) workers.push(spawn(i));
  const entry = workers.reduce((a, b) => (b.jobs.size < a.jobs.size ? b : a));
  const id = nextId++;
  return new Promise(resolve => {
    const timer = setTimeout(() => { entry.jobs.delete(id); resolve(null); }, timeoutMs);
    timer.unref?.();
    entry.jobs.set(id, { resolve, timer });
    try { entry.w.postMessage({ id, input }); }
    catch (_) { entry.jobs.delete(id); clearTimeout(timer); resolve(null); }
  });
}
async function close() {
  closed = true;
  await Promise.all(workers.splice(0).map(e => { for (const j of e.jobs.values()) { clearTimeout(j.timer); j.resolve(null); } return e.w.terminate(); }));
}
module.exports = { decide, close, size: SIZE };
