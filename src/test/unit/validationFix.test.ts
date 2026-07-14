import * as assert from 'assert';
import {
  buildFixes, applyFix, computeFixEdits, type AjvErrorLike, type ValidationFix,
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

suite('[F21-FR-02][F21-NFR-02] buildFixes() — required properties', () => {
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
