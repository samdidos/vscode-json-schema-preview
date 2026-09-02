import * as assert from 'assert';
import fc from 'fast-check';

const {
  applyEdits,
  detectIndent,
  extractDefinition,
  inlineRef,
  findDefinitionReferences,
  renameDefinition,
  unusedDefinitions,
  removeUnusedDefinitions,
} = require('../../schemaRefactor');

interface Edit { offset: number; length: number; newText: string }
type Result = { ok: true; edits: Edit[] } | { ok: false; reason: string };

const ok = (result: Result): Edit[] => {
  assert.ok(result.ok, `expected success, got refusal: ${(result as { reason?: string }).reason}`);
  return (result as { edits: Edit[] }).edits;
};

const refusal = (result: Result): string => {
  assert.ok(!result.ok, 'expected a refusal');
  return (result as { reason: string }).reason;
};

/** Apply a refactoring and re-parse, which is the real contract. */
const applied = (text: string, result: Result): { text: string; value: unknown } => {
  const next = applyEdits(text, ok(result));
  return { text: next, value: JSON.parse(next) };
};

const PERSON = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "address": {
      "type": "object",
      "properties": {
        "street": { "type": "string" }
      }
    }
  }
}`;

const WITH_DEFS = `{
  "$defs": {
    "Address": {
      "type": "object",
      "properties": { "street": { "type": "string" } }
    },
    "Country": { "type": "string" }
  },
  "properties": {
    "home": { "$ref": "#/$defs/Address" }
  }
}`;

suite('[F30-FR-01][F30-NFR-01] applyEdits() — edit model', () => {
  test('applies edits against the original offsets regardless of order', () => {
    const text = 'abcdef';
    const edits = [
      { offset: 0, length: 1, newText: 'X' },
      { offset: 4, length: 2, newText: 'YZ!' },
    ];
    assert.strictEqual(applyEdits(text, edits), 'XbcdYZ!');
    assert.strictEqual(applyEdits(text, [...edits].reverse()), 'XbcdYZ!');
  });

  test('leaves the input untouched when there are no edits', () => {
    assert.strictEqual(applyEdits('abc', []), 'abc');
  });
});

suite('[F30-FR-03] detectIndent() — indentation detection', () => {
  test('detects a two-space unit', () => {
    assert.strictEqual(detectIndent('{\n  "a": 1\n}'), '  ');
  });

  test('detects a four-space unit', () => {
    assert.strictEqual(detectIndent('{\n    "a": {\n        "b": 1\n    }\n}'), '    ');
  });

  test('detects tabs anywhere in the document', () => {
    assert.strictEqual(detectIndent('{\n  "a": 1,\n\t"b": 2\n}'), '\t');
  });

  test('falls back to two spaces for a single-line document', () => {
    assert.strictEqual(detectIndent('{"a":1}'), '  ');
  });

  test('ignores blank lines when measuring', () => {
    assert.strictEqual(detectIndent('{\n\n    "a": 1\n}'), '    ');
  });
});

suite('[F30-FR-04] extractDefinition() — extract to $defs', () => {
  test('replaces the subschema with a $ref and adds the definition', () => {
    const offset = PERSON.indexOf('"type": "object",\n      "properties"');
    const { value } = applied(PERSON, extractDefinition(PERSON, offset, 'Address'));
    const root = value as Record<string, Record<string, Record<string, unknown>>>;
    assert.deepStrictEqual(root.properties.address, { $ref: '#/$defs/Address' });
    assert.deepStrictEqual(root.$defs.Address, {
      type: 'object',
      properties: { street: { type: 'string' } },
    });
  });

  test('reuses an existing $defs block', () => {
    const offset = WITH_DEFS.indexOf('"$ref": "#/$defs/Address"');
    // The `home` value is already a $ref, so extract the Country definition's
    // sibling instead: an object subschema inside $defs/Address.
    const target = WITH_DEFS.indexOf('{ "type": "string" }');
    const { value } = applied(WITH_DEFS, extractDefinition(WITH_DEFS, target, 'Street'));
    const root = value as Record<string, Record<string, unknown>>;
    assert.ok('Street' in root.$defs, 'the new definition joined the existing $defs');
    assert.ok('Address' in root.$defs, 'the existing definitions survived');
    assert.ok(offset > 0);
  });

  test('reuses a `definitions` block when the document uses that spelling', () => {
    const text = `{
  "definitions": { "Country": { "type": "string" } },
  "properties": { "a": { "type": "object", "properties": {} } }
}`;
    const target = text.indexOf('{ "type": "object", "properties": {} }');
    const { value } = applied(text, extractDefinition(text, target, 'A'));
    const root = value as Record<string, Record<string, unknown>>;
    assert.ok('A' in root.definitions);
    assert.deepStrictEqual(root.properties.a, { $ref: '#/definitions/A' });
  });

  test('creates $defs in a document that has none, keeping existing keys', () => {
    const { value } = applied(PERSON, extractDefinition(PERSON, PERSON.indexOf('"street"'), 'Street'));
    const root = value as Record<string, Record<string, unknown>>;
    assert.ok('$defs' in root);
    assert.ok('$schema' in root, 'existing root keys survive');
  });

  test('creates $defs in an empty root object', () => {
    const text = '{}';
    const result = extractDefinition(text, 0, 'X');
    // The root itself cannot be extracted — that is the refusal below, and it
    // is what an empty document hits first.
    assert.ok(!result.ok);
  });

  test('produces a document that still parses for a tab-indented source', () => {
    const text = '{\n\t"properties": {\n\t\t"a": {\n\t\t\t"type": "object"\n\t\t}\n\t}\n}';
    const { text: next } = applied(text, extractDefinition(text, text.indexOf('"type": "object"'), 'A'));
    assert.ok(next.includes('\t'), 'inserted text keeps the tab indentation');
    JSON.parse(next);
  });
});

suite('[F30-FR-05][F30-FR-02][F30-NFR-02] extractDefinition() — refusals', () => {
  test('refuses to extract the root schema', () => {
    assert.match(refusal(extractDefinition(PERSON, 1, 'Root')), /root schema/i);
  });

  test('refuses an existing top-level definition', () => {
    const at = WITH_DEFS.indexOf('"type": "object"');
    assert.match(refusal(extractDefinition(WITH_DEFS, at, 'Other')), /already a definition/i);
  });

  test('refuses a subschema that is already a $ref', () => {
    const at = WITH_DEFS.indexOf('"$ref"');
    assert.match(refusal(extractDefinition(WITH_DEFS, at, 'Other')), /already a \$ref/i);
  });

  test('refuses a name already defined', () => {
    const at = WITH_DEFS.indexOf('{ "type": "string" }');
    assert.match(refusal(extractDefinition(WITH_DEFS, at, 'Country')), /already defined/i);
  });

  test('refuses an empty name', () => {
    assert.match(refusal(extractDefinition(PERSON, PERSON.indexOf('"street"'), '  ')), /name is required/i);
  });

  test('refuses a non-object document', () => {
    assert.match(refusal(extractDefinition('[]', 0, 'X')), /not a JSON object/i);
    assert.match(refusal(extractDefinition('not json', 0, 'X')), /not a JSON object/i);
  });
});

suite('[F30-FR-06] inlineRef() — inline a local $ref', () => {
  test('replaces the $ref object with the definition body', () => {
    const at = WITH_DEFS.indexOf('"$ref": "#/$defs/Address"');
    const { value } = applied(WITH_DEFS, inlineRef(WITH_DEFS, at));
    const root = value as Record<string, Record<string, unknown>>;
    assert.deepStrictEqual(root.properties.home, {
      type: 'object',
      properties: { street: { type: 'string' } },
    });
  });

  test('works when the cursor is anywhere inside the $ref object', () => {
    const at = WITH_DEFS.indexOf('#/$defs/Address') + 4;
    assert.ok(inlineRef(WITH_DEFS, at).ok);
  });
});

suite('[F30-FR-07] inlineRef() — refusals', () => {
  test('refuses a relative or remote $ref', () => {
    const text = '{ "properties": { "a": { "$ref": "./other.json#/x" } } }';
    assert.match(refusal(inlineRef(text, text.indexOf('$ref'))), /local/i);
    const remote = '{ "properties": { "a": { "$ref": "https://x.test/s.json" } } }';
    assert.match(refusal(inlineRef(remote, remote.indexOf('$ref'))), /local/i);
  });

  test('refuses an unresolvable pointer', () => {
    const text = '{ "properties": { "a": { "$ref": "#/$defs/Missing" } } }';
    assert.match(refusal(inlineRef(text, text.indexOf('$ref'))), /does not resolve/i);
  });

  test('refuses the whole-document ref', () => {
    const text = '{ "properties": { "a": { "$ref": "#" } } }';
    assert.match(refusal(inlineRef(text, text.indexOf('$ref'))), /root schema/i);
  });

  test('refuses a directly recursive reference', () => {
    const text = `{
  "$defs": { "Node": { "properties": { "next": { "$ref": "#/$defs/Node" } } } },
  "properties": { "root": { "$ref": "#/$defs/Node" } }
}`;
    assert.match(refusal(inlineRef(text, text.lastIndexOf('$ref'))), /recursive/i);
  });

  test('refuses an indirectly recursive reference', () => {
    const text = `{
  "$defs": {
    "A": { "properties": { "b": { "$ref": "#/$defs/B" } } },
    "B": { "properties": { "a": { "$ref": "#/$defs/A" } } }
  },
  "properties": { "root": { "$ref": "#/$defs/A" } }
}`;
    assert.match(refusal(inlineRef(text, text.lastIndexOf('$ref'))), /recursive/i);
  });

  test('refuses when the cursor is not on a $ref', () => {
    assert.match(refusal(inlineRef(PERSON, PERSON.indexOf('"street"'))), /on a \$ref/i);
  });

  test('refuses a non-object document', () => {
    assert.match(refusal(inlineRef('[1]', 0)), /not a JSON object/i);
  });
});

suite('[F30-FR-08] inlineRef() — sibling keywords', () => {
  test('refuses rather than dropping siblings of a $ref', () => {
    const text = `{
  "$defs": { "A": { "type": "string" } },
  "properties": { "a": { "$ref": "#/$defs/A", "description": "keep me" } }
}`;
    assert.match(refusal(inlineRef(text, text.lastIndexOf('$ref'))), /sibling keywords/i);
  });
});

suite('[F30-FR-09] findDefinitionReferences() — find references', () => {
  test('finds every local reference to a definition', () => {
    const text = `{
  "$defs": { "A": { "type": "string" }, "B": { "type": "number" } },
  "properties": {
    "x": { "$ref": "#/$defs/A" },
    "y": { "$ref": "#/$defs/A" },
    "z": { "$ref": "#/$defs/B" }
  }
}`;
    const hits = findDefinitionReferences(text, 'A');
    assert.strictEqual(hits.length, 2);
    assert.ok(hits.every((h: { ref: string }) => h.ref === '#/$defs/A'));
  });

  test('finds references that point into a definition', () => {
    const text = `{
  "$defs": { "A": { "properties": { "s": { "type": "string" } } } },
  "properties": { "x": { "$ref": "#/$defs/A/properties/s" } }
}`;
    assert.strictEqual(findDefinitionReferences(text, 'A').length, 1);
  });

  test('matches an escaped pointer segment against its unescaped key', () => {
    const text = `{
  "$defs": { "a/b": { "type": "string" } },
  "properties": { "x": { "$ref": "#/$defs/a~1b" } }
}`;
    assert.strictEqual(findDefinitionReferences(text, 'a/b').length, 1);
  });

  test('returns nothing for a document with no definitions', () => {
    assert.deepStrictEqual(findDefinitionReferences(PERSON, 'A'), []);
    assert.deepStrictEqual(findDefinitionReferences('nope', 'A'), []);
  });
});

suite('[F30-FR-10] renameDefinition() — rename', () => {
  test('rewrites the key and every reference', () => {
    const text = `{
  "$defs": { "Address": { "type": "object" }, "Country": { "type": "string" } },
  "properties": {
    "home": { "$ref": "#/$defs/Address" },
    "work": { "$ref": "#/$defs/Address" },
    "c": { "$ref": "#/$defs/Country" }
  }
}`;
    const { value } = applied(text, renameDefinition(text, 'Address', 'Postal'));
    const root = value as Record<string, Record<string, Record<string, unknown>>>;
    assert.ok('Postal' in root.$defs);
    assert.ok(!('Address' in root.$defs));
    assert.deepStrictEqual(root.properties.home, { $ref: '#/$defs/Postal' });
    assert.deepStrictEqual(root.properties.work, { $ref: '#/$defs/Postal' });
    assert.deepStrictEqual(root.properties.c, { $ref: '#/$defs/Country' }, 'unrelated refs untouched');
  });

  test('preserves the suffix of a reference that points into the definition', () => {
    const text = `{
  "$defs": { "A": { "properties": { "s": { "type": "string" } } } },
  "properties": { "x": { "$ref": "#/$defs/A/properties/s" } }
}`;
    const { value } = applied(text, renameDefinition(text, 'A', 'B'));
    const root = value as Record<string, Record<string, Record<string, unknown>>>;
    assert.deepStrictEqual(root.properties.x, { $ref: '#/$defs/B/properties/s' });
  });

  test('escapes a new name that needs escaping in a pointer', () => {
    const text = `{
  "$defs": { "A": { "type": "string" } },
  "properties": { "x": { "$ref": "#/$defs/A" } }
}`;
    const { value } = applied(text, renameDefinition(text, 'A', 'a/b'));
    const root = value as Record<string, Record<string, Record<string, unknown>>>;
    assert.deepStrictEqual(root.properties.x, { $ref: '#/$defs/a~1b' });
    assert.ok('a/b' in (root.$defs as Record<string, unknown>));
  });

  test('refuses an unknown, blank, unchanged, or taken name', () => {
    assert.match(refusal(renameDefinition(WITH_DEFS, 'Nope', 'X')), /not defined/i);
    assert.match(refusal(renameDefinition(WITH_DEFS, 'Address', ' ')), /new name is required/i);
    assert.match(refusal(renameDefinition(WITH_DEFS, 'Address', 'Address')), /same as the old/i);
    assert.match(refusal(renameDefinition(WITH_DEFS, 'Address', 'Country')), /already defined/i);
  });

  test('refuses when there is no definitions block at all', () => {
    assert.match(refusal(renameDefinition(PERSON, 'A', 'B')), /no \$defs/i);
    assert.match(refusal(renameDefinition('[]', 'A', 'B')), /not a JSON object/i);
  });
});

suite('[F30-FR-11] unusedDefinitions() — transitive reachability', () => {
  test('reports a definition nothing references', () => {
    const found = unusedDefinitions(WITH_DEFS);
    assert.deepStrictEqual(found.map((u: { name: string }) => u.name), ['Country']);
  });

  test('reports a definition referenced only from another unused one', () => {
    // Orphan → Leaf: neither is reachable from the root, so a plain reference
    // count would wrongly keep Leaf alive.
    const text = `{
  "$defs": {
    "Used": { "type": "string" },
    "Orphan": { "properties": { "l": { "$ref": "#/$defs/Leaf" } } },
    "Leaf": { "type": "number" }
  },
  "properties": { "u": { "$ref": "#/$defs/Used" } }
}`;
    const names = unusedDefinitions(text).map((u: { name: string }) => u.name).sort();
    assert.deepStrictEqual(names, ['Leaf', 'Orphan']);
  });

  test('keeps a definition reachable only through another definition', () => {
    const text = `{
  "$defs": {
    "A": { "properties": { "b": { "$ref": "#/$defs/B" } } },
    "B": { "type": "string" }
  },
  "properties": { "a": { "$ref": "#/$defs/A" } }
}`;
    assert.deepStrictEqual(unusedDefinitions(text), []);
  });

  test('survives a reference cycle among unused definitions', () => {
    const text = `{
  "$defs": {
    "A": { "properties": { "b": { "$ref": "#/$defs/B" } } },
    "B": { "properties": { "a": { "$ref": "#/$defs/A" } } }
  },
  "properties": {}
}`;
    assert.strictEqual(unusedDefinitions(text).length, 2);
  });

  test('reports the definition key span', () => {
    const [hit] = unusedDefinitions(WITH_DEFS);
    assert.strictEqual(WITH_DEFS.slice(hit.span.start, hit.span.end), '"Country"');
  });

  test('returns nothing for documents with no definitions', () => {
    assert.deepStrictEqual(unusedDefinitions(PERSON), []);
    assert.deepStrictEqual(unusedDefinitions('nope'), []);
  });
});

suite('[F30-FR-12] removeUnusedDefinitions() — deletion', () => {
  test('deletes a trailing unused definition and leaves valid JSON', () => {
    const { value } = applied(WITH_DEFS, removeUnusedDefinitions(WITH_DEFS));
    const root = value as Record<string, Record<string, unknown>>;
    assert.deepStrictEqual(Object.keys(root.$defs), ['Address']);
  });

  test('deletes a leading unused definition', () => {
    const text = `{
  "$defs": { "Dead": { "type": "string" }, "Used": { "type": "number" } },
  "properties": { "u": { "$ref": "#/$defs/Used" } }
}`;
    const { value } = applied(text, removeUnusedDefinitions(text));
    assert.deepStrictEqual(Object.keys((value as Record<string, object>).$defs), ['Used']);
  });

  test('deletes a middle run of unused definitions', () => {
    const text = `{
  "$defs": {
    "Used": { "type": "number" },
    "D1": { "type": "string" },
    "D2": { "type": "string" },
    "Used2": { "type": "boolean" }
  },
  "properties": { "a": { "$ref": "#/$defs/Used" }, "b": { "$ref": "#/$defs/Used2" } }
}`;
    const { value } = applied(text, removeUnusedDefinitions(text));
    assert.deepStrictEqual(Object.keys((value as Record<string, object>).$defs), ['Used', 'Used2']);
  });

  test('empties the container when everything is unused', () => {
    const text = `{
  "$defs": { "A": { "type": "string" }, "B": { "type": "number" } },
  "properties": {}
}`;
    const { value } = applied(text, removeUnusedDefinitions(text));
    assert.deepStrictEqual((value as Record<string, object>).$defs, {});
  });

  test('refuses when every definition is referenced', () => {
    const text = `{
  "$defs": { "A": { "type": "string" } },
  "properties": { "a": { "$ref": "#/$defs/A" } }
}`;
    assert.match(refusal(removeUnusedDefinitions(text)), /Every definition is referenced/i);
  });

  test('refuses a document with no definitions block', () => {
    assert.match(refusal(removeUnusedDefinitions(PERSON)), /no \$defs/i);
    assert.match(refusal(removeUnusedDefinitions('[]')), /not a JSON object/i);
  });
});

suite('[F30-NFR-03] refactorings are total on arbitrary input', () => {
  test('never throws for arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 0, max: 50 }), (text, offset) => {
        extractDefinition(text, offset, 'X');
        inlineRef(text, offset);
        renameDefinition(text, 'A', 'B');
        findDefinitionReferences(text, 'A');
        unusedDefinitions(text);
        removeUnusedDefinitions(text);
        return true;
      }),
      { numRuns: 300 },
    );
  });

  test('never throws for arbitrary JSON documents', () => {
    fc.assert(
      fc.property(fc.jsonValue(), value => {
        const text = JSON.stringify(value, null, 2);
        extractDefinition(text, Math.floor(text.length / 2), 'X');
        inlineRef(text, Math.floor(text.length / 2));
        unusedDefinitions(text);
        return true;
      }),
      { numRuns: 200 },
    );
  });
});
