import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from '../mocks/vscode';

const { SchemaRefProvider, positionAt } = require('../../SchemaRefProvider');

/** Build a document double with the offset/position plumbing the provider needs. */
function makeDoc(text: string, languageId = 'json', fsPath = '/ws/schema.json', version = 1) {
  return {
    languageId,
    uri: { fsPath, scheme: 'file', toString: () => `file://${fsPath}` },
    getText: () => text,
    offsetAt: (pos: any) => pos.__offset ?? 0,
    version,
  };
}

/** A position carrying the raw offset our doc double reads back. */
function posAt(offset: number) {
  return { __offset: offset, line: 0, character: 0 };
}

/** Cache double: each cached URL maps to a stable on-disk path. */
function fakeCache(map: Record<string, string> = {}) {
  return {
    readCached: (url: string) => (url in map ? map[url] : undefined),
    getCachedPath: (url: string) => (url in map ? cachedPathFor(url) : undefined),
  } as any;
}

function cachedPathFor(url: string): string {
  return `/cache/${Buffer.from(url).toString('hex').slice(0, 16)}.json`;
}

setup(() => vscode.resetAll());

suite('[F13-FR-01] SchemaRefProvider.register()', () => {
  test('registers a definition and a hover provider', () => {
    const disposables = SchemaRefProvider.register(fakeCache());
    assert.strictEqual(disposables.length, 2);
    assert.ok(vscode.languages.registerDefinitionProvider.called);
    assert.ok(vscode.languages.registerHoverProvider.called);
    const selector = vscode.languages.registerDefinitionProvider.firstCall.args[0];
    assert.ok(selector.some((s: any) => s.language === 'toml'), 'TOML data files carry inline bindings too');
  });
});

suite('[F13-FR-04] provideDefinition() — same document', () => {
  const text = JSON.stringify(
    { $schema: 'http://json-schema.org/draft-07/schema#', $defs: { address: { type: 'object' } }, use: { $ref: '#/$defs/address' } },
    null, 2,
  );

  test('jumps to the local definition key', () => {
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text);
    const loc = provider.provideDefinition(doc, posAt(text.indexOf('#/$defs/address') + 2));
    assert.ok(loc, 'expected a Location');
    assert.strictEqual(loc.uri, doc.uri);
    const sliced = text.slice(
      offsetOf(text, loc.range.startLine, loc.range.startChar),
      offsetOf(text, loc.range.endLine, loc.range.endChar),
    );
    assert.strictEqual(sliced, '"address"');
  });

  test('[F13-FR-02] returns undefined when not on a $ref', () => {
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text);
    assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf('"type"') + 1)), undefined);
  });

  test('returns undefined for a non-schema document', () => {
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc('{"just":"data"}');
    assert.strictEqual(provider.provideDefinition(doc, posAt(3)), undefined);
  });

  test('[F13-FR-07] returns undefined for an unresolvable local pointer', () => {
    const bad = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', use: { $ref: '#/$defs/missing' } }, null, 2);
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(bad);
    assert.strictEqual(provider.provideDefinition(doc, posAt(bad.indexOf('#/$defs/missing') + 2)), undefined);
  });
});

suite('[F13-FR-05] provideDefinition() — relative file', () => {
  let dir: string;
  teardown(() => { if (dir) {fs.rmSync(dir, { recursive: true, force: true });} });

  test('resolves a relative $ref into a sibling file', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jspreview-ref-'));
    const commonPath = path.join(dir, 'common.json');
    fs.writeFileSync(commonPath, JSON.stringify({ $defs: { id: { type: 'string' } } }, null, 2), 'utf-8');
    const mainPath = path.join(dir, 'main.json');
    const text = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', use: { $ref: './common.json#/$defs/id' } }, null, 2);

    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', mainPath);
    const loc = provider.provideDefinition(doc, posAt(text.indexOf('./common.json') + 3));
    assert.ok(loc);
    assert.strictEqual(loc.uri.fsPath, commonPath);
  });

  test('returns undefined when the relative file is missing', () => {
    const text = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', use: { $ref: './nope.json#/$defs/id' } }, null, 2);
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', '/ws/main.json');
    assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf('./nope.json') + 3)), undefined);
  });
});

