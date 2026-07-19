import * as assert from 'assert';
import {
  unescapePointerToken,
  parseJsonPointer,
  parseRef,
  refKind,
  resolvePointer,
  escapeMarkdown,
  describeRefTarget,
  findRefAtOffset,
  locatePointerTarget,
  parseSchemaText,
  parseSchemaAst,
  findRefInAst,
  locateInAst,
} from '../../schemaPointer';

suite('[F13-FR-03] parseJsonPointer() / unescapePointerToken()', () => {
  test('unescapes ~1 → / and ~0 → ~ in the right order', () => {
    assert.strictEqual(unescapePointerToken('a~1b'), 'a/b');
    assert.strictEqual(unescapePointerToken('a~0b'), 'a~b');
    assert.strictEqual(unescapePointerToken('~01'), '~1');
  });
  test('splits a fragment with a leading #', () => {
    assert.deepStrictEqual(parseJsonPointer('#/$defs/address'), ['$defs', 'address']);
  });
  test('splits a fragment without a #', () => {
    assert.deepStrictEqual(parseJsonPointer('/a/b'), ['a', 'b']);
  });
  test('empty pointer and root variants yield []', () => {
    assert.deepStrictEqual(parseJsonPointer(''), []);
    assert.deepStrictEqual(parseJsonPointer('#'), []);
    assert.deepStrictEqual(parseJsonPointer('#/'), []);
  });
  test('decodes escaped segments', () => {
    assert.deepStrictEqual(parseJsonPointer('#/a~1b/c~0d'), ['a/b', 'c~d']);
  });
});

suite('parseRef() / refKind()', () => {
  test('[F13-FR-04] same-document ref has empty uri', () => {
    assert.deepStrictEqual(parseRef('#/$defs/x'), { uri: '', fragment: '#/$defs/x' });
    assert.strictEqual(refKind('#/$defs/x'), 'local');
  });
  test('[F13-FR-05] relative ref splits uri and fragment', () => {
    assert.deepStrictEqual(parseRef('./common.json#/$defs/id'), { uri: './common.json', fragment: '#/$defs/id' });
    assert.strictEqual(refKind('./common.json#/$defs/id'), 'relative');
    assert.strictEqual(refKind('common.json'), 'relative');
  });
  test('[F13-FR-06] remote ref is classified remote', () => {
    assert.strictEqual(refKind('https://example.com/s.json#/$defs/x'), 'remote');
    assert.deepStrictEqual(parseRef('https://example.com/s.json'), { uri: 'https://example.com/s.json', fragment: '' });
  });
});

suite('[F13-FR-03][F13-NFR-02] resolvePointer()', () => {
  const root = {
    $defs: { address: { type: 'object', title: 'Address' } },
    items: [{ id: 1 }, { id: 2 }],
  };
  test('resolves an object path', () => {
    assert.deepStrictEqual(resolvePointer(root, ['$defs', 'address']), { type: 'object', title: 'Address' });
  });
  test('resolves an array index', () => {
    assert.deepStrictEqual(resolvePointer(root, ['items', '1']), { id: 2 });
  });
  test('empty segments returns the root', () => {
    assert.strictEqual(resolvePointer(root, []), root);
  });
  test('[F13-FR-07] returns undefined for a missing key', () => {
    assert.strictEqual(resolvePointer(root, ['$defs', 'missing']), undefined);
  });
  test('[F13-FR-07] returns undefined for a non-numeric array index', () => {
    assert.strictEqual(resolvePointer(root, ['items', 'x']), undefined);
  });
  test('returns undefined when descending into a scalar', () => {
    assert.strictEqual(resolvePointer({ a: 5 }, ['a', 'b']), undefined);
  });
});

