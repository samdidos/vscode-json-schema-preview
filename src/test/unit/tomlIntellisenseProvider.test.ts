import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from '../mocks/vscode';

const { TomlIntellisenseProvider } = require('../../TomlIntellisenseProvider');

function fakeCache(map: Record<string, string> = {}) {
  return { readCached: (url: string) => (url in map ? map[url] : undefined) } as any;
}

/** Minimal TOML TextDocument stand-in with a real offsetAt. */
function makeDoc(text: string, fsPath: string, version = 1) {
  return {
    languageId: 'toml',
    version,
    getText: () => text,
    uri: { fsPath, scheme: 'file', toString: () => `file://${fsPath}` },
    offsetAt: (pos: { line: number; character: number }) => {
      const lines = text.split('\n');
      let offset = 0;
      for (let i = 0; i < pos.line; i++) { offset += lines[i].length + 1; }
      return offset + pos.character;
    },
  } as any;
}

/** Position of the end of `needle`'s first occurrence in `text`. */
function positionAfter(text: string, needle: string): InstanceType<typeof vscode.Position> {
  const idx = text.indexOf(needle);
  assert.ok(idx !== -1, `fixture must contain ${JSON.stringify(needle)}`);
  const upTo = text.slice(0, idx + needle.length);
  const line = (upTo.match(/\n/g) ?? []).length;
  const character = upTo.length - (upTo.lastIndexOf('\n') + 1);
  return new vscode.Position(line, character);
}

const SCHEMA = JSON.stringify({
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', description: 'Display name.' },
    port: { type: 'integer', description: 'TCP port.', enum: [80, 443] },
    server: {
      type: 'object',
      properties: {
        tls: {
          type: 'object',
          properties: { cert: { type: 'string', description: 'Certificate path.' } },
        },
      },
    },
  },
});

