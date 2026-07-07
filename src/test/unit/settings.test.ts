import * as assert from 'assert';
import { setConfig, resetAll } from '../mocks/vscode';
import {
  resolveTimeoutMs,
  getRenderTimeoutMs,
  getRemoteFetchTimeoutMs,
  getCacheAutoRefresh,
  getCatalogSources,
  getLintEnabled,
  getLintRuleSeverities,
  SCHEMASTORE_CATALOG_URL,
  DEFAULT_RENDER_TIMEOUT_MS,
  DEFAULT_REMOTE_FETCH_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
} from '../../settings';

suite('resolveTimeoutMs()', () => {
  test('[S03-SR-14] falls back when value is undefined', () => {
    assert.strictEqual(resolveTimeoutMs(undefined, 30_000), 30_000);
  });
  test('[S03-SR-14] falls back when value is not a number', () => {
    assert.strictEqual(resolveTimeoutMs('nope', 30_000), 30_000);
  });
  test('[S03-SR-14] falls back on NaN / Infinity', () => {
    assert.strictEqual(resolveTimeoutMs(NaN, 30_000), 30_000);
    assert.strictEqual(resolveTimeoutMs(Infinity, 30_000), 30_000);
  });
  test('[S03-SR-14] falls back on zero or negative', () => {
    assert.strictEqual(resolveTimeoutMs(0, 30_000), 30_000);
    assert.strictEqual(resolveTimeoutMs(-5, 30_000), 30_000);
  });
  test('[S03-SR-14] clamps a too-small positive value up to the minimum', () => {
    assert.strictEqual(resolveTimeoutMs(50, 30_000), MIN_TIMEOUT_MS);
  });
  test('[S03-SR-14] passes a sane value through, floored to an integer', () => {
    assert.strictEqual(resolveTimeoutMs(12_345.9, 30_000), 12_345);
  });
  test('[S03-SR-14] honours a custom minimum', () => {
    assert.strictEqual(resolveTimeoutMs(100, 30_000, 500), 500);
  });
});

suite('getRenderTimeoutMs()', () => {
  setup(() => resetAll());

  test('[S03-SR-11] defaults to 30 s when unset', () => {
    assert.strictEqual(getRenderTimeoutMs(), DEFAULT_RENDER_TIMEOUT_MS);
  });
  test('[S03-SR-14] reads jsonschema.preview.renderTimeout', () => {
    setConfig('jsonschema.preview', 'renderTimeout', 5_000);
    assert.strictEqual(getRenderTimeoutMs(), 5_000);
  });
  test('[S03-SR-14] clamps a mistyped tiny render timeout', () => {
    setConfig('jsonschema.preview', 'renderTimeout', 10);
    assert.strictEqual(getRenderTimeoutMs(), MIN_TIMEOUT_MS);
  });
});

suite('getRemoteFetchTimeoutMs()', () => {
  setup(() => resetAll());

  test('[S03-SR-12] defaults to 30 s when unset', () => {
    assert.strictEqual(getRemoteFetchTimeoutMs(), DEFAULT_REMOTE_FETCH_TIMEOUT_MS);
  });
  test('[S03-SR-14] reads jsonschema.remoteFetchTimeout', () => {
    setConfig('jsonschema', 'remoteFetchTimeout', 8_000);
    assert.strictEqual(getRemoteFetchTimeoutMs(), 8_000);
  });
});

suite('[F08-FR-14] getCacheAutoRefresh()', () => {
  setup(() => resetAll());

  test('defaults to "off" when unset', () => {
    assert.strictEqual(getCacheAutoRefresh(), 'off');
  });
  test('reads a valid "onOpen" value', () => {
    setConfig('jsonschema.cache', 'autoRefresh', 'onOpen');
    assert.strictEqual(getCacheAutoRefresh(), 'onOpen');
  });
  test('reads a valid "daily" value', () => {
    setConfig('jsonschema.cache', 'autoRefresh', 'daily');
    assert.strictEqual(getCacheAutoRefresh(), 'daily');
  });
  test('falls back to "off" for an unrecognised value', () => {
    setConfig('jsonschema.cache', 'autoRefresh', 'hourly');
    assert.strictEqual(getCacheAutoRefresh(), 'off');
  });
});

suite('[F12-FR-03][F12-FR-04] getCatalogSources()', () => {
  setup(() => resetAll());

  test('defaults to the SchemaStore catalog only', () => {
    assert.deepStrictEqual(getCatalogSources(), [SCHEMASTORE_CATALOG_URL]);
  });
  test('disabling SchemaStore removes it', () => {
    setConfig('jsonschema.catalog', 'useSchemaStore', false);
    assert.deepStrictEqual(getCatalogSources(), []);
  });
  test('appends configured private sources after SchemaStore', () => {
    setConfig('jsonschema.catalog', 'sources', ['https://corp/a.json', '  ', 5]);
    assert.deepStrictEqual(getCatalogSources(), [SCHEMASTORE_CATALOG_URL, 'https://corp/a.json']);
  });
});

suite('[F17-FR-03] getLintEnabled() / getLintRuleSeverities()', () => {
  setup(() => resetAll());

  test('lint is enabled by default', () => {
    assert.strictEqual(getLintEnabled(), true);
  });
  test('lint can be disabled', () => {
    setConfig('jsonschema.lint', 'enabled', false);
    assert.strictEqual(getLintEnabled(), false);
  });
  test('rule severities default to an empty object', () => {
    assert.deepStrictEqual(getLintRuleSeverities(), {});
  });
  test('rule severities are read through', () => {
    setConfig('jsonschema.lint', 'rules', { 'no-duplicate-enum': 'off' });
    assert.deepStrictEqual(getLintRuleSeverities(), { 'no-duplicate-enum': 'off' });
  });
});
