const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUsage, providerForUrl } = require('../src/parser');

const NOW = Date.parse('2026-09-26T05:00:00Z');

test('only supported official hosts are accepted', () => {
  assert.equal(providerForUrl('https://claude.ai/settings/usage'), 'claude');
  assert.equal(providerForUrl('https://gemini.google.com/app'), 'gemini');
  assert.equal(providerForUrl('https://chatgpt.com/codex/settings/usage'), 'codex');
  assert.equal(providerForUrl('https://claude.ai.evil.example/settings/usage'), null);
  assert.equal(providerForUrl('http://claude.ai/settings/usage'), null);
  assert.equal(providerForUrl('https://chatgpt.com/c/123'), null);
});

test('parses displayed usage and relative reset without inventing missing values', () => {
  const snapshot = parseUsage('claude', 'Plan usage limits\nCurrent session\n72% used\nResets in 2h 30m\nWeekly limits\n41% used\nResets 2026-09-29T00:00:00Z', 'https://claude.ai/settings/usage', NOW);
  assert.equal(snapshot.status, 'ok');
  assert.equal(snapshot.windows[0].usedPercent, 72);
  assert.equal(snapshot.windows[0].resetsAt, '2026-09-26T07:30:00.000Z');
  assert.equal(snapshot.windows[1].usedPercent, 41);
  assert.equal(snapshot.windows[1].resetsAt, '2026-09-29T00:00:00.000Z');
});

test('preserves remaining percentage as remaining rather than converting to used', () => {
  const snapshot = parseUsage('codex', 'Usage\n5-hour limit\n35% remaining\nWeekly limit\n80% used', 'https://chatgpt.com/codex/settings/usage', NOW);
  assert.equal(snapshot.windows[0].remainingText, '35% 남음');
  assert.equal(snapshot.windows[0].usedPercent, undefined);
  assert.equal(snapshot.windows[1].usedPercent, 80);
});

test('missing 5-hour value is partial, with no synthetic zero', () => {
  const snapshot = parseUsage('gemini', 'Usage limits\n5-hour limit\nCheck later\nWeekly limit\n64% used', 'https://gemini.google.com/app', NOW);
  assert.equal(snapshot.status, 'partial');
  assert.equal(snapshot.windows.some(w => w.kind === 'five_hour'), false);
});

test('unreadable page is a parser failure', () => {
  const snapshot = parseUsage('gemini', 'Gemini chat\nHello', 'https://gemini.google.com/app', NOW);
  assert.equal(snapshot.status, 'parse_error');
  assert.deepEqual(snapshot.windows, []);
});

test('ambiguous reset stays as original text', () => {
  const snapshot = parseUsage('claude', 'Current session\n72% used\nResets Tuesday 09:00', 'https://claude.ai/settings/usage', NOW);
  assert.equal(snapshot.windows[0].resetsAt, undefined);
  assert.equal(snapshot.windows[0].resetText, 'Resets Tuesday 09:00');
});

test('keeps separate weekly values when the page lists model groups', () => {
  const snapshot = parseUsage('claude', 'Current session\n20% used\nWeekly limits\nAll models\n41% used\nResets 2026-09-29T00:00:00Z\nFable\n12% used', 'https://claude.ai/settings/usage', NOW);
  const weeks = snapshot.windows.filter(w => w.kind === 'weekly');
  assert.deepEqual(weeks.map(w => [w.label, w.usedPercent]), [['All models', 41], ['Fable', 12]]);
});
