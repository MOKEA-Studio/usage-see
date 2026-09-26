const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { emptyState, normalizeState, loadState, saveState, setConnected } = require('../electron/state');

test('connection starts empty and disconnect removes only that service data', () => {
  const state = emptyState();
  setConnected(state, 'claude', true); setConnected(state, 'gemini', true);
  state.snapshots.claude = { provider: 'claude', capturedAt: new Date().toISOString(), windows: [] };
  state.snapshots.gemini = { provider: 'gemini', capturedAt: new Date().toISOString(), windows: [] };
  state.failures.claude = { status: 'parse_error' };
  setConnected(state, 'claude', false);
  assert.deepEqual(state.connectedProviders, ['gemini']);
  assert.equal(state.snapshots.claude, undefined);
  assert.equal(state.failures.claude, undefined);
  assert.ok(state.snapshots.gemini);
});

test('saved state keeps only connected provider snapshots', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-see-'));
  try {
    const file = path.join(dir, 'state.json');
    const state = normalizeState({ connectedProviders: ['claude', 'bad', 'claude'], snapshots: {
      claude: { provider: 'claude', capturedAt: '2026-09-26T05:00:00Z', windows: [] },
      gemini: { provider: 'gemini', capturedAt: '2026-09-26T05:00:00Z', windows: [] }
    }, widgetVisible: true });
    saveState(file, state);
    assert.deepEqual(loadState(file).connectedProviders, ['claude']);
    assert.equal(loadState(file).snapshots.gemini, undefined);
    assert.equal(loadState(file).widgetVisible, true);
    assert.equal(loadState(file).widgetOpacity, 100);
    state.widgetOpacity = 55; saveState(file, state);
    assert.equal(loadState(file).widgetOpacity, 55);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('pending CLI login survives restart and becomes connected', () => {
  const state = normalizeState({ pendingProviders: ['codex', 'claude', 'gemini', 'codex'] });
  assert.deepEqual(state.pendingProviders, ['codex', 'claude']);
  setConnected(state, 'codex', true);
  assert.deepEqual(state.pendingProviders, ['claude']);
  assert.deepEqual(state.connectedProviders, ['codex']);
});
