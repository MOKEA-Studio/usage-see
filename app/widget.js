(function () {
  'use strict';
  const { info, dateLabel, stale, status, el } = UsageSeeFormat;
  const $ = id => document.getElementById(id);
  function makeRow(label, data) {
    const wrap = el('div', '');
    const row = el('div', 'row');
    row.append(el('span', '', data?.label ? `${label} · ${data.label}` : label));
    const pct = Number.isFinite(data?.usedPercent) && data.usedPercent >= 0 && data.usedPercent <= 100;
    row.append(el('strong', !pct && !data?.remainingText ? 'unknown' : '', pct ? `${data.usedPercent}% 사용` : data?.remainingText || '확인 필요'));
    wrap.append(row);
    if (pct) { const bar = el('div', 'bar'), fill = el('div', `barFill${data.usedPercent >= 90 ? ' critical' : data.usedPercent >= 75 ? ' high' : ''}`); fill.style.width = `${data.usedPercent}%`; bar.append(fill); wrap.append(bar); }
    return wrap;
  }
  function render(state) {
    const items = $('items'); items.replaceChildren();
    $('empty').classList.toggle('hidden', state.connectedProviders.length > 0);
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
      card.append(el('div', 'checked', snapshot ? `확인 ${dateLabel(snapshot.capturedAt)}${stale(snapshot, failure) ? ' · 이전 값' : ''}` : '아직 읽은 기록 없음'));
      items.append(card);
    }
  }
  window.usageSee.getState().then(state => { render(state); window.usageSee.onState(render); });
  $('closeButton').onclick = () => window.usageSee.setWidgetVisible(false);
  $('appButton').onclick = () => window.usageSee.showApp();
})();
