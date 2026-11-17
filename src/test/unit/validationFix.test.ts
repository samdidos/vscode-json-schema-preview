import * as assert from 'assert';
import {
  buildFixes, applyFix, computeFixEdits, pointerOf, fixTargetPointer,
  type AjvErrorLike, type ValidationFix,
} from '../../validationFix';

/** Shorthand for an Ajv-style error object. */
function err(keyword: string, instancePath: string, params: Record<string, unknown>): AjvErrorLike {
  return { keyword, instancePath, params };
}

function only(fixes: ValidationFix[]): ValidationFix {
  assert.strictEqual(fixes.length, 1, `expected exactly one fix, got ${fixes.length}`);
  return fixes[0];
}

// ── required → add-property ──────────────────────────────────────────────────

suite('[F21-FR-02][F21-NFR-01][F21-NFR-02] buildFixes() — required properties', () => {
  const schema = {
    type: 'object',
    required: ['name'],
    properties: { name: { type: 'string' } },
  };

  test('inserts the missing property with a typed empty placeholder', () => {
    const fixes = buildFixes([err('required', '', { missingProperty: 'name' })], schema, {});
    const fix = only(fixes);
    assert.strictEqual(fix.kind, 'add-required');
    assert.match(fix.title, /Add missing required property "name"/);
    assert.strictEqual(applyFix('{}', fix), '{\n  "name": ""\n}');
  });

  test('prefers const, then default, then enum[0] for the placeholder', () => {
    const s = { properties: { a: { const: 42 }, b: { default: 'x' }, c: { enum: ['p', 'q'] } } };
    assert.strictEqual(only(buildFixes([err('required', '', { missingProperty: 'a' })], s, {})).value, 42);
    assert.strictEqual(only(buildFixes([err('required', '', { missingProperty: 'b' })], s, {})).value, 'x');
    assert.strictEqual(only(buildFixes([err('required', '', { missingProperty: 'c' })], s, {})).value, 'p');
  });

  test('type-appropriate empties: number→0, boolean→false, array→[], object→{}, null→null', () => {
    const s = {
      properties: {
        n: { type: 'integer' }, b: { type: 'boolean' },
        arr: { type: 'array' }, obj: { type: 'object' }, z: { type: 'null' },
      },
    };
    const val = (name: string) => only(buildFixes([err('required', '', { missingProperty: name })], s, {})).value;
    assert.strictEqual(val('n'), 0);
    assert.strictEqual(val('b'), false);
    assert.deepStrictEqual(val('arr'), []);
    assert.deepStrictEqual(val('obj'), {});
    assert.strictEqual(val('z'), null);
  });

  test('falls back to null when the property subschema cannot be resolved', () => {
    const fix = only(buildFixes([err('required', '', { missingProperty: 'ghost' })], {}, {}));
    assert.strictEqual(fix.value, null);
  });

  test('resolves the placeholder through a nested object path', () => {
    const s = { properties: { user: { properties: { age: { type: 'integer' } } } } };
    const fix = only(buildFixes([err('required', '/user', { missingProperty: 'age' })], s, { user: {} }));
    assert.strictEqual(fix.value, 0);
    assert.strictEqual(applyFix('{\n  "user": {}\n}', fix), '{\n  "user": {\n    "age": 0\n  }\n}');
  });

  test('a missingProperty of "" yields no fix', () => {
    assert.deepStrictEqual(buildFixes([err('required', '', { missingProperty: '' })], schema, {}), []);
  });
});

// ── additionalProperties → remove ────────────────────────────────────────────

suite('[F21-FR-03] buildFixes() — additional/unevaluated properties', () => {
  test('removes the offending extra property', () => {
    const fix = only(buildFixes([err('additionalProperties', '', { additionalProperty: 'extra' })], {}, { extra: 1 }));
    assert.strictEqual(fix.kind, 'remove-additional');
    assert.deepStrictEqual(JSON.parse(applyFix('{\n  "extra": 1\n}', fix)), {});
  });

  test('also handles unevaluatedProperties', () => {
    const fix = only(buildFixes([err('unevaluatedProperties', '', { unevaluatedProperty: 'x' })], {}, { x: 1 }));
    assert.strictEqual(fix.kind, 'remove-additional');
  });
});

