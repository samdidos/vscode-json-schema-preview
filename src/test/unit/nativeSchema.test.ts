import * as assert from 'assert';
import {
  jsonValidationSources, catalogSources, matchNativeSchema, nativeSchemaLabel,
  type NativeSchemaSource,
} from '../../nativeSchema';

suite('[F04-FR-15] jsonValidationSources()', () => {
  test('extracts fileMatch/url from extension contributions (string or array fileMatch)', () => {
    const exts = [
      { packageJSON: { contributes: { jsonValidation: [
        { fileMatch: 'package.json', url: './schemas/package.json' },
        { fileMatch: ['tsconfig.json', 'tsconfig.*.json'], url: 'https://x/tsconfig.json' },
      ] } } },
      { packageJSON: { contributes: {} } },        // no jsonValidation
      { packageJSON: {} },                           // no contributes
      {},                                            // no packageJSON
    ];
    const sources = jsonValidationSources(exts);
    assert.strictEqual(sources.length, 2);
    assert.deepStrictEqual(sources[0], { fileMatch: ['package.json'], url: './schemas/package.json', origin: 'extension' });
    assert.deepStrictEqual(sources[1].fileMatch, ['tsconfig.json', 'tsconfig.*.json']);
  });

  test('skips entries without a string url', () => {
    const exts = [{ packageJSON: { contributes: { jsonValidation: [
      { fileMatch: 'a.json' },              // no url
      { fileMatch: 'b.json', url: 42 },     // non-string url
      { fileMatch: 'c.json', url: 'ok' },
    ] } } }];
    const sources = jsonValidationSources(exts as any);
    assert.strictEqual(sources.length, 1);
    assert.strictEqual(sources[0].url, 'ok');
  });
});

suite('[F04-FR-15] catalogSources()', () => {
  test('maps catalog entries to catalog-origin sources', () => {
    const sources = catalogSources([{ name: 'commitlint', url: 'https://json.schemastore.org/commitlintrc.json', fileMatch: ['**/.commitlintrc.json'] }]);
    assert.deepStrictEqual(sources, [{
      fileMatch: ['**/.commitlintrc.json'],
      url: 'https://json.schemastore.org/commitlintrc.json',
      name: 'commitlint',
      origin: 'catalog',
    }]);
  });
});

suite('[F04-FR-15] matchNativeSchema()', () => {
  const commitlint: NativeSchemaSource = {
    name: 'commitlint', url: 'https://json.schemastore.org/commitlintrc.json',
    fileMatch: ['**/.commitlintrc.json', '**/commitlint.config.json'], origin: 'catalog',
  };
  const pkg: NativeSchemaSource = { url: 'https://x/package.json', fileMatch: ['package.json'], origin: 'extension' };

  test('matches a SchemaStore catalog entry by fileMatch (the commitlint case)', () => {
    const m = matchNativeSchema('.commitlintrc.json', [pkg, commitlint]);
    assert.ok(m);
    assert.strictEqual(m!.name, 'commitlint');
    assert.strictEqual(m!.origin, 'catalog');
  });

  test('matches an extension contribution by basename', () => {
    const m = matchNativeSchema('package.json', [pkg, commitlint]);
    assert.strictEqual(m?.url, 'https://x/package.json');
  });

  test('returns undefined when nothing matches', () => {
    assert.strictEqual(matchNativeSchema('data.json', [pkg, commitlint]), undefined);
  });

  test('a source with no fileMatch never claims a file', () => {
    assert.strictEqual(matchNativeSchema('anything.json', [{ url: 'u', origin: 'extension' }]), undefined);
    assert.strictEqual(matchNativeSchema('anything.json', [{ url: 'u', fileMatch: [], origin: 'extension' }]), undefined);
  });

  test('returns the first matching source (extensions take precedence when listed first)', () => {
    const a: NativeSchemaSource = { url: 'first', fileMatch: ['x.json'], origin: 'extension' };
    const b: NativeSchemaSource = { url: 'second', fileMatch: ['x.json'], origin: 'catalog' };
    assert.strictEqual(matchNativeSchema('x.json', [a, b])?.url, 'first');
  });
});

suite('[F04-FR-15] nativeSchemaLabel()', () => {
  test('prefers the catalog name', () => {
    assert.strictEqual(nativeSchemaLabel({ url: 'https://x/y.json', name: 'commitlint', origin: 'catalog' }), 'commitlint');
  });
  test('falls back to the url basename (ignoring query/fragment)', () => {
    assert.strictEqual(nativeSchemaLabel({ url: 'https://x/schemas/tsconfig.json?v=1', origin: 'extension' }), 'tsconfig.json');
  });
});