suite('[F13-FR-06] provideDefinition() — remote ref', () => {
  test('uses the cached copy when present', () => {
    const url = 'https://example.com/s.json';
    const cached = JSON.stringify({ $defs: { id: { type: 'string' } } }, null, 2);
    const text = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', use: { $ref: `${url}#/$defs/id` } }, null, 2);
    const provider = new SchemaRefProvider(fakeCache({ [url]: cached }));
    const doc = makeDoc(text);
    const loc = provider.provideDefinition(doc, posAt(text.indexOf(url) + 5));
    assert.ok(loc);
    // [F13-FR-12] the actual cached file, not a path built from the URL
    assert.strictEqual(loc.uri.fsPath, cachedPathFor(url));
  });

  test('[F13-FR-06] offers to cache when the remote ref is uncached', () => {
    vscode.window.showInformationMessage.resolves(undefined);
    const url = 'https://example.com/s.json';
    const text = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', use: { $ref: `${url}#/$defs/id` } }, null, 2);
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text);
    const loc = provider.provideDefinition(doc, posAt(text.indexOf(url) + 5));
    assert.strictEqual(loc, undefined);
    assert.ok(vscode.window.showInformationMessage.called);
  });

  // Regression: F08's on-disk cache file is always named "<hash>.json"
  // regardless of the schema's authored format, so language detection for a
  // cached remote schema must come from the *original* URL, not the cached
  // file's extension (which is meaningless) or a hardcoded assumption.
  test('[F13-FR-06] resolves a pointer in a cached remote schema authored as YAML', () => {
    const url = 'https://example.com/s.yaml';
    const cached = 'defs:\n  id:\n    type: string\n';
    const text = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', use: { $ref: `${url}#/defs/id` } }, null, 2);
    const provider = new SchemaRefProvider(fakeCache({ [url]: cached }));
    const doc = makeDoc(text);
    const loc = provider.provideDefinition(doc, posAt(text.indexOf(url) + 5));
    assert.ok(loc, 'expected the YAML pointer to resolve');
  });
});

suite('[F13-FR-08] provideHover()', () => {
  const text = JSON.stringify(
    { $schema: 'http://json-schema.org/draft-07/schema#', $defs: { address: { title: 'Address', type: 'object', properties: { city: {} } } }, use: { $ref: '#/$defs/address' } },
    null, 2,
  );

  test('shows the target summary for a local ref', () => {
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text);
    const hover = provider.provideHover(doc, posAt(text.indexOf('#/$defs/address') + 2));
    assert.ok(hover);
    assert.match(hover.contents[0].value, /Address/);
    assert.match(hover.contents[0].value, /`city`/);
  });

  test('[F13-FR-10] a hover on an uncached remote ref states it is not cached', () => {
    const url = 'https://example.com/s.json';
    const t = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', use: { $ref: `${url}#/x` } }, null, 2);
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(t);
    const hover = provider.provideHover(doc, posAt(t.indexOf(url) + 5));
    assert.ok(hover);
    assert.match(hover.contents[0].value, /not cached/i);
  });

  test('[F13-FR-07] a hover on an unresolvable pointer explains it', () => {
    const t = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', use: { $ref: '#/$defs/missing' } }, null, 2);
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(t);
    const hover = provider.provideHover(doc, posAt(t.indexOf('#/$defs/missing') + 2));
    assert.ok(hover);
    assert.match(hover.contents[0].value, /does not resolve/);
  });

  test('returns undefined when not on a $ref', () => {
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text);
    assert.strictEqual(provider.provideHover(doc, posAt(text.indexOf('"type"') + 1)), undefined);
  });
});

// Regression: provideHover and provideDefinition each independently parsed the
// active document (once to find the $ref under the cursor, once more to
// locate/resolve the target) on every single call, even for a local ref where
// both parses read the exact same unchanged text. SchemaRefProvider now
// memoizes the parse per document version.
suite('SchemaRefProvider — parse caching [F13-NFR]', () => {
  test('does not re-parse the document on a second hover/definition call for an unchanged version', () => {
    const text = JSON.stringify(
      { $schema: 'http://json-schema.org/draft-07/schema#', $defs: { address: { title: 'Address', type: 'object' } }, use: { $ref: '#/$defs/address' } },
    );
    let getTextCalls = 0;
    const doc: any = makeDoc(text);
    const realGetText = doc.getText;
    doc.getText = () => { getTextCalls++; return realGetText(); };

    const provider = new SchemaRefProvider(fakeCache());
    const pos = posAt(text.indexOf('#/$defs/address') + 2);

    provider.provideHover(doc, pos);
    const afterFirst = getTextCalls;
    getTextCalls = 0;
    provider.provideDefinition(doc, pos);
    const afterSecond = getTextCalls;

    assert.ok(afterFirst >= 1, 'sanity: getText() should be read at least once on the first call');
    assert.ok(
      afterSecond < afterFirst,
      `a second call on the same unchanged document version must read getText() fewer times than the first ` +
      `(first call read it ${afterFirst}x, second read it ${afterSecond}x) — the parsed AST/value-tree must be reused`
    );
  });

  test('does not return a stale result after the document changes version', () => {
    const provider = new SchemaRefProvider(fakeCache());
    const textV1 = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', $defs: { a: { type: 'string' } }, use: { $ref: '#/$defs/a' } });
    const doc: any = makeDoc(textV1, 'json', '/ws/schema.json', 1);
    const posV1 = posAt(textV1.indexOf('#/$defs/a') + 2);
    const loc1 = provider.provideDefinition(doc, posV1);
    assert.ok(loc1, 'expected the v1 pointer to resolve');

    // Same uri, new version, no $ref anywhere — if the cache incorrectly kept
    // serving v1's parsed AST, this offset would still resolve against it.
    const textV2 = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', note: 'no ref in this version' });
    doc.getText = () => textV2;
    doc.version = 2;
    const stale = provider.provideDefinition(doc, posV1);
    assert.strictEqual(stale, undefined, 'a v1-only $ref offset must not resolve once the document has moved to v2');
  });
});