// ── enum / const → set-value ─────────────────────────────────────────────────

suite('[F21-FR-04] buildFixes() — enum and const', () => {
  test('offers one fix per allowed enum value', () => {
    const fixes = buildFixes([err('enum', '/color', { allowedValues: ['red', 'green'] })], {}, { color: 'purpel' });
    assert.strictEqual(fixes.length, 2);
    assert.strictEqual(applyFix('{ "color": "purpel" }', fixes[0]), '{ "color": "red" }');
  });

  test('caps enum fixes at six', () => {
    const many = Array.from({ length: 20 }, (_, i) => `v${i}`);
    const fixes = buildFixes([err('enum', '', { allowedValues: many })], {}, 'x');
    assert.strictEqual(fixes.length, 6);
  });

  test('const yields a single set-value fix', () => {
    const fix = only(buildFixes([err('const', '/kind', { allowedValue: 'fixed' })], {}, { kind: 'other' }));
    assert.strictEqual(fix.kind, 'set-const');
    assert.strictEqual(applyFix('{ "kind": "other" }', fix), '{ "kind": "fixed" }');
  });
});

// ── type → coerce ────────────────────────────────────────────────────────────

suite('[F21-FR-05] buildFixes() — lossless type coercion', () => {
  test('numeric string → integer', () => {
    const fix = only(buildFixes([err('type', '/age', { type: 'integer' })], {}, { age: '5' }));
    assert.strictEqual(fix.value, 5);
    assert.strictEqual(applyFix('{ "age": "5" }', fix), '{ "age": 5 }');
  });

  test('non-integral numeric string → integer offers no fix', () => {
    assert.deepStrictEqual(buildFixes([err('type', '/age', { type: 'integer' })], {}, { age: '5.5' }), []);
  });

  test('decimal string → number', () => {
    const fix = only(buildFixes([err('type', '/x', { type: 'number' })], {}, { x: '5.5' }));
    assert.strictEqual(fix.value, 5.5);
  });

  test('number → string', () => {
    const fix = only(buildFixes([err('type', '/id', { type: 'string' })], {}, { id: 42 }));
    assert.strictEqual(fix.value, '42');
  });

  test('"true"/"false" string → boolean', () => {
    assert.strictEqual(only(buildFixes([err('type', '/f', { type: 'boolean' })], {}, { f: 'true' })).value, true);
    assert.strictEqual(only(buildFixes([err('type', '/f', { type: 'boolean' })], {}, { f: 'false' })).value, false);
  });

  test('accepts a union type array', () => {
    const fix = only(buildFixes([err('type', '/x', { type: ['integer', 'null'] })], {}, { x: '7' }));
    assert.strictEqual(fix.value, 7);
  });

  test('an unconvertible value offers no fix', () => {
    assert.deepStrictEqual(buildFixes([err('type', '/x', { type: 'number' })], {}, { x: 'abc' }), []);
    assert.deepStrictEqual(buildFixes([err('type', '/x', { type: 'boolean' })], {}, { x: 'yes' }), []);
  });
});

// ── unsupported keywords & edit-time behaviour ───────────────────────────────

suite('[F21-FR-01] buildFixes() — unsupported keywords', () => {
  test('keywords with no safe fix produce nothing', () => {
    for (const kw of ['pattern', 'minLength', 'format', 'minimum', 'uniqueItems']) {
      assert.deepStrictEqual(buildFixes([err(kw, '/x', {})], {}, { x: 1 }), []);
    }
  });
});

suite('[F21-FR-08] pointerOf() / fixTargetPointer() — diagnostic matching', () => {
  test('pointerOf builds an Ajv-style instance path ([] = root)', () => {
    assert.strictEqual(pointerOf([]), '/');
    assert.strictEqual(pointerOf(['status']), '/status');
    assert.strictEqual(pointerOf(['items', 0]), '/items/0');
    assert.strictEqual(pointerOf(['a/b', 'c~d']), '/a~1b/c~0d'); // RFC 6901 escaping
  });

  test('value fixes target their own node; add/remove target the parent object', () => {
    const enumFix = only(buildFixes([err('enum', '/status', { allowedValues: ['open'] })], {}, { status: 'x' }));
    assert.strictEqual(fixTargetPointer(enumFix), '/status');
    const addFix = only(buildFixes([err('required', '', { missingProperty: 'name' })], {}, {}));
    assert.strictEqual(fixTargetPointer(addFix), '/'); // parent of the inserted child = root
    const removeFix = only(buildFixes([err('additionalProperties', '/user', { additionalProperty: 'extra' })], {}, { user: { extra: 1 } }));
    assert.strictEqual(fixTargetPointer(removeFix), '/user');
  });
});

