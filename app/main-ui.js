(function () {
  'use strict';
  const { info, date, dateLabel, timeLabel, stale, status, el, windowRow } = UsageSeeFormat;
  const $ = id => document.getElementById(id);
  let state = { connectedProviders: [], pendingProviders: [], snapshots: {}, failures: {}, widgetVisible: false, widgetOpacity: 100 };
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
    if (snapshot) checked.append(el('span', 'source', snapshot.captureMethod === 'codex_app_server' ? 'Codex CLI' : snapshot.captureMethod === 'claude_statusline' ? 'Claude Code' : '복사한 화면'), el('span', '', `확인 ${dateLabel(snapshot.capturedAt)}${stale(snapshot, failure) ? ' · 이전 값' : ''}`));
    else checked.textContent = '아직 읽은 기록 없음';
    foot.append(checked);
    const actions = el('div', 'actions');
    const open = el('button', 'linkButton', '브라우저에서 열기 ↗'); open.type = 'button'; open.onclick = () => invoke(() => window.usageSee.openProvider(provider));
    const read = el('button', 'readButton', provider === 'gemini' ? '복사한 내용 읽기' : '새로고침'); read.type = 'button'; read.onclick = () => readProvider(provider);
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
    $('widgetOpacity').value = String(state.widgetOpacity ?? 100);
    $('widgetOpacityValue').textContent = `${state.widgetOpacity ?? 100}%`;
    const list = $('providers'); list.replaceChildren();
    Object.entries(info).forEach(([provider, data]) => {
      const row = el('div', 'providerSetting'); row.append(el('span', `providerLogo ${provider}`, data.logo));
      const detail = el('div', 'detail'); detail.append(el('strong', '', data.name), el('small', '', data.hint)); row.append(detail);
      const connected = state.connectedProviders.includes(provider);
      const pending = state.pendingProviders?.includes(provider);
      const toggle = el('button', `toggleButton${connected ? ' connected' : ''}`, connected ? '연결 해제' : pending ? '로그인 확인 중…' : provider === 'gemini' ? '연결' : '로그인·연결'); toggle.type = 'button';
      toggle.onclick = async () => {
        try {
          const result = await window.usageSee.connect(provider, !connected);
          if (result?.pendingLogin) notice(`${data.name} 로그인을 확인 중입니다. 완료하면 자동으로 연결됩니다.`);
          else hideNotice();
        } catch (error) { notice(error.message || '연결하지 못했습니다.'); }
      };
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
      if (!result.ok) notice(provider !== 'gemini' ? (result.status === 'login_required' ? 'CLI 로그인이 필요합니다. 설정에서 다시 연결해 주세요.' : result.status === 'waiting_data' ? 'Claude Code에서 메시지를 한 번 보낸 뒤 다시 새로고침해 주세요.' : result.status) : result.status === 'clipboard_empty' ? '브라우저의 사용량 화면에서 텍스트를 선택해 복사한 뒤 다시 눌러 주세요.' : result.status === 'login_required' ? '브라우저에서 로그인한 뒤 사용량 영역을 복사해 주세요.' : '복사한 내용에서 사용량을 찾지 못했습니다. 해당 서비스의 사용량 영역을 다시 복사해 주세요.');
      else hideNotice();
    } catch (e) { notice(e.message || '화면을 읽지 못했습니다.'); }
  }
  async function init() {
    state = await window.usageSee.getState();
    window.usageSee.onState(next => {
      const completed = state.pendingProviders?.some(p => !next.pendingProviders?.includes(p) && next.connectedProviders.includes(p));
      state = next; render();
      if (completed) notice('로그인이 확인되어 연결되었습니다. Claude 사용량은 Claude Code에서 메시지를 보낸 뒤 표시됩니다.');
    });
    $('dashboardNav').onclick = () => showView('dashboard'); $('settingsNav').onclick = () => showView('settings'); $('emptySettings').onclick = () => showView('settings');
    $('widgetButton').onclick = () => invoke(() => window.usageSee.setWidgetVisible(!state.widgetVisible));
    $('widgetOpacity').oninput = event => { $('widgetOpacityValue').textContent = `${event.target.value}%`; };
    $('widgetOpacity').onchange = event => invoke(() => window.usageSee.setWidgetOpacity(Number(event.target.value)));
    $('clearButton').onclick = () => invoke(() => window.usageSee.clearHistory());
    render();
  }
  init().catch(e => notice(e.message || '앱을 시작하지 못했습니다.'));
})();
