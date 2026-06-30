// Direct, outcome-asserting tests for the SchemaBindingManager utility
// functions. These target the branch/equality/logic that mutation testing
// found to be executed-but-unverified — they assert exact return values across
// every branch so a flipped condition or operator fails a test (i.e. is killed).
import * as assert from 'assert';
import * as vscode from '../mocks/vscode';
import { setConfig } from '../mocks/vscode';

const {
  findBoundSchemaPath,
  extractInlineSchemaUrl,
  stripEmbeddedUrlToken,
  relFileForTarget,
  pickInspectValue,
} = require('../../SchemaBindingManager');

const { ConfigurationTarget } = vscode;

suite('findBoundSchemaPath()', () => {
  setup(() => {
    vscode.resetAll();
    // The doc always resolves to 'data.json' at folder scope; if the code ever
    // asks for the folder-prefixed form (includeFolder=true) it gets a path that
    // does NOT match, so flipping that boolean is caught.
    vscode.workspace.asRelativePath.callsFake((_u: any, inc?: boolean) =>
      inc ? 'prefixed/data.json' : 'data.json'
    );
  });
  const doc = { uri: { fsPath: '/ws/data.json' } };

  test('returns the json schema url when fileMatch matches', () => {
    setConfig('json', 'schemas', [{ url: 'https://s/a.json', fileMatch: ['data.json'] }]);
    assert.strictEqual(findBoundSchemaPath(doc), 'https://s/a.json');
  });

  test('returns undefined when nothing matches', () => {
    setConfig('json', 'schemas', [{ url: 'x', fileMatch: ['other.json'] }]);
    setConfig('yaml', 'schemas', { 'y': 'other.json' });
    assert.strictEqual(findBoundSchemaPath(doc), undefined);
  });

  test('json binding takes precedence over a matching yaml binding', () => {
    setConfig('json', 'schemas', [{ url: 'json-url', fileMatch: ['data.json'] }]);
    setConfig('yaml', 'schemas', { 'yaml-url': 'data.json' });
    assert.strictEqual(findBoundSchemaPath(doc), 'json-url');
  });

  test('matches a yaml single-string pattern', () => {
    setConfig('json', 'schemas', []);
    setConfig('yaml', 'schemas', { 'yaml-url': 'data.json' });
    assert.strictEqual(findBoundSchemaPath(doc), 'yaml-url');
  });

  test('matches a yaml array pattern (one of many)', () => {
    setConfig('json', 'schemas', []);
    setConfig('yaml', 'schemas', { 'yaml-url': ['nope.json', 'data.json'] });
    assert.strictEqual(findBoundSchemaPath(doc), 'yaml-url');
  });

  test('normalises ./ when matching yaml patterns', () => {
    setConfig('json', 'schemas', []);
    setConfig('yaml', 'schemas', { 'yaml-url': './data.json' });
    assert.strictEqual(findBoundSchemaPath(doc), 'yaml-url');
  });

  test('tolerates a json entry with no fileMatch', () => {
    setConfig('json', 'schemas', [{ url: 'x' }]); // no fileMatch → defaults to []
    assert.strictEqual(findBoundSchemaPath(doc), undefined);
  });
});

suite('stripEmbeddedUrlToken()', () => {
  test('strips ?token= from github.com', () => {
    assert.strictEqual(
      stripEmbeddedUrlToken('https://github.com/o/r/raw/main/s.json?token=ABC'),
      'https://github.com/o/r/raw/main/s.json'
    );
  });

  test('strips token from raw.githubusercontent.com', () => {
    assert.strictEqual(
      stripEmbeddedUrlToken('https://raw.githubusercontent.com/o/r/main/s.json?token=ABC'),
      'https://raw.githubusercontent.com/o/r/main/s.json'
    );
  });

  test('strips token from an *.github.com subdomain', () => {
    assert.strictEqual(stripEmbeddedUrlToken('https://api.github.com/x?token=ABC'), 'https://api.github.com/x');
  });

  test('leaves non-github hosts untouched even with a token', () => {
    const url = 'https://evil.example.com/s.json?token=ABC';
    assert.strictEqual(stripEmbeddedUrlToken(url), url);
  });

  test('does not match lookalike hosts like notgithub.com', () => {
    const url = 'https://notgithub.com/s.json?token=ABC';
    assert.strictEqual(stripEmbeddedUrlToken(url), url);
  });

  test('leaves a github url without a token unchanged', () => {
    const url = 'https://github.com/o/r/raw/main/s.json';
    assert.strictEqual(stripEmbeddedUrlToken(url), url);
  });

  test('drops token but preserves other query params', () => {
    const out = stripEmbeddedUrlToken('https://raw.githubusercontent.com/s.json?ref=main&token=ABC');
    assert.ok(out.includes('ref=main'), 'kept ref param');
    assert.ok(!out.includes('token'), 'dropped token param');
  });

  test('returns a malformed url unchanged', () => {
    assert.strictEqual(stripEmbeddedUrlToken('not a url'), 'not a url');
  });
});

