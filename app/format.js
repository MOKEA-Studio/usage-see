(function (root) {
  'use strict';
  const info = {
    claude: { name: 'Claude', logo: '✳', hint: 'Settings → Usage' },
    gemini: { name: 'Gemini', logo: '✦', hint: 'Settings → Usage Limits → Usage' },
    codex: { name: 'Codex', logo: '⌘', hint: 'Settings → Usage' }
  };
  const MAX_AGE = 15 * 60 * 1000;
  function date(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
  function dateLabel(value) { const d = date(value); return d ? new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d) : '확인 필요'; }
  function timeLabel(value) { const d = date(value); return d ? new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(d) : '—'; }
  function stale(snapshot, failure, now = Date.now()) { const d = date(snapshot?.capturedAt); return !!snapshot && (!d || now - d.getTime() > MAX_AGE || !!failure || snapshot.windows?.some(w => w.resetsAt && date(w.resetsAt)?.getTime() <= now)); }
  function status(snapshot, failure) {
    if (failure?.status === 'login_required') return ['로그인 필요', 'error'];
    if (failure?.status === 'clipboard_empty') return ['복사 필요', 'warn'];
    if (failure) return ['읽기 실패', 'error'];
    if (!snapshot) return ['확인 필요', 'warn'];
    if (stale(snapshot, failure)) return ['오래된 정보', 'warn'];
    if (snapshot.status === 'partial') return ['값 일부 없음', 'warn'];
    return ['정상', ''];
  }
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function windowRow(kind, data) {
    const box = el('div', 'window'), head = el('div', 'windowHead');
    const label = kind === 'five_hour' ? '5시간' : '1주';
    head.append(el('span', 'windowLabel', data?.label ? `${label} · ${data.label}` : label));
    const pct = Number.isFinite(data?.usedPercent) && data.usedPercent >= 0 && data.usedPercent <= 100;
    head.append(el('span', `windowValue${!pct && !data?.remainingText ? ' unknown' : ''}`, pct ? `${data.usedPercent}% 사용` : data?.remainingText || '확인 필요'));
    box.append(head);
    if (pct) {
      const bar = el('div', 'bar'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuenow', String(data.usedPercent)); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
      const fill = el('div', `barFill${data.usedPercent >= 95 ? ' critical' : data.usedPercent >= 80 ? ' high' : ''}`); fill.style.width = `${data.usedPercent}%`; bar.append(fill); box.append(bar);
    }
    if (data?.resetsAt) box.append(el('div', 'reset', `↻ ${dateLabel(data.resetsAt)} 초기화`));
    else if (data?.resetText) box.append(el('div', 'reset', `↻ ${data.resetText}`));
    return box;
  }
  root.UsageSeeFormat = { info, date, dateLabel, timeLabel, stale, status, el, windowRow };
})(globalThis);
