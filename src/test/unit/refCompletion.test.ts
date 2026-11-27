import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from '../mocks/vscode';

const {
  refCompletionContext, referenceTargets, refCandidates, escapePointerToken,
} = require('../../refCompletion');
const { SchemaRefCompletionProvider, toRelativeRef } = require('../../SchemaRefCompletionProvider');

const META = 'https://json-schema.org/draft/2020-12/schema';

/** Offset just after the first occurrence of `marker` in `text`. */
const after = (text: string, marker: string) => text.indexOf(marker) + marker.length;

function makeDoc(text: string, fsPath: string, languageId = 'json') {
  const positionAt = (offset: number) => {
    const lines = text.slice(0, offset).split('\n');
    return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
  };
  return {
    languageId,
    uri: { fsPath, scheme: 'file', toString: () => `file://${fsPath}` },
    getText: () => text,
    version: 1,
    offsetAt: (pos: { [k: string]: number }) => pos.__offset,
    positionAt,
  };
}

suite('[F13-FR-14] referenceTargets — the document\'s own targets', () => {
  test('lists $defs and definitions entries at any depth, then anchors', () => {
    const root = {
      $defs: { Address: { $anchor: 'addr', type: 'object' }, 'a/b~c': {} },
      definitions: { Legacy: {} },
      properties: { inner: { $defs: { Nested: {} } } },
    };
    assert.deepStrictEqual(referenceTargets(root), [
      '#/$defs/Address',
      '#/$defs/a~1b~0c',
      '#/definitions/Legacy',
      '#/properties/inner/$defs/Nested',
      '#addr',
    ]);
  });

  test('does not search instance data (enum, const, default, examples)', () => {
    const root = {
      enum: [{ $defs: { NotASchema: {} } }],
      const: { $anchor: 'nope' },
      default: { definitions: { X: {} } },
      examples: [{ $defs: { Y: {} } }],
      items: [{ $defs: { InTuple: {} } }],
    };
    assert.deepStrictEqual(referenceTargets(root), ['#/items/0/$defs/InTuple']);
  });

  test('treats keys under properties and other name maps as names, not keywords', () => {
    const root = {
      properties: {
        enum: { $defs: { UnderEnumProperty: {} } },
        $defs: { $anchor: 'propNamedDefs' },
      },
      $defs: { default: { $defs: { UnderDefaultDef: {} } } },
    };
    assert.deepStrictEqual(referenceTargets(root), [
      '#/$defs/default',
      '#/properties/enum/$defs/UnderEnumProperty',
      '#/$defs/default/$defs/UnderDefaultDef',
      '#propNamedDefs',
    ]);
  });

  test('escapes pointer tokens per RFC 6901', () => {
    assert.strictEqual(escapePointerToken('a~/b'), 'a~0~1b');
  });

  test('is empty for a non-object root', () => {
    assert.deepStrictEqual(referenceTargets(undefined), []);
    assert.deepStrictEqual(referenceTargets('x'), []);
  });
});

suite('[F13-FR-16] refCompletionContext — the value being typed', () => {
  test('finds a closed JSON string and reports its full content range', () => {
    const text = '{ "$ref": "#/$defs/Ad" }';
    const ctx = refCompletionContext(text, 'json', after(text, '#/$d'));
    assert.strictEqual(ctx.prefix, '#/$d');
    assert.strictEqual(text.slice(ctx.contentStart, ctx.contentEnd), '#/$defs/Ad');
  });

  test('handles an unterminated JSON string still being typed', () => {
    const text = '{ "$ref": "#/$de';
    const ctx = refCompletionContext(text, 'json', text.length);
    assert.ok(ctx);
    assert.strictEqual(ctx.prefix, '#/$de');
  });

  test('works on a quoted YAML value', () => {
    const text = "$defs:\n  A: {}\nitems:\n  $ref: '#/'\n";
    const ctx = refCompletionContext(text, 'yaml', after(text, "'#/"));
    assert.strictEqual(ctx.prefix, '#/');
    assert.strictEqual(text.slice(ctx.contentStart, ctx.contentEnd), '#/');
  });

  test('is undefined on the key, outside the quotes, or in another string', () => {
    const text = '{ "$ref": "#/x", "title": "#/y" }';
    assert.strictEqual(refCompletionContext(text, 'json', 4), undefined);
    assert.strictEqual(refCompletionContext(text, 'json', text.indexOf('"#/x"')), undefined);
    assert.strictEqual(refCompletionContext(text, 'json', after(text, '"#/y')), undefined);
  });
});

suite('[F13-FR-15] refCandidates — local targets, files, and pointers inside files', () => {
  const local = { $defs: { A: {} } };
  const files = ['./common.schema.json', '../shared/id.schema.yaml'];
  const load = (rel: string) => (rel === './common.schema.json' ? { $defs: { Id: {} } } : undefined);

  test('before a "#", offers local targets then files', () => {
    assert.deepStrictEqual(refCandidates('', local, files, load), [
      { value: '#/$defs/A', kind: 'target' },
      { value: './common.schema.json', kind: 'file' },
      { value: '../shared/id.schema.yaml', kind: 'file' },
    ]);
  });

  test('after "#", offers only local targets', () => {
    assert.deepStrictEqual(refCandidates('#/', local, files, load).map((c: { value: string }) => c.value), ['#/$defs/A']);
  });

  test('after "<file>#", offers that file\'s targets with the path', () => {
    assert.deepStrictEqual(
      refCandidates('./common.schema.json#/', local, files, load).map((c: { value: string }) => c.value),
      ['./common.schema.json#/$defs/Id'],
    );
  });

  test('offers nothing for an unreadable file or a remote URL', () => {
    assert.deepStrictEqual(refCandidates('./missing.json#', local, files, load), []);
    assert.deepStrictEqual(refCandidates('https://example.com/s.json#/', local, files, load), []);
    assert.deepStrictEqual(refCandidates('https://exa', local, files, load), []);
  });
});

