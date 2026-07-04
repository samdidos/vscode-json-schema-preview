import * as assert from 'assert';
import {
  renderSchemaHtml,
  describeType,
  isToolingUnavailable,
} from '../../fallbackRenderer';

suite('describeType()', () => {
  test('string type', () => assert.strictEqual(describeType({ type: 'string' }), 'string'));
  test('union type array', () =>
    assert.strictEqual(describeType({ type: ['string', 'null'] }), 'string | null'));
  test('$ref', () =>
    assert.strictEqual(describeType({ $ref: '#/$defs/Foo' }), '$ref: #/$defs/Foo'));
  test('array with typed items', () =>
    assert.strictEqual(describeType({ type: 'array', items: { type: 'number' } }), 'array<number>'));
  test('enum without a type', () =>
    assert.strictEqual(describeType({ enum: [1, 2] }), 'enum'));
  test('inline object without a type', () =>
    assert.strictEqual(describeType({ properties: {} }), 'object'));
  test('unknown falls back to any', () => assert.strictEqual(describeType({}), 'any'));
  test('non-object input never throws', () => {
    assert.strictEqual(describeType(null), 'any');
    assert.strictEqual(describeType('x'), 'any');
    assert.strictEqual(describeType(undefined), 'any');
  });
});

suite('renderSchemaHtml()', () => {
  test('[S06-SR-04] emits the schema title as a top-level <h1>', () => {
    const html = renderSchemaHtml({ title: 'Person', type: 'object' });
    assert.match(html, /<h1>Person<\/h1>/);
  });

  test('[F01-FR-21] falls back to the filename, then a default, for the title', () => {
    assert.match(renderSchemaHtml({}, { filename: 'my.schema.json' }), /<h1>my\.schema\.json<\/h1>/);
    assert.match(renderSchemaHtml({}), /<h1>JSON Schema<\/h1>/);
  });

  test('[F01-FR-22] escapes schema-derived text so it cannot inject markup', () => {
    const html = renderSchemaHtml({
      title: '<script>alert(1)</script>',
      description: '<img src=x onerror=y>',
    });
    assert.ok(!html.includes('<script>alert(1)'), 'title must be escaped');
    assert.ok(!html.includes('<img src=x'), 'description must be escaped');
    assert.match(html, /&lt;script&gt;/);
  });

  test('[F01-FR-22] is self-contained: a static CSP, no <script>, inline styles', () => {
    const html = renderSchemaHtml({ title: 'X', properties: { a: { type: 'string' } } });
    assert.match(html, /Content-Security-Policy/);
    assert.ok(!/<script/i.test(html), 'fallback page must contain no scripts');
    assert.match(html, /<style>/);
  });

  test('renders a property row with name, type and description', () => {
    const html = renderSchemaHtml({
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'integer', description: 'the identifier' },
        name: { type: 'string' },
      },
    });
    assert.match(html, /<code>id<\/code>/);
    assert.match(html, /integer/);
    assert.match(html, /the identifier/);
    assert.match(html, /<code>name<\/code>/);
  });

  test('[S06-SR-07][F01-NFR-03] marks required with text, not colour alone', () => {
    const html = renderSchemaHtml({
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'integer' }, opt: { type: 'string' } },
    });
    // required column carries a textual "Yes" so it does not depend on colour
    assert.match(html, /Yes/);
  });

  test('[S06-SR-04] nested object properties become sub-headings', () => {
    const html = renderSchemaHtml({
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: { city: { type: 'string' } },
        },
      },
    });
    assert.match(html, /<h3>address<\/h3>/);
    assert.match(html, /<code>city<\/code>/);
  });

  test('a schema with no properties still renders a valid page', () => {
    const html = renderSchemaHtml({ title: 'Scalar', type: 'string' });
    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /<h1>Scalar<\/h1>/);
  });

  test('non-object schema input never throws', () => {
    assert.doesNotThrow(() => renderSchemaHtml(null));
    assert.doesNotThrow(() => renderSchemaHtml('not a schema'));
    assert.match(renderSchemaHtml(42), /<h1>JSON Schema<\/h1>/);
  });
});

suite('isToolingUnavailable()', () => {
  test('[F01-FR-21] true when the interpreter is missing (ENOENT)', () => {
    assert.ok(isToolingUnavailable('spawn python3 ENOENT'));
  });
  test('[F01-FR-21] true when the Python package is missing', () => {
    assert.ok(isToolingUnavailable('No module named json_schema_for_humans'));
  });
  test('[F01-FR-21] true when auto-install failed', () => {
    assert.ok(isToolingUnavailable('Could not install json-schema-for-humans automatically.'));
  });
  test('[F01-FR-21] false for an ordinary schema/generation error', () => {
    assert.ok(!isToolingUnavailable('invalid schema: expected object at line 3'));
  });
});
