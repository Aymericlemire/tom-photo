import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api.js';

test('api keeps the session cookie and returns JSON responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_path, options) => {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers['Content-Type'], 'application/json');
    return new Response(JSON.stringify({ authenticated: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    assert.deepEqual(await api('/api/admin/session'), { authenticated: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('api reports a clear message when the server does not answer in time', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_path, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      reject(new DOMException('The request was aborted.', 'AbortError'));
    }, { once: true });
  });

  try {
    await assert.rejects(
      api('/api/admin/content', { timeoutMs: 5 }),
      /Le serveur met trop de temps à répondre/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
