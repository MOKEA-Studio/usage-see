'use strict';
const fs = require('node:fs');

const PROVIDERS = ['claude', 'gemini', 'codex'];
function emptyApiBalance() { return { configured: false, startingBalance: null, anchorAt: null, spentSince: 0, remaining: null, lastUpdated: null, error: null }; }
function emptyState() { return { connectedProviders: [], pendingProviders: [], snapshots: {}, failures: {}, widgetVisible: false, widgetOpacity: 100, apiBalance: emptyApiBalance() }; }
function normalizeState(value) {
  const state = emptyState();
  if (!value || typeof value !== 'object') return state;
  if (Array.isArray(value.connectedProviders)) state.connectedProviders = [...new Set(value.connectedProviders.filter(p => PROVIDERS.includes(p)))];
  if (Array.isArray(value.pendingProviders)) state.pendingProviders = [...new Set(value.pendingProviders.filter(p => ['codex', 'claude'].includes(p) && !state.connectedProviders.includes(p)))];
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
  if (Number.isFinite(value.widgetOpacity)) state.widgetOpacity = Math.max(40, Math.min(100, Math.round(value.widgetOpacity)));
  const b = value.apiBalance;
  if (b && typeof b === 'object' && b.configured === true && Number.isFinite(b.startingBalance) && Number.isFinite(Date.parse(b.anchorAt))) {
    state.apiBalance = {
      configured: true,
      startingBalance: b.startingBalance,
      anchorAt: b.anchorAt,
      spentSince: Number.isFinite(b.spentSince) ? b.spentSince : 0,
      remaining: Number.isFinite(b.remaining) ? b.remaining : b.startingBalance,
      lastUpdated: Number.isFinite(Date.parse(b.lastUpdated)) ? b.lastUpdated : null,
      error: typeof b.error === 'string' ? b.error : null
    };
  }
  return state;
}
function configureApiBalance(state, startingBalance) {
  if (!Number.isFinite(startingBalance) || startingBalance < 0) throw new Error('잔액 값이 올바르지 않습니다.');
  state.apiBalance = { configured: true, startingBalance, anchorAt: new Date().toISOString(), spentSince: 0, remaining: startingBalance, lastUpdated: null, error: null };
  return state;
}
function clearApiBalance(state) { state.apiBalance = emptyApiBalance(); return state; }
function applyApiBalanceReading(state, spentCents) {
  state.apiBalance.spentSince = spentCents;
  state.apiBalance.remaining = Math.round((state.apiBalance.startingBalance - spentCents / 100) * 100) / 100;
  state.apiBalance.lastUpdated = new Date().toISOString();
  state.apiBalance.error = null;
  return state;
}
function applyApiBalanceError(state, message) { state.apiBalance.error = message; return state; }
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
  state.pendingProviders = state.pendingProviders.filter(p => p !== provider);
  if (!connected) {
    state.connectedProviders = state.connectedProviders.filter(p => p !== provider);
    delete state.snapshots[provider];
    delete state.failures[provider];
  }
  return state;
}
module.exports = { PROVIDERS, emptyState, normalizeState, loadState, saveState, setConnected, emptyApiBalance, configureApiBalance, clearApiBalance, applyApiBalanceReading, applyApiBalanceError };