// ── Inline bindings in data files (F13-FR-11..13) ─────────────────────────────

suite('[F13-FR-11] inline binding — which positions trigger', () => {
  let dir: string;
  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jspreview-inline-'));
    fs.writeFileSync(path.join(dir, 'person.json'),
      JSON.stringify({ title: 'Person', type: 'object', $defs: { name: { type: 'string' } } }, null, 2), 'utf-8');
  });
  teardown(() => fs.rmSync(dir, { recursive: true, force: true }));

  const cases: Array<[string, string, string]> = [
    ['json', 'data.json', '{\n  "$schema": "./person.json",\n  "name": "Ada"\n}'],
    ['jsonc', 'data.jsonc', '// data\n{ "$schema": "./person.json", "name": "Ada" }'],
    ['yaml', 'data.yaml', '# yaml-language-server: $schema=./person.json\nname: Ada\n'],
    ['yaml', 'key.yaml', 'name: Ada\n$schema: "./person.json"\n'],
    ['toml', 'data.toml', 'name = "Ada"\n"$schema" = "./person.json"\n[extra]\nx = 1\n'],
  ];
  for (const [languageId, file, text] of cases) {
    test(`${languageId} (${file}): Go to Definition on the value opens the bound schema`, () => {
      const provider = new SchemaRefProvider(fakeCache());
      const doc = makeDoc(text, languageId, path.join(dir, file));
      const loc = provider.provideDefinition(doc, posAt(text.indexOf('./person.json') + 3));
      assert.ok(loc, 'expected a Location');
      assert.strictEqual(loc.uri.fsPath, path.join(dir, 'person.json'));
      assert.strictEqual(loc.range.startLine, 0);
    });
  }

  test('positions outside the binding value do not trigger', () => {
    const text = '{\n  "$schema": "./person.json",\n  "name": "Ada"\n}';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', path.join(dir, 'data.json'));
    assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf('"name"') + 2)), undefined);
    assert.strictEqual(provider.provideHover(doc, posAt(text.indexOf('Ada'))), undefined);
  });

  test('a TOML binding-like line inside a multi-line string does not trigger', () => {
    const text = 'doc = """\n"$schema" = "./person.json"\n"""\n';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'toml', path.join(dir, 'data.toml'));
    assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf('./person.json') + 3)), undefined);
  });

  test('JSONL is not handled', () => {
    const text = '{"$schema": "./person.json"}';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'jsonl', path.join(dir, 'data.jsonl'));
    assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf('./person.json') + 3)), undefined);
  });

  test("a schema's own meta-schema $schema does not trigger", () => {
    const text = JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' }, null, 2);
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text);
    assert.strictEqual(provider.provideHover(doc, posAt(text.indexOf('json-schema.org') + 3)), undefined);
  });

  // Regression guard for the design reviewed in PR #274: a directive naming the
  // meta-schema marks a YAML *schema* file, whose $refs must keep navigating.
  test('a YAML schema with a meta-schema directive keeps $ref navigation', () => {
    const text = '# yaml-language-server: $schema=https://json-schema.org/draft/2020-12/schema\n'
      + 'type: object\n$defs:\n  name:\n    type: string\nproperties:\n  n:\n    $ref: "#/$defs/name"\n';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'yaml', path.join(dir, 'person.schema.yaml'));
    const loc = provider.provideDefinition(doc, posAt(text.indexOf('#/$defs/name') + 3));
    assert.ok(loc, 'expected the $ref to resolve');
    assert.strictEqual(loc.uri, doc.uri);
  });

  test('the binding is re-located after the document changes', () => {
    const provider = new SchemaRefProvider(fakeCache());
    const v1 = '{"$schema": "./person.json"}';
    const doc: any = makeDoc(v1, 'json', path.join(dir, 'data.json'), 1);
    const pos = posAt(v1.indexOf('./person.json') + 3);
    assert.ok(provider.provideDefinition(doc, pos));
    doc.getText = () => '{"name": "no binding any more"}';
    doc.version = 2;
    assert.strictEqual(provider.provideDefinition(doc, pos), undefined);
  });
});