suite('[F21-FR-06] computeFixEdits() — computed against current text', () => {
  test('a fix whose target object no longer exists produces no edit', () => {
    // The property path points into an object that has been deleted from the doc.
    const fix: ValidationFix = { title: 't', kind: 'add-required', path: ['user', 'name'], value: '' };
    assert.deepStrictEqual(computeFixEdits('{}', fix), []);
  });

  test('a removal of an already-absent property is a no-op', () => {
    const fix: ValidationFix = { title: 't', kind: 'remove-additional', path: ['gone'], remove: true };
    assert.deepStrictEqual(computeFixEdits('{ "kept": 1 }', fix), []);
  });

  test('edits apply against the current (edited) text, not stale offsets', () => {
    const fix = only(buildFixes([err('const', '/kind', { allowedValue: 'fixed' })], {}, { kind: 'other' }));
    // Text has shifted since validation (a new first key was added).
    const edited = '{ "added": true, "kind": "other" }';
    assert.strictEqual(applyFix(edited, fix), '{ "added": true, "kind": "fixed" }');
  });
});

// ── F25: near-miss property names ────────────────────────────────────────────

suite('[F25-FR-05] buildFixes() — an unexpected key that is a near-miss of a declared one', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      description: { type: 'string' },
      name: { type: 'string' },
      server: { type: 'object', properties: { port: { type: 'integer' }, host: { type: 'string' } } },
      jobs: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' } } } },
    },
  };
  const fixesFor = (instancePath: string, name: string, data: unknown, keyword = 'additionalProperties') =>
    buildFixes([err(keyword, instancePath, keyword === 'additionalProperties'
      ? { additionalProperty: name }
      : { unevaluatedProperty: name })], schema, data);

  test('offers the rename first, preferred, and still offers the removal', () => {
    const fixes = fixesFor('', 'descripton', { descripton: 'x' });
    assert.deepStrictEqual(fixes.map(f => f.kind), ['rename-property', 'remove-additional']);
    assert.strictEqual(fixes[0].title, 'Rename to "description" (closest match)');
    assert.strictEqual(fixes[0].newName, 'description');
    assert.strictEqual(fixes[0].preferred, true);
    assert.deepStrictEqual(fixes[0].path, ['descripton']);
    assert.strictEqual(fixes[1].preferred, undefined);
    assert.strictEqual(fixes[1].title, 'Remove unexpected property "descripton"');
  });

  test('a case-only difference and swapped letters both count as near-misses', () => {
    assert.strictEqual(fixesFor('', 'Name', { Name: 'x' })[0].newName, 'name');
    assert.strictEqual(fixesFor('', 'nmae', { nmae: 'x' })[0].newName, 'name');
  });

  test('follows the instance path through properties and array items', () => {
    const nested = fixesFor('/server', 'prot', { server: { prot: 1 } });
    assert.strictEqual(nested[0].newName, 'port');
    assert.deepStrictEqual(nested[0].path, ['server', 'prot']);
    const inArray = fixesFor('/jobs/1', 'comand', { jobs: [{}, { comand: 'x' }] });
    assert.strictEqual(inArray[0].newName, 'command');
    assert.deepStrictEqual(inArray[0].path, ['jobs', 1, 'comand']);
  });

  test('unevaluatedProperties errors get the same suggestion', () => {
    const fixes = fixesFor('', 'nam', { nam: 'x' }, 'unevaluatedProperties');
    assert.deepStrictEqual(fixes.map(f => f.kind), ['rename-property', 'remove-additional']);
    assert.strictEqual(fixes[0].newName, 'name');
  });

  test('a name the object already has is never suggested — the next free one is', () => {
    // `nam` is closest to `name`, but `name` is taken; nothing else is near.
    assert.deepStrictEqual(fixesFor('', 'nam', { nam: 'x', name: 'y' }).map(f => f.kind), ['remove-additional']);
    // `hots` is one swap from `host`; with `host` present, `port` is not a near-miss.
    assert.deepStrictEqual(
      fixesFor('/server', 'hots', { server: { hots: 'a', host: 'b' } }).map(f => f.kind),
      ['remove-additional'],
    );
  });

  test('a distant name, an unresolvable subschema and a schema without properties suggest nothing', () => {
    assert.deepStrictEqual(fixesFor('', 'zzzzzz', { zzzzzz: 1 }).map(f => f.kind), ['remove-additional']);
    assert.deepStrictEqual(fixesFor('/nowhere', 'nam', { nowhere: { nam: 1 } }).map(f => f.kind), ['remove-additional']);
    assert.deepStrictEqual(
      buildFixes([err('additionalProperties', '', { additionalProperty: 'nam' })], { additionalProperties: false }, { nam: 1 })
        .map(f => f.kind),
      ['remove-additional'],
    );
    // The instance at the path is not an object (stale data): still safe.
    assert.strictEqual(fixesFor('/server', 'prot', { server: 5 })[0].newName, 'port');
  });
});

