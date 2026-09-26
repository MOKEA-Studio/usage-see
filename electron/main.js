'use strict';
const path = require('node:path');
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session } = require('electron');
const { providerForUrl, parseUsage } = require('../src/parser');
const { PROVIDERS, loadState, saveState, setConnected } = require('./state');

const URLS = {
  claude: 'https://claude.ai/settings/usage',
  gemini: 'https://gemini.google.com/',
  codex: 'https://chatgpt.com/codex/settings/usage'
};
const READ_VISIBLE_TEXT = `(() => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')].find(el => el.getClientRects().length && /usage|사용량|limit/i.test(el.innerText || ''));
  const scope = dialog || document.querySelector('main') || document.body;
  return (scope?.innerText || '').slice(0, 100000);
})()`;
let mainWindow, widgetWindow, tray, state, statePath;
const providerWindows = new Map();

function broadcast() {
  saveState(statePath, state);
  for (const win of [mainWindow, widgetWindow]) if (win && !win.isDestroyed()) win.webContents.send('state:changed', state);
  updateTray();
}
function secureLocalWindow(options, file) {
  const win = new BrowserWindow({ ...options, webPreferences: {
    preload: path.join(__dirname, 'preload.js'), nodeIntegration: false,
    contextIsolation: true, sandbox: true
  } });
  win.loadFile(path.join(__dirname, '..', 'app', file));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  return win;
}
function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); return; }
  mainWindow = secureLocalWindow({ title: 'Usage See', width: 960, height: 720, minWidth: 720, minHeight: 560, backgroundColor: '#f6f7f5', show: false }, 'index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}
function setWidgetVisible(visible) {
  state.widgetVisible = !!visible;
  if (visible && (!widgetWindow || widgetWindow.isDestroyed())) {
    widgetWindow = secureLocalWindow({ title: 'Usage See Widget', width: 350, height: 420, minWidth: 310, minHeight: 300, frame: false, transparent: false, alwaysOnTop: true, skipTaskbar: true, resizable: true, backgroundColor: '#f9fbf8', show: false }, 'widget.html');
    widgetWindow.once('ready-to-show', () => widgetWindow.show());
    widgetWindow.on('closed', () => { widgetWindow = null; if (state.widgetVisible) { state.widgetVisible = false; broadcast(); } });
  } else if (!visible && widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.close();
  broadcast();
  return state;
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Usage See 열기', click: createMainWindow },
    { label: state.widgetVisible ? '위젯 숨기기' : '위젯 표시', click: () => setWidgetVisible(!state.widgetVisible) },
    { type: 'separator' }, { label: '종료', click: () => app.quit() }
  ]));
}
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Usage See');
  tray.on('double-click', createMainWindow);
  updateTray();
}
function providerWindow(provider) {
  if (!PROVIDERS.includes(provider)) throw new Error('지원하지 않는 서비스입니다.');
  let win = providerWindows.get(provider);
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return win; }
  win = new BrowserWindow({ title: `${provider[0].toUpperCase()}${provider.slice(1)} 사용량`, width: 1100, height: 800, minWidth: 750, minHeight: 550,
    webPreferences: { partition: `usage-see-${provider}`, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  win.webContents.setWindowOpenHandler(details => {
    try { return new URL(details.url).protocol === 'https:' ? { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: `usage-see-${provider}` } } } : { action: 'deny' }; }
    catch { return { action: 'deny' }; }
  });
  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('https://')) event.preventDefault(); });
  win.on('closed', () => providerWindows.delete(provider));
  providerWindows.set(provider, win);
  win.loadURL(URLS[provider]);
  return win;
}
function markFailure(provider, status) {
  state.failures[provider] = { status, at: new Date().toISOString() };
  broadcast();
  return { ok: false, status };
}
async function readProvider(provider) {
  if (!state.connectedProviders.includes(provider)) throw new Error('서비스를 먼저 연결해 주세요.');
  const win = providerWindows.get(provider);
  if (!win || win.isDestroyed()) return markFailure(provider, 'parse_error');
  const url = win.webContents.getURL();
  if (providerForUrl(url) !== provider) return markFailure(provider, 'login_required');
  if (provider === 'codex' && !/usage|analytics/i.test(new URL(url).pathname + new URL(url).hash)) return markFailure(provider, 'parse_error');
  try {
    const text = await win.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: READ_VISIBLE_TEXT }]);
    if (win.webContents.getURL() !== url) return markFailure(provider, 'parse_error');
    const snapshot = parseUsage(provider, text, url);
    if (snapshot.status === 'login_required' || snapshot.status === 'parse_error') return markFailure(provider, snapshot.status);
    state.snapshots[provider] = snapshot;
    delete state.failures[provider];
    broadcast();
    return { ok: true, snapshot };
  } catch { return markFailure(provider, 'parse_error'); }
}

app.whenReady().then(() => {
  statePath = path.join(app.getPath('userData'), 'state.json');
  state = loadState(statePath);
  for (const provider of PROVIDERS) session.fromPartition(`usage-see-${provider}`).setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ipcMain.handle('state:get', () => state);
  ipcMain.handle('provider:connect', async (_event, provider, connected) => {
    setConnected(state, provider, !!connected);
    if (connected) providerWindow(provider);
    else {
      const win = providerWindows.get(provider);
      if (win && !win.isDestroyed()) win.close();
      await session.fromPartition(`usage-see-${provider}`).clearStorageData();
    }
    broadcast(); return state;
  });
  ipcMain.handle('provider:open', (_event, provider) => { providerWindow(provider); return true; });
  ipcMain.handle('provider:read', (_event, provider) => readProvider(provider));
  ipcMain.handle('history:clear', () => { state.snapshots = {}; state.failures = {}; broadcast(); return state; });
  ipcMain.handle('widget:visible', (_event, visible) => setWidgetVisible(visible));
  ipcMain.handle('app:show', () => { createMainWindow(); return true; });
  createMainWindow(); createTray();
  if (state.widgetVisible) setWidgetVisible(true);
  app.on('activate', createMainWindow);
  app.on('window-all-closed', () => {});
});
