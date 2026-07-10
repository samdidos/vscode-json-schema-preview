import * as assert from 'assert';

const {
  tomlPositionContext,
  splitKeySegments,
  subschemaAt,
  keyCompletionsAt,
  valueCompletionsAt,
  serialiseTomlValue,
  tomlKeyAt,
  hoverMarkdownAt,
} = require('../../tomlIntellisense');

const noRefs = () => undefined;

/** Offset of the end of `needle`'s first occurrence in `text`. */
function after(text: string, needle: string): number {
  const idx = text.indexOf(needle);
  assert.ok(idx !== -1, `fixture must contain ${JSON.stringify(needle)}`);
  return idx + needle.length;
}

suite('[F19-NFR-01] tomlPositionContext — position → context mapping', () => {
  test('root of an empty document is key mode with an empty path', () => {
    const ctx = tomlPositionContext('', 0);
    assert.strictEqual(ctx.mode, 'key');
    assert.deepStrictEqual(ctx.tablePath, []);
    assert.deepStrictEqual(ctx.keyPath, []);
  });

  test('a partial key at the root keeps the path empty (the partial is the filter)', () => {
    const text = 'name = "x"\npo';
    const ctx = tomlPositionContext(text, text.length);
    assert.strictEqual(ctx.mode, 'key');
    assert.deepStrictEqual(ctx.tablePath, []);
    assert.deepStrictEqual(ctx.keyPath, []);
  });

  test('[F19-FR-03] a [table] header sets the table path', () => {
    const text = '[server.tls]\n';
    const ctx = tomlPositionContext(text, text.length);
    assert.deepStrictEqual(ctx.tablePath, ['server', 'tls']);
  });

  test('[F19-FR-03] a [[array-of-tables]] header sets the table path', () => {
    const text = '[[servers.pool]]\n';
    const ctx = tomlPositionContext(text, text.length);
    assert.deepStrictEqual(ctx.tablePath, ['servers', 'pool']);
  });

  test('quoted dotted header segments parse as TOML defines them', () => {
    const text = '[server."tls.internal"]\n';
    const ctx = tomlPositionContext(text, text.length);
    assert.deepStrictEqual(ctx.tablePath, ['server', 'tls.internal']);
  });

  test('a completed dotted key contributes to the key path', () => {
    const text = 'server.po';
    const ctx = tomlPositionContext(text, text.length);
    assert.deepStrictEqual(ctx.keyPath, ['server']);
  });

  test('a header being typed resets the table path (header paths are absolute)', () => {
    const text = '[outer]\na = 1\n[server.t';
    const ctx = tomlPositionContext(text, text.length);
    assert.deepStrictEqual(ctx.tablePath, []);
    assert.deepStrictEqual(ctx.keyPath, ['server']);
  });

  test('[F19-FR-04] after an unquoted = the mode is value with the line key', () => {
    const text = 'port = ';
    const ctx = tomlPositionContext(text, text.length);
    assert.strictEqual(ctx.mode, 'value');
    assert.deepStrictEqual(ctx.valueKeyPath, ['port']);
  });

  test('a dotted key on a value line resolves the full value key path', () => {
    const text = '[server]\ntls.mode = ';
    const ctx = tomlPositionContext(text, text.length);
    assert.strictEqual(ctx.mode, 'value');
    assert.deepStrictEqual(ctx.tablePath, ['server']);
    assert.deepStrictEqual(ctx.valueKeyPath, ['tls', 'mode']);
  });

  test('an = inside a string does not switch to value mode', () => {
    const text = '"key=name" ';
    const ctx = tomlPositionContext(text, text.length);
    assert.strictEqual(ctx.mode, 'key');
  });

  test('[F19-FR-03] existing keys in the current table are reported', () => {
    const text = 'name = "x"\n[server]\nport = 1\nho';
    const ctx = tomlPositionContext(text, text.length);
    assert.deepStrictEqual(ctx.tablePath, ['server']);
    assert.deepStrictEqual(ctx.existingKeys, ['port']);
  });

  test('existing keys still resolve when the cursor line does not parse', () => {
    const text = 'name = "x"\npo';
    const ctx = tomlPositionContext(text, text.length);
    assert.deepStrictEqual(ctx.existingKeys, ['name']);
  });

  test('existing keys in the latest [[array-of-tables]] element are reported', () => {
    const text = '[[pool]]\nhost = "a"\n[[pool]]\nport = 1\n';
    const ctx = tomlPositionContext(text, text.length);
    assert.deepStrictEqual(ctx.existingKeys, ['port']);
  });
});

