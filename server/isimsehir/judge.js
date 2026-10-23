'use strict';
// İsim Şehir hakemi: bir elin bütün cevaplarını doğrular.
// 1) Biçim: boş değil, harfle başlıyor (Türkçe karakterler isteğe bağlı: "semsiye" = "Şemsiye"), en çok 30 karakter.
// 2) Yerleşik sözlük (words.js). Bitki/hayvanda "elma ağacı", "gül çiçeği" gibi ekler kabul edilir.
// 3) Önbellek: daha önce yapay zekânın verdiği kararlar (DATA_DIR/isimsehir.db, kalıcı).
// 4) Yapay zekâ (Claude): sözlükte olmayan cevaplar elde bir kez, toplu sorulur. "yksd" gibi uydurma kelimeler reddedilir.
//    ANTHROPIC_API_KEY yoksa ya da cevap gelmezse sözlükte olmayan kelime geçersiz sayılır (gerekçesi yazılır).
const fs = require('node:fs');
const path = require('node:path');
const W = require('./words');

const MODEL = 'claude-opus-5-5';
const AI_TIMEOUT_MS = Number(process.env.ISIM_AI_TIMEOUT_MS) || 12000;
const SUFFIX = { bitki: / (ağacı|çiçeği|bitkisi|fidanı|tohumu|meyvesi)$/u, hayvan: / (yavrusu|kuşu|balığı)$/u };

// ---------- Kalıcı önbellek ----------
let db = null;
const memo = new Map(); // `${kategori}:${anahtar}` → { valid, canonical, reason, by }
function openDb() {
  if (db !== null) return db;
  try {
    const { DatabaseSync } = require('node:sqlite');
    const dir = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
    fs.mkdirSync(dir, { recursive: true });
    db = new DatabaseSync(path.join(dir, 'isimsehir.db'));
    db.exec('CREATE TABLE IF NOT EXISTS verdicts (category TEXT NOT NULL, key TEXT NOT NULL, valid INTEGER NOT NULL, canonical TEXT, reason TEXT, created INTEGER, PRIMARY KEY (category, key))');
  } catch (err) { console.error('İsim Şehir önbelleği açılamadı:', err.message); db = false; }
  return db;
}
function cached(cat, key) {
  const id = `${cat}:${key}`;
  if (memo.has(id)) return memo.get(id);
  const d = openDb(); if (!d) return null;
  const row = d.prepare('SELECT valid, canonical, reason FROM verdicts WHERE category = ? AND key = ?').get(cat, key);
  if (!row) return null;
  const v = { valid: !!row.valid, canonical: row.canonical, reason: row.reason, by: 'ai' };
  memo.set(id, v); return v;
}
function remember(cat, key, v) {
  memo.set(`${cat}:${key}`, v);
  const d = openDb(); if (!d) return;
  try { d.prepare('INSERT OR REPLACE INTO verdicts (category, key, valid, canonical, reason, created) VALUES (?, ?, ?, ?, ?, ?)').run(cat, key, v.valid ? 1 : 0, v.canonical || '', v.reason || '', Date.now()); } catch (_) {}
}

