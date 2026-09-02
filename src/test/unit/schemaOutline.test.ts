import * as assert from 'assert';
import fc from 'fast-check';

const { buildOutline } = require('../../schemaOutline');

interface Node {
  name: string;
  detail: string;
  kind: string;
  span: { start: number; end: number };
  selectionSpan: { start: number; end: number };
  children: Node[];
}

const outline = (schema: object, languageId = 'json', fallback = 'schema'): Node[] =>
  buildOutline(JSON.stringify(schema, null, 2), languageId, fallback);

const root = (schema: object, fallback = 'schema'): Node => {
  const nodes = outline(schema, 'json', fallback);
  assert.strictEqual(nodes.length, 1, 'exactly one root symbol');
  return nodes[0];
};

const names = (nodes: Node[]): string[] => nodes.map(n => n.name);
const child = (node: Node, name: string): Node => {
  const found = node.children.find(c => c.name === name);
  assert.ok(found, `expected a child named ${name}, got ${names(node.children).join(', ')}`);
  return found as Node;
};

suite('[F31-FR-01] buildOutline() — root symbol', () => {
  test('names the root from the schema title', () => {
    assert.strictEqual(root({ title: 'Person', properties: {} }).name, 'Person');
  });

  test('falls back to the supplied file name', () => {
    assert.strictEqual(root({ properties: {} }, 'person.schema.json').name, 'person.schema.json');
  });

  test('shows $id as the root detail', () => {
    assert.strictEqual(root({ $id: 'https://x.test/p.json', properties: {} }).detail, 'https://x.test/p.json');
  });

  test('returns an empty outline for unparsable or non-object text', () => {
    assert.deepStrictEqual(buildOutline('not json', 'json'), []);
    assert.deepStrictEqual(buildOutline('[1, 2]', 'json'), []);
    assert.deepStrictEqual(buildOutline('', 'json'), []);
  });
});

suite('[F31-FR-02] buildOutline() — properties nest by containment', () => {
  test('nests a property under the schema that declares it, skipping "properties"', () => {
    const r = root({ properties: { address: { type: 'object', properties: { street: { type: 'string' } } } } });
    assert.deepStrictEqual(names(r.children), ['address']);
    assert.deepStrictEqual(names(child(r, 'address').children), ['street']);
  });

  test('contributes array element properties under the array symbol', () => {
    const r = root({ properties: { items: { type: 'array', items: { properties: { tag: {} } } } } });
    assert.deepStrictEqual(names(child(r, 'items').children), ['tag']);
  });

  test('contributes tuple element properties too', () => {
    const r = root({
      properties: { pair: { type: 'array', items: [{ properties: { x: {} } }, { properties: { y: {} } }] } },
    });
    assert.deepStrictEqual(names(child(r, 'pair').children).sort(), ['x', 'y']);
  });

  test('yields no children for a schema with no properties', () => {
    assert.deepStrictEqual(root({ type: 'string' }).children, []);
  });
});

suite('[F31-FR-03] buildOutline() — type and required detail', () => {
  test('renders the effective type as detail', () => {
    const r = root({ properties: { name: { type: 'string' }, age: { type: 'integer' } } });
    assert.strictEqual(child(r, 'name').detail, 'string');
    assert.strictEqual(child(r, 'age').detail, 'integer');
  });

  test('marks required properties distinctly from optional ones', () => {
    const r = root({ properties: { a: { type: 'string' }, b: { type: 'string' } }, required: ['a'] });
    assert.match(child(r, 'a').detail, /required/);
    assert.doesNotMatch(child(r, 'b').detail, /required/);
  });

  test('renders a union type', () => {
    const r = root({ properties: { x: { type: ['string', 'null'] } } });
    assert.strictEqual(child(r, 'x').detail, 'string | null');
  });

  test('renders an array element type', () => {
    const r = root({ properties: { tags: { type: 'array', items: { type: 'string' } } } });
    assert.strictEqual(child(r, 'tags').detail, 'array<string>');
  });

  test('renders enum and untyped schemas', () => {
    const r = root({ properties: { e: { enum: ['a', 'b'] }, u: {} } });
    assert.strictEqual(child(r, 'e').detail, 'enum');
    assert.strictEqual(child(r, 'u').detail, 'any');
  });
});