suite('tomlIntellisense — splitKeySegments', () => {
  test('splits dotted keys and trims whitespace', () => {
    assert.deepStrictEqual(splitKeySegments('a.b . c').map((s: any) => s.name), ['a', 'b', 'c']);
  });

  test('keeps dots inside quoted segments', () => {
    assert.deepStrictEqual(splitKeySegments('"tls.internal".x').map((s: any) => s.name), ['tls.internal', 'x']);
  });

  test('handles escaped quotes in basic strings', () => {
    assert.deepStrictEqual(splitKeySegments('"a\\".b"').map((s: any) => s.name), ['a".b']);
  });
});

suite('[F19-FR-06] tomlIntellisense — subschemaAt', () => {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      server: {
        type: 'object',
        properties: {
          tls: { $ref: '#/$defs/tls' },
        },
      },
      pool: { type: 'array', items: { type: 'object', properties: { host: { type: 'string' } } } },
    },
    $defs: { tls: { type: 'object', properties: { cert: { type: 'string' } } } },
  };
  const resolve = (ref: string) =>
    ref === '#/$defs/tls' ? schema.$defs.tls : undefined;

  test('walks nested properties', () => {
    const sub: any = subschemaAt(schema, ['server'], resolve);
    assert.ok(sub.properties.tls);
  });

  test('resolves $refs along the path', () => {
    const sub: any = subschemaAt(schema, ['server', 'tls'], resolve);
    assert.ok(sub.properties.cert);
  });

  test('unwraps array items for [[array-of-tables]] paths', () => {
    const sub: any = subschemaAt(schema, ['pool'], resolve);
    assert.ok(sub.properties.host);
  });

  test('returns undefined off the schema', () => {
    assert.strictEqual(subschemaAt(schema, ['nope'], resolve), undefined);
  });

  test('a $ref cycle terminates instead of hanging', () => {
    const cyclic = { properties: { a: { $ref: '#/x' } } };
    const cycleResolver = () => ({ $ref: '#/x' });
    assert.strictEqual(subschemaAt(cyclic, ['a'], cycleResolver), undefined);
  });
});

suite('[F19-FR-03][F19-FR-05] tomlIntellisense — key completions', () => {
  const schema = {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', description: 'Display name.' },
      port: { type: 'integer', enum: [80, 443] },
    },
  };

  test('offers schema properties with description, type, and required flag', () => {
    const ctx = tomlPositionContext('', 0);
    const items: any[] = keyCompletionsAt(schema, ctx, noRefs);
    const names = items.map(i => i.name);
    assert.deepStrictEqual(names.sort(), ['name', 'port']);
    const name = items.find(i => i.name === 'name');
    assert.strictEqual(name.required, true);
    assert.strictEqual(name.description, 'Display name.');
    assert.strictEqual(name.typeLabel, 'string');
    assert.strictEqual(items.find(i => i.name === 'port').required, false);
  });

  test('omits keys already present in the table', () => {
    const text = 'name = "x"\n';
    const ctx = tomlPositionContext(text, text.length);
    const items: any[] = keyCompletionsAt(schema, ctx, noRefs);
    assert.deepStrictEqual(items.map(i => i.name), ['port']);
  });

  test('merges properties and required across allOf branches', () => {
    const merged = {
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
        { type: 'object', properties: { b: { type: 'number' } } },
      ],
    };
    const ctx = tomlPositionContext('', 0);
    const items: any[] = keyCompletionsAt(merged, ctx, noRefs);
    assert.deepStrictEqual(items.map(i => i.name).sort(), ['a', 'b']);
    assert.strictEqual(items.find(i => i.name === 'a').required, true);
  });

  test('returns nothing for a path outside the schema', () => {
    const text = '[unknown.table]\n';
    const ctx = tomlPositionContext(text, text.length);
    assert.deepStrictEqual(keyCompletionsAt(schema, ctx, noRefs), []);
  });
});

