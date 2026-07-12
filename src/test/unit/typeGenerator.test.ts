import * as assert from 'assert';
import * as ts from 'typescript';

const {
  generateTypeScript,
  generateCode,
  generateCodeFiles,
  concatenateGeneratedFiles,
  annotateSchemaForCodegen,
  sanitizeIdentifier,
  TARGET_LANGUAGES,
} = require('../../typeGenerator');

/** Compile generated code with the in-repo TypeScript compiler under
 *  `--strict` (F18-NFR-02) and return the diagnostics' messages. Parsed
 *  default-lib files are cached across calls — re-parsing lib.d.ts for every
 *  test is what would otherwise dominate the suite's runtime. */
const libFileCache = new Map<string, ts.SourceFile | undefined>();
function strictCompileErrors(code: string): string[] {
  const fileName = 'generated.ts';
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2020,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const readSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, ...rest) => {
    if (name === fileName) { return ts.createSourceFile(fileName, code, languageVersion); }
    if (!libFileCache.has(name)) { libFileCache.set(name, readSourceFile(name, languageVersion, ...rest)); }
    return libFileCache.get(name);
  };
  const program = ts.createProgram([fileName], options, host);
  return ts.getPreEmitDiagnostics(program)
    .map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

function assertCompiles(code: string): void {
  assert.deepStrictEqual(strictCompileErrors(code), [], `generated code must compile under --strict:\n${code}`);
}

suite('[F18-FR-03] typeGenerator — object mapping', function () {
  this.timeout(20000);
  test('required members are mandatory, others optional', async () => {
    const code = await generateTypeScript({
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' }, count: { type: 'integer' } },
      additionalProperties: false,
    }, 'config');
    assert.match(code, /name:\s*string;/);
    assert.match(code, /count\?:\s*number;/);
    assertCompiles(code);
  });

  test('additionalProperties: <schema> becomes an index signature', async () => {
    const code = await generateTypeScript({
      type: 'object',
      required: ['fixed'],
      properties: { fixed: { type: 'number' } },
      additionalProperties: { type: 'number' },
    }, 'bag');
    assert.match(code, /\[property: string\]: number;/);
    assertCompiles(code);
  });

  test('additionalProperties: false omits the index signature', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: { fixed: { type: 'string' } },
      additionalProperties: false,
    }, 'strict');
    assert.doesNotMatch(code, /\[property: string\]/);
    assertCompiles(code);
  });
});

suite('[F18-FR-04] typeGenerator — primitive & structural mapping', function () {
  this.timeout(20000);
  test('enum maps to a union of literal types', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: { mode: { enum: ['read', 'write'] } },
      additionalProperties: false,
    }, 'modes');
    assert.match(code, /"read"\s*\|\s*"write"/);
    assertCompiles(code);
  });

  test('string const maps to a literal type', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: { kind: { const: 'fixed' } },
      additionalProperties: false,
    }, 'consts');
    assert.match(code, /"fixed"/);
    assertCompiles(code);
  });

  test('non-string const widens with a comment naming the value', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: { version: { const: 2 } },
      additionalProperties: false,
    }, 'consts');
    assert.match(code, /version\?:\s*number;/);
    assert.match(code, /const: 2/);
    assertCompiles(code);
  });

  test('array maps to T[]', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    }, 'arr');
    assert.match(code, /tags\?:\s*string\[\];/);
    assertCompiles(code);
  });

  test('prefixItems tuple degrades to an element-union array with a tuple note', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: { pair: { type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }] } },
      additionalProperties: false,
    }, 'tup');
    assert.match(code, /Array<number \| string>|\(number \| string\)\[\]/);
    assert.match(code, /tuple of 2 element\(s\)/);
    assertCompiles(code);
  });

  test('oneOf / anyOf map to unions', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: {
        either: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        any: { anyOf: [{ type: 'boolean' }, { type: 'string' }] },
      },
      additionalProperties: false,
    }, 'unions');
    assert.match(code, /either\?:\s*number \| string;/);
    assert.match(code, /any\?:\s*boolean \| string;/);
    assertCompiles(code);
  });

  test('allOf merges the combined members into the declaration', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: {
        both: {
          allOf: [
            { type: 'object', properties: { a: { type: 'string' } } },
            { type: 'object', properties: { b: { type: 'number' } } },
          ],
        },
      },
      additionalProperties: false,
    }, 'merged');
    assert.match(code, /a\?:\s*string;/);
    assert.match(code, /b\?:\s*number;/);
    assertCompiles(code);
  });

  test('nullable type: [T, "null"] maps to T | null', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: { note: { type: ['string', 'null'] } },
      additionalProperties: false,
    }, 'nullable');
    assert.match(code, /null \| string|string \| null/);
    assertCompiles(code);
  });
});

