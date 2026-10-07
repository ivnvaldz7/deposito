import { 
  getRuntimeState, 
  clearRuntimeState,
  getListeningProcess, 
  getProcessInfo, 
  isOurProcess, 
  killAllOurProcesses
} from './dev-lib.mjs';

console.log('Cleaning UAT environment...');
const runtimeState = getRuntimeState();
killAllOurProcesses(runtimeState);
clearRuntimeState();

// Re-verify ports 5177 and 3102
let ok = true;
for (const port of [5177, 3102]) {
  const pid = getListeningProcess(port);
  if (pid) {
    const info = getProcessInfo(pid);
    if (!isOurProcess(info, null)) {
      console.log(`Port ${port} is occupied by an external process PID: ${pid}`);
    } else {
      console.log(`Warning: Port ${port} is STILL occupied by our project process PID: ${pid} after clean.`);
    }
    ok = false;
  } else {
    console.log(`Port ${port} is FREE.`);
  }
}

if (ok) {
  console.log('Clean complete. Ports are available.');
} else {
  console.log('Clean finished with warnings.');
}
