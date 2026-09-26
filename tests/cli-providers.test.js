'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { codexSnapshot, loggedInOutput, executable } = require('../electron/cli-providers');

test('Codex official rate limits map to 5-hour and weekly windows', () => {
  const snapshot = codexSnapshot({ result: { rateLimitsByLimitId: { codex: {
    primary: { usedPercent: 35, windowDurationMins: 300, resetsAt: 1800000000 },
    secondary: { usedPercent: 62, windowDurationMins: 10080, resetsAt: 1800200000 }
  } } } });
  assert.deepEqual(snapshot.windows.map(w => [w.kind, w.usedPercent]), [['five_hour', 35], ['weekly', 62]]);
  assert.equal(snapshot.captureMethod, 'codex_app_server');
});

test('Claude bridge preserves an existing status line and captures usage locally', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-see-test-'));
  try {
    fs.mkdirSync(path.join(home, '.claude'));
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'cat >/dev/null; echo original' } }));
    const capture = execFileSync(process.execPath, ['-e', "process.stdout.write(require('./electron/cli-providers').installClaudeBridge())"], { cwd: path.join(__dirname, '..'), env: { ...process.env, HOME: home } }).toString();
    const settings = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json')));
    const line = execFileSync('/bin/sh', ['-c', settings.statusLine.command], { input: JSON.stringify({ rate_limits: { five_hour: { used_percentage: 30 } } }) }).toString();
    assert.equal(line.trim(), 'original');
    assert.equal(JSON.parse(fs.readFileSync(capture)).rate_limits.five_hour.used_percentage, 30);
    execFileSync(process.execPath, ['-e', "require('./electron/cli-providers').uninstallClaudeBridge()"], { cwd: path.join(__dirname, '..'), env: { ...process.env, HOME: home } });
    assert.equal(JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'))).statusLine.command, 'cat >/dev/null; echo original');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('Codex login status from CLI stderr is recognized', () => {
  assert.equal(loggedInOutput('codex', 'Logged in using ChatGPT\n'), true);
  assert.equal(loggedInOutput('codex', 'Not logged in'), false);
});

test('executable() never resolves to a wrapper living under the OS temp dir', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-see-shim-'));
  const shimFile = path.join(shimDir, 'codex');
  fs.writeFileSync(shimFile, '#!/bin/sh\necho fake\n', { mode: 0o755 });
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = `${shimDir}${path.delimiter}${originalPath}`;
    const resolved = executable('codex');
    assert.notEqual(resolved, shimFile);
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(shimDir, { recursive: true, force: true });
  }
});
