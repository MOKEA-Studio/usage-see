(function (root) {
  'use strict';
  function fiveHourRemaining(state, provider, now = Date.now()) {
    const snapshot = state.snapshots?.[provider];
    const window = snapshot?.windows?.find(item => item.kind === 'five_hour');
    if (!Number.isFinite(window?.usedPercent) || window.usedPercent < 0 || window.usedPercent > 100) return '—';
    const captured = Date.parse(snapshot.capturedAt);
    if (!Number.isFinite(captured) || now - captured > 15 * 60 * 1000) return '—';
    if (window.resetsAt && Date.parse(window.resetsAt) <= now) return '—';
    return `${Math.round(100 - window.usedPercent)}%`;
  }
  function usageSummary(state, now = Date.now()) {
    const parts = ['claude', 'codex']
      .filter(provider => state.connectedProviders?.includes(provider))
      .map(provider => `${provider === 'claude' ? 'Claude' : 'Codex'}: ${fiveHourRemaining(state, provider, now)}`);
    return parts.length ? `[${parts.join('  ')}]` : '';
  }
  const api = { fiveHourRemaining, usageSummary };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UsageSeeSummary = api;
})(globalThis);
