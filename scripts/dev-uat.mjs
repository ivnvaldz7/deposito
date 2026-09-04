import { spawn } from 'node:child_process';
import http from 'node:http';
import { 
  getRuntimeState, 
  saveRuntimeState, 
  clearRuntimeState,
  getListeningProcess, 
  getProcessInfo, 
  isOurProcess, 
  killAllOurProcesses,
  killTree 
} from './dev-lib.mjs';

const CLIENT_PORT = 5177;
const SERVER_PORT = 3102;
const databaseUrl = 'postgresql://postgres:postgres@localhost:5432/platform_test';
const npmCli = process.env.npm_execpath;
const npmCommand = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';

function checkHealth(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve();
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for ${url}`));
        }
      });
      req.end();
    }, 1000);
  });
}

async function start() {
  const runtimeState = getRuntimeState();
  console.log('Cleaning up previous runtime processes...');
  killAllOurProcesses(runtimeState);
  clearRuntimeState();

  // Verify ports are free
  for (const port of [CLIENT_PORT, SERVER_PORT]) {
    const pid = getListeningProcess(port);
    if (pid) {
      const info = getProcessInfo(pid);
      if (isOurProcess(info, null)) {
        console.log(`Port ${port} still held by our project process PID ${pid}. Forcing kill...`);
        killTree(pid);
      } else {
        console.error('\nDEV START ABORTED\n');
        console.error(`Port ${port} is already being used by another process.\n`);
        console.error(`PID: ${info ? info.ProcessId : pid}`);
        console.error(`Process: ${info ? info.Name : 'unknown'}`);
        console.error(`Command: ${info ? info.CommandLine : 'unknown'}`);
        console.error(`Port: ${port}\n`);
        console.error('Close it manually or change the project configuration.\n');
        process.exit(1);
      }
    }
  }
  
  // Re-verify after aggressive kill
  for (const port of [CLIENT_PORT, SERVER_PORT]) {
    if (getListeningProcess(port)) {
      console.error(`\nDEV START ABORTED: Port ${port} is still in use after cleanup.\n`);
      process.exit(1);
    }
  }

  console.log('Starting UAT environment...');
  
  const serverChild = spawn(npmCommand, npmCli ? [npmCli, '--workspace', '@platform/server', 'run', 'dev:uat'] : ['--workspace', '@platform/server', 'run', 'dev:uat'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PLATFORM_DATABASE_URL: databaseUrl,
      PORT: SERVER_PORT.toString(),
    },
    stdio: 'inherit',
    shell: !npmCli && process.platform === 'win32',
  });

  const clientChild = spawn(npmCommand, npmCli ? [npmCli, '--workspace', '@platform/client', 'run', 'dev:uat'] : ['--workspace', '@platform/client', 'run', 'dev:uat'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VITE_API_URL: `http://localhost:${SERVER_PORT}`,
    },
    stdio: 'inherit',
    shell: !npmCli && process.platform === 'win32',
  });

  saveRuntimeState({
    projectPath: process.cwd(),
    launcherPid: process.pid,
    serverPid: serverChild.pid,
    clientPid: clientChild.pid,
    serverPort: SERVER_PORT,
    clientPort: CLIENT_PORT,
    startedAt: new Date().toISOString()
  });

  let shuttingDown = false;

  const shutdown = (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\nShutting down UAT environment...');
    
    // Controlled tree kill
    killTree(serverChild.pid);
    killTree(clientChild.pid);
    killAllOurProcesses(getRuntimeState());
    
    clearRuntimeState();
    console.log('Shutdown complete.');
    process.exit(exitCode);
  };

  serverChild.on('error', (err) => {
    console.error('Server process failed to start:', err);
    shutdown(1);
  });
  clientChild.on('error', (err) => {
    console.error('Client process failed to start:', err);
    shutdown(1);
  });

  serverChild.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`Server stopped unexpectedly (${signal ?? 'code ' + code}).`);
      shutdown(code ?? 1);
    }
  });

  clientChild.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`Client stopped unexpectedly (${signal ?? 'code ' + code}).`);
      shutdown(code ?? 1);
    }
  });

  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());

  try {
    await checkHealth(`http://localhost:${SERVER_PORT}/api/health`, 150000);
    await checkHealth(`http://localhost:${CLIENT_PORT}/`, 150000);
    
    console.log('\n==================================================');
    console.log('LOGÍSTICA UAT READY');
    console.log(`Frontend: http://localhost:${CLIENT_PORT}`);
    console.log(`Backend:  http://localhost:${SERVER_PORT}`);
    console.log('==================================================\n');
  } catch (err) {
    console.error(`\nFailed to reach health endpoints: ${err.message}`);
    shutdown(1);
  }
}

start();