let dir: string;
setup(() => {
  vscode.resetAll();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jspreview-tomlint-'));
  fs.writeFileSync(path.join(dir, 'schema.json'), SCHEMA);
});
teardown(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

function tomlDoc(body: string, version = 1) {
  const text = `"$schema" = "./schema.json"\n${body}`;
  return { text, doc: makeDoc(text, path.join(dir, 'config.toml'), version) };
}

suite('[F19-FR-01] TomlIntellisenseProvider — registration & activation', () => {
  test('registers a completion and a hover provider for TOML', () => {
    const disposables = TomlIntellisenseProvider.register(fakeCache());
    assert.strictEqual(disposables.length, 2);
    const completionArgs = vscode.languages.registerCompletionItemProvider.firstCall.args;
    assert.deepStrictEqual(completionArgs[0], { language: 'toml' });
    const hoverArgs = vscode.languages.registerHoverProvider.firstCall.args;
    assert.deepStrictEqual(hoverArgs[0], { language: 'toml' });
  });

  test('a document without an inline $schema gets no completions and no hover', () => {
    const provider = new TomlIntellisenseProvider(fakeCache());
    const text = 'name = "x"\npo';
    const doc = makeDoc(text, path.join(dir, 'plain.toml'));
    assert.strictEqual(provider.provideCompletionItems(doc, positionAfter(text, 'po')), undefined);
    assert.strictEqual(provider.provideHover(doc, new vscode.Position(0, 2)), undefined);
  });

  test('[F19-FR-02] an unreachable remote schema with an empty cache yields nothing and no error UI', () => {
    const provider = new TomlIntellisenseProvider(fakeCache());
    const text = '"$schema" = "https://corp/missing.json"\npo';
    const doc = makeDoc(text, path.join(dir, 'remote.toml'));
    assert.strictEqual(provider.provideCompletionItems(doc, positionAfter(text, 'po')), undefined);
    assert.strictEqual(provider.provideHover(doc, new vscode.Position(1, 1)), undefined);
    assert.ok(!vscode.window.showErrorMessage.called);
    assert.ok(!vscode.window.showWarningMessage.called);
    assert.ok(!vscode.window.showInformationMessage.called);
  });

  test('[F19-FR-02] a cached remote schema serves completions from the cache', () => {
    const provider = new TomlIntellisenseProvider(
      fakeCache({ 'https://corp/config.json': SCHEMA }),
    );
    const text = '"$schema" = "https://corp/config.json"\n';
    const doc = makeDoc(text, path.join(dir, 'remote.toml'));
    const items = provider.provideCompletionItems(doc, new vscode.Position(1, 0));
    assert.ok(items.some((i: any) => i.label === 'port'));
  });
});

suite('[F19-FR-03] TomlIntellisenseProvider — key completions', () => {
  test('root keys are offered, minus already-present ones', () => {
    const provider = new TomlIntellisenseProvider(fakeCache());
    const { text, doc } = tomlDoc('name = "x"\n');
    const items = provider.provideCompletionItems(doc, positionAfter(text, 'name = "x"\n'));
    const labels = items.map((i: any) => i.label);
    assert.ok(labels.includes('port'), `port expected in ${labels}`);
    assert.ok(labels.includes('server'));
    assert.ok(!labels.includes('name'), 'already-present key must be omitted');
  });

  test('under [server.tls] completions come from the tls subschema, not the root', () => {
    const provider = new TomlIntellisenseProvider(fakeCache());
    const { text, doc } = tomlDoc('[server.tls]\n');
    const items = provider.provideCompletionItems(doc, positionAfter(text, '[server.tls]\n'));
    assert.deepStrictEqual(items.map((i: any) => i.label), ['cert']);
  });

  test('[F19-FR-05] descriptions become documentation and required keys sort first', () => {
    const provider = new TomlIntellisenseProvider(fakeCache());
    const { text, doc } = tomlDoc('');
    const items = provider.provideCompletionItems(doc, positionAfter(text, '\n'));
    const name = items.find((i: any) => i.label === 'name');
    const port = items.find((i: any) => i.label === 'port');
    assert.strictEqual(name.documentation.value, 'Display name.');
    assert.match(name.detail, /required/);
    assert.ok(name.sortText < port.sortText, 'required key must sort before optional');
  });
});

suite('[F19-FR-04] TomlIntellisenseProvider — value completions', () => {
  test('after port = the enum values are offered as TOML literals', () => {
    const provider = new TomlIntellisenseProvider(fakeCache());
    const { text, doc } = tomlDoc('port = ');
    const items = provider.provideCompletionItems(doc, positionAfter(text, 'port = '));
    assert.deepStrictEqual(items.map((i: any) => i.label), ['80', '443']);
    assert.strictEqual(items[0].kind, vscode.CompletionItemKind.Value);
  });
});

suite('[F19-FR-07] TomlIntellisenseProvider — hover', () => {
  test('hovering a key shows description and enum from the schema', () => {
    const provider = new TomlIntellisenseProvider(fakeCache());
    const { text, doc } = tomlDoc('port = 80\n');
    const hover = provider.provideHover(doc, positionAfter(text, '\npo'));
    assert.ok(hover, 'hover expected');
    const md = hover.contents[0].value as string;
    assert.match(md, /\*\*key\*\* `port`/);
    assert.match(md, /TCP port/);
    assert.match(md, /`80`, `443`/);
  });

  test('hovering a value yields no hover', () => {
    const provider = new TomlIntellisenseProvider(fakeCache());
    const { text, doc } = tomlDoc('port = 80\n');
    const hover = provider.provideHover(doc, positionAfter(text, 'port = 8'));
    assert.strictEqual(hover, undefined);
  });

  test('[F19-FR-06] hover follows $refs in the schema', () => {
    fs.writeFileSync(path.join(dir, 'refs.json'), JSON.stringify({
      type: 'object',
      properties: { level: { $ref: '#/$defs/level' } },
      $defs: { level: { type: 'string', description: 'Log level.', enum: ['info', 'warn'] } },
    }));
    const provider = new TomlIntellisenseProvider(fakeCache());
    const text = '"$schema" = "./refs.json"\nlevel = "info"\n';
    const doc = makeDoc(text, path.join(dir, 'app.toml'));
    const hover = provider.provideHover(doc, positionAfter(text, '\nlev'));
    assert.ok(hover);
    assert.match(hover.contents[0].value, /Log level/);
  });
});

suite('[F19-NFR-02] TomlIntellisenseProvider — parsing & I/O discipline', () => {
  test('the schema is loaded once per document version', () => {
    let reads = 0;
    const cache = {
      readCached: (url: string) => { reads++; return url === 'https://corp/config.json' ? SCHEMA : undefined; },
    } as any;
    const provider = new TomlIntellisenseProvider(cache);
    const text = '"$schema" = "https://corp/config.json"\n';
    const doc = makeDoc(text, path.join(dir, 'memo.toml'));
    provider.provideCompletionItems(doc, new vscode.Position(1, 0));
    provider.provideCompletionItems(doc, new vscode.Position(1, 0));
    provider.provideHover(doc, new vscode.Position(1, 0));
    assert.strictEqual(reads, 1, 'same document version must not reload the schema');
  });

  test('a new document version reloads the schema', () => {
    let reads = 0;
    const cache = {
      readCached: () => { reads++; return SCHEMA; },
    } as any;
    const provider = new TomlIntellisenseProvider(cache);
    const text = '"$schema" = "https://corp/config.json"\n';
    provider.provideCompletionItems(makeDoc(text, path.join(dir, 'memo.toml'), 1), new vscode.Position(1, 0));
    provider.provideCompletionItems(makeDoc(text, path.join(dir, 'memo.toml'), 2), new vscode.Position(1, 0));
    assert.strictEqual(reads, 2);
  });
});
