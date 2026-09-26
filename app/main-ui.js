(function () {
  'use strict';
  const { info, date, dateLabel, timeLabel, stale, status, el, windowRow } = UsageSeeFormat;
  const $ = id => document.getElementById(id);
  let state = { connectedProviders: [], snapshots: {}, failures: {}, widgetVisible: false };
  let view = 'dashboard';
  function notice(message) { const box = $('notice'); box.textContent = message; box.classList.remove('hidden'); }
  function hideNotice() { $('notice').classList.add('hidden'); }
  function makeCard(provider) {
    const data = info[provider], snapshot = state.snapshots[provider], failure = state.failures[provider];
    const card = el('article', 'card'), top = el('div', 'cardTop'), name = el('div', 'providerName');
    name.append(el('span', `providerLogo ${provider}`, data.logo), el('span', '', data.name));
    const [text, tone] = status(snapshot, failure); top.append(name, el('span', `badge ${tone}`, text)); card.append(top);
    const windows = snapshot?.windows || [];
    card.append(windowRow('five_hour', windows.find(w => w.kind === 'five_hour')));
    const weekly = windows.filter(w => w.kind === 'weekly');
    if (weekly.length) weekly.forEach(w => card.append(windowRow('weekly', w)));
    else card.append(windowRow('weekly', null));
    const foot = el('div', 'cardFoot');
    const checked = el('span', 'checked');
    if (snapshot) checked.append(el('span', 'source', '공식 화면'), el('span', '', `확인 ${dateLabel(snapshot.capturedAt)}${stale(snapshot, failure) ? ' · 이전 값' : ''}`));
    else checked.textContent = '아직 읽은 기록 없음';
    foot.append(checked);
    const actions = el('div', 'actions');
    const open = el('button', 'linkButton', '공식 화면 열기 ↗'); open.type = 'button'; open.onclick = () => invoke(() => window.usageSee.openProvider(provider));
    const read = el('button', 'readButton', '현재 화면 읽기'); read.type = 'button'; read.onclick = () => readProvider(provider);
    actions.append(open, read); foot.append(actions); card.append(foot); return card;
  }
  function renderDashboard() {
    const cards = $('cards'); cards.replaceChildren(); state.connectedProviders.forEach(p => cards.append(makeCard(p)));
    $('emptyState').classList.toggle('hidden', state.connectedProviders.length > 0);
    $('connectedCount').textContent = String(state.connectedProviders.length);
    const latest = state.connectedProviders.map(p => date(state.snapshots[p]?.capturedAt)?.getTime() || 0).reduce((a, b) => Math.max(a, b), 0);
    $('lastChecked').textContent = latest ? timeLabel(latest) : '—';
    $('widgetButton').textContent = state.widgetVisible ? '위젯 숨기기' : '위젯 띄우기';
  }
  function renderSettings() {
    const list = $('providers'); list.replaceChildren();
    Object.entries(info).forEach(([provider, data]) => {
      const row = el('div', 'providerSetting'); row.append(el('span', `providerLogo ${provider}`, data.logo));
      const detail = el('div', 'detail'); detail.append(el('strong', '', data.name), el('small', '', data.hint)); row.append(detail);
      const connected = state.connectedProviders.includes(provider);
      const toggle = el('button', `toggleButton${connected ? ' connected' : ''}`, connected ? '연결 해제' : '연결'); toggle.type = 'button';
      toggle.onclick = async () => { await invoke(() => window.usageSee.connect(provider, !connected)); };
      const open = el('button', 'openButton', '열기 ↗'); open.type = 'button'; open.onclick = () => invoke(() => window.usageSee.openProvider(provider));
      row.append(toggle, open); list.append(row);
    });
  }
  function render() { renderDashboard(); renderSettings(); }
  function showView(next) {
    view = next; $('dashboardView').classList.toggle('hidden', view !== 'dashboard'); $('settingsView').classList.toggle('hidden', view !== 'settings');
    $('dashboardNav').classList.toggle('active', view === 'dashboard'); $('settingsNav').classList.toggle('active', view === 'settings');
  }
  async function invoke(action) { try { await action(); hideNotice(); } catch (e) { notice(e.message || '작업을 완료하지 못했습니다.'); } }
  async function readProvider(provider) {
    try {
      const result = await window.usageSee.readProvider(provider);
      if (!result.ok) notice(result.status === 'login_required' ? '서비스 창에서 로그인한 뒤 사용량 화면을 열어 주세요.' : '값을 찾지 못했습니다. 서비스 창에서 공식 사용량 화면이 열린 상태인지 확인해 주세요.');
      else hideNotice();
    } catch (e) { notice(e.message || '화면을 읽지 못했습니다.'); }
  }
  async function init() {
    state = await window.usageSee.getState();
    window.usageSee.onState(next => { state = next; render(); });
    $('dashboardNav').onclick = () => showView('dashboard'); $('settingsNav').onclick = () => showView('settings'); $('emptySettings').onclick = () => showView('settings');
    $('widgetButton').onclick = () => invoke(() => window.usageSee.setWidgetVisible(!state.widgetVisible));
    $('clearButton').onclick = () => invoke(() => window.usageSee.clearHistory());
    render();
  }
  init().catch(e => notice(e.message || '앱을 시작하지 못했습니다.'));
})();
