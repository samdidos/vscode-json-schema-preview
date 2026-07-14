// S08-NFR-02 — the E2E suite must not hit the real network. Remote-schema
// scenarios (a `json.schemas`/`$ref` URL pointing off-disk) are exercised
// against a loopback-only fixture HTTP server (helpers.ts's
// `startFixtureHttpServer`) instead, so the run stays deterministic and
// offline even though it drives the extension's real HTTP fetch path
// (SchemaAuthManager -> SchemaCache) rather than a stub.
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  withCapturedMessages,
  readJsonFile,
  writeFile,
  closeAllEditors,
  openDocument,
  startFixtureHttpServer,
  FIXTURES_ROOT,
  FixtureHttpServer,
} from '../helpers';

const FIXTURE = path.join(FIXTURES_ROOT, 'single-folder');
const SETTINGS_PATH = path.join(FIXTURE, '.vscode', 'settings.json');

const REMOTE_SCHEMA_TEXT = JSON.stringify({
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Remote Fixture Schema',
  type: 'object',
  properties: { name: { type: 'string' } },
});

function resetWorkspaceFolderSettings(): void {
  writeFile(SETTINGS_PATH, '{}\n');
}

suite('[S08-NFR-02] Remote schema scenario — local HTTP fixture server, no real network', () => {
  let server: FixtureHttpServer;

  setup(async () => {
    resetWorkspaceFolderSettings();
    await closeAllEditors();
    server = await startFixtureHttpServer({ '/schema.json': REMOTE_SCHEMA_TEXT });
  });
  teardown(async () => {
    await server.close();
    resetWorkspaceFolderSettings();
    await closeAllEditors();
  });

  test('[S08-NFR-02] jsonschema.cacheSchemaLocally downloads a "remote" schema from the loopback fixture server and redirects the binding', async () => {
    const doc = await openDocument(path.join(FIXTURE, 'data.json'));
    const remoteUrl = `${server.origin}/schema.json`;

    const { errors, info } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.cacheSchemaLocally', remoteUrl, doc.uri) as Promise<void>,
    );

    assert.deepStrictEqual(errors, [], `expected no error notification, got: ${JSON.stringify(errors)}`);
    assert.ok(
      info.some(m => m.includes('Schema cached')),
      `expected a "Schema cached" confirmation, got info: ${JSON.stringify(info)}`
    );

    // The binding must have been redirected to a *local* file:// path — proof
    // the extension fetched the schema from our fixture server and wrote it
    // to disk, rather than leaving the remote URL in place.
    const settings = readJsonFile(SETTINGS_PATH);
    const entry = (settings['json.schemas'] ?? []).find((e: any) => e.fileMatch?.includes('data.json'));
    assert.ok(entry, `expected a redirected json.schemas entry for data.json in ${JSON.stringify(settings)}`);
    assert.ok(
      typeof entry.url === 'string' && entry.url.startsWith('file://'),
      `expected the redirected schema url to be a local file:// URI, got ${entry.url}`
    );
    assert.ok(
      !entry.url.includes(server.origin),
      `expected the fixture server's own URL to be gone after caching, got ${entry.url}`
    );

    const { warnings, info: validateInfo } = await withCapturedMessages(
      () => vscode.commands.executeCommand('jsonschema.validateFile') as Promise<void>,
    );
    assert.ok(
      !warnings.some(w => w.includes('No schema bound')),
      `expected the validator to recognise the cached-local binding (warnings: ${JSON.stringify(warnings)})`
    );
    assert.ok(
      validateInfo.some(m => m.includes('is valid against')),
      `expected a successful validation message using the locally cached copy of the remote schema (info: ${JSON.stringify(validateInfo)})`
    );
  });
});