suite('[F18-FR-05] typeGenerator — TSDoc', function () {
  this.timeout(20000);
  test('descriptions become TSDoc comments on declaration and member', async () => {
    const code = await generateTypeScript({
      type: 'object',
      description: 'Top-level thing.',
      properties: { name: { type: 'string', description: 'The display name.' } },
      additionalProperties: false,
    }, 'doc');
    assert.match(code, /\/\*\*[\s\S]*Top-level thing\.[\s\S]*\*\//);
    assert.match(code, /\/\*\*[\s\S]*The display name\.[\s\S]*\*\//);
    assertCompiles(code);
  });
});

suite('[F18-FR-06] typeGenerator — named declarations & recursion', function () {
  this.timeout(20000);
  // The input mirrors bundleSchema output: self-contained, refs local.
  test('a $defs entry referenced twice yields one named declaration referenced by name', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: {
        home: { $ref: '#/$defs/address' },
        work: { $ref: '#/$defs/address' },
      },
      additionalProperties: false,
      $defs: {
        address: {
          type: 'object',
          description: 'A postal address',
          required: ['city'],
          properties: { city: { type: 'string' } },
          additionalProperties: false,
        },
      },
    }, 'order');
    const declarations = code.match(/export interface Address\b/g) ?? [];
    assert.strictEqual(declarations.length, 1, code);
    assert.match(code, /home\?:\s*Address;/);
    assert.match(code, /work\?:\s*Address;/);
    assertCompiles(code);
  });

  test('a recursive schema yields a self-referencing named type and terminates', async () => {
    const code = await generateTypeScript({
      title: 'Person',
      type: 'object',
      properties: {
        name: { type: 'string' },
        children: { type: 'array', items: { $ref: '#/$defs/person' } },
      },
      additionalProperties: false,
      $defs: {
        person: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            children: { type: 'array', items: { $ref: '#/$defs/person' } },
          },
          additionalProperties: false,
        },
      },
    }, 'person');
    // Some named declaration must reference itself — recursion is expressed
    // through a type reference, not endless inlining.
    assert.match(code, /export interface (\w+) \{[^}]*children\?:\s*\1\[\];/s);
    assertCompiles(code);
  });
});

suite('[F18-FR-07] typeGenerator — naming', function () {
  this.timeout(20000);
  test('the root declaration is named after the schema title', async () => {
    const code = await generateTypeScript(
      { title: 'My Config!', type: 'object', properties: { x: { type: 'string' } }, additionalProperties: false },
      'some-file',
    );
    assert.match(code, /export interface MyConfig\b/);
  });

  test('falls back to the file stem when there is no title', async () => {
    const code = await generateTypeScript(
      { type: 'object', properties: { x: { type: 'string' } }, additionalProperties: false },
      'build-config',
    );
    assert.match(code, /export interface BuildConfig\b/);
  });

  test('an untitled $defs entry is named after its key', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: { first: { $ref: '#/$defs/lineItem' } },
      additionalProperties: false,
      $defs: {
        lineItem: { type: 'object', properties: { sku: { type: 'string' } }, additionalProperties: false },
      },
    }, 'cart');
    assert.match(code, /export interface LineItem\b/);
    assertCompiles(code);
  });

  test('sanitizeIdentifier produces valid PascalCase identifiers', () => {
    assert.strictEqual(sanitizeIdentifier('my config'), 'MyConfig');
    assert.strictEqual(sanitizeIdentifier('123 456'), 'Schema');
    assert.strictEqual(sanitizeIdentifier('kebab-case-name'), 'KebabCaseName');
    assert.strictEqual(sanitizeIdentifier(''), 'Schema');
    assert.strictEqual(sanitizeIdentifier('7zip'), 'Zip');
  });
});

suite('[F18-FR-08] typeGenerator — graceful degradation', function () {
  this.timeout(20000);
  test('pattern and bounds are named in a comment; output stays valid', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[a-z]+$' },
        age: { type: 'integer', minimum: 0, maximum: 150 },
      },
      additionalProperties: false,
    }, 'constrained');
    assert.match(code, /pattern: "\^\[a-z\]\+\$"/);
    assert.match(code, /minimum: 0/);
    assert.match(code, /maximum: 150/);
    assertCompiles(code);
  });

  test('if/then generates valid TypeScript with a comment noting the conditional', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: { kind: { type: 'string' } },
      if: { properties: { kind: { const: 'x' } } },
      then: { required: ['kind'] },
      additionalProperties: false,
    }, 'conditional');
    assert.match(code, /Unrepresented in the generated type:.*\bif\b/);
    assert.match(code, /\bthen\b/);
    assertCompiles(code);
  });

  test('format is stripped so date-time stays a string', async () => {
    const code = await generateTypeScript({
      type: 'object',
      properties: { at: { type: 'string', format: 'date-time' } },
      additionalProperties: false,
    }, 'timed');
    assert.match(code, /at\?:\s*string;/);
    assert.doesNotMatch(code, /\bDate\b/);
    assert.match(code, /format: "date-time"/);
    assertCompiles(code);
  });
});