suite('relFileForTarget()', () => {
  setup(() => {
    vscode.resetAll();
    (vscode.workspace as any).workspaceFile = undefined;
    vscode.workspace.asRelativePath.callsFake((_u: any, inc?: boolean) =>
      inc ? 'sub/data.json' : 'data.json'
    );
  });
  const uri = { fsPath: '/ws/sub/data.json' } as any;

  test('Workspace + multi-root → folder-relative path', () => {
    (vscode.workspace as any).workspaceFile = { fsPath: '/ws/p.code-workspace' };
    vscode.workspace.workspaceFolders = [{}, {}] as any;
    assert.strictEqual(relFileForTarget(uri, ConfigurationTarget.Workspace), 'sub/data.json');
  });

  test('Workspace + single-root → plain relative path', () => {
    (vscode.workspace as any).workspaceFile = { fsPath: '/ws/p.code-workspace' };
    vscode.workspace.workspaceFolders = [{}] as any;
    assert.strictEqual(relFileForTarget(uri, ConfigurationTarget.Workspace), 'data.json');
  });

  test('Workspace without a .code-workspace file → plain relative path', () => {
    (vscode.workspace as any).workspaceFile = undefined;
    vscode.workspace.workspaceFolders = [{}, {}] as any;
    assert.strictEqual(relFileForTarget(uri, ConfigurationTarget.Workspace), 'data.json');
  });

  test('WorkspaceFolder target → plain relative path', () => {
    (vscode.workspace as any).workspaceFile = { fsPath: '/ws/p.code-workspace' };
    vscode.workspace.workspaceFolders = [{}, {}] as any;
    assert.strictEqual(relFileForTarget(uri, ConfigurationTarget.WorkspaceFolder), 'data.json');
  });

  test('Global target → plain relative path', () => {
    assert.strictEqual(relFileForTarget(uri, ConfigurationTarget.Global), 'data.json');
  });
});

suite('pickInspectValue()', () => {
  const inspect = { workspaceValue: 'WS', globalValue: 'GLOBAL', workspaceFolderValue: 'FOLDER' };

  test('WorkspaceFolder → workspaceFolderValue', () =>
    assert.strictEqual(pickInspectValue(inspect, ConfigurationTarget.WorkspaceFolder), 'FOLDER'));
  test('Workspace → workspaceValue', () =>
    assert.strictEqual(pickInspectValue(inspect, ConfigurationTarget.Workspace), 'WS'));
  test('Global → globalValue', () =>
    assert.strictEqual(pickInspectValue(inspect, ConfigurationTarget.Global), 'GLOBAL'));
  test('undefined inspect → undefined', () =>
    assert.strictEqual(pickInspectValue(undefined, ConfigurationTarget.Global), undefined));
});

suite('extractInlineSchemaUrl()', () => {
  const doc = (languageId: string, text: string) => ({ languageId, getText: () => text } as any);

  test('json $schema string', () =>
    assert.strictEqual(
      extractInlineSchemaUrl(doc('json', '{"$schema":"https://x/s.json","a":1}')),
      'https://x/s.json'
    ));
  test('json without $schema → undefined', () =>
    assert.strictEqual(extractInlineSchemaUrl(doc('json', '{"a":1}')), undefined));
  test('json with non-string $schema → undefined', () =>
    assert.strictEqual(extractInlineSchemaUrl(doc('json', '{"$schema":123}')), undefined));
  test('invalid json → undefined', () =>
    assert.strictEqual(extractInlineSchemaUrl(doc('json', '{not json')), undefined));
  test('jsonc with comments + $schema', () =>
    assert.strictEqual(
      extractInlineSchemaUrl(doc('jsonc', '// header\n{"$schema":"https://x/s.json"}')),
      'https://x/s.json'
    ));
  test('yaml-language-server directive comment', () =>
    assert.strictEqual(
      extractInlineSchemaUrl(doc('yaml', '# yaml-language-server: $schema=https://x/s.json\nfoo: 1')),
      'https://x/s.json'
    ));
  test('yaml top-level $schema key', () =>
    assert.strictEqual(
      extractInlineSchemaUrl(doc('yaml', '$schema: https://x/s.json\nfoo: 1')),
      'https://x/s.json'
    ));
  test('yaml without any schema → undefined', () =>
    assert.strictEqual(extractInlineSchemaUrl(doc('yaml', 'foo: 1\nbar: 2')), undefined));
  test('yaml directive is case-insensitive', () =>
    assert.strictEqual(
      extractInlineSchemaUrl(doc('yaml', '# YAML-LANGUAGE-SERVER: $schema=https://x/s.json')),
      'https://x/s.json'
    ));
});
