const test = require('node:test');
const assert = require('node:assert/strict');
const { isAdminKeyFormat, sumCents, fetchSpentCents } = require('../electron/anthropic-admin');

test('admin key format check accepts only sk-ant-admin keys', () => {
  assert.equal(isAdminKeyFormat('sk-ant-admin01-abc'), true);
  assert.equal(isAdminKeyFormat('sk-ant-api03-abc'), false);
  assert.equal(isAdminKeyFormat(''), false);
  assert.equal(isAdminKeyFormat(undefined), false);
});

test('sumCents adds every result amount across buckets', () => {
  const data = [
    { results: [{ amount: '100.5' }, { amount: '50' }] },
    { results: [{ amount: '25.25' }] },
    { results: [] }
  ];
  assert.equal(sumCents(data), 175.75);
});

test('sumCents ignores malformed amounts and missing results', () => {
  assert.equal(sumCents([{ results: [{ amount: 'oops' }] }, { }, undefined]), 0);
});

test('fetchSpentCents follows pagination until has_more is false', async () => {
  const pages = [
    { data: [{ results: [{ amount: '100' }] }], has_more: true, next_page: 'page_2' },
    { data: [{ results: [{ amount: '50' }] }], has_more: false, next_page: null }
  ];
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url.toString());
    return { ok: true, json: async () => pages.shift() };
  };
  const total = await fetchSpentCents('sk-ant-admin01-test', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', fetchImpl);
  assert.equal(total, 150);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes('page=page_2'));
});

test('fetchSpentCents throws a Korean message for 401/403/429, including the API detail', async () => {
  const cases = [[401, /키가 올바르지 않습니다/], [403, /관리자 권한/], [429, /너무 잦습니다/], [500, /HTTP 500/]];
  for (const [status, pattern] of cases) {
    const fetchImpl = async () => ({ ok: false, status, json: async () => ({ error: { message: 'detail from api' } }) });
    await assert.rejects(fetchSpentCents('sk-ant-admin01-test', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', fetchImpl), pattern);
  }
});

test('fetchSpentCents floors both ends to the UTC day and requests daily buckets', async () => {
  let sent;
  const fetchImpl = async url => { sent = url; return { ok: true, json: async () => ({ data: [], has_more: false, next_page: null }) }; };
  await fetchSpentCents('sk-ant-admin01-test', '2026-01-01T15:30:00.123Z', new Date('2026-01-03T09:45:05.456Z'), fetchImpl);
  assert.equal(sent.searchParams.get('starting_at'), '2026-01-01T00:00:00Z');
  assert.equal(sent.searchParams.get('ending_at'), '2026-01-03T00:00:00Z');
  assert.equal(sent.searchParams.get('bucket_width'), '1d');
});

test('fetchSpentCents returns 0 without a network call when no full UTC day has elapsed since the anchor', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({ data: [], has_more: false, next_page: null }) }; };
  const total = await fetchSpentCents('sk-ant-admin01-test', '2026-01-01T08:00:00Z', '2026-01-01T20:00:00Z', fetchImpl);
  assert.equal(total, 0);
  assert.equal(called, false);
});

test('fetchSpentCents never asks for an ending_at bucket beyond today, even mid-day', async () => {
  let sent;
  const fetchImpl = async url => { sent = url; return { ok: true, json: async () => ({ data: [], has_more: false, next_page: null }) }; };
  const anchorAt = '2025-12-30T00:05:00Z';
  const now = '2026-01-01T03:20:00Z';
  await fetchSpentCents('sk-ant-admin01-test', anchorAt, now, fetchImpl);
  assert.ok(Date.parse(sent.searchParams.get('ending_at')) <= Date.parse(now));
  assert.equal(sent.searchParams.get('ending_at'), '2026-01-01T00:00:00Z');
});
