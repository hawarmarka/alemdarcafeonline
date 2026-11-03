// Tanıtım sitesi: son sürümün zip bağlantısı GitHub cevabından doğru okunur; GitHub'a ulaşılamazsa sürümler sayfasına düşer.
const assert = require('assert');
const Site = require('../server/site');

(async () => {
    const ok = async () => ({ ok: true, json: async () => ({ tag_name: 'v1.3.0', published_at: '2026-11-03T15:00:00Z', assets: [
        { name: 'notlar.txt', browser_download_url: 'https://x/notlar.txt', size: 10 },
        { name: 'AlemdarKiraathanesi-Windows-1.3.0.zip', browser_download_url: 'https://x/oyun.zip', size: 305913805 }] }) });
    Site._reset();
    const v = await Site.latest(ok);
    assert.strictEqual(v.version, '1.3.0');
    assert.strictEqual(v.url, 'https://x/oyun.zip');
    assert.strictEqual(v.size, 305913805);
    // önbellek: ikinci çağrı GitHub'a gitmez
    let calls = 0; await Site.latest(async () => { calls++; return ok(); }); assert.strictEqual(calls, 0);

    Site._reset();
    const down = await Site.latest(async () => { throw new Error('ağ yok'); });
    assert.ok(/releases\/latest$/.test(down.url), 'GitHub yoksa sürümler sayfası');
    assert.strictEqual(down.version, '');

    Site._reset();
    const odd = await Site.latest(async () => ({ ok: true, json: async () => ({ tag_name: '<b>x</b>', assets: [] }) }));
    assert.strictEqual(odd.version, '', 'sürüm adı yalnız rakam ve nokta');
    console.log('v46Site: son sürüm bağlantısı, önbellek, GitHub yokken yedek bağlantı geçti');
})().catch(e => { console.error(e); process.exit(1); });
