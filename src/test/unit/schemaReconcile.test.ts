import * as assert from 'assert';
import fc from 'fast-check';

const {
  collectDataEntries,
  reconcile,
  renderReconcileReport,
} = require('../../schemaCoverage');

const PERSON = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    address: { type: 'object', properties: { street: { type: 'string' } } },
  },
};

const paths = (result: { undeclared: Array<{ dataPath: string }> }): string[] =>
  result.undeclared.map(u => u.dataPath);

suite('[F23-FR-09] collectDataEntries() — observed paths and values', () => {
  test('records every path with the values seen at it', () => {
    const entries = collectDataEntries({ a: 1, b: { c: 'x' } });
    assert.deepStrictEqual([...entries.keys()].sort(), ['a', 'b', 'b.c']);
    assert.deepStrictEqual(entries.get('a'), [1]);
    assert.deepStrictEqual(entries.get('b.c'), ['x']);
  });

  test('collapses array indices and accumulates every element value', () => {
    const entries = collectDataEntries({ items: [{ tag: 'a' }, { tag: 'b' }] });
    assert.deepStrictEqual(entries.get('items[].tag'), ['a', 'b']);
  });

  test('returns nothing for scalars and empty containers', () => {
    assert.strictEqual(collectDataEntries(42).size, 0);
    assert.strictEqual(collectDataEntries(null).size, 0);
    assert.strictEqual(collectDataEntries([]).size, 0);
  });
});

suite('[F23-FR-09] reconcile() — undeclared-in-schema', () => {
  test('reports a path the data uses that the schema never declares', () => {
    const result = reconcile(PERSON, [{ name: 'Ada', nickname: 'A' }]);
    assert.deepStrictEqual(paths(result), ['nickname']);
  });

  test('reports nothing when the data stays within the declared surface', () => {
    assert.deepStrictEqual(paths(reconcile(PERSON, [{ name: 'Ada', address: { street: 'x' } }])), []);
  });

  test('reports only the topmost gap for a whole new nested object', () => {
    // `contact` is the gap; reporting each of its leaves too would be noise.
    const result = reconcile(PERSON, [{ contact: { email: 'a@b.c', phone: '1' } }]);
    assert.deepStrictEqual(paths(result), ['contact']);
  });

  test('reports a leaf added under a declared object', () => {
    const result = reconcile(PERSON, [{ address: { street: 'x', zip: '123' } }]);
    assert.deepStrictEqual(paths(result), ['address.zip']);
  });

  test('unions undeclared paths across several instances', () => {
    const result = reconcile(PERSON, [{ a: 1 }, { b: 2 }]);
    assert.deepStrictEqual(paths(result), ['a', 'b']);
  });

  test('counts occurrences across instances', () => {
    const result = reconcile(PERSON, [{ a: 1 }, { a: 2 }, { a: 3 }]);
    assert.strictEqual(result.undeclared[0].occurrences, 3);
  });

  test('sorts findings by path for a stable report', () => {
    assert.deepStrictEqual(paths(reconcile(PERSON, [{ z: 1, m: 2, a: 3 }])), ['a', 'm', 'z']);
  });

  test('treats an array element path as a child of the array property', () => {
    const schema = { properties: { items: { type: 'array', items: { properties: { tag: {} } } } } };
    const result = reconcile(schema, [{ items: [{ tag: 'a', extra: 1 }] }]);
    assert.deepStrictEqual(paths(result), ['items[].extra']);
  });
});

suite('[F23-FR-10] reconcile() — inferred types', () => {
  test('infers a scalar type from the observed values', () => {
    const result = reconcile(PERSON, [{ nickname: 'A' }]);
    assert.deepStrictEqual(result.undeclared[0].inferred, { type: 'string' });
  });

  test('infers an object shape for a new nested object', () => {
    const result = reconcile(PERSON, [{ contact: { email: 'a@b.c' } }]);
    const inferred = result.undeclared[0].inferred as Record<string, unknown>;
    assert.strictEqual(inferred.type, 'object');
    assert.ok(inferred.properties);
  });

  test('unions types observed across instances', () => {
    const result = reconcile(PERSON, [{ x: 1 }, { x: 'a' }]);
    const type = (result.undeclared[0].inferred as { type: unknown }).type;
    assert.ok(Array.isArray(type), `expected a union type, got ${JSON.stringify(type)}`);
  });

  test('still reports coverage alongside reconciliation', () => {
    const result = reconcile(PERSON, [{ name: 'Ada', extra: 1 }]);
    assert.strictEqual(result.coverage.total, 3);
    assert.deepStrictEqual(result.coverage.unexercised.map((p: { dataPath: string }) => p.dataPath).sort(), ['address', 'address.street']);
  });
});

suite('[F23-FR-10] renderReconcileReport() — report', () => {
  test('reports both directions', () => {
    const report = renderReconcileReport(reconcile(PERSON, [{ name: 'Ada', extra: 1 }]), 'person.json');
    assert.match(report, /Schema coverage — person\.json/);
    assert.match(report, /Unexercised properties/);
    assert.match(report, /Undeclared in the schema \(1\)/);
    assert.match(report, /`extra` — integer \(seen 1×\)/);
  });

  test('says so plainly when nothing is undeclared', () => {
    const report = renderReconcileReport(reconcile(PERSON, [{ name: 'Ada' }]), 'p');
    assert.match(report, /sets nothing the schema does not declare/);
  });

  test('renders a union type label', () => {
    const report = renderReconcileReport(reconcile(PERSON, [{ x: 1 }, { x: 'a' }]), 'p');
    assert.match(report, /`x` — (integer \| string|string \| integer)/);
  });
});

suite('[F23-NFR-01] reconcile() — totality', () => {
  test('never throws on arbitrary schema/data pairs', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.array(fc.jsonValue(), { maxLength: 4 }), (schema, data) => {
        reconcile(schema, data);
        return true;
      }),
      { numRuns: 200 },
    );
  });

  test('handles a schema that cannot be walked', () => {
    const result = reconcile(null, [{ a: 1 }]);
    assert.deepStrictEqual(paths(result), ['a']);
  });
});