suite('[F13-FR-14][F13-FR-15][F13-FR-16] SchemaRefCompletionProvider', () => {
  let tmp: string;
  setup(() => {
    vscode.resetAll();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'refc-'));
    fs.mkdirSync(path.join(tmp, 'shared'));
    fs.writeFileSync(path.join(tmp, 'common.schema.json'), JSON.stringify({ $schema: META, $defs: { Id: {} } }));
    fs.writeFileSync(path.join(tmp, 'shared', 'name.schema.yaml'), `$schema: ${META}\n$defs:\n  Name: {}\n`);
    fs.writeFileSync(path.join(tmp, 'data.json'), '{"not":"a schema"}');
    vscode.workspace.findFiles.resolves(
      ['common.schema.json', 'shared/name.schema.yaml', 'data.json', 'main.schema.json']
        .map(f => ({ fsPath: path.join(tmp, f) })),
    );
  });
  teardown(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const mainText = (ref: string) => JSON.stringify({ $schema: META, $defs: { Address: {} }, properties: { a: { $ref: ref } } }, null, 2);

  test('registers for JSON and YAML with #, / and quote triggers', () => {
    SchemaRefCompletionProvider.register();
    const args = vscode.languages.registerCompletionItemProvider.firstCall.args;
    assert.deepStrictEqual(args.slice(2).sort(), ['"', '#', "'", '/'].sort());
  });

  test('offers local targets and other schema files, replacing the whole value', async () => {
    const text = mainText('./c');
    const doc = makeDoc(text, path.join(tmp, 'main.schema.json'));
    const items = await new SchemaRefCompletionProvider().provideCompletionItems(doc, { __offset: after(text, '"./') });
    assert.deepStrictEqual(items.map((i: { label: string }) => i.label), [
      '#/$defs/Address', './common.schema.json', './shared/name.schema.yaml',
    ]);
    assert.strictEqual(items[0].kind, vscode.CompletionItemKind.Reference);
    assert.strictEqual(items[1].kind, vscode.CompletionItemKind.File);
    const valueStart = text.indexOf('./c');
    assert.deepStrictEqual(items[0].range.start, doc.positionAt(valueStart));
    assert.deepStrictEqual(items[0].range.end, doc.positionAt(valueStart + 3));
    assert.strictEqual(items[1].filterText, './common.schema.json');
  });

  test('offers the targets inside a referenced file after "#"', async () => {
    const text = mainText('./shared/name.schema.yaml#/');
    const doc = makeDoc(text, path.join(tmp, 'main.schema.json'));
    const items = await new SchemaRefCompletionProvider().provideCompletionItems(doc, { __offset: after(text, 'yaml#/') });
    assert.deepStrictEqual(items.map((i: { label: string }) => i.label), ['./shared/name.schema.yaml#/$defs/Name']);
    assert.strictEqual(vscode.workspace.findFiles.callCount, 0, 'no workspace scan once a file is chosen');
  });

  test('reuses the workspace scan between keystrokes', async () => {
    let now = 0;
    const provider = new SchemaRefCompletionProvider(() => now);
    const text = mainText('');
    const doc = makeDoc(text, path.join(tmp, 'main.schema.json'));
    const pos = { __offset: after(text, '"$ref": "') };
    await provider.provideCompletionItems(doc, pos);
    await provider.provideCompletionItems(doc, pos);
    assert.strictEqual(vscode.workspace.findFiles.callCount, 1);
    now = 60_000;
    await provider.provideCompletionItems(doc, pos);
    assert.strictEqual(vscode.workspace.findFiles.callCount, 2);
  });

  test('does nothing outside a $ref value or in a data file', async () => {
    const text = mainText('#/');
    const doc = makeDoc(text, path.join(tmp, 'main.schema.json'));
    assert.strictEqual(await new SchemaRefCompletionProvider().provideCompletionItems(doc, { __offset: 2 }), undefined);
    const data = '{ "$ref": "#/" }';
    const dataDoc = makeDoc(data, path.join(tmp, 'data.json'));
    assert.strictEqual(await new SchemaRefCompletionProvider().provideCompletionItems(dataDoc, { __offset: after(data, '#/') }), undefined);
  });

  test('builds relative references with forward slashes', () => {
    assert.strictEqual(toRelativeRef('/ws/a', '/ws/a/b.json'), './b.json');
    assert.strictEqual(toRelativeRef('/ws/a', '/ws/c/d.json'), '../c/d.json');
  });

  test('skips a file with no relative path to it (another Windows drive)', () => {
    assert.strictEqual(toRelativeRef('C:\\ws\\a', 'D:\\x\\b.json', path.win32), undefined);
    assert.strictEqual(toRelativeRef('C:\\ws\\a', 'C:\\ws\\c\\d.json', path.win32), '../c/d.json');
  });

  test('skips the schema check and parse when the line has no $ref', async () => {
    const text = `{ "$schema": "${META}", "title": "x" }`;
    const doc = makeDoc(text, path.join(tmp, 'main.schema.json'));
    let reads = 0;
    const counted = { ...doc, getText: () => { reads++; return text; } };
    assert.strictEqual(await new SchemaRefCompletionProvider().provideCompletionItems(counted, { __offset: after(text, '"title": "') }), undefined);
    assert.strictEqual(reads, 1, 'only the guard read the text; no schema detection or parse');
  });
});
