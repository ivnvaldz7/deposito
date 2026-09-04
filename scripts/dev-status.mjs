import http from 'node:http';
import { 
  getRuntimeState, 
  getListeningProcess, 
  getProcessInfo, 
  isOurProcess
} from './dev-lib.mjs';

function checkHealth(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function run() {
  const runtimeState = getRuntimeState();
  console.log('Logística UAT Runtime\n');
  
  const clientPid = getListeningProcess(5177);
  const serverPid = getListeningProcess(3102);

  if (clientPid) console.log(`Frontend 5177: RUNNING - PID ${clientPid}`);
  else console.log(`Frontend 5177: FREE`);

  if (serverPid) console.log(`Backend  3102: RUNNING - PID ${serverPid}`);
  else console.log(`Backend  3102: FREE`);

  if (clientPid || serverPid) {
    let ownerStr = 'external';
    if ((clientPid && isOurProcess(getProcessInfo(clientPid), runtimeState)) ||
        (serverPid && isOurProcess(getProcessInfo(serverPid), runtimeState))) {
      ownerStr = 'current project';
    }
    console.log(`Owner: ${ownerStr}`);
    
    const clientOk = await checkHealth('http://localhost:5177/');
    const serverOk = await checkHealth('http://localhost:3102/api/health');
    console.log(`Health: ${clientOk && serverOk ? 'OK' : 'DEGRADED'}`);
  }
}

run();
