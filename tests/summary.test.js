'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { usageSummary } = require('../app/summary');

test('top bar shows configured services using fresh five-hour remaining quota', () => {
  const now = Date.parse('2026-09-26T06:00:00Z');
  const state = {
    connectedProviders: ['claude', 'codex'],
    snapshots: {
      claude: { capturedAt: new Date(now).toISOString(), windows: [{ kind: 'five_hour', usedPercent: 64, resetsAt: new Date(now + 3600000).toISOString() }] },
      codex: { capturedAt: new Date(now).toISOString(), windows: [{ kind: 'five_hour', usedPercent: 81, resetsAt: new Date(now + 3600000).toISOString() }] }
    }
  };
  assert.equal(usageSummary(state, now), '[Claude: 36%  Codex: 19%]');
  state.connectedProviders = ['codex'];
  assert.equal(usageSummary(state, now), '[Codex: 19%]');
  assert.equal(usageSummary(state, now + 16 * 60000), '[Codex: —]');
});

test('top bar appends API balance when configured, and omits it otherwise', () => {
  const now = Date.parse('2026-09-26T06:00:00Z');
  const state = { connectedProviders: [], snapshots: {}, apiBalance: { configured: true, remaining: 83.98 } };
  assert.equal(usageSummary(state, now), '[API $83.98]');
  state.apiBalance.configured = false;
  assert.equal(usageSummary(state, now), '');
  state.apiBalance = undefined;
  assert.equal(usageSummary(state, now), '');
});
