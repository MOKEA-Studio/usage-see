'use strict';
const path = require('node:path');
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, clipboard } = require('electron');
const { parseUsage } = require('../src/parser');
const { PROVIDERS, loadState, saveState, setConnected } = require('./state');
const cli = require('./cli-providers');

const URLS = {
  claude: 'https://claude.ai/settings/usage',
  gemini: 'https://gemini.google.com/',
  codex: 'https://chatgpt.com/codex/settings/usage'
};
let mainWindow, widgetWindow, tray, state, statePath;

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
async function openProvider(provider) {
  if (!PROVIDERS.includes(provider)) throw new Error('지원하지 않는 서비스입니다.');
  await shell.openExternal(URLS[provider]);
  return true;
}
function markFailure(provider, status) {
  state.failures[provider] = { status, at: new Date().toISOString() };
  broadcast();
  return { ok: false, status };
}
async function readProvider(provider) {
  if (!state.connectedProviders.includes(provider)) throw new Error('서비스를 먼저 연결해 주세요.');
  if (provider === 'codex' || provider === 'claude') {
    if (!await cli.authenticated(provider)) return markFailure(provider, 'login_required');
    try {
      const snapshot = provider === 'codex' ? await cli.readCodex() : cli.readClaude();
      state.snapshots[provider] = snapshot; delete state.failures[provider]; broadcast();
      return { ok: true, snapshot };
    } catch (error) { return markFailure(provider, provider === 'claude' ? 'waiting_data' : error.message || 'read_error'); }
  }
  const text = clipboard.readText().slice(0, 100000);
  if (!text.trim()) return markFailure(provider, 'clipboard_empty');
  try {
    const snapshot = parseUsage(provider, text, URLS[provider]);
    if (snapshot.status === 'login_required' || snapshot.status === 'parse_error') return markFailure(provider, snapshot.status);
    snapshot.captureMethod = 'clipboard';
    snapshot.sourceUrl = null; // 복사한 텍스트의 실제 탭 주소는 확인할 수 없다.
    state.snapshots[provider] = snapshot;
    delete state.failures[provider];
    broadcast();
    return { ok: true, snapshot };
  } catch { return markFailure(provider, 'parse_error'); }
}

app.whenReady().then(() => {
  statePath = path.join(app.getPath('userData'), 'state.json');
  state = loadState(statePath);
  ipcMain.handle('state:get', () => state);
  ipcMain.handle('provider:connect', async (_event, provider, connected) => {
    if (!PROVIDERS.includes(provider)) throw new Error('지원하지 않는 서비스입니다.');
    if (!connected && provider === 'claude') cli.uninstallClaudeBridge();
    if (connected && provider !== 'gemini') {
      if (!cli.executable(provider)) throw new Error(`${provider} CLI를 먼저 설치해 주세요.`);
      if (!await cli.authenticated(provider)) {
        if (!state.pendingProviders.includes(provider)) state.pendingProviders.push(provider);
        broadcast();
        cli.beginLogin(provider);
        return { pendingLogin: true };
      }
      if (provider === 'claude') cli.installClaudeBridge();
    } else if (connected) await openProvider(provider);
    setConnected(state, provider, !!connected);
    broadcast();
    if (connected && provider !== 'gemini') await readProvider(provider);
    return state;
  });
  ipcMain.handle('provider:open', (_event, provider) => openProvider(provider));
  ipcMain.handle('provider:auth', async (_event, provider) => {
    if (!['codex', 'claude'].includes(provider)) throw new Error('지원하지 않는 서비스입니다.');
    return cli.authenticated(provider);
  });
  ipcMain.handle('provider:read', (_event, provider) => readProvider(provider));
  ipcMain.handle('history:clear', () => { state.snapshots = {}; state.failures = {}; broadcast(); return state; });
  ipcMain.handle('widget:visible', (_event, visible) => setWidgetVisible(visible));
  ipcMain.handle('app:show', () => { createMainWindow(); return true; });
  createMainWindow(); createTray();
  if (state.widgetVisible) setWidgetVisible(true);
  let checkingLogin = false;
  const checkPendingLogins = async () => {
    if (checkingLogin) return;
    checkingLogin = true;
    try {
      for (const provider of [...state.pendingProviders]) {
        if (!await cli.authenticated(provider)) continue;
        try {
          if (provider === 'claude') cli.installClaudeBridge();
          setConnected(state, provider, true);
          broadcast();
          await readProvider(provider);
        } catch (error) { markFailure(provider, error.message); }
      }
    } finally { checkingLogin = false; }
  };
  let refreshing = false;
  const refreshCli = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      for (const provider of ['codex', 'claude']) {
        if (!state.connectedProviders.includes(provider)) continue;
        if (!await cli.authenticated(provider)) { markFailure(provider, 'login_required'); continue; }
        if (provider === 'claude') { try { cli.installClaudeBridge(); } catch (error) { markFailure(provider, error.message); continue; } }
        await readProvider(provider);
      }
    } finally { refreshing = false; }
  };
  checkPendingLogins();
  refreshCli();
  setInterval(checkPendingLogins, 3000);
  setInterval(refreshCli, 60 * 1000);
  app.on('activate', createMainWindow);
  app.on('window-all-closed', () => {});
});
