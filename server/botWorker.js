'use strict';
// worker_threads içinde çalışır: Monte Carlo bot kararını ana iş parçacığını (event loop) durdurmadan hesaplar.
// Mesaj: { id, input } → cevap: { id, result } veya { id, error }.
const { parentPort } = require('node:worker_threads');
const BotMC = require('./botMC');
parentPort.on('message', ({ id, input }) => {
  try { parentPort.postMessage({ id, result: BotMC.chooseDiscard(input) }); }
  catch (err) { parentPort.postMessage({ id, error: String(err?.message || err) }); }
});
