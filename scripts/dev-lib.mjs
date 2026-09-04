import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RUNTIME_FILE = path.join(process.cwd(), '.runtime', 'dev-uat.json');

export function getRuntimeState() {
  if (fs.existsSync(RUNTIME_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8'));
    } catch {}
  }
  return null;
}

export function saveRuntimeState(state) {
  const dir = path.dirname(RUNTIME_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(state, null, 2));
}

export function clearRuntimeState() {
  if (fs.existsSync(RUNTIME_FILE)) fs.unlinkSync(RUNTIME_FILE);
}

export function getListeningProcess(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const pid = parseInt(parts[4], 10);
          if (!isNaN(pid) && pid > 0) return pid;
        }
      }
    }
  } catch {}
  return null;
}

export function getProcessInfo(pid) {
  try {
    const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object ProcessId, Name, ExecutablePath, CommandLine | ConvertTo-Json"`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (output.trim()) {
      return JSON.parse(output);
    }
  } catch {}
  return null;
}

export function isOurProcess(info, runtimeState) {
  if (!info) return false;
  if (runtimeState && (info.ProcessId === runtimeState.serverPid || info.ProcessId === runtimeState.clientPid || info.ProcessId === runtimeState.launcherPid)) {
    return true;
  }
  const cmd = info.CommandLine || '';
  const cwd = process.cwd();
  const cwdForward = cwd.replace(/\\/g, '/');
  if (cmd.includes(cwd) || cmd.includes(cwdForward)) return true;
  if (cmd.includes('vite') && cmd.includes('dev:uat')) return true;
  if (cmd.includes('tsx') && cmd.includes('src/index.ts')) return true;
  return false;
}

export function sleepSync(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // block
  }
}

export function killTree(pid) {
  try {
    // Try graceful tree kill first
    execSync(`taskkill /PID ${pid} /T`, { stdio: 'ignore' });
  } catch {}
  
  sleepSync(1000); // give it a second to shutdown gracefully
  
  try {
    // Check if still alive
    const check = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8' });
    if (check.includes(pid.toString())) {
      // Force tree kill
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    }
  } catch {}
}

export function killAllOurProcesses(runtimeState) {
  if (runtimeState) {
    if (runtimeState.serverPid) killTree(runtimeState.serverPid);
    if (runtimeState.clientPid) killTree(runtimeState.clientPid);
  }
  
  const ports = [5177, 3102];
  for (const port of ports) {
    const pid = getListeningProcess(port);
    if (pid) {
      const info = getProcessInfo(pid);
      if (isOurProcess(info, runtimeState)) {
        killTree(pid);
      }
    }
  }
}