suite('[F13-FR-12] inline binding — Go to Definition targets', () => {
  let dir: string;
  setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jspreview-inline-')); });
  teardown(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('a relative path resolves against the workspace folder, as validation does', () => {
    fs.mkdirSync(path.join(dir, 'schemas'));
    fs.writeFileSync(path.join(dir, 'schemas', 's.json'), '{"type":"object"}', 'utf-8');
    fs.mkdirSync(path.join(dir, 'data'));
    vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: dir } });
    const text = '{"$schema": "./schemas/s.json"}';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', path.join(dir, 'data', 'a.json'));
    const loc = provider.provideDefinition(doc, posAt(text.indexOf('./schemas') + 3));
    assert.ok(loc);
    assert.strictEqual(loc.uri.fsPath, path.join(dir, 'schemas', 's.json'));
  });

  test('a fragment places the cursor on the pointer target', () => {
    fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({ $defs: { item: { type: 'string' } } }, null, 2), 'utf-8');
    const text = '{"$schema": "./s.json#/$defs/item"}';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', path.join(dir, 'a.json'));
    const loc = provider.provideDefinition(doc, posAt(text.indexOf('./s.json') + 3));
    assert.ok(loc);
    assert.ok(loc.range.startLine > 0, 'expected the item definition, not the top of the file');
  });

  test('a schema that does not parse still opens at its top', () => {
    fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json', 'utf-8');
    const text = '{"$schema": "./broken.json"}';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', path.join(dir, 'a.json'));
    const loc = provider.provideDefinition(doc, posAt(text.indexOf('./broken') + 3));
    assert.ok(loc);
    assert.strictEqual(loc.uri.fsPath, path.join(dir, 'broken.json'));
  });

  test('a missing local schema yields nothing', () => {
    const text = '{"$schema": "./nope.json"}';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', path.join(dir, 'a.json'));
    assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf('./nope') + 3)), undefined);
  });

  test('a fragment-only binding yields nothing', () => {
    const text = '{"$schema": "#/x"}';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', path.join(dir, 'a.json'));
    assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf('#/x') + 1)), undefined);
  });

  test('a remote binding opens the actual cached file, keyed by the full value', () => {
    const url = 'https://example.com/s.yaml#/defs/item';
    const provider = new SchemaRefProvider(fakeCache({ [url]: 'defs:\n  item:\n    type: string\n' }));
    const text = JSON.stringify({ $schema: url });
    const doc = makeDoc(text, 'json', path.join(dir, 'a.json'));
    const loc = provider.provideDefinition(doc, posAt(text.indexOf('example.com')));
    assert.ok(loc, 'expected the cached YAML schema to be parsed by its original URL');
    assert.strictEqual(loc.uri.fsPath, cachedPathFor(url));
  });

  test('a cached copy keyed by the URL without its fragment is also found', () => {
    const docUrl = 'https://example.com/s.json';
    const provider = new SchemaRefProvider(fakeCache({ [docUrl]: '{"$defs":{"item":{}}}' }));
    const text = JSON.stringify({ $schema: `${docUrl}#/$defs/item` });
    const doc = makeDoc(text, 'json', path.join(dir, 'a.json'));
    const loc = provider.provideDefinition(doc, posAt(text.indexOf('example.com')));
    assert.ok(loc);
    assert.strictEqual(loc.uri.fsPath, cachedPathFor(docUrl));
  });

  test('an uncached remote binding offers to cache the full value, fetching only when picked', async () => {
    const url = 'https://example.com/s.json#/x';
    vscode.window.showInformationMessage.resolves('Cache Schema Locally');
    const provider = new SchemaRefProvider(fakeCache());
    const text = JSON.stringify({ $schema: url });
    const doc = makeDoc(text, 'json', path.join(dir, 'a.json'));
    assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf('example.com'))), undefined);
    assert.ok(vscode.window.showInformationMessage.calledOnce);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(vscode.commands.executeCommand.calledWith('jsonschema.cacheSchemaLocally', url, doc.uri));
  });

  test('declining the offer runs nothing', async () => {
    vscode.window.showInformationMessage.resolves(undefined);
    const provider = new SchemaRefProvider(fakeCache());
    const text = JSON.stringify({ $schema: 'https://example.com/s.json' });
    const doc = makeDoc(text, 'json', path.join(dir, 'a.json'));
    provider.provideDefinition(doc, posAt(text.indexOf('example.com')));
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(!vscode.commands.executeCommand.called);
  });
});

