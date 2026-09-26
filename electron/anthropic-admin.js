'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { safeStorage } = require('electron');

const API_BASE = 'https://api.anthropic.com/v1/organizations/cost_report';
const KEY_FILE = 'anthropic-admin-key.enc';

function keyPath(dir) { return path.join(dir, KEY_FILE); }
function isAdminKeyFormat(key) { return typeof key === 'string' && /^sk-ant-admin/.test(key.trim()); }
function hasAdminKey(dir) { return fs.existsSync(keyPath(dir)); }

function saveAdminKey(dir, key) {
  const trimmed = (key || '').trim();
  if (!isAdminKeyFormat(trimmed)) throw new Error('Admin API 키 형식이 아닙니다. sk-ant-admin으로 시작해야 합니다.');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const payload = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(trimmed) : Buffer.from(trimmed, 'utf8');
  fs.writeFileSync(keyPath(dir), payload, { mode: 0o600 });
}
function loadAdminKey(dir) {
  const file = keyPath(dir);
  if (!fs.existsSync(file)) return null;
  const buffer = fs.readFileSync(file);
  try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buffer) : buffer.toString('utf8'); }
  catch { return null; }
}
function deleteAdminKey(dir) { fs.rmSync(keyPath(dir), { force: true }); }

function sumCents(data) {
  let total = 0;
  for (const bucket of data || []) {
    for (const result of bucket?.results || []) {
      const value = Number.parseFloat(result?.amount);
      if (Number.isFinite(value)) total += value;
    }
  }
  return total;
}
function floorToDayIso(value) {
  const d = new Date(value);
  const boundary = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return boundary.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
async function statusError(response) {
  let detail = '';
  try { detail = (await response.json())?.error?.message || ''; } catch {}
  const suffix = detail ? `: ${detail}` : '';
  if (response.status === 401) return new Error(`Admin API 키가 올바르지 않습니다${suffix}`);
  if (response.status === 403) return new Error(`이 키에는 조직 관리자 권한이 없습니다${suffix}`);
  if (response.status === 429) return new Error('요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.');
  return new Error(`Cost Report 조회 실패 (HTTP ${response.status})${suffix}`);
}
async function fetchSpentCents(adminKey, startingAt, endingAt, fetchImpl = fetch) {
  // The Cost Report endpoint only accepts bucket_width "1d" - no hourly/minute
  // granularity - so a day is the smallest unit it can report. starting_at is
  // floored to the anchor's UTC day; ending_at is floored to *today's* UTC day
  // (never tomorrow), since a future ending_at gets server-side clamped and
  // can collapse the range to zero width ("ending date must be after
  // starting date"). That means today's still-incomplete day isn't queryable
  // yet: if no full UTC day has elapsed since the anchor, skip the network
  // call and report 0 spent so far.
  const start = floorToDayIso(startingAt), end = floorToDayIso(endingAt);
  if (Date.parse(end) <= Date.parse(start)) return 0;
  let total = 0, page = null;
  do {
    const url = new URL(API_BASE);
    url.searchParams.set('starting_at', start);
    url.searchParams.set('ending_at', end);
    url.searchParams.set('bucket_width', '1d');
    url.searchParams.set('limit', '31');
    if (page) url.searchParams.set('page', page);
    const response = await fetchImpl(url, { headers: { 'anthropic-version': '2023-06-01', 'x-api-key': adminKey } });
    if (!response.ok) throw await statusError(response);
    const body = await response.json();
    total += sumCents(body.data);
    page = body.has_more ? body.next_page : null;
  } while (page);
  return total;
}

module.exports = { isAdminKeyFormat, hasAdminKey, saveAdminKey, loadAdminKey, deleteAdminKey, sumCents, fetchSpentCents };