suite('[F18-FR-09] typeGenerator — determinism', function () {
  this.timeout(20000);
  test('the same schema yields byte-identical output across runs', async () => {
    const schema = {
      title: 'Stable',
      type: 'object',
      required: ['b'],
      properties: {
        b: { type: 'string', description: 'b first' },
        a: { enum: ['x', 'y'] },
        nested: { $ref: '#/$defs/inner' },
      },
      $defs: { inner: { type: 'object', properties: { v: { type: 'number', minimum: 1 } } } },
    };
    const first = await generateTypeScript(schema, 'stable');
    const second = await generateTypeScript(structuredClone(schema), 'stable');
    assert.strictEqual(first, second);
  });
});

suite('[F18-NFR-01] typeGenerator — offline engine', function () {
  this.timeout(20000);
  test('an external address in a $ref is a hard error, never a fetch', async () => {
    await assert.rejects(
      generateTypeScript({
        type: 'object',
        properties: { x: { $ref: 'https://example.invalid/schema.json' } },
      }, 'remote'),
    );
  });
});

suite('[F18-NFR-02] typeGenerator — acceptance snapshot compiles under --strict', function () {
  this.timeout(20000);
  test('required + enum + twice-referenced $defs + descriptions', async () => {
    const code = await generateTypeScript({
      title: 'Order',
      description: 'A customer order.',
      type: 'object',
      required: ['id', 'status'],
      properties: {
        id: { type: 'string', description: 'Order id.' },
        status: { enum: ['open', 'shipped', 'closed'], description: 'Lifecycle state.' },
        billing: { $ref: '#/$defs/address' },
        shipping: { $ref: '#/$defs/address' },
      },
      additionalProperties: false,
      $defs: {
        address: {
          type: 'object',
          description: 'A postal address.',
          required: ['city'],
          properties: {
            city: { type: 'string', description: 'City name.' },
            zip: { type: 'string', pattern: '^[0-9]{5}$' },
          },
          additionalProperties: false,
        },
      },
    }, 'order');
    assert.match(code, /export interface Order\b/);
    assert.strictEqual((code.match(/export interface Address\b/g) ?? []).length, 1);
    assert.match(code, /\/\*\*/);
    assertCompiles(code);
  });
});

suite('typeGenerator — annotateSchemaForCodegen internals', function () {
  this.timeout(20000);
  test('does not mutate its input', () => {
    const input = { type: 'object', properties: { x: { type: 'string', pattern: 'a' } } };
    const copy = structuredClone(input);
    annotateSchemaForCodegen(input);
    assert.deepStrictEqual(input, copy);
  });

  test('appends the note to an existing description', () => {
    const out: any = annotateSchemaForCodegen({ type: 'string', pattern: 'x', description: 'Already documented.' });
    assert.match(out.description, /^Already documented\.\n\nUnrepresented in the generated type: pattern: "x"\.$/);
  });

  test('a property literally named "pattern" is not mistaken for a constraint', () => {
    const out: any = annotateSchemaForCodegen({
      type: 'object',
      properties: { pattern: { type: 'string' } },
    });
    assert.strictEqual(out.description, undefined);
    assert.strictEqual(out.properties.pattern.description, undefined);
  });

  test('data-carrying keywords (enum/const/examples/default) are never walked as schemas', () => {
    const out: any = annotateSchemaForCodegen({
      type: 'object',
      default: { pattern: 'looks-like-a-constraint' },
      examples: [{ minimum: 3 }],
      properties: { x: { type: 'string' } },
    });
    assert.strictEqual(out.default.description, undefined);
    assert.strictEqual(out.examples[0].description, undefined);
  });

  test('prefixItems moves to draft-07 items form, preserving the rest schema', () => {
    const out: any = annotateSchemaForCodegen({
      type: 'array',
      prefixItems: [{ type: 'string' }],
      items: { type: 'number' },
    });
    assert.deepStrictEqual(out.items, [{ type: 'string' }]);
    assert.deepStrictEqual(out.additionalItems, { type: 'number' });
    assert.strictEqual(out.prefixItems, undefined);
  });

  test('non-string enum members are noted', () => {
    const out: any = annotateSchemaForCodegen({ enum: ['a', 1] });
    assert.match(out.description, /enum: \["a",1\]/);
  });

  test('boolean and non-object nodes pass through untouched', () => {
    assert.strictEqual(annotateSchemaForCodegen(true), true);
    assert.strictEqual(annotateSchemaForCodegen(null), null);
    const out: any = annotateSchemaForCodegen({ type: 'object', additionalProperties: false });
    assert.strictEqual(out.additionalProperties, false);
  });
});

