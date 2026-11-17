import * as assert from 'assert';
import fc from 'fast-check';
import { parse, stringify } from 'smol-toml';
import { scanToml, findTomlNode, locateTomlPath, type TomlNode } from '../../tomlLocator';
import { locateInstanceSpan, locateInstancePath } from '../../workspaceValidation';

const at = (text: string, segments: string[]) => {
  const span = locateTomlPath(text, segments);
  return span ? text.slice(span.start, span.end) : undefined;
};
const node = (text: string, segments: string[]) => findTomlNode(scanToml(text), segments);
const valueOf = (text: string, segments: string[]) => {
  const n = node(text, segments);
  return n?.value ? text.slice(n.value.start, n.value.end) : undefined;
};

suite('[F11-FR-20] tomlLocator — the exact key of an instance path', () => {
  test('a root key, and the right one of two keys that share a name', () => {
    const text = 'port = 1\n\n[server]\nport = 8080\nhost = "x"\n';
    assert.deepStrictEqual(locateTomlPath(text, ['port']), { start: 0, end: 4 });
    assert.deepStrictEqual(locateTomlPath(text, ['server', 'port']), { start: 19, end: 23 });
    assert.strictEqual(valueOf(text, ['server', 'port']), '8080');
    assert.strictEqual(valueOf(text, ['server', 'host']), '"x"');
  });

  test('a table is located at its name in the header', () => {
    const text = '[a]\nx = 1\n[a.b]\ny = 2\n';
    assert.deepStrictEqual(locateTomlPath(text, ['a']), { start: 1, end: 2 });
    assert.deepStrictEqual(locateTomlPath(text, ['a', 'b']), { start: 13, end: 14 });
    assert.strictEqual(at(text, ['a', 'b', 'y']), 'y');
  });

  test('a super-table declared after its sub-table is still found', () => {
    const text = '[a.b]\ny = 2\n[a]\nx = 1\n';
    assert.strictEqual(at(text, ['a', 'b', 'y']), 'y');
    assert.strictEqual(at(text, ['a', 'x']), 'x');
    assert.deepStrictEqual(locateTomlPath(text, ['a']), { start: 13, end: 14 });
  });

  test('array-of-tables elements are addressed by index', () => {
    const text = '[[item]]\nname = "a"\n\n[[item]]\nname = "b"\n[item.meta]\nk = 1\n';
    assert.strictEqual(valueOf(text, ['item', '0', 'name']), '"a"');
    assert.strictEqual(valueOf(text, ['item', '1', 'name']), '"b"');
    assert.strictEqual(at(text, ['item', '1', 'meta', 'k']), 'k');
    assert.strictEqual(node(text, ['item', '2']), undefined);
    assert.deepStrictEqual(locateTomlPath(text, ['item', '1']), { start: 23, end: 27 });
  });

  test('dotted keys create the tables they name', () => {
    const text = 'a.b.c = 1\na.d = 2\n';
    assert.deepStrictEqual(locateTomlPath(text, ['a', 'b', 'c']), { start: 4, end: 5 });
    assert.strictEqual(at(text, ['a', 'd']), 'd');
    assert.strictEqual(at(text, ['a']), 'a');
    assert.strictEqual(node(text, ['a', 'b', 'c'])?.statement, undefined);
  });

  test('quoted keys keep their quotes in the span and are addressed unquoted', () => {
    const text = '"a b" = 1\n\'c.d\' = 2\n"e\\"f" = 3\n["x y".z]\nk = 4\n';
    assert.strictEqual(at(text, ['a b']), '"a b"');
    assert.strictEqual(at(text, ['c.d']), "'c.d'");
    assert.strictEqual(at(text, ['e"f']), '"e\\"f"');
    assert.strictEqual(at(text, ['x y', 'z', 'k']), 'k');
  });

  test('inline tables and arrays are located element by element', () => {
    const text = 'point = { x = 1, y = { z = "q" } }\nlist = [ 10, "s", [1, 2], { a = true } ]\n';
    assert.strictEqual(at(text, ['point', 'x']), 'x');
    assert.strictEqual(valueOf(text, ['point', 'y', 'z']), '"q"');
    assert.strictEqual(valueOf(text, ['point']), '{ x = 1, y = { z = "q" } }');
    assert.strictEqual(at(text, ['list', '0']), '10');
    assert.strictEqual(at(text, ['list', '1']), '"s"');
    assert.strictEqual(at(text, ['list', '2', '1']), '2');
    assert.strictEqual(at(text, ['list', '3', 'a']), 'a');
    assert.strictEqual(node(text, ['list', '4']), undefined);
    assert.strictEqual(node(text, ['list', 'x']), undefined);
    assert.strictEqual(node(text, ['point', 'x', 'deeper']), undefined);
  });

  test('multi-line arrays, comments and every string form are skipped correctly', () => {
    const text = [
      '# a comment with key = "decoy"',
      'a = [',
      '  1, # one',
      '  2,',
      ']',
      'b = """',
      'c = "decoy" """',
      "d = '''",
      "e = 1'''",
      'f = "has # hash and \\" quote"  # trailing',
      "g = 'lit\\'",
      'h = """"quoted""""',
      'i = 1979-05-27 07:32:00',
      'j = 1',
      '',
    ].join('\n');
    assert.strictEqual(at(text, ['a', '1']), '2');
    assert.strictEqual(node(text, ['c']), undefined);
    assert.strictEqual(node(text, ['e']), undefined);
    assert.strictEqual(valueOf(text, ['f']), '"has # hash and \\" quote"');
    assert.strictEqual(valueOf(text, ['g']), "'lit\\'");
    assert.strictEqual(valueOf(text, ['h']), '""""quoted""""');
    assert.strictEqual(valueOf(text, ['i']), '1979-05-27 07:32:00');
    assert.strictEqual(valueOf(text, ['j']), '1');
  });

  test('statements own their whole line, and tables know where a new line goes', () => {
    const text = 'top = 1  # note\n\n[t]\n  x = 1\r\n  y = [\n    2,\n  ]\n\n[u]\n';
    const span = (segments: string[]) => {
      const s = node(text, segments)!.statement!;
      return text.slice(s.start, s.end);
    };
    assert.strictEqual(span(['top']), 'top = 1  # note\n');
    assert.strictEqual(span(['t', 'x']), '  x = 1\r\n');
    assert.strictEqual(span(['t', 'y']), '  y = [\n    2,\n  ]\n');
    const root = scanToml(text)!;
    assert.strictEqual(root.insertAt, 'top = 1  # note\n'.length);
    assert.strictEqual(text.slice(0, node(text, ['t'])!.insertAt), 'top = 1  # note\n\n[t]\n  x = 1\r\n  y = [\n    2,\n  ]\n');
    assert.strictEqual(node(text, ['u'])!.insertAt, text.length);
  });

  test('a document with no root pairs inserts root keys at the very start', () => {
    assert.strictEqual(scanToml('[a]\nx = 1\n')!.insertAt, 0);
    assert.strictEqual(scanToml('')!.insertAt, 0);
    assert.strictEqual(scanToml('a = 1')!.insertAt, 5);
  });

  test('inline and dotted tables have nowhere to insert a line', () => {
    const text = 'p = { x = 1 }\na.b = 2\n[t]\n';
    assert.strictEqual(node(text, ['p'])!.insertAt, undefined);
    assert.strictEqual(node(text, ['a'])!.insertAt, undefined);
    assert.strictEqual(typeof node(text, ['t'])!.insertAt, 'number');
    assert.strictEqual(node(text, ['p', 'x'])!.statement, undefined);
  });

  test('a path that does not exist, and text that is not TOML, locate nothing', () => {
    assert.strictEqual(locateTomlPath('a = 1\n', ['b']), undefined);
    assert.strictEqual(locateTomlPath('a = 1\n', ['a', 'b']), undefined);
    assert.strictEqual(findTomlNode(undefined, ['a']), undefined);
    assert.strictEqual(scanToml('a = "1" b = 2'), undefined, 'a statement must end its line');
    for (const bad of [
      'a = ', 'a 1', '= 1', '[a', '[[a]', 'a = "x', 'a = [1, 2', 'a = { b = 1', 'a = { b }',
      'a = """x', 'a = 1\n[a.b]\n', 'a = 1\n[[a]]\n', '[a]\n[[a]]\n',
      'a = [1]\n[[a]]\n', 'a."b', 'a. = 1',
    ]) {
      assert.strictEqual(scanToml(bad), undefined, JSON.stringify(bad));
    }
  });

  test('scanning is total on arbitrary text', () => {
    fc.assert(fc.property(fc.string(), (text) => {
      const root = scanToml(text);
      assert.ok(root === undefined || root.kind === 'table');
    }), { numRuns: 500 });
  });

  test('every path the real parser produces is located, at a key or value that reads back the same', () => {
    const key = fc.oneof(
      fc.stringMatching(/^[a-z][a-z0-9_-]{0,5}$/),
      fc.string({ minLength: 1, maxLength: 6 }).filter(k => !/[\u0000-\u001f\u007f]/.test(k)),
    );
    const scalar = fc.oneof(
      fc.integer({ min: -1000, max: 1000 }),
      fc.boolean(),
      fc.string({ maxLength: 12 }).filter(s => !/[\u0000-\u001f\u007f]/.test(s)),
    );
    const { tree } = fc.letrec(tie => ({
      tree: fc.dictionary(key, fc.oneof(
        { depthSize: 'small' },
        scalar,
        fc.array(scalar, { maxLength: 3 }),
        tie('tree'),
        fc.array(tie('tree'), { minLength: 1, maxLength: 2 }),
      ), { maxKeys: 4 }),
    }));

    const check = (text: string, root: TomlNode, value: unknown, path: string[]): void => {
      const found = findTomlNode(root, path);
      assert.ok(found, `located /${path.join('/')} in\n${text}`);
      if (Array.isArray(value)) {
        assert.strictEqual(found.kind, 'array');
        value.forEach((item, i) => check(text, root, item, [...path, String(i)]));
      } else if (value !== null && typeof value === 'object') {
        assert.strictEqual(found.kind, 'table');
        for (const [k, v] of Object.entries(value)) { check(text, root, v, [...path, k]); }
      } else {
        assert.strictEqual(found.kind, 'value');
        const literal = text.slice(found.value!.start, found.value!.end);
        assert.deepStrictEqual(parse(`v = ${literal}`).v, value);
      }
      if (path.length && found.key && !/^\d+$/.test(path[path.length - 1])) {
        const token = text.slice(found.key.start, found.key.end);
        assert.deepStrictEqual(Object.keys(parse(`${token} = 1`)), [path[path.length - 1]]);
      }
    };

    fc.assert(fc.property(tree, (value) => {
      const text = stringify(value);
      const root = scanToml(text);
      assert.ok(root, `scanned\n${text}`);
      check(text, root, parse(text), []);
    }), { numRuns: 300 });
  });
});

suite('[F11-FR-20] validation diagnostics land on the exact TOML key', () => {
  const text = 'name = "x"\n\n[server]\nname = 5\n\n[[job]]\nname = "a"\n[[job]]\nname = 7\n';

  test('a repeated key name resolves to the occurrence the error is about', () => {
    assert.strictEqual(locateInstancePath(text, '/name', 'toml'), 0);
    assert.strictEqual(locateInstancePath(text, '/server/name', 'toml'), 3);
    assert.strictEqual(locateInstancePath(text, '/job/1/name', 'toml'), 8);
    assert.deepStrictEqual(locateInstanceSpan(text, 'toml', '/server/name'), { start: 21, end: 25 });
  });

  test('a path the scanner cannot place falls back to the nearest key by name', () => {
    assert.strictEqual(locateInstancePath(text, '/server/missing', 'toml'), undefined);
    assert.strictEqual(locateInstancePath('a = 1\nport = 99\n', '/x/port', 'toml'), 1);
    assert.strictEqual(locateInstancePath('port = \n', '/port', 'toml'), 0);
  });
});