suite('[F31-FR-04] buildOutline() — $ref properties', () => {
  test('shows the reference as detail and does not expand it', () => {
    const r = root({
      properties: { home: { $ref: '#/$defs/Address' } },
      $defs: { Address: { properties: { street: {} } } },
    });
    const home = child(r, 'home');
    assert.match(home.detail, /#\/\$defs\/Address/);
    assert.strictEqual(home.kind, 'ref');
    assert.deepStrictEqual(home.children, [], 'a $ref is followed by F13, never expanded here');
  });

  test('terminates on a self-recursive schema', () => {
    const r = root({
      properties: { node: { $ref: '#/$defs/Node' } },
      $defs: { Node: { properties: { next: { $ref: '#/$defs/Node' } } } },
    });
    assert.deepStrictEqual(child(r, 'node').children, []);
  });
});

suite('[F31-FR-05] buildOutline() — definitions section', () => {
  test('lists $defs as one section with each definition expanded', () => {
    const r = root({
      properties: { a: {} },
      $defs: { Address: { properties: { street: {} } }, Country: { type: 'string' } },
    });
    const defs = child(r, '$defs');
    assert.strictEqual(defs.kind, 'section');
    assert.strictEqual(defs.detail, '2 definitions');
    assert.deepStrictEqual(names(defs.children), ['Address', 'Country']);
    assert.deepStrictEqual(names(child(defs, 'Address').children), ['street']);
  });

  test('uses the singular for one definition', () => {
    assert.strictEqual(child(root({ $defs: { A: {} } }), '$defs').detail, '1 definition');
  });

  test('supports the `definitions` spelling', () => {
    assert.strictEqual(child(root({ definitions: { A: {} } }), 'definitions').kind, 'section');
  });

  test('prefers $defs when a document carries both', () => {
    const r = root({ $defs: { A: {} }, definitions: { B: {} } });
    assert.deepStrictEqual(names(r.children), ['$defs']);
  });
});

suite('[F31-FR-06] buildOutline() — composition branches', () => {
  test('contributes properties declared in allOf/anyOf/oneOf branches', () => {
    const r = root({
      allOf: [{ properties: { a: {} } }],
      anyOf: [{ properties: { b: {} } }],
      oneOf: [{ properties: { c: {} } }],
    });
    assert.deepStrictEqual(names(r.children).sort(), ['a', 'b', 'c']);
  });

  test('contributes branch properties of a nested property', () => {
    const r = root({ properties: { x: { allOf: [{ properties: { y: {} } }] } } });
    assert.deepStrictEqual(names(child(r, 'x').children), ['y']);
  });
});

suite('[F31-FR-07] buildOutline() — spans', () => {
  test('the selection span is the property key and the full span covers the value', () => {
    const text = JSON.stringify({ properties: { name: { type: 'string' } } }, null, 2);
    const r = buildOutline(text, 'json')[0] as Node;
    const name = r.children[0];
    assert.strictEqual(text.slice(name.selectionSpan.start, name.selectionSpan.end), '"name"');
    assert.ok(name.span.start <= name.selectionSpan.start);
    assert.ok(name.span.end >= name.selectionSpan.end);
    assert.match(text.slice(name.span.start, name.span.end), /"type": "string"/);
  });
});

suite('[F31-FR-08] buildOutline() — symbol kinds', () => {
  test('assigns a kind from the declared type', () => {
    const r = root({
      properties: {
        o: { type: 'object' }, a: { type: 'array' }, s: { type: 'string' },
        n: { type: 'number' }, i: { type: 'integer' }, b: { type: 'boolean' }, z: { type: 'null' },
      },
    });
    const kinds = Object.fromEntries(r.children.map(c => [c.name, c.kind]));
    assert.deepStrictEqual(kinds, {
      o: 'object', a: 'array', s: 'string', n: 'number', i: 'number', b: 'boolean', z: 'null',
    });
  });

  test('infers object from properties and falls back to unknown', () => {
    const r = root({ properties: { o: { properties: {} }, u: { description: 'x' } } });
    assert.strictEqual(child(r, 'o').kind, 'object');
    assert.strictEqual(child(r, 'u').kind, 'unknown');
  });

  test('uses the first entry of a union type', () => {
    assert.strictEqual(child(root({ properties: { x: { type: ['string', 'null'] } } }), 'x').kind, 'string');
  });
});

suite('[F31-NFR-01][F31-NFR-03] buildOutline() — YAML sources', () => {
  test('outlines a YAML schema the same way', () => {
    const yaml = [
      'title: Person',
      'properties:',
      '  name:',
      '    type: string',
      '  address:',
      '    type: object',
      '    properties:',
      '      street:',
      '        type: string',
      'required:',
      '  - name',
    ].join('\n');
    const r = buildOutline(yaml, 'yaml')[0] as Node;
    assert.strictEqual(r.name, 'Person');
    assert.deepStrictEqual(names(r.children), ['name', 'address']);
    assert.match(child(r, 'name').detail, /required/);
    assert.deepStrictEqual(names(child(r, 'address').children), ['street']);
  });
});

suite('[F31-NFR-02] buildOutline() — totality and bounds', () => {
  test('never throws on arbitrary JSON documents', () => {
    fc.assert(
      fc.property(fc.jsonValue(), value => {
        buildOutline(JSON.stringify(value), 'json');
        return true;
      }),
      { numRuns: 200 },
    );
  });

  test('never throws on arbitrary text, JSON or YAML', () => {
    fc.assert(
      fc.property(fc.string(), text => {
        buildOutline(text, 'json');
        buildOutline(text, 'yaml');
        return true;
      }),
      { numRuns: 200 },
    );
  });

  test('terminates within the depth cap on a deeply nested schema', () => {
    let schema: Record<string, unknown> = { type: 'string' };
    for (let i = 0; i < 60; i++) { schema = { type: 'object', properties: { next: schema } }; }
    const nodes = buildOutline(JSON.stringify(schema), 'json');
    let depth = 0;
    let cursor: Node | undefined = nodes[0];
    while (cursor?.children.length) { cursor = cursor.children[0]; depth++; }
    assert.ok(depth <= 21, `depth ${depth} should stay within the cap`);
  });
});
