/**
 * Sets the login password: asks for it twice (hidden), writes its scrypt hash to .env as PASSWORD_HASH,
 * and creates SESSION_SECRET if it doesn't exist yet. The password itself is never stored.
 *
 *   npm run set-password
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '@companion/config';
import { hashPassword } from './auth/password.ts';

const MIN_LENGTH = 12;

/** Reads a line without echoing it, so the password never appears on screen or in terminal history. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) return reject(new Error('Run this in an interactive terminal.'));
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let input = '';
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          return resolve(input);
        }
        if (char === '\u0003') process.exit(130); // Ctrl+C
        if (char === '\u007f' || char === '\b') input = input.slice(0, -1);
        else input += char;
      }
    };
    stdin.on('data', onData);
  });
}

/** Replaces KEY=… in .env, or appends it; every other line is kept as it is. */
function setEnvValue(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  // A function replacement: the hash contains '$', which a replacement string would treat as a back-reference.
  return pattern.test(content) ? content.replace(pattern, () => line) : `${content.replace(/\s*$/, '')}\n${line}\n`;
}

const password = await askHidden(`New password (at least ${MIN_LENGTH} characters): `);
if (password.length < MIN_LENGTH) {
  console.error(`✗ Too short. Use at least ${MIN_LENGTH} characters; a passphrase of a few words works well.`);
  process.exit(1);
}
if ((await askHidden('Repeat it: ')) !== password) {
  console.error('✗ The two entries differ. Nothing was changed.');
  process.exit(1);
}

const envFile = join(ROOT, '.env');
let env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
env = setEnvValue(env, 'PASSWORD_HASH', await hashPassword(password));
const hasSecret = /^SESSION_SECRET=.{32,}$/m.test(env);
if (!hasSecret) env = setEnvValue(env, 'SESSION_SECRET', randomBytes(32).toString('base64url'));
writeFileSync(envFile, env);

console.log(`✓ Saved the password hash${hasSecret ? '' : ' and a new session secret'} to .env`);
console.log('  Restart the server for it to take effect. Existing logins stay valid until SESSION_SECRET changes.');
