import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from '../mocks/vscode';

const { SchemaRefProvider, positionAt } = require('../../SchemaRefProvider');

/** Build a document double with the offset/position plumbing the provider needs. */
function makeDoc(text: string, languageId = 'json', fsPath = '/ws/schema.json') {
  return {
    languageId,
    uri: { fsPath, scheme: 'file' },
    getText: () => text,
    offsetAt: (pos: any) => pos.__offset ?? 0,
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
    { $schema: 'x', $defs: { address: { type: 'object' } }, use: { $ref: '#/$defs/address' } },
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
    const bad = JSON.stringify({ $schema: 'x', use: { $ref: '#/$defs/missing' } }, null, 2);
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
    const text = JSON.stringify({ $schema: 'x', use: { $ref: './common.json#/$defs/id' } }, null, 2);

    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', mainPath);
    const loc = provider.provideDefinition(doc, posAt(text.indexOf('./common.json') + 3));
    assert.ok(loc);
    assert.strictEqual(loc.uri.fsPath, commonPath);
  });

  test('returns undefined when the relative file is missing', () => {
    const text = JSON.stringify({ $schema: 'x', use: { $ref: './nope.json#/$defs/id' } }, null, 2);
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text, 'json', '/ws/main.json');
    assert.strictEqual(provider.provideDefinition(doc, posAt(text.indexOf('./nope.json') + 3)), undefined);
  });
});

suite('[F13-FR-06] provideDefinition() — remote ref', () => {
  test('uses the cached copy when present', () => {
    const url = 'https://example.com/s.json';
    const cached = JSON.stringify({ $defs: { id: { type: 'string' } } }, null, 2);
    const text = JSON.stringify({ $schema: 'x', use: { $ref: `${url}#/$defs/id` } }, null, 2);
    const provider = new SchemaRefProvider(fakeCache({ [url]: cached }));
    const doc = makeDoc(text);
    const loc = provider.provideDefinition(doc, posAt(text.indexOf(url) + 5));
    assert.ok(loc);
  });

  test('[F13-FR-06] offers to cache when the remote ref is uncached', () => {
    vscode.window.showInformationMessage.resolves(undefined);
    const url = 'https://example.com/s.json';
    const text = JSON.stringify({ $schema: 'x', use: { $ref: `${url}#/$defs/id` } }, null, 2);
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(text);
    const loc = provider.provideDefinition(doc, posAt(text.indexOf(url) + 5));
    assert.strictEqual(loc, undefined);
    assert.ok(vscode.window.showInformationMessage.called);
  });
});

suite('[F13-FR-08] provideHover()', () => {
  const text = JSON.stringify(
    { $schema: 'x', $defs: { address: { title: 'Address', type: 'object', properties: { city: {} } } }, use: { $ref: '#/$defs/address' } },
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
    const t = JSON.stringify({ $schema: 'x', use: { $ref: `${url}#/x` } }, null, 2);
    const provider = new SchemaRefProvider(fakeCache());
    const doc = makeDoc(t);
    const hover = provider.provideHover(doc, posAt(t.indexOf(url) + 5));
    assert.ok(hover);
    assert.match(hover.contents[0].value, /not cached/i);
  });

  test('[F13-FR-07] a hover on an unresolvable pointer explains it', () => {
    const t = JSON.stringify({ $schema: 'x', use: { $ref: '#/$defs/missing' } }, null, 2);
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
