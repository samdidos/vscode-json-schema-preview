import * as assert from 'assert';
import { normalise, matchesFile, dropPattern } from '../../SchemaBindingManager';

suite('normalise', () => {
  test('strips leading ./', () => {
    assert.strictEqual(normalise('./foo.json'), 'foo.json');
  });

  test('leaves path without ./ unchanged', () => {
    assert.strictEqual(normalise('foo.json'), 'foo.json');
  });

  test('leaves nested path without ./ unchanged', () => {
    assert.strictEqual(normalise('schemas/foo.json'), 'schemas/foo.json');
  });

  test('only strips a single leading ./', () => {
    assert.strictEqual(normalise('./schemas/foo.json'), 'schemas/foo.json');
  });

  test('empty string', () => {
    assert.strictEqual(normalise(''), '');
  });
});

suite('matchesFile', () => {
  test('matches exact path', () => {
    assert.strictEqual(matchesFile(['data.json'], 'data.json'), true);
  });

  test('matches when pattern has leading ./', () => {
    assert.strictEqual(matchesFile(['./data.json'], 'data.json'), true);
  });

  test('matches when file has leading ./', () => {
    assert.strictEqual(matchesFile(['data.json'], './data.json'), true);
  });

  test('matches when both have leading ./', () => {
    assert.strictEqual(matchesFile(['./data.json'], './data.json'), true);
  });

  test('returns false when no pattern matches', () => {
    assert.strictEqual(matchesFile(['other.json', 'more.json'], 'data.json'), false);
  });

  test('returns false for empty patterns array', () => {
    assert.strictEqual(matchesFile([], 'data.json'), false);
  });

  test('matches first of multiple patterns', () => {
    assert.strictEqual(matchesFile(['a.json', 'data.json', 'b.json'], 'data.json'), true);
  });
});

suite('dropPattern', () => {
  test('removes matching string pattern, returns undefined', () => {
    assert.strictEqual(dropPattern('data.json', 'data.json'), undefined);
  });

  test('returns undefined when pattern with ./ matches file', () => {
    assert.strictEqual(dropPattern('./data.json', 'data.json'), undefined);
  });

  test('no match — string returned unchanged', () => {
    assert.strictEqual(dropPattern('other.json', 'data.json'), 'other.json');
  });

  test('removes one from array, returns remaining string (not array)', () => {
    assert.strictEqual(dropPattern(['data.json', 'other.json'], 'data.json'), 'other.json');
  });

  test('removes one from array, returns remaining array when >1 left', () => {
    assert.deepStrictEqual(
      dropPattern(['a.json', 'data.json', 'b.json'], 'data.json'),
      ['a.json', 'b.json']
    );
  });

  test('removes all from array, returns undefined', () => {
    assert.strictEqual(dropPattern(['data.json'], 'data.json'), undefined);
  });

  test('no match in array — original returned', () => {
    assert.deepStrictEqual(
      dropPattern(['a.json', 'b.json'], 'data.json'),
      ['a.json', 'b.json']
    );
  });
});
