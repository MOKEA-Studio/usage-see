(function (root) {
  'use strict';

  const PROVIDERS = {
    claude: { host: 'claude.ai', path: /(?:\/settings\/usage|#settings\/usage)/i },
    gemini: { host: 'gemini.google.com', path: null },
    codex: { host: 'chatgpt.com', path: /\/codex\//i }
  };

  function providerForUrl(rawUrl) {
    let url;
    try { url = new URL(rawUrl); } catch { return null; }
    if (url.protocol !== 'https:') return null;
    for (const [name, rule] of Object.entries(PROVIDERS)) {
      if (url.hostname === rule.host && (!rule.path || rule.path.test(url.pathname + url.hash))) return name;
    }
    return null;
  }

  function cleanLines(text) {
    return String(text || '').split(/\n+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 1200);
  }

  const labels = {
    five_hour: /(?:current session|5[ -]?hour(?:s)?|five[ -]?hour|5시간|현재 세션|5時間|5 horas?)/i,
    weekly: /(?:weekly|week(?:ly)? limit|7[ -]?day|주간|1주|이번 주|週間|semanal)/i
  };
  const excluded = /(?:api|credit|billing|cost|token|추가 사용|크레딧|결제|비용)/i;

  function percentFrom(line) {
    const match = line.match(/(?:^|\D)(100|\d{1,2})(?:[.,](\d+))?\s*%/);
    if (!match) return null;
    const value = Number(`${match[1]}.${match[2] || '0'}`);
    return value >= 0 && value <= 100 ? value : null;
  }

  function metricFrom(line) {
    const percent = percentFrom(line);
    if (percent !== null) {
      const isRemaining = /(?:remaining|left|available|잔여|남음|残り)/i.test(line) &&
        !/(?:used|consumed|사용|利用済)/i.test(line);
      return isRemaining ? { remainingText: `${percent}% 남음` } : { usedPercent: percent };
    }
    const match = line.match(/(?:remaining|left|available|잔여|남음)\s*[:：]?\s*(\d[\d,.]*\s*(?:messages?|requests?|credits?|회|건))/i);
    return match ? { remainingText: match[1] } : null;
  }

  function resetFrom(line, now) {
    if (!/(?:reset|refresh|renew|초기화|재설정|갱신|リセット)/i.test(line)) return null;
    // Only unambiguous ISO timestamps or relative durations become absolute times.
    const iso = line.match(/\b(20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2}))\b/i);
    if (iso) {
      const date = new Date(iso[1].replace(' ', 'T'));
      if (!Number.isNaN(date.getTime())) return { resetsAt: date.toISOString() };
    }
    const relative = line.match(/(?:in|후)\s*(?:(\d+)\s*(?:hours?|hrs?|시간|h)\s*)?(?:(\d+)\s*(?:minutes?|mins?|분|m))?/i);
    if (relative && (relative[1] || relative[2])) {
      const minutes = Number(relative[1] || 0) * 60 + Number(relative[2] || 0);
      if (minutes > 0 && minutes <= 10080) return { resetsAt: new Date(now + minutes * 60000).toISOString() };
    }
    return { resetText: line.slice(0, 100) };
  }

  function parseWindow(lines, start, kind, now) {
    const heading = lines[start];
    const segment = [heading];
    for (let i = start + 1; i < Math.min(lines.length, start + 7); i++) {
      if (labels.five_hour.test(lines[i]) || labels.weekly.test(lines[i]) || excluded.test(lines[i])) break;
      segment.push(lines[i]);
    }
    let metric = null;
    let reset = null;
    for (const line of segment) {
      metric ||= metricFrom(line);
      reset ||= resetFrom(line, now);
    }
    const result = { kind };
    const label = heading.replace(labels[kind], '').replace(/^[\s:：—–-]+|[\s:：—–-]+$/g, '');
    if (kind === 'weekly' && label && label.length < 50 && !/%|reset|초기화/i.test(label)) result.label = label;
    return Object.assign(result, metric || {}, reset || {});
  }

  function parseWeeklyGroup(lines, start, now) {
    const heading = lines[start];
    if (metricFrom(heading)) return [parseWindow(lines, start, 'weekly', now)];
    const items = [];
    let nextLabel;
    for (let i = start + 1; i < Math.min(lines.length, start + 18); i++) {
      const line = lines[i];
      if (labels.five_hour.test(line) || labels.weekly.test(line) || excluded.test(line)) break;
      const metric = metricFrom(line);
      const reset = resetFrom(line, now);
      if (metric) {
        const item = { kind: 'weekly', ...metric };
        if (nextLabel) item.label = nextLabel;
        items.push(item);
        nextLabel = undefined;
      } else if (reset && items.length) {
        Object.assign(items[items.length - 1], reset);
      } else if (!reset && line.length <= 45 && !/(?:usage|limit|사용량|한도)/i.test(line)) {
        nextLabel = line;
      }
    }
    if (!items.length) return [parseWindow(lines, start, 'weekly', now)];
    return items;
  }

  function parseUsage(provider, text, sourceUrl, now = Date.now()) {
    if (providerForUrl(sourceUrl) !== provider) throw new Error('지원하지 않는 페이지입니다.');
    const lines = cleanLines(text);
    const all = lines.join(' ');
    const loginRequired = /(?:sign in|log in|로그인|계정에 로그인)/i.test(all) &&
      !/(?:usage|사용량|사용 한도|limit)/i.test(all);
    if (loginRequired) return { provider, windows: [], capturedAt: new Date(now).toISOString(), sourceUrl, status: 'login_required' };

    // Gemini's usage view is a dialog over the chat page. Do not parse the chat underneath it.
    if (provider === 'gemini' && !/(?:usage limits?|사용량 한도|사용 한도|使用量)/i.test(all)) {
      return { provider, windows: [], capturedAt: new Date(now).toISOString(), sourceUrl, status: 'parse_error' };
    }
    if (provider === 'codex' && !/(?:usage|사용량|limit)/i.test(all)) {
      return { provider, windows: [], capturedAt: new Date(now).toISOString(), sourceUrl, status: 'parse_error' };
    }

    const windows = [];
    for (let i = 0; i < lines.length; i++) {
      if (excluded.test(lines[i])) continue;
      const kind = labels.five_hour.test(lines[i]) ? 'five_hour' : labels.weekly.test(lines[i]) ? 'weekly' : null;
      if (!kind) continue;
      const parsed = kind === 'weekly' ? parseWeeklyGroup(lines, i, now) : [parseWindow(lines, i, kind, now)];
      for (const item of parsed) {
        if (item.usedPercent === undefined && !item.remainingText && !item.resetsAt && !item.resetText) continue;
        if (kind === 'five_hour' && windows.some(w => w.kind === kind)) continue;
        if (kind === 'weekly' && windows.some(w => w.kind === kind && w.label === item.label)) continue;
        windows.push(item);
      }
    }
    const hasMetric = windows.some(w => w.usedPercent !== undefined || w.remainingText);
    const hasFive = windows.some(w => w.kind === 'five_hour' && (w.usedPercent !== undefined || w.remainingText));
    const hasWeek = windows.some(w => w.kind === 'weekly' && (w.usedPercent !== undefined || w.remainingText));
    return {
      provider, windows, capturedAt: new Date(now).toISOString(), sourceUrl,
      status: !hasMetric ? 'parse_error' : hasFive && hasWeek ? 'ok' : 'partial'
    };
  }

  const api = { providerForUrl, parseUsage, cleanLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.UsageSeeParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
