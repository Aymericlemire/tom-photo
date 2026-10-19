// Affiche quel programme utilise les ports du site (5174 = API, 5175 = site).
// Utile quand `npm run dev` répond « Port 5175 is already in use ».
// Le script n'arrête jamais rien tout seul : il indique le numéro (PID) à arrêter.
import { execFileSync } from 'node:child_process';

const PORTS = [5174, 5175];

function listeners(port) {
  if (process.platform === 'win32') {
    const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
    return [...new Set(output.split(/\r?\n/)
      .filter((line) => line.includes('LISTENING') && new RegExp(`[:.]${port}\\s`).test(line))
      .map((line) => line.trim().split(/\s+/).pop()))];
  }
  try {
    const output = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    return output.split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

function processName(pid) {
  try {
    if (process.platform === 'win32') {
      const output = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
      return output.split(',')[0]?.replaceAll('"', '').trim() || 'inconnu';
    }
    return execFileSync('ps', ['-p', pid, '-o', 'comm='], { encoding: 'utf8' }).trim();
  } catch {
    return 'inconnu';
  }
}

let busy = false;
for (const port of PORTS) {
  const pids = listeners(port);
  if (!pids.length) {
    console.log(`Port ${port} : libre`);
    continue;
  }
  busy = true;
  for (const pid of pids) {
    console.log(`Port ${port} : utilisé par ${processName(pid)} (PID ${pid})`);
    console.log(process.platform === 'win32'
      ? `   Pour l'arrêter : Stop-Process -Id ${pid}`
      : `   Pour l'arrêter : kill ${pid}`);
  }
}
if (busy) console.log('\nSi c\'est un ancien « npm run dev » oublié, arrêtez-le avec la commande indiquée puis relancez.');
