import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import readline from 'node:readline/promises';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const envPath = resolve(root, '.env');
const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
let terminalClosed = false;

async function askPassword(prompt) {
  if (!process.stdin.isTTY) throw new Error('Lancez cette commande dans un terminal interactif.');
  if (!terminalClosed) {
    terminal.pause();
    terminal.close();
    terminalClosed = true;
  }
  process.stdout.write(prompt);
  const input = process.stdin;
  input.setRawMode(true);
  input.resume();
  return new Promise((resolvePassword, reject) => {
    let value = '';
    const onData = (buffer) => {
      for (const character of buffer.toString('utf8')) {
        if (character === '\u0003') {
          input.setRawMode(false);
          input.removeListener('data', onData);
          process.stdout.write('\n');
          reject(new Error('Configuration annulée.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          input.setRawMode(false);
          input.removeListener('data', onData);
          process.stdout.write('\n');
          resolvePassword(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= ' ') value += character;
      }
    };
    input.on('data', onData);
  });
}

try {
  let username = (await terminal.question('Identifiant administrateur [tom] : ')).trim() || 'tom';
  if (username.length > 80) throw new Error('L’identifiant ne doit pas dépasser 80 caractères.');
  const password = await askPassword('Mot de passe admin (12 caractères minimum) : ');
  if (password.length < 12 || password.length > 200) {
    throw new Error('Choisissez un mot de passe contenant entre 12 et 200 caractères.');
  }
  const confirmation = await askPassword('Confirmez le mot de passe : ');
  if (password !== confirmation) throw new Error('Les deux mots de passe ne correspondent pas.');

  let existing = '';
  try {
    existing = await readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const values = {
    ADMIN_USERNAME: username,
    ADMIN_PASSWORD_HASH: await bcrypt.hash(password, 12),
    SESSION_SECRET: randomBytes(48).toString('hex')
  };
  let updated = existing;
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    updated = pattern.test(updated)
      ? updated.replace(pattern, line)
      : `${updated}${updated && !updated.endsWith('\n') ? '\n' : ''}${line}\n`;
  }
  await writeFile(envPath, updated, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`Compte « ${username} » configuré dans .env. Gardez ce fichier privé.\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  if (process.stdin.isTTY && process.stdin.isRaw) process.stdin.setRawMode(false);
  if (process.stdin.isTTY) process.stdin.pause();
}
