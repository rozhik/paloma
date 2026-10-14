import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { asyncRoute } from './asyncRoute.js';
import { apiErrorHandler } from '../services/apiError.js';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.get('/fails', asyncRoute(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    throw new Error('lost connection');
  }));
  app.get('/works', asyncRoute(async (_req, res) => {
    res.json({ ok: true });
  }));
  app.use(apiErrorHandler);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('asyncRoute', () => {
  it('passes a rejected handler to the API error handler', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await fetch(`${base}/fails`);
    expect(res.status).toBe(500);
    // The message stays in the server log: such messages often name server paths
    expect(await res.json()).toEqual({ error: 'Internal server error', code: 'internal' });
    vi.restoreAllMocks();
  });

  it('lets a handler that resolves answer as usual', async () => {
    const res = await fetch(`${base}/works`);
    expect(await res.json()).toEqual({ ok: true });
  });
});