suite('[F25-FR-06] rename-property — rewrites the key and nothing else', () => {
  const rename = (path: (string | number)[], newName: string): ValidationFix =>
    ({ title: 't', kind: 'rename-property', path, newName, preferred: true });

  test('only the key token changes; the value, comments and layout are untouched', () => {
    const text = '{\n  // why\n  "descripton" :   { "a": [1, 2] }, "n": 1\n}';
    assert.strictEqual(
      applyFix(text, rename(['descripton'], 'description')),
      '{\n  // why\n  "description" :   { "a": [1, 2] }, "n": 1\n}',
    );
    assert.deepStrictEqual(computeFixEdits(text, rename(['descripton'], 'description')), [
      { offset: text.indexOf('"descripton"'), length: '"descripton"'.length, content: '"description"' },
    ]);
  });

  test('renames a nested key inside an array element, escaping the new name', () => {
    const text = '{"jobs":[{},{"comand":"x"}]}';
    assert.strictEqual(applyFix(text, rename(['jobs', 1, 'comand'], 'com"mand')), '{"jobs":[{},{"com\\"mand":"x"}]}');
  });

  test('produces no edit when the key is gone, the new name is taken, or no name is given', () => {
    assert.deepStrictEqual(computeFixEdits('{"other":1}', rename(['descripton'], 'description')), []);
    assert.deepStrictEqual(computeFixEdits('{"descripton":1,"description":2}', rename(['descripton'], 'description')), []);
    assert.deepStrictEqual(
      computeFixEdits('{"descripton":1}', { title: 't', kind: 'rename-property', path: ['descripton'] }),
      [],
    );
    assert.deepStrictEqual(computeFixEdits('not json', rename(['a'], 'b')), []);
  });

  test('the fix belongs to the diagnostic on the parent object', () => {
    assert.strictEqual(fixTargetPointer(rename(['server', 'prot'], 'port')), '/server');
    assert.strictEqual(fixTargetPointer(rename(['prot'], 'port')), '/');
  });

  test('[F25-FR-04] the other fix kinds are unchanged by the rename suggestion', () => {
    const schema = { type: 'object', required: ['name'], properties: { name: { type: 'string' }, kind: { enum: ['a', 'b'] } } };
    const fixes = buildFixes([
      err('required', '', { missingProperty: 'name' }),
      err('enum', '/kind', { allowedValues: ['a', 'b'] }),
      err('const', '/c', { allowedValue: 1 }),
      err('type', '/n', { type: 'number' }),
    ], schema, { kind: 'z', c: 2, n: '5' });
    assert.deepStrictEqual(fixes.map(f => f.kind), ['add-required', 'set-enum', 'set-enum', 'set-const', 'coerce-type']);
    assert.ok(fixes.every(f => f.newName === undefined));
  });
});

