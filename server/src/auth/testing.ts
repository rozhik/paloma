import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';

/**
 * Points PALOMA_* at a new temp folder and opens the library database there. config.ts and db/index.ts read
 * the environment at import time, so a test file calls this before importing modules that use them
 * (dynamically, in beforeAll). Returns the temp folder and a cleanup function.
 */
export async function openTestDatabase(prefix: string, env: Record<string, string> = {}): Promise<{ tmpDir: string; cleanup: () => void }> {
  const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_EXPORT_DIR', path.join(tmpDir, 'export'));
  vi.stubEnv('PALOMA_PLUGINS_DIR', path.join(tmpDir, 'plugins'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');
  vi.stubEnv('PALOMA_AUTH', 'off');
  vi.stubEnv('PALOMA_CLIENT_ORIGIN', '');
  vi.stubEnv('PALOMA_RATE_LIMIT', '');
  vi.stubEnv('PALOMA_SESSION_DAYS', '');
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  await (await import('../db/index.js')).openDatabase();
  return {
    tmpDir,
    cleanup: () => {
      vi.unstubAllEnvs();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

export interface TestResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  headers: Headers;
}

/** A client of the test server that keeps the session cookie it is given, like a browser. */
export class TestClient {
  cookie: string | null = null;

  constructor(private readonly base: string, private readonly bearer?: string) {}

  async send(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<TestResponse> {
    const res = await fetch(`${this.base}${url}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(this.bearer ? { Authorization: `Bearer ${this.bearer}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const [pair] = setCookie.split(';');
      this.cookie = pair.endsWith('=') ? null : pair;
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // not JSON: an image or other file
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  get = (url: string) => this.send('GET', url);
  post = (url: string, body?: unknown) => this.send('POST', url, body ?? {});
  patch = (url: string, body?: unknown) => this.send('PATCH', url, body ?? {});
  put = (url: string, body?: unknown) => this.send('PUT', url, body ?? {});
  delete = (url: string, body?: unknown) => this.send('DELETE', url, body);
}

/** Starts the whole app (CORS, auth, routes) on a free port. Call after `openTestDatabase`. */
export async function startTestApp(): Promise<{ base: string; origin: string; close: () => Promise<void> }> {
  const { createApp } = await import('../app.js');
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as import('node:net').AddressInfo;
  return {
    base: `http://127.0.0.1:${port}/api`,
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