// ---------- Yerel kontrol ----------
const clean = s => String(s || '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
const firstOf = s => W.norm(s).charAt(0);
// Harf eşleşmesi doğru yazılış üzerinden: "canakkale" Ç harfinde kabul, C harfinde ret.
const startsWith = (word, letter) => W.lower(word).startsWith(W.lower(letter));
function dictLookup(cat, text, letter) {
  const tries = [text];
  const m = SUFFIX[cat] && W.lower(text).match(SUFFIX[cat]);
  if (m) tries.push(text.slice(0, W.lower(text).length - m[0].length));
  for (const t of tries) {
    const forms = W.DICT[cat].get(W.norm(t));
    if (!forms) continue;
    const ok = forms.find(f => startsWith(f, letter));
    return ok ? { valid: true, canonical: ok, by: 'dict' } : { valid: false, canonical: forms[0], reason: `"${forms[0]}" ${letter} harfiyle başlamıyor`, by: 'dict' };
  }
  return null;
}
// Cevabın ilk bakışta durumu: boş, harf hatası, sözlükte/önbellekte karar ya da yapay zekâya sorulacak.
function precheck(cat, raw, letter) {
  const text = clean(raw);
  if (!text) return { text, valid: false, empty: true, reason: 'Boş' };
  if (firstOf(text) !== W.norm(letter)) return { text, valid: false, reason: `${letter} harfiyle başlamıyor` };
  if (W.norm(text).length < 2) return { text, valid: false, reason: 'Çok kısa' };
  const d = dictLookup(cat, text, letter); if (d) return { text, ...d };
  const c = cached(cat, W.norm(text));
  if (c) return { text, ...c, valid: c.valid && startsWith(c.canonical || text, letter) };
  return { text, pending: true };
}

// ---------- Yapay zekâ ----------
let client;
function aiClient() {
  if (client !== undefined) return client;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return (client = null);
  try { const sdk = require('@anthropic-ai/sdk'); const Anthropic = sdk.default || sdk; client = new Anthropic({ timeout: AI_TIMEOUT_MS, maxRetries: 1 }); }
  catch (err) { console.error('Anthropic SDK yüklenemedi:', err.message); client = null; }
  return client;
}
const SYSTEM = `Sen "İsim Şehir" kelime oyununun hakemisin. Oyuncular verilen harfle başlayan bir isim, şehir, hayvan, bitki ve eşya yazar.
Her cevap için gerçekten var olan, bu kategoriye uyan bir şey olup olmadığına karar ver. Uydurma, anlamsız harf dizileri (ör. "yksd"), kategori dışı kelimeler ve küfür geçersizdir.
Kurallar:
- isim: gerçek bir kişi adı (Türkçe ya da yabancı, yaygın bilinen ad). Soyadı tek başına, ünvan ya da kelime değil.
- sehir: Türkiye'nin il ya da ilçesi veya dünyada bilinen bir şehir. Ülke, bölge, köy ve semt adları geçersiz.
- hayvan: gerçek bir hayvan türü ya da yaygın adı (cins, kuş, balık, böcek dahil). Masal yaratıkları geçersiz.
- bitki: gerçek bir bitki, ağaç, çiçek, meyve, sebze, tahıl ya da ot.
- esya: elle tutulan, insan yapımı bir nesne ya da eşya. Yiyecek, hayvan, bitki, yer ve soyut kavram geçersiz.
Türkçe karakter eksikliği ve küçük yazım farkları (ör. "semsiye") hata değildir; doğru yazılışı canonical alanına yaz.
Cevabın doğru yazılışı oyunun harfiyle başlamıyorsa geçersizdir. Emin değilsen ve kelime yaygın bilinmiyorsa geçersiz say.
reason alanına kısa Türkçe gerekçe yaz (en çok 8 kelime).`;
const SCHEMA = { type: 'object', additionalProperties: false, required: ['results'], properties: { results: { type: 'array', items: { type: 'object', additionalProperties: false,
  required: ['i', 'valid', 'canonical', 'reason'], properties: { i: { type: 'integer' }, valid: { type: 'boolean' }, canonical: { type: 'string' }, reason: { type: 'string' } } } } } };
// items: [{ category, letter, answer }] → [{ valid, canonical, reason }] ya da yapay zekâ yoksa null.
async function askAI(items) {
  const ai = aiClient(); if (!ai || !items.length) return null;
  const body = {
    model: MODEL, max_tokens: 4000, system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: 'Şu cevapları değerlendir (i alanını aynen geri yaz):\n' +
      JSON.stringify(items.map((x, i) => ({ i, kategori: x.category, harf: x.letter, cevap: x.answer }))) }],
  };
  let res;
  try { res = await ai.beta.messages.create({ ...body, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }); }
  catch (err) {
    const sdk = require('@anthropic-ai/sdk'), A = sdk.default || sdk;
    if (!(err instanceof A.BadRequestError)) throw err;
    res = await ai.messages.create(body); // yedek model parametresi kabul edilmezse düz istek
  }
  if (res.stop_reason === 'refusal') return null;
  const text = res.content.find(b => b.type === 'text')?.text;
  const out = JSON.parse(text || '{}').results || [];
  return items.map((_, i) => out.find(r => r.i === i) || null);
}

// Bir elin cevaplarını doğrular. answers: [{ cat, text }] (her oyuncu ve kategori için) → aynı sırayla karar listesi.
async function judgeRound(letter, answers) {
  const verdicts = answers.map(a => precheck(a.cat, a.text, letter));
  // Aynı kelime bir kez sorulur.
  const ask = new Map();
  verdicts.forEach((v, i) => { if (v.pending) { const k = `${answers[i].cat}:${W.norm(v.text)}`; if (!ask.has(k)) ask.set(k, { category: answers[i].cat, letter, answer: v.text, key: W.norm(v.text) }); } });
  let ai = null;
  if (ask.size) { try { ai = await askAI([...ask.values()]); } catch (err) { console.error('İsim Şehir yapay zekâ hatası:', err.message); } }
  const decided = new Map();
  [...ask.entries()].forEach(([k, q], i) => {
    const r = ai?.[i];
    if (!r) { decided.set(k, { valid: false, reason: aiClient() ? 'Doğrulanamadı' : 'Sözlükte yok', by: 'none' }); return; }
    const canonical = String(r.canonical || q.answer).trim().slice(0, 40);
    const v = { valid: !!r.valid && startsWith(canonical, letter), canonical, reason: String(r.reason || '').slice(0, 80), by: 'ai' };
    remember(q.category, q.key, { ...v, valid: !!r.valid }); // harften bağımsız karar saklanır
    decided.set(k, v);
  });
  return verdicts.map((v, i) => {
    if (!v.pending) return v;
    return { text: v.text, ...decided.get(`${answers[i].cat}:${W.norm(v.text)}`) };
  });
}

module.exports = { judgeRound, precheck, clean, aiEnabled: () => !!aiClient(), _remember: remember, _setClient: c => { client = c; } };
