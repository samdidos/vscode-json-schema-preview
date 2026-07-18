import * as assert from 'assert';
import fc from 'fast-check';

const {
  collectSchemaProperties,
  collectDataPaths,
  computeCoverage,
  renderCoverageReport,
} = require('../../schemaCoverage');

const dataPaths = (schema: unknown): string[] =>
  collectSchemaProperties(schema).map((p: { dataPath: string }) => p.dataPath).sort();

suite('[F23-FR-04] collectSchemaProperties() — declared surface', () => {
  test('collects flat property names', () => {
    assert.deepStrictEqual(dataPaths({ properties: { a: {}, b: {} } }), ['a', 'b']);
  });

  test('recurses into nested object schemas', () => {
    const schema = { properties: { address: { type: 'object', properties: { street: {}, city: {} } } } };
    assert.deepStrictEqual(dataPaths(schema), ['address', 'address.city', 'address.street']);
  });

  test('descends array items with [] notation', () => {
    const schema = { properties: { items: { type: 'array', items: { properties: { tag: {} } } } } };
    assert.deepStrictEqual(dataPaths(schema), ['items', 'items[].tag']);
  });

  test('descends tuple (array-valued) items', () => {
    const schema = { properties: { pair: { items: [{ properties: { x: {} } }, { properties: { y: {} } }] } } };
    assert.deepStrictEqual(dataPaths(schema), ['pair', 'pair[].x', 'pair[].y']);
  });

  test('pulls properties out of allOf / anyOf / oneOf branches', () => {
    const schema = {
      allOf: [{ properties: { a: {} } }],
      anyOf: [{ properties: { b: {} } }],
      oneOf: [{ properties: { c: {} } }],
    };
    assert.deepStrictEqual(dataPaths(schema), ['a', 'b', 'c']);
  });

  test('follows same-document $ref into $defs', () => {
    const schema = {
      properties: { user: { $ref: '#/$defs/User' } },
      $defs: { User: { properties: { name: {} } } },
    };
    assert.deepStrictEqual(dataPaths(schema), ['user', 'user.name']);
  });

  test('guards against $ref cycles without looping forever', () => {
    const schema = {
      properties: { node: { $ref: '#/$defs/Node' } },
      $defs: { Node: { properties: { child: { $ref: '#/$defs/Node' } } } },
    };
    // Terminates; records node, node.child (the cycle stops there).
    assert.deepStrictEqual(dataPaths(schema), ['node', 'node.child']);
  });

  test('dedupes by data path (first definition wins)', () => {
    const schema = { allOf: [{ properties: { a: {} } }, { properties: { a: {} } }] };
    assert.deepStrictEqual(dataPaths(schema), ['a']);
  });

  test('escapes ~ and / in property names within the schema pointer', () => {
    const [prop] = collectSchemaProperties({ properties: { 'a/b~c': {} } });
    assert.strictEqual(prop.schemaPointer, '/properties/a~1b~0c');
    assert.strictEqual(prop.dataPath, 'a/b~c');
  });

  test('returns nothing for a non-object schema', () => {
    assert.deepStrictEqual(collectSchemaProperties(null), []);
    assert.deepStrictEqual(collectSchemaProperties('scalar'), []);
  });
});

suite('[F23-FR-05] collectDataPaths() — present surface', () => {
  test('records nested object keys', () => {
    const present = collectDataPaths({ a: 1, address: { street: 'x' } });
    assert.deepStrictEqual([...present].sort(), ['a', 'address', 'address.street']);
  });

  test('collapses array indices to []', () => {
    const present = collectDataPaths({ items: [{ tag: 't1' }, { tag: 't2' }] });
    assert.deepStrictEqual([...present].sort(), ['items', 'items[].tag']);
  });

  test('primitives and empty containers contribute no paths', () => {
    assert.strictEqual(collectDataPaths(42).size, 0);
    assert.strictEqual(collectDataPaths([]).size, 0);
    assert.strictEqual(collectDataPaths(null).size, 0);
  });
});

suite('[F23-FR-05][F23-FR-06] computeCoverage() — classification', () => {
  test('splits exercised vs unexercised and reports percent', () => {
    const schema = { properties: { a: {}, b: {} } };
    const r = computeCoverage(schema, [{ a: 1 }]);
    assert.strictEqual(r.total, 2);
    assert.strictEqual(r.exercised.length, 1);
    assert.strictEqual(r.unexercised.length, 1);
    assert.strictEqual(r.unexercised[0].dataPath, 'b');
    assert.strictEqual(r.percent, 50);
  });

  test('[F23-FR-03] unions coverage across multiple (JSONL) instances', () => {
    const schema = { properties: { a: {}, b: {} } };
    const r = computeCoverage(schema, [{ a: 1 }, { b: 2 }]);
    assert.strictEqual(r.unexercised.length, 0);
    assert.strictEqual(r.percent, 100);
  });

  test('a schema declaring no properties is 100% covered', () => {
    const r = computeCoverage({ type: 'string' }, ['hello']);
    assert.strictEqual(r.total, 0);
    assert.strictEqual(r.percent, 100);
  });

  test('nested and array paths are matched against the data', () => {
    const schema = {
      properties: {
        address: { properties: { street: {}, zip: {} } },
        items: { items: { properties: { tag: {} } } },
      },
    };
    const r = computeCoverage(schema, [{ address: { street: 'x' }, items: [{}] }]);
    const unused = r.unexercised.map((p: { dataPath: string }) => p.dataPath).sort();
    assert.deepStrictEqual(unused, ['address.zip', 'items[].tag']);
  });

  test('malformed inputs never throw', () => {
    assert.doesNotThrow(() => computeCoverage(undefined, [undefined]));
    assert.doesNotThrow(() => computeCoverage('nope', ['nope']));
  });
});

suite('[F23-FR-08][F23-NFR-02] renderCoverageReport() — markdown', () => {
  test('lists unexercised paths and the heuristic caveat', () => {
    const r = computeCoverage({ properties: { a: {}, b: {} } }, [{ a: 1 }]);
    const md = renderCoverageReport(r, 'data.json vs s.json');
    assert.match(md, /# Schema coverage — data.json vs s.json/);
    assert.match(md, /1 \/ 2 declared properties exercised \(50%\)/);
    assert.match(md, /## Unexercised properties \(1\)/);
    assert.match(md, /`b`/);
    assert.match(md, /Heuristic presence analysis/);
  });

  test('celebrates full coverage instead of an empty list', () => {
    const r = computeCoverage({ properties: { a: {} } }, [{ a: 1 }]);
    const md = renderCoverageReport(r, 'x');
    assert.match(md, /Every declared property is exercised/);
    assert.doesNotMatch(md, /## Unexercised/);
  });
});

suite('[F23-NFR-01] property: computeCoverage never throws', () => {
  test('handles arbitrary JSON schema/data pairs', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (schema, data) => {
        const r = computeCoverage(schema, [data]);
        return r.exercised.length + r.unexercised.length === r.total && r.percent >= 0 && r.percent <= 100;
      }),
    );
  });
});
