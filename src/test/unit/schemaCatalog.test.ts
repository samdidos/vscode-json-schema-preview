import * as assert from 'assert';
import {
  parseCatalog,
  globToRegExp,
  fileMatches,
  rankByFileMatch,
  type CatalogEntry,
} from '../../schemaCatalog';

suite('[F12-FR-06][F12-NFR-03] parseCatalog()', () => {
  test('parses well-formed entries', () => {
    const text = JSON.stringify({
      schemas: [
        { name: 'Package', description: 'npm package', url: 'https://x/package.json', fileMatch: ['package.json'] },
        { name: 'TSConfig', url: 'https://x/tsconfig.json' },
      ],
    });
    const entries = parseCatalog(text);
    assert.strictEqual(entries.length, 2);
    assert.deepStrictEqual(entries[0], {
      name: 'Package', description: 'npm package', url: 'https://x/package.json', fileMatch: ['package.json'],
    });
    assert.deepStrictEqual(entries[1], { name: 'TSConfig', url: 'https://x/tsconfig.json' });
  });

  test('skips malformed entries instead of aborting', () => {
    const text = JSON.stringify({
      schemas: [
        { name: 'Good', url: 'https://x/a.json' },
        { name: 'NoUrl' },
        { url: 'https://x/b.json' },
        42,
        null,
        { name: 'AlsoGood', url: 'https://x/c.json' },
      ],
    });
    const entries = parseCatalog(text);
    assert.deepStrictEqual(entries.map(e => e.name), ['Good', 'AlsoGood']);
  });

  test('drops non-string fileMatch members', () => {
    const text = JSON.stringify({ schemas: [{ name: 'X', url: 'u', fileMatch: ['a.json', 5, null] }] });
    assert.deepStrictEqual(parseCatalog(text)[0].fileMatch, ['a.json']);
  });

  test('throws on invalid JSON', () => {
    assert.throws(() => parseCatalog('{not json'));
  });

  test('throws when there is no schemas array', () => {
    assert.throws(() => parseCatalog(JSON.stringify({ nope: [] })));
  });
});

suite('globToRegExp() / fileMatches()', () => {
  test('* matches within a path segment only', () => {
    assert.ok(globToRegExp('*.json').test('a.json'));
    assert.ok(!globToRegExp('*.json').test('dir/a.json'));
  });
  test('** matches across segments', () => {
    assert.ok(globToRegExp('**/*.yml').test('.github/workflows/ci.yml'));
  });
  test('a basename pattern matches the basename of a path', () => {
    assert.ok(fileMatches(['*.json'], 'src/config.json'));
    assert.ok(fileMatches(['package.json'], 'package.json'));
  });
  test('a slash pattern matches the full path', () => {
    assert.ok(fileMatches(['.github/workflows/*.yml'], '.github/workflows/ci.yml'));
    assert.ok(!fileMatches(['.github/workflows/*.yml'], 'ci.yml'));
  });
  test('no patterns never matches', () => {
    assert.ok(!fileMatches(undefined, 'x.json'));
    assert.ok(!fileMatches([], 'x.json'));
  });
});

suite('[F12-FR-08] rankByFileMatch()', () => {
  const entries: CatalogEntry[] = [
    { name: 'A', url: 'a', fileMatch: ['*.toml'] },
    { name: 'B', url: 'b', fileMatch: ['*.json'] },
    { name: 'C', url: 'c' },
  ];
  test('partitions matching entries into suggested, preserving order', () => {
    const { suggested, rest } = rankByFileMatch(entries, 'config.json');
    assert.deepStrictEqual(suggested.map(e => e.name), ['B']);
    assert.deepStrictEqual(rest.map(e => e.name), ['A', 'C']);
  });
  test('empty suggested when nothing matches', () => {
    const { suggested, rest } = rankByFileMatch(entries, 'notes.md');
    assert.strictEqual(suggested.length, 0);
    assert.strictEqual(rest.length, 3);
  });
});
