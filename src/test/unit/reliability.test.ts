import * as assert from 'assert';
import {
  classifyFetchFailure,
  shouldFallbackToCache,
  HttpError,
} from '../../reliability';

suite('classifyFetchFailure()', () => {
  test('[S04-SR-04] a 401 is an auth failure (no fallback)', () => {
    assert.strictEqual(classifyFetchFailure(new HttpError(401, 'x')), 'auth');
  });
  test('[S04-SR-04] a 403 is an auth failure', () => {
    assert.strictEqual(classifyFetchFailure({ status: 403 }), 'auth');
  });
  test('[S04-SR-04] an AuthRequiredError (by name) is an auth failure', () => {
    assert.strictEqual(classifyFetchFailure({ name: 'AuthRequiredError', status: 401 }), 'auth');
  });
  test('[S04-SR-04] a 404 is a client failure (no fallback — schema moved)', () => {
    assert.strictEqual(classifyFetchFailure(new HttpError(404, 'x')), 'client');
  });
  test('[S04-SR-04] a 400 is a client failure', () => {
    assert.strictEqual(classifyFetchFailure({ status: 400 }), 'client');
  });
  test('[S04-SR-01] a 500 is transient (fall back to cache)', () => {
    assert.strictEqual(classifyFetchFailure(new HttpError(503, 'x')), 'transient');
  });
  test('[S04-SR-01] a network-level error with no status is transient', () => {
    assert.strictEqual(classifyFetchFailure(new Error('fetch failed')), 'transient');
  });
  test('[S04-SR-01] a timeout error is transient', () => {
    assert.strictEqual(classifyFetchFailure(new Error('Timed out fetching … after 30000 ms')), 'transient');
  });
  test('[S04-SR-01] null / undefined is treated as transient, not a crash', () => {
    assert.strictEqual(classifyFetchFailure(undefined), 'transient');
    assert.strictEqual(classifyFetchFailure(null), 'transient');
  });
});

suite('shouldFallbackToCache()', () => {
  test('[S04-SR-01] transient failures permit a stale-cache fallback', () => {
    assert.strictEqual(shouldFallbackToCache('transient'), true);
  });
  test('[S04-SR-04] auth failures do not fall back', () => {
    assert.strictEqual(shouldFallbackToCache('auth'), false);
  });
  test('[S04-SR-04] client failures do not fall back', () => {
    assert.strictEqual(shouldFallbackToCache('client'), false);
  });
});

suite('HttpError', () => {
  test('[S04-SR-04] carries the HTTP status for classification', () => {
    const e = new HttpError(502, 'bad gateway');
    assert.strictEqual(e.status, 502);
    assert.strictEqual(e.name, 'HttpError');
    assert.ok(e instanceof Error);
  });
});
