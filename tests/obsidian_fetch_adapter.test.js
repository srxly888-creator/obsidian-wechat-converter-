import { describe, expect, it, vi } from 'vitest';

const {
  createObsidianFetchAdapter,
} = require('../services/obsidian-fetch-adapter');

describe('Obsidian fetch adapter', () => {
  it('should map fetch-style JSON requests to requestUrl', async () => {
    const requestUrl = vi.fn(async () => ({
      status: 200,
      text: '{"ok":true}',
      json: { ok: true },
      headers: { 'content-type': 'application/json' },
    }));
    const fetchImpl = createObsidianFetchAdapter(requestUrl);

    const response = await fetchImpl('https://api.example.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret',
      },
      body: '{"hello":"world"}',
    });

    expect(requestUrl).toHaveBeenCalledWith({
      url: 'https://api.example.com/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret',
      },
      body: '{"hello":"world"}',
      contentType: 'application/json',
    });
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('{"ok":true}');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('should expose non-2xx responses without throwing', async () => {
    const requestUrl = vi.fn(async () => ({
      status: 401,
      text: 'unauthorized',
      headers: {},
    }));
    const fetchImpl = createObsidianFetchAdapter(requestUrl);

    const response = await fetchImpl('https://api.example.com/v1/chat/completions');

    expect(response.ok).toBe(false);
    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('unauthorized');
  });

  it('should reject immediately when the signal is already aborted', async () => {
    const requestUrl = vi.fn();
    const fetchImpl = createObsidianFetchAdapter(requestUrl);
    const controller = new AbortController();
    controller.abort();

    await expect(fetchImpl('https://api.example.com', {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it('should reject with AbortError when the signal aborts while requestUrl is pending', async () => {
    const requestUrl = vi.fn(() => new Promise(() => {}));
    const fetchImpl = createObsidianFetchAdapter(requestUrl);
    const controller = new AbortController();
    const request = fetchImpl('https://api.example.com', {
      signal: controller.signal,
    });

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
