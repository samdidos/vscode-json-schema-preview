// Direct, outcome-asserting tests for the SchemaBindingManager utility
// functions. These target the branch/equality/logic that mutation testing
// found to be executed-but-unverified — they assert exact return values across
// every branch so a flipped condition or operator fails a test (i.e. is killed).
import * as assert from 'assert';
import { applyEdits } from 'jsonc-parser';
import * as vscode from '../mocks/vscode';
import { setConfig, setScopedConfig } from '../mocks/vscode';

const {
  findBoundSchemaPath,
  extractInlineSchemaUrl,
  stripEmbeddedUrlToken,
  relFileForTarget,
  pickInspectValue,
  validateSchemaRefInput,
  computeJsonSchemaInsertEdits,
  computeJsonSchemaRemoveEdits,
  computeYamlSchemaUpsertEdit,
  computeYamlSchemaRemoveEdit,
  computeTomlSchemaUpsertEdit,
  computeTomlSchemaRemoveEdit,
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

// A regression suite for the multi-root scope-resolution bug: findBoundSchemaPath
// used to call getConfiguration() with no resource, so a WorkspaceFolder-scoped
// binding written in a *different* folder's .vscode/settings.json could still
// be considered (or, depending on VS Code's own resolution, a same-folder
// WorkspaceFolder-scoped binding could be missed entirely), and it only ever
// matched the folder-relative path form even though Workspace-scope bindings
// in a multi-root workspace are stored folder-prefixed (relFileForTarget).
// setScopedConfig lets the mock hold genuinely different values per scope and
// per folder, which setConfig() (same value everywhere) cannot exercise.
suite('findBoundSchemaPath() — multi-root scope resolution [F04-FR-14]', () => {
  const tmpA = '/ws/projA';
  const tmpB = '/ws/projB';

  setup(() => {
    vscode.resetAll();
    (vscode.workspace as any).workspaceFile = { fsPath: '/ws/multi-root.code-workspace' };
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: tmpA }, name: 'projA' },
      { uri: { fsPath: tmpB }, name: 'projB' },
    ] as any;
    vscode.workspace.asRelativePath.callsFake((u: any, includeFolder?: boolean) => {
      const p = typeof u === 'string' ? u : u.fsPath;
      if (p.startsWith(`${tmpA}/`)) {
        const rel = p.slice(tmpA.length + 1);
        return includeFolder ? `projA/${rel}` : rel;
      }
      if (p.startsWith(`${tmpB}/`)) {
        const rel = p.slice(tmpB.length + 1);
        return includeFolder ? `projB/${rel}` : rel;
      }
      return p;
    });
  });

  test('a WorkspaceFolder-scoped binding in folder A is found for a document in folder A', () => {
    setScopedConfig('json', 'schemas', {
      workspaceFolder: [[tmpA, [{ url: 'https://a.example/s.json', fileMatch: ['data.json'] }]]],
    });
    assert.strictEqual(
      findBoundSchemaPath({ uri: { fsPath: `${tmpA}/data.json` } }),
      'https://a.example/s.json'
    );
  });

  test('a WorkspaceFolder-scoped binding in folder A does not leak into folder B', () => {
    setScopedConfig('json', 'schemas', {
      workspaceFolder: [[tmpA, [{ url: 'https://a.example/s.json', fileMatch: ['data.json'] }]]],
    });
    assert.strictEqual(findBoundSchemaPath({ uri: { fsPath: `${tmpB}/data.json` } }), undefined);
  });

  test('a Workspace-scoped (folder-prefixed) binding is found for the file it names regardless of which folder is queried', () => {
    setScopedConfig('json', 'schemas', {
      workspace: [{ url: 'https://shared.example/s.json', fileMatch: ['projB/data.json'] }],
    });
    assert.strictEqual(findBoundSchemaPath({ uri: { fsPath: `${tmpA}/other.json` } }), undefined);
    assert.strictEqual(
      findBoundSchemaPath({ uri: { fsPath: `${tmpB}/data.json` } }),
      'https://shared.example/s.json'
    );
  });

  test('a WorkspaceFolder-scoped binding and a Workspace-scoped binding for different files coexist', () => {
    setScopedConfig('json', 'schemas', {
      workspaceFolder: [[tmpA, [{ url: 'https://a.example/local.json', fileMatch: ['local.json'] }]]],
      workspace: [{ url: 'https://shared.example/shared.json', fileMatch: ['projB/shared.json'] }],
    });
    assert.strictEqual(
      findBoundSchemaPath({ uri: { fsPath: `${tmpA}/local.json` } }),
      'https://a.example/local.json'
    );
    assert.strictEqual(
      findBoundSchemaPath({ uri: { fsPath: `${tmpB}/shared.json` } }),
      'https://shared.example/shared.json'
    );
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

suite('validateSchemaRefInput()', () => {
  test('empty string → Required', () =>
    assert.strictEqual(validateSchemaRefInput(''), 'Required'));
  test('whitespace only → Required', () =>
    assert.strictEqual(validateSchemaRefInput('   '), 'Required'));
  test('undefined → Required', () =>
    assert.strictEqual(validateSchemaRefInput(undefined), 'Required'));
  test('http URL → accepted', () =>
    assert.strictEqual(validateSchemaRefInput('http://x/s.json'), undefined));
  test('https URL → accepted', () =>
    assert.strictEqual(validateSchemaRefInput('https://x/s.json'), undefined));
  test('relative ./ path → accepted', () =>
    assert.strictEqual(validateSchemaRefInput('./s.json'), undefined));
  test('absolute path → accepted', () =>
    assert.strictEqual(validateSchemaRefInput('/abs/s.json'), undefined));
  test('bare relative path → rejected', () =>
    assert.ok(validateSchemaRefInput('s.json')?.startsWith('Enter')));
  test('ftp scheme → rejected', () =>
    assert.ok(validateSchemaRefInput('ftp://x')?.startsWith('Enter')));
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
  // [F10-FR-14] the directive form must also detect local paths, not just
  // http(s) URLs, so inline bindings written by writeInlineBinding (which can
  // embed a relative path) round-trip through this same detector.
  test('yaml directive with a local relative path', () =>
    assert.strictEqual(
      extractInlineSchemaUrl(doc('yaml', '# yaml-language-server: $schema=./schema.json\nfoo: 1')),
      './schema.json'
    ));
  test('yaml directive with an absolute local path', () =>
    assert.strictEqual(
      extractInlineSchemaUrl(doc('yaml', '# yaml-language-server: $schema=/abs/schema.json')),
      '/abs/schema.json'
    ));

  // [F11-FR-15] TOML inline $schema quoted-key form
  test('toml "$schema" quoted key', () =>
    assert.strictEqual(
      extractInlineSchemaUrl(doc('toml', '"$schema" = "./config.schema.json"\ntitle = "x"')),
      './config.schema.json'
    ));
  test('toml without $schema → undefined', () =>
    assert.strictEqual(extractInlineSchemaUrl(doc('toml', 'title = "x"\nn = 1')), undefined));
  test('toml $schema with a remote URL', () =>
    assert.strictEqual(
      extractInlineSchemaUrl(doc('toml', '"$schema" = "https://x/s.json"')),
      'https://x/s.json'
    ));
});

// ─── Inline binding — TOML edit computation [F11] ─────────────────────────────

suite('computeTomlSchemaUpsertEdit() [F11-FR-16]', () => {
  test('inserts a new "$schema" line before the first non-comment line', () => {
    const text = 'title = "cfg"\nn = 1\n';
    const edit = computeTomlSchemaUpsertEdit(text, './s.json');
    assert.strictEqual(edit.offset, 0);
    assert.strictEqual(edit.length, 0);
    assert.strictEqual(edit.content, '"$schema" = "./s.json"\n');
  });

  test('inserts below leading comment lines but above the first table', () => {
    const text = '# a comment\n\ntitle = "cfg"\n[server]\nhost = "x"\n';
    const edit = computeTomlSchemaUpsertEdit(text, './s.json');
    // Applying the edit puts the $schema key ahead of both title and [server].
    const result = text.slice(0, edit.offset) + edit.content + text.slice(edit.offset);
    assert.match(result, /# a comment\n\n"\$schema" = "\.\/s\.json"\ntitle/);
  });

  test('replaces an existing "$schema" value in place', () => {
    const text = '"$schema" = "./old.json"\ntitle = "cfg"\n';
    const edit = computeTomlSchemaUpsertEdit(text, './new.json');
    const result = text.slice(0, edit.offset) + edit.content + text.slice(edit.offset + edit.length);
    assert.strictEqual(result, '"$schema" = "./new.json"\ntitle = "cfg"\n');
  });

  test('handles an all-comment file by appending at the end', () => {
    const text = '# just a comment\n';
    const edit = computeTomlSchemaUpsertEdit(text, './s.json');
    assert.strictEqual(edit.offset, text.length);
    assert.strictEqual(edit.content, '"$schema" = "./s.json"\n');
  });

  // A raw Windows path embeds backslashes, which TOML basic strings interpret
  // as escape sequences (`\U` not followed by 8 hex digits is an invalid
  // escape and makes the whole file fail to parse) — the ref must be escaped.
  test('escapes backslashes in a Windows-style path so the written file stays valid TOML', () => {
    const edit = computeTomlSchemaUpsertEdit('title = "cfg"\n', 'C:\\Users\\dev\\schema.json');
    assert.strictEqual(edit.content, '"$schema" = "C:\\\\Users\\\\dev\\\\schema.json"\n');
  });

  test('escapes backslashes when replacing an existing value too', () => {
    const text = '"$schema" = "./old.json"\n';
    const edit = computeTomlSchemaUpsertEdit(text, 'C:\\Users\\dev\\schema.json');
    const result = text.slice(0, edit.offset) + edit.content + text.slice(edit.offset + edit.length);
    assert.strictEqual(result, '"$schema" = "C:\\\\Users\\\\dev\\\\schema.json"\n');
  });

  test('round-trips a backslash-containing path through extractInlineSchemaUrl', () => {
    const text = 'title = "cfg"\n';
    const ref = 'C:\\Users\\dev\\schema.json';
    const edit = computeTomlSchemaUpsertEdit(text, ref);
    const written = text.slice(0, edit.offset) + edit.content + text.slice(edit.offset);
    assert.strictEqual(
      extractInlineSchemaUrl({ languageId: 'toml', getText: () => written } as any),
      ref
    );
  });
});

// A regression suite for the TOML root-table scoping bug: the "$schema"
// detection regex used to search the whole document, so a `"$schema"` key
// nested under a `[table]` header (a legitimate, unrelated nested key, e.g.
// `tool.foo."$schema"`) was mistaken for the document's own binding.
suite('TOML "$schema" detection is restricted to the root table [F11-FR-15][F11-FR-16][F11-FR-17]', () => {
  const nested = '"$schema" = "https://root.example/s.json"\n[tool.foo]\n"$schema" = "not-a-binding"\n';
  const onlyNested = '[tool.foo]\n"$schema" = "not-a-binding"\n';

  test('extractInlineSchemaUrl reads the root binding, ignoring the nested key', () => {
    assert.strictEqual(
      extractInlineSchemaUrl({ languageId: 'toml', getText: () => nested } as any),
      'https://root.example/s.json'
    );
  });

  test('extractInlineSchemaUrl returns undefined when the only "$schema" key is nested under a table', () => {
    assert.strictEqual(
      extractInlineSchemaUrl({ languageId: 'toml', getText: () => onlyNested } as any),
      undefined
    );
  });

  test('computeTomlSchemaUpsertEdit replaces the root binding, leaving the nested key untouched', () => {
    const edit = computeTomlSchemaUpsertEdit(nested, 'https://new.example/s.json');
    const result = nested.slice(0, edit.offset) + edit.content + nested.slice(edit.offset + edit.length);
    assert.strictEqual(
      result,
      '"$schema" = "https://new.example/s.json"\n[tool.foo]\n"$schema" = "not-a-binding"\n'
    );
  });

  test('computeTomlSchemaUpsertEdit inserts a new root binding above the table, ignoring the nested key', () => {
    const edit = computeTomlSchemaUpsertEdit(onlyNested, 'https://new.example/s.json');
    assert.strictEqual(edit.offset, 0);
    assert.strictEqual(edit.content, '"$schema" = "https://new.example/s.json"\n');
  });

  test('computeTomlSchemaRemoveEdit removes only the root "$schema" line, leaving the nested one intact', () => {
    const edit = computeTomlSchemaRemoveEdit(nested);
    assert.ok(edit);
    const result = nested.slice(0, edit!.offset) + nested.slice(edit!.offset + edit!.length);
    assert.strictEqual(result, '[tool.foo]\n"$schema" = "not-a-binding"\n');
  });

  test('computeTomlSchemaRemoveEdit returns undefined when the only "$schema" key is nested under a table', () => {
    assert.strictEqual(computeTomlSchemaRemoveEdit(onlyNested), undefined);
  });
});

suite('computeTomlSchemaRemoveEdit() [F11-FR-17]', () => {
  test('removes the whole "$schema" line including its newline', () => {
    const text = '"$schema" = "./s.json"\ntitle = "cfg"\n';
    const edit = computeTomlSchemaRemoveEdit(text);
    const result = text.slice(0, edit.offset) + text.slice(edit.offset + edit.length);
    assert.strictEqual(result, 'title = "cfg"\n');
  });

  test('returns undefined when there is no "$schema" line', () => {
    assert.strictEqual(computeTomlSchemaRemoveEdit('title = "cfg"\n'), undefined);
  });
});

// ─── Inline binding — pure edit computation [F10] ─────────────────────────────

suite('computeJsonSchemaInsertEdits() [F10-FR-04][F10-FR-06][F10-FR-07]', () => {
  const fmt = { tabSize: 2, insertSpaces: true, eol: '\n' };

  test('inserts $schema as the first key ahead of existing keys', () => {
    const text = '{\n  "a": 1,\n  "b": 2\n}';
    const result = computeJsonSchemaInsertEdits(text, './schema.json', fmt);
    assert.ok('edits' in result);
    assert.strictEqual(
      applyEdits(text, result.edits),
      '{\n  "$schema": "./schema.json",\n  "a": 1,\n  "b": 2\n}'
    );
  });

  test('replaces an existing $schema value in place', () => {
    const text = '{\n  "$schema": "./old.json",\n  "a": 1\n}';
    const result = computeJsonSchemaInsertEdits(text, './new.json', fmt);
    assert.strictEqual(
      applyEdits(text, result.edits),
      '{\n  "$schema": "./new.json",\n  "a": 1\n}'
    );
  });

  test('preserves // and /* */ comments in JSONC', () => {
    const text = '// header\n{\n  "a": 1 /* trailing */\n}';
    const result = computeJsonSchemaInsertEdits(text, './s.json', fmt);
    const out = applyEdits(text, result.edits);
    assert.strictEqual(out, '// header\n{\n  "$schema": "./s.json",\n  "a": 1 /* trailing */\n}');
  });

  test('errors and returns no edits when the root is an array', () => {
    const result = computeJsonSchemaInsertEdits('[1,2,3]', './s.json', fmt);
    assert.ok('error' in result);
    assert.ok(result.error.length > 0);
  });

  test('errors when the root is a scalar', () => {
    const result = computeJsonSchemaInsertEdits('42', './s.json', fmt);
    assert.ok('error' in result);
  });
});

suite('computeJsonSchemaRemoveEdits() [F10-FR-10][F10-FR-11]', () => {
  const fmt = { tabSize: 2, insertSpaces: true, eol: '\n' };

  test('removes the only property, leaving a valid empty object', () => {
    const text = '{\n  "$schema": "./s.json"\n}';
    const edits = computeJsonSchemaRemoveEdits(text, fmt);
    assert.deepStrictEqual(JSON.parse(applyEdits(text, edits)), {});
  });

  test('removes $schema and the dangling comma when other properties follow', () => {
    const text = '{\n  "$schema": "./s.json",\n  "a": 1\n}';
    const edits = computeJsonSchemaRemoveEdits(text, fmt);
    assert.strictEqual(applyEdits(text, edits), '{\n  "a": 1\n}');
  });

  test('returns no edits when there is no $schema property', () => {
    assert.deepStrictEqual(computeJsonSchemaRemoveEdits('{\n  "a": 1\n}', fmt), []);
  });

  test('returns no edits when the root is not an object', () => {
    assert.deepStrictEqual(computeJsonSchemaRemoveEdits('[1,2]', fmt), []);
  });
});

function applyYamlEdit(text: string, edit: { offset: number; length: number; content: string }): string {
  return text.slice(0, edit.offset) + edit.content + text.slice(edit.offset + edit.length);
}

suite('computeYamlSchemaUpsertEdit() [F10-FR-08][F10-FR-09][F10-FR-16]', () => {
  test('inserts a plain $schema: key as the first line when the yaml extension is absent', () => {
    const text = 'foo: 1\nbar: 2\n';
    const edit = computeYamlSchemaUpsertEdit(text, './s.json', false);
    assert.strictEqual(applyYamlEdit(text, edit), '$schema: ./s.json\nfoo: 1\nbar: 2\n');
  });

  test('inserts a yaml-language-server directive as the first line when the extension is installed', () => {
    const text = 'foo: 1\n';
    const edit = computeYamlSchemaUpsertEdit(text, './s.json', true);
    assert.strictEqual(applyYamlEdit(text, edit), '# yaml-language-server: $schema=./s.json\nfoo: 1\n');
  });

  test('updates an existing directive in place, ignoring the extension-installed flag', () => {
    const text = '# yaml-language-server: $schema=./old.json\nfoo: 1\n';
    const edit = computeYamlSchemaUpsertEdit(text, './new.json', false);
    assert.strictEqual(applyYamlEdit(text, edit), '# yaml-language-server: $schema=./new.json\nfoo: 1\n');
  });

  test('updates an existing plain key in place, ignoring the extension-installed flag', () => {
    const text = '$schema: ./old.json\nfoo: 1\n';
    const edit = computeYamlSchemaUpsertEdit(text, './new.json', true);
    assert.strictEqual(applyYamlEdit(text, edit), '$schema: ./new.json\nfoo: 1\n');
  });
});

suite('computeYamlSchemaRemoveEdit() [F10-FR-10]', () => {
  test('removes a directive comment line entirely', () => {
    const text = '# yaml-language-server: $schema=./s.json\nfoo: 1\n';
    const edit = computeYamlSchemaRemoveEdit(text);
    assert.strictEqual(applyYamlEdit(text, edit), 'foo: 1\n');
  });

  test('removes a plain $schema: key line entirely', () => {
    const text = '$schema: ./s.json\nfoo: 1\n';
    const edit = computeYamlSchemaRemoveEdit(text);
    assert.strictEqual(applyYamlEdit(text, edit), 'foo: 1\n');
  });

  test('returns undefined when there is nothing to remove', () => {
    assert.strictEqual(computeYamlSchemaRemoveEdit('foo: 1\n'), undefined);
  });
});