suite('[F13-FR-13] inline binding — hover', () => {
  let dir: string;
  setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jspreview-inline-')); });
  teardown(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('shows the schema summary under a $schema heading, the value shown verbatim', () => {
    fs.writeFileSync(path.join(dir, 'person.schema.json'),
      JSON.stringify({ title: 'Person', description: 'A *person*', type: 'object' }), 'utf-8');
    const text = 'name: Ada\n$schema: ./person.schema.json\n';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'yaml', path.join(dir, 'a.yaml'));
    const hover = provider.provideHover(doc, posAt(text.indexOf('./person') + 3));
    assert.ok(hover);
    const md: string = hover.contents[0].value;
    assert.ok(md.startsWith('**$schema** `./person.schema.json`'), md);
    assert.match(md, /Person/);
    assert.match(md, /A \\\*person\\\*/, 'description is still escaped (F13-FR-09)');
  });

  test('an uncached remote binding shows guidance without prompting', () => {
    const url = 'https://example.com/s.json';
    const provider = new SchemaRefProvider(fakeCache());
    const text = `"$schema" = "${url}"\n`;
    const doc = makeDoc(text, 'toml', path.join(dir, 'a.toml'));
    const hover = provider.provideHover(doc, posAt(text.indexOf('example.com')));
    assert.ok(hover);
    assert.match(hover.contents[0].value, /^\*\*\$schema\*\* `https:\/\/example\.com\/s\.json`/);
    assert.match(hover.contents[0].value, /not cached/);
    assert.ok(!vscode.window.showInformationMessage.called, 'hover must never prompt');
  });

  test('a cached remote binding shows the cached summary', () => {
    const url = 'https://example.com/s.json';
    const provider = new SchemaRefProvider(fakeCache({ [url]: '{"title":"Remote"}' }));
    const text = JSON.stringify({ $schema: url });
    const doc = makeDoc(text, 'json', path.join(dir, 'a.json'));
    const hover = provider.provideHover(doc, posAt(text.indexOf('example.com')));
    assert.match(hover.contents[0].value, /Remote/);
  });

  test('a target that does not parse says so', () => {
    fs.writeFileSync(path.join(dir, 'broken.yaml'), 'a: [unclosed\n', 'utf-8');
    const text = '{"$schema": "./broken.yaml"}';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', path.join(dir, 'a.json'));
    const hover = provider.provideHover(doc, posAt(text.indexOf('./broken') + 3));
    assert.match(hover.contents[0].value, /could not be parsed/);
  });

  test('an unresolvable fragment names the pointer verbatim', () => {
    fs.writeFileSync(path.join(dir, 's.json'), '{"type":"object"}', 'utf-8');
    const text = '{"$schema": "./s.json#/$defs/missing_one"}';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', path.join(dir, 'a.json'));
    const hover = provider.provideHover(doc, posAt(text.indexOf('./s.json') + 3));
    assert.match(hover.contents[0].value, /Pointer `#\/\$defs\/missing_one` does not resolve/);
  });

  test('a missing local schema shows no hover', () => {
    const text = '{"$schema": "./nope.json"}';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', path.join(dir, 'a.json'));
    assert.strictEqual(provider.provideHover(doc, posAt(text.indexOf('./nope') + 3)), undefined);
  });
});

suite('positionAt()', () => {
  test('maps offsets to line/character across newlines', () => {
    const text = 'a\nbb\nccc';
    assert.deepStrictEqual({ ...positionAt(text, 0) }, { line: 0, character: 0 });
    assert.deepStrictEqual({ ...positionAt(text, 2) }, { line: 1, character: 0 });
    assert.deepStrictEqual({ ...positionAt(text, 5) }, { line: 2, character: 0 });
  });
  test('clamps an out-of-range offset', () => {
    const p = positionAt('abc', 999);
    assert.strictEqual(p.line, 0);
    assert.strictEqual(p.character, 3);
  });
});

/** Reverse of positionAt for assertions: line/char → absolute offset. */
function offsetOf(text: string, line: number, char: number): number {
  const lines = text.split('\n');
  let off = 0;
  for (let i = 0; i < line; i++) { off += lines[i].length + 1; }
  return off + char;
}