suite('[F19-FR-04] tomlIntellisense — value completions', () => {
  test('enum members serialise as TOML for their type', () => {
    const schema = { properties: { port: { enum: [80, 443] }, mode: { enum: ['a', 'b'] } } };
    const portText = 'port = ';
    const items: any[] = valueCompletionsAt(schema, tomlPositionContext(portText, portText.length), noRefs);
    assert.deepStrictEqual(items.map(i => i.text), ['80', '443']);
    const modeText = 'mode = ';
    const modeItems: any[] = valueCompletionsAt(schema, tomlPositionContext(modeText, modeText.length), noRefs);
    assert.deepStrictEqual(modeItems.map(i => i.text), ['"a"', '"b"']);
  });

  test('const and booleans are offered; null has no TOML form', () => {
    const schema = {
      properties: {
        kind: { const: 'fixed' },
        on: { type: 'boolean' },
        weird: { enum: [null, 1] },
      },
    };
    const kind = 'kind = ';
    assert.deepStrictEqual(
      valueCompletionsAt(schema, tomlPositionContext(kind, kind.length), noRefs).map((i: any) => i.text),
      ['"fixed"'],
    );
    const on = 'on = ';
    assert.deepStrictEqual(
      valueCompletionsAt(schema, tomlPositionContext(on, on.length), noRefs).map((i: any) => i.text),
      ['true', 'false'],
    );
    const weird = 'weird = ';
    assert.deepStrictEqual(
      valueCompletionsAt(schema, tomlPositionContext(weird, weird.length), noRefs).map((i: any) => i.text),
      ['1'],
    );
  });

  test('collects const/enum across oneOf branches, deduplicated', () => {
    const schema = {
      properties: {
        level: { oneOf: [{ const: 'info' }, { const: 'warn' }, { enum: ['warn', 'error'] }] },
      },
    };
    const text = 'level = ';
    const items: any[] = valueCompletionsAt(schema, tomlPositionContext(text, text.length), noRefs);
    assert.deepStrictEqual(items.map(i => i.text), ['"info"', '"warn"', '"error"']);
  });

  test('serialiseTomlValue covers the TOML-representable types only', () => {
    assert.strictEqual(serialiseTomlValue('a "quote"'), '"a \\"quote\\""');
    assert.strictEqual(serialiseTomlValue(42), '42');
    assert.strictEqual(serialiseTomlValue(true), 'true');
    assert.strictEqual(serialiseTomlValue(null), undefined);
    assert.strictEqual(serialiseTomlValue({ a: 1 }), undefined);
    assert.strictEqual(serialiseTomlValue(Infinity), undefined);
  });
});

suite('[F19-FR-07] tomlIntellisense — key hover', () => {
  const schema = {
    properties: {
      port: {
        title: 'Port',
        type: 'integer',
        description: 'TCP port to listen on.',
        enum: [80, 443],
        minimum: 1,
        maximum: 65535,
      },
      server: { type: 'object', properties: { host: { type: 'string', description: 'Host name.' } } },
    },
  };

  test('tomlKeyAt finds the key on a key-value line', () => {
    const text = 'port = 80';
    assert.deepStrictEqual(tomlKeyAt(text, 2), ['port']);
  });

  test('tomlKeyAt includes the table path', () => {
    const text = '[server]\nhost = "a"';
    assert.deepStrictEqual(tomlKeyAt(text, after(text, 'ho')), ['server', 'host']);
  });

  test('tomlKeyAt resolves the hovered segment of a dotted key', () => {
    const text = 'server.host = "a"';
    assert.deepStrictEqual(tomlKeyAt(text, 2), ['server']);
    assert.deepStrictEqual(tomlKeyAt(text, after(text, 'server.h')), ['server', 'host']);
  });

  test('tomlKeyAt resolves header segments to absolute paths', () => {
    const text = '[server]\n';
    assert.deepStrictEqual(tomlKeyAt(text, 3), ['server']);
  });

  test('tomlKeyAt returns undefined in a value or on blank text', () => {
    const text = 'port = 80\n';
    assert.strictEqual(tomlKeyAt(text, after(text, '= 8')), undefined);
    assert.strictEqual(tomlKeyAt(text, text.length), undefined);
  });

  test('hover markdown carries title, type, description, enum, and bounds', () => {
    const md: string = hoverMarkdownAt(schema, ['port'], noRefs)!;
    assert.match(md, /\*\*key\*\* `port`/);
    assert.match(md, /### Port/);
    assert.match(md, /\*\*type:\*\* `integer`/);
    assert.match(md, /TCP port to listen on/);
    assert.match(md, /`80`, `443`/);
    assert.match(md, /minimum: 1, maximum: 65535/);
  });

  test('hover returns undefined off the schema or for an empty path', () => {
    assert.strictEqual(hoverMarkdownAt(schema, ['nope'], noRefs), undefined);
    assert.strictEqual(hoverMarkdownAt(schema, [], noRefs), undefined);
  });
});