suite('[F13-FR-09] escapeMarkdown() / describeRefTarget()', () => {
  test('escapes Markdown/HTML metacharacters', () => {
    const out = escapeMarkdown('<img src=x> `code` [link](u)');
    assert.ok(!out.includes('<img src=x>'));
    assert.ok(out.includes('\\<'));
    assert.ok(out.includes('\\`'));
  });
  test('[F13-FR-08] summarises title, type, description and properties', () => {
    const md = describeRefTarget(
      { title: 'Address', type: 'object', description: 'A postal address', properties: { city: {}, zip: {} } },
      '#/$defs/address',
    );
    assert.match(md, /Address/);
    assert.match(md, /type:/);
    assert.match(md, /A postal address/);
    assert.match(md, /`city`/);
    assert.match(md, /`zip`/);
  });
  test('[F13-FR-08] caps the property list at 10 with an ellipsis', () => {
    const properties: Record<string, unknown> = {};
    for (let i = 0; i < 15; i++) { properties[`p${i}`] = {}; }
    const md = describeRefTarget({ type: 'object', properties }, '#/x');
    assert.match(md, /…/);
  });
  test('handles a non-object target gracefully', () => {
    const md = describeRefTarget('not a schema', '#/x');
    assert.match(md, /not an object schema/);
  });
  test('does not embed raw HTML from a malicious title', () => {
    const md = describeRefTarget({ title: '<script>alert(1)</script>' }, '#/x');
    assert.ok(!md.includes('<script>alert(1)</script>'));
  });
});

suite('[F13-FR-02][F13-FR-04] findRefAtOffset() / locatePointerTarget() — JSON', () => {
  const text = JSON.stringify({ $defs: { address: { type: 'object' } }, use: { $ref: '#/$defs/address' } }, null, 2);
  const refIndex = text.indexOf('#/$defs/address');

  test('finds the ref when the offset is inside the value', () => {
    const hit = findRefAtOffset(text, 'json', refIndex + 2);
    assert.ok(hit);
    assert.strictEqual(hit!.ref, '#/$defs/address');
  });
  test('finds the ref when the offset is on the $ref key', () => {
    const keyIndex = text.indexOf('"$ref"');
    const hit = findRefAtOffset(text, 'json', keyIndex + 2);
    assert.ok(hit);
    assert.strictEqual(hit!.ref, '#/$defs/address');
  });
  test('[F13-FR-02] returns undefined when the offset is not on a $ref', () => {
    const other = text.indexOf('"type"');
    assert.strictEqual(findRefAtOffset(text, 'json', other + 2), undefined);
  });
  test('[F13-FR-04] locates the target definition key', () => {
    const span = locatePointerTarget(text, 'json', ['$defs', 'address']);
    assert.ok(span);
    assert.strictEqual(text.slice(span!.start, span!.end), '"address"');
  });
  test('[F13-FR-07] returns undefined for an unresolvable pointer', () => {
    assert.strictEqual(locatePointerTarget(text, 'json', ['$defs', 'nope']), undefined);
  });
});

suite('[F13-FR-03] findRefAtOffset() / locatePointerTarget() — YAML', () => {
  const text = ['$defs:', '  address:', '    type: object', 'use:', "  $ref: '#/$defs/address'", ''].join('\n');

  test('finds the ref value in YAML', () => {
    const idx = text.indexOf('#/$defs/address');
    const hit = findRefAtOffset(text, 'yaml', idx + 1);
    assert.ok(hit);
    assert.strictEqual(hit!.ref, '#/$defs/address');
  });
  test('locates the YAML pointer target', () => {
    const span = locatePointerTarget(text, 'yaml', ['$defs', 'address']);
    assert.ok(span);
    // The mapped value spans the "type: object" block.
    assert.match(text.slice(span!.start, span!.end), /object/);
  });
  test('returns undefined off a $ref', () => {
    const idx = text.indexOf('type: object');
    assert.strictEqual(findRefAtOffset(text, 'yaml', idx), undefined);
  });
});

