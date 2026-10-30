/**
 * Sets a new login password from the server's terminal: the way back in if you forgot it (the app's Settings
 * screen changes it while you're logged in). Asks twice, hidden, and saves only its scrypt hash in the settings file.
 * Also logs out every browser, as any password change should.
 *
 *   npm run set-password
 */
import { randomBytes } from 'node:crypto';
import { loadEnv, LockedSettingError, settings } from '@companion/config';
import { hashPassword, MIN_PASSWORD_LENGTH as MIN_LENGTH } from './auth/password.ts';

loadEnv();

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

const password = await askHidden(`New password (at least ${MIN_LENGTH} characters): `);
if (password.length < MIN_LENGTH) {
  console.error(`✗ Too short. Use at least ${MIN_LENGTH} characters; a passphrase of a few words works well.`);
  process.exit(1);
}
if ((await askHidden('Repeat it: ')) !== password) {
  console.error('✗ The two entries differ. Nothing was changed.');
  process.exit(1);
}

const store = settings();
try {
  store.update({ passwordHash: await hashPassword(password), ...(store.locked().has('sessionSecret') ? {} : { sessionSecret: randomBytes(32).toString('base64url') }) });
} catch (error) {
  console.error(`✗ ${error instanceof LockedSettingError ? error.message : String(error)}`);
  process.exit(1);
}
console.log('✓ Saved. Every browser is logged out; log in with the new password. A running server picks it up straight away.');
