/**
 * Recovery: `npm --prefix server run reset-password <username>` sets a new password for a user, asks them to
 * choose their own at the next login and ends their sessions. Run it with the server stopped or running;
 * the password is read from the PALOMA_NEW_PASSWORD environment variable or asked for on the terminal.
 */
import readline from 'node:readline';
import { openDatabase } from '../db/index.js';
import { pluginRegistry } from '../plugins/index.js';
import { HttpError } from '../services/apiError.js';
import './providers.js';
import { findUserByUsername, resetPassword } from './users.js';

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer);
  }));
}

/** Resets a user's password; returns the message to print. Throws for an unknown user or a refused password. */
export async function resetPasswordOf(username: string, password: string): Promise<string> {
  await openDatabase();
  await pluginRegistry.init();
  const user = await findUserByUsername(username);
  if (!user) throw new Error(`No user named ${username}`);
  await resetPassword(user.id, { password });
  return `Password of ${user.username} reset. They must choose a new one at their next login.`;
}

async function main(): Promise<void> {
  const [username] = process.argv.slice(2);
  if (!username) {
    console.error('Usage: npm --prefix server run reset-password <username>');
    process.exit(2);
  }
  const password = process.env.PALOMA_NEW_PASSWORD ?? await ask(`New password for ${username}: `);
  try {
    console.log(await resetPasswordOf(username, password));
  } catch (err) {
    console.error(err instanceof HttpError ? err.body.error : (err as Error).message);
    process.exit(1);
  }
}

if (require.main === module) void main();
