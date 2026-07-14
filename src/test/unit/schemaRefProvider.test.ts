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

function fakeCache(map: Record<string, string> = {}) {
  return { readCached: (url: string) => (url in map ? map[url] : undefined) } as any;
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
  teardown(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

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
