'use strict';
// Alemdar Kıraathanesi masaüstü uygulaması (Windows, Electron).
// Varsayılan: oyun sunucusu uygulamanın İÇİNDE, bu bilgisayarda çalışır (127.0.0.1). Sayfalar, 3D ve botlu oyunlar
// tamamen yerel: internet gerekmez, gecikme yok. config.json'da "serverUrl" verilirse çevrimiçi sunucuya bağlanır
// (arkadaşlarla aynı masada oynamak için ortak sunucu gerekir).
const { app, BrowserWindow, Menu, shell, session, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');

// Performans: ekran kartını her zaman kullan, arka planda kısma yapma, kare hızı sınırı ekranla aynı.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const ROOT = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'); // server/, public/, node_modules/
function readConfig() {
  const cfg = {};
  for (const file of [path.join(__dirname, 'config.json'), path.join(app.getPath('userData'), 'config.json')]) {
    try { Object.assign(cfg, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (_) { /* yok */ }
  }
  const arg = process.argv.find(a => a.startsWith('--server='));
  if (arg) cfg.serverUrl = arg.slice('--server='.length);
  if (process.env.ALEMDAR_SERVER) cfg.serverUrl = process.env.ALEMDAR_SERVER;
  return cfg;
}

let win = null, serverProc = null, SERVER = '', ORIGIN = '';

if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', () => { if (!win) return; if (win.isMinimized()) win.restore(); win.focus(); });

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.unref(); s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
function waitHealthy(url, ms = 20000) {
  const until = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tryOnce = () => http.get(url + '/health', res => { res.resume(); res.statusCode === 200 ? resolve() : retry(); }).on('error', retry);
    const retry = () => (Date.now() > until ? reject(new Error('Yerel sunucu açılamadı')) : setTimeout(tryOnce, 150));
    tryOnce();
  });
}
// Oyun sunucusu, Electron'un kendi Node'uyla ayrı süreçte çalışır (pencere hiç takılmaz).
async function startLocalServer() {
  const port = await freePort();
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, BOT_AI: 'mc', NODE_ENV: 'production', LOG_LEVEL: 'warn' },
  });
  const log = fs.createWriteStream(path.join(dataDir, 'server.log'), { flags: 'a' });
  serverProc.stdout.pipe(log); serverProc.stderr.pipe(log);
  serverProc.on('exit', code => { serverProc = null; if (!app.isQuitting && win) win.loadFile(path.join(__dirname, 'offline.html')); log.write(`\nsunucu kapandı: ${code}\n`); });
  const url = `http://127.0.0.1:${port}`;
  await waitHealthy(url);
  return url;
}

function sameOrigin(url) { try { return new URL(url).origin === ORIGIN; } catch (_) { return false; } }

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640,
    title: 'Alemdar Kıraathanesi', backgroundColor: '#1b1c1e', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (!sameOrigin(url)) shell.openExternal(url); else win.loadURL(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!sameOrigin(url) && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on('did-fail-load', (_e, code, _d, url, isMain) => { if (isMain && code !== -3 && sameOrigin(url)) win.loadFile(path.join(__dirname, 'offline.html')); });
  // F11 tam ekran, F5 yenile, Ctrl+Shift+I geliştirici araçları.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (input.key === 'F5') { win.webContents.reload(); e.preventDefault(); }
    else if (input.control && input.shift && input.key.toLowerCase() === 'i') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  win.loadFile(path.join(__dirname, 'loading.html'));
  win.on('closed', () => { win = null; });
}

async function connect() {
  const cfg = readConfig();
  try {
    SERVER = cfg.serverUrl ? cfg.serverUrl.replace(/\/+$/, '') : await startLocalServer();
    ORIGIN = new URL(SERVER).origin;
    if (win) win.loadURL(SERVER + '/kiraathane');
  } catch (err) {
    if (win) win.loadFile(path.join(__dirname, 'offline.html'));
  }
}

app.whenReady().then(() => {
  // Kamera ve mikrofon izni yalnızca oyun sunucusunun sayfalarına (sesli/görüntülü sohbet).
  const ALLOWED = new Set(['media', 'audioCapture', 'videoCapture', 'speaker-selection', 'clipboard-sanitized-write', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => cb(ALLOWED.has(permission) && sameOrigin(details.requestingUrl || wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => ALLOWED.has(permission) && sameOrigin(origin));
  ipcMain.on('alemdar:retry', () => { if (serverProc || readConfig().serverUrl) { if (win) win.loadURL(SERVER + '/kiraathane'); } else connect(); });
  ipcMain.on('alemdar:fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });
  createWindow();
  connect();
});

app.on('before-quit', () => { app.isQuitting = true; if (serverProc) serverProc.kill(); });
app.on('window-all-closed', () => app.quit());
