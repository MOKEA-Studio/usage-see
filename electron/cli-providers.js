'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

function isTempDir(dir) {
  const tmp = os.tmpdir();
  return !!dir && (dir === tmp || dir.startsWith(tmp + path.sep));
}
function executable(name) {
  // Some third-party tools (e.g. computer-use automation helpers) install a
  // wrapper script under the OS temp dir and prepend it to PATH, shadowing
  // the real CLI. No legitimate persistent install lives in a temp dir, so
  // those entries are never trusted here. For codex specifically, the
  // official binary bundled inside the ChatGPT app is never added to PATH
  // at all, so it is checked first, before any PATH entry.
  const envPaths = (process.env.PATH || '').split(path.delimiter).filter(dir => dir && !isTempDir(dir));
  const paths = name === 'codex'
    ? ['/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS', ...envPaths]
    : envPaths;
  paths.push(path.join(os.homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin');
  for (const dir of paths) {
    const file = path.join(dir, name);
    try { fs.accessSync(file, fs.constants.X_OK); return file; } catch {}
  }
  return null;
}
function run(file, args, input = '', timeout = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env: { ...process.env, PATH: `${path.dirname(file)}:${process.env.PATH || '/usr/bin:/bin'}` }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('CLI 응답 시간이 초과되었습니다.')); }, timeout);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 200000) child.kill(); });
    child.stderr.on('data', chunk => { error += chunk; if (error.length > 10000) child.kill(); });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output || error) : reject(new Error(error.trim().slice(0, 300) || `CLI 종료 코드 ${code}`)); });
    child.stdin.end(input);
  });
}
function loggedInOutput(provider, output) {
  if (provider === 'codex') return /Logged in using ChatGPT/i.test(output);
  try { return JSON.parse(output).loggedIn === true; } catch { return false; }
}
async function authenticated(provider) {
  const file = executable(provider);
  if (!file) return false;
  try {
    const result = await run(file, provider === 'codex' ? ['login', 'status'] : ['auth', 'status']);
    return loggedInOutput(provider, result);
  } catch { return false; }
}
function beginLogin(provider) {
  const file = executable(provider);
  if (!file) throw new Error(`${provider} CLI를 먼저 설치해 주세요.`);
  const child = spawn(file, provider === 'codex' ? ['login'] : ['auth', 'login'], {
    detached: true, stdio: 'ignore', env: { ...process.env, PATH: `${path.dirname(file)}:${process.env.PATH || '/usr/bin:/bin'}` }
  });
  child.on('error', () => {});
  child.unref();
}
function windowValue(kind, data) {
  if (!data || !Number.isFinite(data.usedPercent)) return null;
  return { kind, windowDurationMins: data.windowDurationMins ?? null, usedPercent: Math.max(0, Math.min(100, data.usedPercent)), resetsAt: Number.isFinite(data.resetsAt) ? new Date(data.resetsAt * 1000).toISOString() : null };
}
function codexSnapshot(response) {
  if (response.error) throw new Error(response.error.message || 'Codex 사용량 조회 실패');
  const result = response.result || {};
  const limits = result.rateLimitsByLimitId?.codex || result.rateLimits;
  if (!limits) throw new Error('Codex 사용량 정보가 없습니다.');
  const windows = [
    limits.primary?.windowDurationMins === 300 && windowValue('five_hour', limits.primary),
    limits.secondary?.windowDurationMins === 10080 && windowValue('weekly', limits.secondary)
  ].filter(Boolean);
  if (!windows.length) throw new Error('Codex 사용량 정보가 없습니다.');
  return { provider: 'codex', windows, status: windows.length === 2 ? 'ok' : 'partial', capturedAt: new Date().toISOString(), captureMethod: 'codex_app_server' };
}
async function readCodex() {
  const file = executable('codex');
  if (!file) throw new Error('Codex CLI를 찾을 수 없습니다.');
  return new Promise((resolve, reject) => {
    const child = spawn(file, ['app-server'], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, PATH: `${path.dirname(file)}:${process.env.PATH || '/usr/bin:/bin'}` } });
    let buffer = '', done = false;
    const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); child.kill(); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => finish(new Error('Codex 응답 시간이 초과되었습니다.')), 15000);
    child.on('error', error => finish(error));
    child.on('close', () => finish(new Error('Codex app-server가 종료되었습니다.')));
    child.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 200000) return finish(new Error('Codex 응답이 너무 큽니다.'));
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1) {
          try { return finish(null, codexSnapshot(message)); } catch (error) { return finish(error); }
        }
      }
    });
    child.stdin.write([
      { method: 'initialize', id: 0, params: { clientInfo: { name: 'usage-see', title: 'Usage See', version: '0.3.0' } } },
      { method: 'initialized' },
      { method: 'account/rateLimits/read', id: 1 }
    ].map(JSON.stringify).join('\n') + '\n');
  });
}
function quote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
function installClaudeBridge() {
  const base = path.join(os.homedir(), '.usage-see');
  const script = path.join(base, 'claude-statusline.sh');
  const capture = path.join(base, 'claude-statusline.json');
  const backup = path.join(base, 'claude-statusline-previous.json');
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
  const current = settings.statusLine?.command;
  if (current?.includes(script)) return capture;
  fs.writeFileSync(backup, JSON.stringify({ statusLine: settings.statusLine ?? null }), { mode: 0o600 });
  const body = `#!/bin/sh\numask 077\ninput=$(cat)\nprintf '%s' "$input" > ${quote(capture + '.tmp')} && mv ${quote(capture + '.tmp')} ${quote(capture)}\nif [ -n "$1" ]; then printf '%s' "$input" | sh -c "$1"; fi\n`;
  fs.writeFileSync(script, body, { mode: 0o700 });
  fs.chmodSync(script, 0o700);
  settings.statusLine = { type: 'command', command: `${quote(script)}${current ? ` ${quote(current)}` : ''}` };
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
  return capture;
}
function readClaude() {
  const capture = path.join(os.homedir(), '.usage-see', 'claude-statusline.json');
  if (!fs.existsSync(capture)) throw new Error('Claude Code에서 메시지를 한 번 보낸 뒤 새로고침해 주세요.');
  const data = JSON.parse(fs.readFileSync(capture, 'utf8'));
  const convert = (kind, raw) => raw && Number.isFinite(raw.used_percentage) ? windowValue(kind, { usedPercent: raw.used_percentage, resetsAt: raw.resets_at }) : null;
  const windows = [convert('five_hour', data.rate_limits?.five_hour), convert('weekly', data.rate_limits?.seven_day)].filter(Boolean);
  if (!windows.length) throw new Error('Claude Code 사용량 데이터가 아직 없습니다. 메시지를 보낸 뒤 새로고침해 주세요.');
  return { provider: 'claude', windows, status: windows.length === 2 ? 'ok' : 'partial', capturedAt: fs.statSync(capture).mtime.toISOString(), captureMethod: 'claude_statusline' };
}
function uninstallClaudeBridge() {
  const base = path.join(os.homedir(), '.usage-see');
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const backup = path.join(base, 'claude-statusline-previous.json');
  const script = path.join(base, 'claude-statusline.sh');
  if (!fs.existsSync(settingsPath) || !fs.existsSync(backup)) return;
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  if (!settings.statusLine?.command?.includes(script)) return;
  const previous = JSON.parse(fs.readFileSync(backup, 'utf8')).statusLine;
  if (previous) settings.statusLine = previous; else delete settings.statusLine;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
  fs.rmSync(backup, { force: true });
  fs.rmSync(script, { force: true });
  fs.rmSync(path.join(base, 'claude-statusline.json'), { force: true });
}
module.exports = { executable, loggedInOutput, authenticated, beginLogin, codexSnapshot, readCodex, installClaudeBridge, uninstallClaudeBridge, readClaude };