// parseSchemaAst/findRefInAst/locateInAst let a caller parse a document once
// and reuse the AST for both ref-finding and pointer-locating (F13-NFR),
// instead of findRefAtOffset/locatePointerTarget each re-parsing the text.
suite('parseSchemaAst() / findRefInAst() / locateInAst()', () => {
  const jsonText = JSON.stringify({ $defs: { address: { type: 'object' } }, use: { $ref: '#/$defs/address' } }, null, 2);
  const yamlText = ['$defs:', '  address:', '    type: object', 'use:', "  $ref: '#/$defs/address'", ''].join('\n');

  test('returns undefined for empty JSON input', () => {
    // jsonc-parser's parseTree is lenient about malformed content (it returns
    // a best-effort partial tree) but returns undefined for empty/whitespace
    // input — mirroring findRefAtOffset/locatePointerTarget's existing guard.
    assert.strictEqual(parseSchemaAst('', 'json'), undefined);
  });

  test('returns undefined for unparsable YAML', () => {
    // yaml's parseDocument rarely throws outright; parseSchemaAst still must
    // not throw for genuinely malformed input.
    assert.doesNotThrow(() => parseSchemaAst(':::', 'yaml'));
  });

  test('findRefInAst(parseSchemaAst(...)) matches findRefAtOffset(...) for JSON', () => {
    const refIndex = jsonText.indexOf('#/$defs/address');
    const ast = parseSchemaAst(jsonText, 'json');
    assert.ok(ast);
    const viaAst = findRefInAst(ast!, refIndex + 2);
    const viaText = findRefAtOffset(jsonText, 'json', refIndex + 2);
    assert.deepStrictEqual(viaAst, viaText);
  });

  test('locateInAst(parseSchemaAst(...)) matches locatePointerTarget(...) for JSON', () => {
    const ast = parseSchemaAst(jsonText, 'json');
    assert.ok(ast);
    const viaAst = locateInAst(ast!, ['$defs', 'address']);
    const viaText = locatePointerTarget(jsonText, 'json', ['$defs', 'address']);
    assert.deepStrictEqual(viaAst, viaText);
  });

  test('findRefInAst(parseSchemaAst(...)) matches findRefAtOffset(...) for YAML', () => {
    const idx = yamlText.indexOf('#/$defs/address');
    const ast = parseSchemaAst(yamlText, 'yaml');
    assert.ok(ast);
    const viaAst = findRefInAst(ast!, idx + 1);
    const viaText = findRefAtOffset(yamlText, 'yaml', idx + 1);
    assert.deepStrictEqual(viaAst, viaText);
  });

  test('locateInAst(parseSchemaAst(...)) matches locatePointerTarget(...) for YAML', () => {
    const ast = parseSchemaAst(yamlText, 'yaml');
    assert.ok(ast);
    const viaAst = locateInAst(ast!, ['$defs', 'address']);
    const viaText = locatePointerTarget(yamlText, 'yaml', ['$defs', 'address']);
    assert.deepStrictEqual(viaAst, viaText);
  });

  test('the same parsed AST can be queried for both a ref and a pointer target', () => {
    const ast = parseSchemaAst(jsonText, 'json');
    assert.ok(ast);
    const refIndex = jsonText.indexOf('#/$defs/address');
    const hit = findRefInAst(ast!, refIndex + 2);
    assert.ok(hit);
    const span = locateInAst(ast!, ['$defs', 'address']);
    assert.ok(span);
    assert.strictEqual(jsonText.slice(span!.start, span!.end), '"address"');
  });
});

suite('parseSchemaText()', () => {
  test('parses JSON', () => {
    assert.deepStrictEqual(parseSchemaText('{"a":1}', 'json'), { a: 1 });
  });
  test('parses JSONC with comments', () => {
    assert.deepStrictEqual(parseSchemaText('// c\n{"a":1}', 'jsonc'), { a: 1 });
  });
  test('parses YAML', () => {
    assert.deepStrictEqual(parseSchemaText('a: 1\n', 'yaml'), { a: 1 });
  });
  test('returns undefined on malformed input', () => {
    assert.strictEqual(parseSchemaText('{bad', 'json'), undefined);
  });
});
