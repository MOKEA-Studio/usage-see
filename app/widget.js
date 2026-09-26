(function () {
  'use strict';
  const { info, date, dateLabel, stale, status, el } = UsageSeeFormat;
  const $ = id => document.getElementById(id);
  function makeRow(label, data) {
    const wrap = el('div', '');
    const row = el('div', 'row');
    row.append(el('span', '', data?.label ? `${label} · ${data.label}` : label));
    const pct = Number.isFinite(data?.usedPercent) && data.usedPercent >= 0 && data.usedPercent <= 100;
    row.append(el('strong', !pct && !data?.remainingText ? 'unknown' : '', pct ? `${data.usedPercent}% 사용` : data?.remainingText || '확인 필요'));
    wrap.append(row);
    if (pct) { const bar = el('div', 'bar'), fill = el('div', `barFill${data.usedPercent >= 95 ? ' critical' : data.usedPercent >= 80 ? ' high' : ''}`); fill.style.width = `${data.usedPercent}%`; bar.append(fill); wrap.append(bar); }
    if (data?.resetsAt) wrap.append(el('div', 'reset', `↻ ${dateLabel(data.resetsAt)} 초기화`));
    else if (data?.resetText) wrap.append(el('div', 'reset', `↻ ${data.resetText}`));
    return wrap;
  }
  function render(state) {
    const items = $('items'); items.replaceChildren();
    $('empty').classList.toggle('hidden', state.connectedProviders.length > 0);
    const latest = state.connectedProviders.map(p => date(state.snapshots[p]?.capturedAt)?.getTime() || 0).reduce((a, b) => Math.max(a, b), 0);
    $('widgetUpdated').textContent = latest ? `마지막 확인 ${dateLabel(latest)}` : '아직 확인한 기록 없음';
    for (const provider of state.connectedProviders) {
      const snapshot = state.snapshots[provider], failure = state.failures[provider], card = el('div', 'item'), head = el('div', 'itemHead');
      const [text, tone] = status(snapshot, failure);
      head.append(el('span', '', `${info[provider].logo}  ${info[provider].name}`), el('span', `status ${tone}`, text)); card.append(head);
      const windows = snapshot?.windows || [], rows = el('div', 'rows');
      rows.append(makeRow('5시간', windows.find(w => w.kind === 'five_hour')));
      const weekly = windows.filter(w => w.kind === 'weekly');
      if (weekly.length) weekly.forEach(w => rows.append(makeRow('1주', w)));
      else rows.append(makeRow('1주', null));
      card.append(rows);
      const checked = el('div', 'checked');
      if (snapshot) checked.append(el('span', 'source', snapshot.captureMethod === 'codex_app_server' ? 'Codex CLI' : snapshot.captureMethod === 'claude_statusline' ? 'Claude Code' : '복사한 화면'), el('span', '', `확인 ${dateLabel(snapshot.capturedAt)}${stale(snapshot, failure) ? ' · 이전 값' : ''}`));
      else checked.textContent = '아직 읽은 기록 없음';
      card.append(checked);
      items.append(card);
    }
  }
  window.usageSee.getState().then(state => { render(state); window.usageSee.onState(render); });
  $('closeButton').onclick = () => window.usageSee.setWidgetVisible(false);
  $('appButton').onclick = () => window.usageSee.showApp();
})();