suite('[F18-FR-10] typeGenerator — additional target languages', function () {
  this.timeout(20000);

  const schema = {
    title: 'Person',
    type: 'object',
    required: ['id', 'name'],
    properties: {
      id: { type: 'integer', description: 'Unique id.' },
      name: { type: 'string' },
      role: { enum: ['admin', 'user'] },
      address: { $ref: '#/$defs/address' },
    },
    additionalProperties: false,
    $defs: {
      address: { type: 'object', properties: { city: { type: 'string' } }, additionalProperties: false },
    },
  };

  test('TypeScript is the first (default) target and generateTypeScript matches it', async () => {
    assert.strictEqual(TARGET_LANGUAGES[0].id, 'typescript');
    const viaWrapper = await generateTypeScript(schema, 'person');
    const viaTable = await generateCode(structuredClone(schema), 'person', TARGET_LANGUAGES[0]);
    assert.strictEqual(viaWrapper, viaTable);
  });

  // F18-FR-09/NFR-02 for every offered target: generation succeeds, names the
  // title-derived declaration, and is byte-stable across runs. (No in-repo
  // compilers exist for the non-TypeScript targets — see F18-NFR-02.)
  for (const target of TARGET_LANGUAGES as any[]) {
    test(`[F18-FR-09] ${target.label} output is non-empty, named, and byte-stable`, async () => {
      const first = await generateCode(structuredClone(schema), 'person', target);
      const second = await generateCode(structuredClone(schema), 'person', target);
      assert.ok(first.trim().length > 0, 'output must not be empty');
      assert.match(first, /Person/);
      assert.strictEqual(first, second, 'output must be byte-identical across runs');
    });
  }
});

suite('[F18-FR-10][F18-FR-11] typeGenerator — multi-file output (Java)', function () {
  this.timeout(20000);

  const schema = {
    title: 'Person',
    type: 'object',
    properties: {
      id: { type: 'integer' },
      address: { $ref: '#/$defs/address' },
    },
    additionalProperties: false,
    $defs: {
      address: { type: 'object', properties: { city: { type: 'string' } }, additionalProperties: false },
    },
  };
  const java = TARGET_LANGUAGES.find((t: any) => t.id === 'java');

  test('Java emits one file per class, top-level file first', async () => {
    const files: Map<string, string> = await generateCodeFiles(schema, 'person', java);
    assert.ok(files.size > 1, `expected multiple files, got ${files.size}`);
    const names = [...files.keys()];
    assert.ok(names.every(n => n.endsWith('.java')), `engine-given filenames: ${names}`);
    assert.strictEqual(names[0], 'Person.java', 'the top-level file comes first');
    assert.match(files.get('Person.java')!, /class Person/);
    assert.match(files.get('Address.java')!, /class Address/);
  });

  test('every other offered target emits a single file', async () => {
    for (const target of TARGET_LANGUAGES as any[]) {
      if (target.id === 'java') { continue; }
      const files: Map<string, string> = await generateCodeFiles(structuredClone(schema), 'person', target);
      assert.strictEqual(files.size, 1, `${target.label} should emit one file`);
    }
  });

  test('concatenateGeneratedFiles: single file is returned as-is, multi-file gets banners', () => {
    const single = new Map([['stdout', 'only-content\n']]);
    assert.strictEqual(concatenateGeneratedFiles(single, java), 'only-content\n');

    const multi = new Map([['A.java', 'class A {}\n'], ['B.java', 'class B {}\n']]);
    const joined = concatenateGeneratedFiles(multi, java);
    assert.match(joined, /^\/\/ A\.java\n\nclass A \{\}\n/);
    assert.match(joined, /\/\/ B\.java\n\nclass B \{\}\n/);
  });

  test('generateCode for Java is the banner-joined preview containing every class', async () => {
    const preview = await generateCode(structuredClone(schema), 'person', java);
    assert.match(preview, /\/\/ Person\.java/);
    assert.match(preview, /\/\/ Address\.java/);
    assert.match(preview, /class Person/);
    assert.match(preview, /class Address/);
  });
});
