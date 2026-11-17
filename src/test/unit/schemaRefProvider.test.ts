import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
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

function fakeCache(map: Record<string, string> = {}) {
  return {
    readCached: (url: string) => (url in map ? map[url] : undefined),
    getCachedPath: (url: string) => (url in map ? '/cache/schema.json' : undefined),
  } as any;
}

setup(() => vscode.resetAll());

suite('[F13-FR-01] SchemaRefProvider.register()', () => {
  test('registers a definition and a hover provider', () => {
    const disposables = SchemaRefProvider.register(fakeCache());
    assert.strictEqual(disposables.length, 2);
    assert.ok(vscode.languages.registerDefinitionProvider.called);
    assert.ok(vscode.languages.registerHoverProvider.called);
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
    assert.strictEqual(loc.uri.fsPath, '/cache/schema.json');
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

suite('Inline schema navigation [F13-FR-11] [F13-FR-12] [F13-FR-13]', () => {
  let dir: string;
  setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jspreview-inline-nav-')); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const forms = [
    { lang: 'json', text: '{"$schema":"./person.json", "name":"Ada"}' },
    { lang: 'jsonc', text: '{/* ./person.json */ "$schema":"./person.json", "name":"Ada"}' },
    { lang: 'yaml', text: '$schema: ./person.json\nname: Ada\n' },
    { lang: 'yml', text: '# yaml-language-server: $schema=./person.json\nname: Ada\n' },
    { lang: 'toml', text: '"$schema" = "./person.json"\nname = "Ada"\n' },
  ];
  for (const { lang, text } of forms) {
    test(`navigates and shows the local schema summary from ${lang}`, () => {
      const schemaPath = path.join(dir, 'person.json');
      fs.writeFileSync(schemaPath, JSON.stringify({ title: 'Person', description: 'A person', type: 'object' }));
      const provider = new SchemaRefProvider(fakeCache());
      const doc = makeDoc(text, lang, path.join(dir, `data.${lang}`));
      const position = posAt(text.lastIndexOf('./person.json') + 3);
      assert.strictEqual(provider.provideDefinition(doc, position)?.uri.fsPath, schemaPath);
      const md = provider.provideHover(doc, position)?.contents[0].value;
      assert.match(md, /\*\*\$schema\*\*/);
      assert.match(md, /Person/);
      assert.match(md, /A person/);
      assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf('$schema'))), undefined);
      assert.strictEqual(provider.provideHover(doc, posAt(text.indexOf('Ada'))), undefined);
    });
  }

  test('supports quoted YAML paths, spaces and JSONC trailing commas', () => {
    fs.writeFileSync(path.join(dir, 'person schema.json'), '{"title":"Person"}');
    for (const [lang, text] of [
      ['yaml', '$schema: "./person schema.json"'],
      ['yaml', '$schema: ./person schema.json'],
      ['jsonc', '{"$schema":"./person schema.json",}'],
    ]) {
      const provider = new SchemaRefProvider(fakeCache());
      const doc = makeDoc(text, lang, path.join(dir, 'data'));
      const position = posAt(text.indexOf('./person') + 4);
      assert.strictEqual(provider.provideDefinition(doc, position)?.uri.fsPath, path.join(dir, 'person schema.json'));
      assert.match(provider.provideHover(doc, position)?.contents[0].value, /Person/);
    }
  });

  test('honors a YAML directive over a meta-schema key', () => {
    fs.writeFileSync(path.join(dir, 'person.json'), '{"title":"Person"}');
    const text = '# yaml-language-server: $schema=./person.json\n$schema: https://json-schema.org/draft/2020-12/schema';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'yaml', path.join(dir, 'data.yaml'));
    const position = posAt(text.indexOf('./person') + 4);
    assert.ok(provider.provideDefinition(doc, position));
    assert.match(provider.provideHover(doc, position)?.contents[0].value, /Person/);
  });

  test('recognizes cache entries saved under either the document URL or full reference', () => {
    const url = 'https://example.com/person.json';
    const ref = `${url}#/$defs/person`;
    for (const cacheKey of [url, ref]) {
      const text = JSON.stringify({ $schema: ref });
      const provider = new SchemaRefProvider(fakeCache({ [cacheKey]: '{"$defs":{"person":{"title":"Person"}}}' }));
      const doc = makeDoc(text);
      const position = posAt(text.indexOf(url) + 5);
      assert.strictEqual(provider.provideDefinition(doc, position)?.uri.fsPath, '/cache/schema.json');
      assert.match(provider.provideHover(doc, position)?.contents[0].value, /Person/);
      assert.ok(vscode.window.showInformationMessage.notCalled);
    }
  });

  test('does not re-read an unchanged inline document on ordinary field hovers', () => {
    const doc = makeDoc('{"$schema":"./person.json", "name":"Ada"}');
    const getText = sinon.spy(doc, 'getText');
    const provider = new SchemaRefProvider(fakeCache());
    provider.provideHover(doc, posAt(40));
    getText.resetHistory();
    provider.provideHover(doc, posAt(40));
    assert.ok(getText.notCalled);
    doc.version++;
    provider.provideHover(doc, posAt(40));
    assert.ok(getText.called);
  });

  test('reopening the same URI at version one does not reuse its old binding or AST', () => {
    fs.writeFileSync(path.join(dir, 'old.json'), '{"title":"Old"}');
    fs.writeFileSync(path.join(dir, 'new.json'), '{"title":"New"}');
    const provider = new SchemaRefProvider(fakeCache());
    for (const file of ['old', 'new']) {
      const text = JSON.stringify({ $schema: `./${file}.json` });
      const doc = makeDoc(text, 'json', path.join(dir, 'data.json'), 1);
      assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf('./') + 2))?.uri.fsPath,
        path.join(dir, `${file}.json`));
    }
    for (const title of ['Old', 'New']) {
      const text = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#',
        $defs: { person: { title } }, use: { $ref: '#/$defs/person' } });
      const doc = makeDoc(text, 'json', path.join(dir, 'schema.json'), 1);
      assert.match(provider.provideHover(doc, posAt(text.indexOf('#/$defs') + 3))?.contents[0].value,
        new RegExp(title));
    }
  });

  test('honors schemaDetection changes without editing an open document', () => {
    const text = JSON.stringify({ type: 'object', properties: {}, $defs: { person: { title: 'Person' } },
      use: { $ref: '#/$defs/person' } });
    const doc = makeDoc(text, 'json', path.join(dir, 'ordinary.json'));
    const provider = new SchemaRefProvider(fakeCache());
    const position = posAt(text.indexOf('#/$defs') + 2);
    vscode.setConfig('jsonschema', 'schemaDetection', 'auto');
    assert.ok(provider.provideDefinition(doc, position));
    vscode.setConfig('jsonschema', 'schemaDetection', 'strict');
    assert.strictEqual(provider.provideDefinition(doc, position), undefined);
    vscode.setConfig('jsonschema', 'schemaDetection', 'auto');
    assert.ok(provider.provideHover(doc, position));
  });

  test('TOML remains data when its binding points to json-schema.org', () => {
    const url = 'https://json-schema.org/draft/2020-12/schema';
    const text = `"$schema" = "${url}"`;
    const doc = makeDoc(text, 'toml');
    const position = posAt(text.indexOf(url) + 5);
    assert.match(new SchemaRefProvider(fakeCache()).provideHover(doc, position)?.contents[0].value, /not cached/);
    const cached = new SchemaRefProvider(fakeCache({ [url]: '{"title":"Meta schema"}' }));
    assert.strictEqual(cached.provideDefinition(doc, position)?.uri.fsPath, '/cache/schema.json');
    assert.match(cached.provideHover(doc, position)?.contents[0].value, /Meta schema/);
  });

  test('registers TOML along with the existing language selectors', () => {
    SchemaRefProvider.register(fakeCache());
    const selector = vscode.languages.registerDefinitionProvider.firstCall.args[0];
    assert.ok(selector.some((entry: any) => entry.language === 'toml'));
  });

  test('uses the data file workspace folder even when the file is nested', () => {
    fs.writeFileSync(path.join(dir, 'person.json'), '{"title":"Person"}');
    vscode.workspace.getWorkspaceFolder.returns({ uri: { fsPath: dir } });
    const text = '{"$schema":"./person.json"}';
    const doc = makeDoc(text, 'json', path.join(dir, 'nested', 'data.json'));
    const provider = new SchemaRefProvider(fakeCache());
    assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf('./person') + 2))?.uri.fsPath,
      path.join(dir, 'person.json'));
  });

  test('handles absolute paths, file URIs and JSON Pointer fragments', () => {
    const schemaPath = path.join(dir, 'person.json');
    fs.writeFileSync(schemaPath, '{"$defs":{"name":{"title":"Name"}}}');
    for (const ref of [schemaPath, `file://${schemaPath}`]) {
      const text = JSON.stringify({ $schema: `${ref}#/$defs/name` });
      const provider = new SchemaRefProvider(fakeCache());
      const doc = makeDoc(text, 'json');
      const position = posAt(text.indexOf('#/') + 2);
      const loc = provider.provideDefinition(doc, position);
      assert.strictEqual(loc?.uri.fsPath, schemaPath);
      const schemaText = fs.readFileSync(schemaPath, 'utf-8');
      assert.strictEqual(schemaText.slice(
        offsetOf(schemaText, loc.range.startLine, loc.range.startChar),
        offsetOf(schemaText, loc.range.endLine, loc.range.endChar),
      ), '"name"');
      assert.match(provider.provideHover(doc, position)?.contents[0].value, /Name/);
    }
  });

  test('navigates to the actual cached file and parses remote YAML by its original URL', () => {
    const url = 'https://example.com/person.yaml';
    const cachedPath = path.join(dir, 'hash.json');
    const content = 'title: Person\ndescription: A person\ntype: object\n';
    fs.writeFileSync(cachedPath, content);
    const { SchemaCache } = require('../../SchemaCache');
    const cache = new SchemaCache({ globalState: { get: () => [{ originalUrl: url, cachedPath }] } }, {});
    const text = JSON.stringify({ $schema: url });
    const provider = new SchemaRefProvider(cache);
    const doc = makeDoc(text, 'json');
    const position = posAt(text.indexOf(url) + 5);
    assert.strictEqual(provider.provideDefinition(doc, position)?.uri.fsPath, cachedPath);
    assert.match(provider.provideHover(doc, position)?.contents[0].value, /A person/);
  });

  test('[F13-FR-10] never fetches, downloads or prompts during hover, including uncached URLs', () => {
    const fetch = sinon.stub().rejects(new Error('network forbidden'));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetch;
    try {
      for (const cached of [false, true]) {
        const url = 'https://example.com/person.json';
        const cache = fakeCache(cached ? { [url]: '{"title":"Person"}' } : {});
        cache.download = sinon.stub().rejects(new Error('download forbidden'));
        const text = JSON.stringify({ $schema: url });
        const provider = new SchemaRefProvider(cache);
        const hover = provider.provideHover(makeDoc(text), posAt(text.indexOf(url) + 5));
        assert.match(hover?.contents[0].value, cached ? /Person/ : /not cached/);
        assert.ok(cache.download.notCalled);
      }
      assert.ok(fetch.notCalled);
      assert.ok(vscode.window.showInformationMessage.notCalled);
      assert.ok(vscode.commands.executeCommand.notCalled);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('offers caching on definition, but runs the cache command only after acceptance', async () => {
    const url = 'https://example.com/person.json';
    const text = JSON.stringify({ $schema: url });
    const doc = makeDoc(text);
    const provider = new SchemaRefProvider(fakeCache());
    vscode.window.showInformationMessage.resolves(undefined);
    assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf(url) + 5)), undefined);
    await Promise.resolve();
    assert.ok(vscode.commands.executeCommand.notCalled);
    vscode.window.showInformationMessage.resolves('Cache Schema Locally');
    provider.provideDefinition(doc, posAt(text.indexOf(url) + 5));
    await Promise.resolve();
    assert.ok(vscode.commands.executeCommand.calledWith('jsonschema.cacheSchemaLocally', url, doc.uri));
  });

  test('uses the YAML directive in preference to a plain key and ignores other occurrences', () => {
    const text = '# yaml-language-server: $schema=./person.json\n$schema: ./ignored.json\nnote: ./person.json\n';
    fs.writeFileSync(path.join(dir, 'person.json'), '{"title":"Person"}');
    const doc = makeDoc(text, 'yaml', path.join(dir, 'data.yaml'));
    const provider = new SchemaRefProvider(fakeCache());
    assert.ok(provider.provideDefinition(doc, posAt(text.indexOf('./person.json') + 2)));
    assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf('./ignored.json') + 2)), undefined);
    assert.strictEqual(provider.provideHover(doc, posAt(text.lastIndexOf('./person.json') + 2)), undefined);
  });

  test('ignores nested keys, TOML table bindings, comments, malformed data and JSONL', () => {
    const examples = [
      ['json', '{"nested":{"$schema":"./person.json"}}'],
      ['json', '{"$schema": 42, "note":"./person.json"}'],
      ['json', '{"$schema":"./person.json"'],
      ['jsonc', '{/* "$schema":"./person.json" */ "name":"Ada"}'],
      ['toml', '[tool]\n"$schema" = "./person.json"'],
      ['toml', 'description = """\n"$schema" = "./person.json"\n"""'],
      ['yaml', '# $schema: ./person.json\nname: Ada'],
      ['yaml', 'nested:\n  $schema: ./person.json'],
      ['jsonl', '{"$schema":"./person.json"}'],
    ];
    for (const [lang, text] of examples) {
      const provider = new SchemaRefProvider(fakeCache());
      const doc = makeDoc(text, lang);
      const position = posAt(text.indexOf('./person.json') + 2);
      assert.strictEqual(provider.provideDefinition(doc, position), undefined, text);
      assert.strictEqual(provider.provideHover(doc, position), undefined, text);
    }
  });

  test('escapes schema-derived Markdown and tolerates missing or invalid targets', () => {
    const schemaPath = path.join(dir, 'person.json');
    const text = '{"$schema":"./person.json"}';
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', path.join(dir, 'data.json'));
    const position = posAt(text.indexOf('./person.json') + 2);
    assert.strictEqual(provider.provideDefinition(doc, position), undefined);
    fs.writeFileSync(schemaPath, 'not json');
    assert.strictEqual(provider.provideDefinition(doc, position), undefined);
    fs.writeFileSync(schemaPath, JSON.stringify({ title: '<script>', description: '[click](command:bad)' }));
    const md = provider.provideHover(doc, position).contents[0].value;
    assert.ok(md.includes('\\<script\\>'));
    assert.ok(md.includes('\\[click\\]\\(command:bad\\)'));
  });
});
