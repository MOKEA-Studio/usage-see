'use strict';
const fs = require('node:fs');

const PROVIDERS = ['claude', 'gemini', 'codex'];
function emptyState() { return { connectedProviders: [], snapshots: {}, failures: {}, widgetVisible: false }; }
function normalizeState(value) {
  const state = emptyState();
  if (!value || typeof value !== 'object') return state;
  if (Array.isArray(value.connectedProviders)) state.connectedProviders = [...new Set(value.connectedProviders.filter(p => PROVIDERS.includes(p)))];
  if (value.snapshots && typeof value.snapshots === 'object') {
    for (const p of state.connectedProviders) {
      const snap = value.snapshots[p];
      if (snap?.provider === p && Array.isArray(snap.windows) && Number.isFinite(Date.parse(snap.capturedAt))) state.snapshots[p] = snap;
    }
  }
  if (value.failures && typeof value.failures === 'object') {
    for (const p of state.connectedProviders) if (value.failures[p]?.status) state.failures[p] = value.failures[p];
  }
  state.widgetVisible = value.widgetVisible === true;
  return state;
}
function loadState(file) {
  try { return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { return emptyState(); }
}
function saveState(file, state) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(normalizeState(state), null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}
function setConnected(state, provider, connected) {
  if (!PROVIDERS.includes(provider)) throw new Error('지원하지 않는 서비스입니다.');
  if (connected && !state.connectedProviders.includes(provider)) state.connectedProviders.push(provider);
  if (!connected) {
    state.connectedProviders = state.connectedProviders.filter(p => p !== provider);
    delete state.snapshots[provider];
    delete state.failures[provider];
  }
  return state;
}
module.exports = { PROVIDERS, emptyState, normalizeState, loadState, saveState, setConnected };
