// Tanıtım sitesi: ana sayfa (public/site), /indir (GitHub'daki son sürümün zip'ine yönlendirir), /api/surum.
// Eski web oyunu sayfaları ana sayfaya yönlenir; Unity istemcisinin kullandığı API ve socket bağlantısı değişmez.
const path = require('path');

const REPO = process.env.RELEASE_REPO || 'hawarmarka/alemdarcafeonline';
const RELEASES = `https://github.com/${REPO}/releases/latest`;
const OLD_PAGES = ['/game', '/batak', '/pisti', '/isim-sehir', '/kiraathane', '/lobby'];
const SITE = path.join(__dirname, '..', 'public', 'site', 'index.html');

let cache = null, cacheAt = 0, pending = null;
// GitHub'dan son sürümü okur (10 dk önbellek); ulaşılamazsa eldeki bilgiyle devam eder.
async function latest(fetchImpl = globalThis.fetch) {
    if (cache && Date.now() - cacheAt < 10 * 60 * 1000) return cache;
    if (pending) return pending;
    pending = (async () => {
        try {
            const r = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'alemdar-kiraathanesi', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(6000) });
            if (!r.ok) throw new Error('GitHub ' + r.status);
            const j = await r.json();
            const asset = (j.assets || []).find(a => /windows.*\.zip$/i.test(a.name)) || (j.assets || []).find(a => /\.zip$/i.test(a.name));
            const version = String(j.tag_name || '').replace(/^v/, '');
            cache = { version: /^[\d.]+$/.test(version) ? version : '', url: asset?.browser_download_url || RELEASES, size: asset?.size || 0, date: j.published_at || null };
            cacheAt = Date.now();
        } catch { if (!cache) cache = { version: '', url: RELEASES, size: 0, date: null }; cacheAt = Date.now() - 9 * 60 * 1000; } // 1 dk sonra tekrar dene
        finally { pending = null; }
        return cache;
    })();
    return pending;
}

function attach(app) {
    app.get(['/', '/index.html'], (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(SITE); });
    app.get([...OLD_PAGES, ...OLD_PAGES.map(p => p + '.html'), '/game.html'], (_req, res) => res.redirect(302, '/'));
    app.get('/indir', async (_req, res) => { const v = await latest(); res.redirect(302, v.url); });
    app.get('/api/surum', async (_req, res) => { const v = await latest(); res.json({ version: v.version, size: v.size, date: v.date }); });
}

module.exports = { attach, latest, _reset: () => { cache = null; cacheAt = 0; } };
