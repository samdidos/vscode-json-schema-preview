import * as assert from 'assert';
import * as vscodeMock from '../mocks/vscode';

const { SchemaOutlineProvider, registerSchemaOutline } = require('../../SchemaOutlineProvider');
const {
  SchemaRefactorProvider, SchemaRenameProvider, SchemaReferenceProvider, registerSchemaRefactorings,
} = require('../../SchemaRefactorProvider');
const { CompatCodeLensProvider, countBreaking, registerCompatCodeLens } = require('../../CompatCodeLensProvider');
const { suiteDiagnostics, registerSchemaTests, RUN_TESTS_COMMAND } = require('../../SchemaTestsCommand');
const { createWorkspaceIo, registerLanguageModelTools } = require('../../LanguageModelTools');
const { isInsideRoot } = require('../../pathSafety');

/** Minimal TextDocument stand-in with real offset/position arithmetic. */
function doc(text: string, opts: { languageId?: string; path?: string } = {}) {
  const languageId = opts.languageId ?? 'json';
  const path = opts.path ?? '/w/person.schema.json';
  return {
    languageId,
    version: 1,
    uri: { path, fsPath: path, scheme: 'file', toString: () => `file://${path}` },
    getText: (range?: { startLine: number; startChar: number; endLine: number; endChar: number }) => {
      if (!range) { return text; }
      const lines = text.split('\n');
      return lines[range.startLine]?.slice(range.startChar, range.endChar) ?? '';
    },
    positionAt: (offset: number) => {
      const before = text.slice(0, offset);
      const line = (before.match(/\n/g) ?? []).length;
      return new vscodeMock.Position(line, offset - (before.lastIndexOf('\n') + 1));
    },
    offsetAt: (position: { line: number; character: number }) => {
      const lines = text.split('\n');
      let offset = 0;
      for (let i = 0; i < position.line; i++) { offset += lines[i].length + 1; }
      return offset + position.character;
    },
  };
}

const SCHEMA_TEXT = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Person',
  type: 'object',
  properties: { name: { type: 'string' }, home: { $ref: '#/$defs/Address' } },
  required: ['name'],
  $defs: {
    Address: { type: 'object', properties: { street: { type: 'string' } } },
    Unused: { type: 'string' },
  },
}, null, 2);

const DATA_TEXT = JSON.stringify({ $schema: './person.schema.json', name: 'Ada' }, null, 2);

setup(() => vscodeMock.resetAll());

suite('[F31-FR-09] SchemaOutlineProvider — registration scope', () => {
  test('outlines a schema document', () => {
    const symbols = new SchemaOutlineProvider().provideDocumentSymbols(doc(SCHEMA_TEXT));
    assert.strictEqual(symbols.length, 1);
    assert.strictEqual(symbols[0].name, 'Person');
    assert.deepStrictEqual(symbols[0].children.map((s: { name: string }) => s.name), ['name', 'home', '$defs']);
  });

  test('returns nothing for a data file, leaving the editor\'s own outline alone', () => {
    assert.deepStrictEqual(
      new SchemaOutlineProvider().provideDocumentSymbols(doc(DATA_TEXT, { path: '/w/data.json' })),
      [],
    );
  });

  test('maps schema types onto symbol kinds', () => {
    const symbols = new SchemaOutlineProvider().provideDocumentSymbols(doc(SCHEMA_TEXT));
    const name = symbols[0].children.find((s: { name: string }) => s.name === 'name');
    assert.strictEqual(name.kind, vscodeMock.SymbolKind.String);
    assert.strictEqual(symbols[0].kind, vscodeMock.SymbolKind.File);
  });

  test('keeps the selection range inside the full range', () => {
    const symbols = new SchemaOutlineProvider().provideDocumentSymbols(doc(SCHEMA_TEXT));
    for (const child of symbols[0].children) {
      assert.ok(child.range.contains(child.selectionRange), `${child.name} has an out-of-range selection`);
    }
  });

  test('registers one document-symbol provider', () => {
    const context = { subscriptions: [] as unknown[], extension: undefined };
    registerSchemaOutline(context as never);
    assert.strictEqual(vscodeMock.languages.registerDocumentSymbolProvider.callCount, 1);
  });
});

suite('[F30-FR-13] SchemaRefactorProvider — code actions', () => {
  const provider = new SchemaRefactorProvider();
  const range = (offset: number) => {
    const position = doc(SCHEMA_TEXT).positionAt(offset);
    return { start: position, end: position };
  };

  test('offers inline on a $ref', () => {
    const actions = provider.provideCodeActions(doc(SCHEMA_TEXT), range(SCHEMA_TEXT.indexOf('"$ref"')));
    assert.ok(actions.some((a: { title: string }) => /Inline this \$ref/.test(a.title)));
  });

  test('offers extract inside an object subschema', () => {
    const actions = provider.provideCodeActions(doc(SCHEMA_TEXT), range(SCHEMA_TEXT.indexOf('"street"')));
    assert.ok(actions.some((a: { title: string }) => /Extract to \$defs/.test(a.title)));
  });

  test('offers removing unused definitions, counting them', () => {
    const actions = provider.provideCodeActions(doc(SCHEMA_TEXT), range(0));
    const action = actions.find((a: { title: string }) => /Remove 1 unused definition/.test(a.title));
    assert.ok(action, `expected a remove action, got ${actions.map((a: { title: string }) => a.title).join(', ')}`);
  });

  test('every action carries a command with its arguments', () => {
    for (const action of provider.provideCodeActions(doc(SCHEMA_TEXT), range(SCHEMA_TEXT.indexOf('"$ref"')))) {
      assert.ok(action.command?.command.startsWith('jsonschema.refactor.'));
      assert.ok(Array.isArray(action.command.arguments));
    }
  });

  test('offers nothing for a data file', () => {
    assert.deepStrictEqual(
      provider.provideCodeActions(doc(DATA_TEXT, { path: '/w/data.json' }), range(0)),
      [],
    );
  });
});

suite('[F30-FR-10] SchemaRenameProvider — the editor rename gesture', () => {
  const provider = new SchemaRenameProvider();
  const positionOf = (needle: string) => doc(SCHEMA_TEXT).positionAt(SCHEMA_TEXT.indexOf(needle));

  test('prepares a rename on a definition key', () => {
    const result = provider.prepareRename(doc(SCHEMA_TEXT), positionOf('"Address"'));
    assert.strictEqual(result.placeholder, 'Address');
  });

  test('prepares a rename from a $ref pointing at the definition', () => {
    const result = provider.prepareRename(doc(SCHEMA_TEXT), positionOf('"#/$defs/Address"'));
    assert.strictEqual(result.placeholder, 'Address');
  });

  test('refuses elsewhere', () => {
    assert.throws(() => provider.prepareRename(doc(SCHEMA_TEXT), positionOf('"title"')), /can be renamed/);
  });

  test('produces edits for the key and every reference', () => {
    const edit = provider.provideRenameEdits(doc(SCHEMA_TEXT), positionOf('"Address"'), 'Postal');
    assert.strictEqual(edit.edits.length, 2, 'the definition key plus its one reference');
    assert.ok(edit.edits.some((e: { newText: string }) => e.newText === '"Postal"'));
    assert.ok(edit.edits.some((e: { newText: string }) => e.newText === '"#/$defs/Postal"'));
  });

  test('strips quotes a user typed into the rename box', () => {
    const edit = provider.provideRenameEdits(doc(SCHEMA_TEXT), positionOf('"Address"'), '"Postal"');
    assert.ok(edit.edits.some((e: { newText: string }) => e.newText === '"Postal"'));
  });

  test('warns and yields no edit when the rename is refused', () => {
    const edit = provider.provideRenameEdits(doc(SCHEMA_TEXT), positionOf('"Address"'), 'Unused');
    assert.strictEqual(edit, undefined);
    assert.ok(vscodeMock.window.showWarningMessage.called);
  });

  test('yields nothing when the cursor is not on a definition', () => {
    assert.strictEqual(provider.provideRenameEdits(doc(SCHEMA_TEXT), positionOf('"title"'), 'X'), undefined);
  });
});

suite('[F30-FR-09] SchemaReferenceProvider — find all references', () => {
  const provider = new SchemaReferenceProvider();
  const positionOf = (needle: string) => doc(SCHEMA_TEXT).positionAt(SCHEMA_TEXT.indexOf(needle));

  test('returns the references, and the declaration when asked', () => {
    const withoutDecl = provider.provideReferences(
      doc(SCHEMA_TEXT), positionOf('"Address"'), { includeDeclaration: false },
    );
    const withDecl = provider.provideReferences(
      doc(SCHEMA_TEXT), positionOf('"Address"'), { includeDeclaration: true },
    );
    assert.strictEqual(withoutDecl.length, 1);
    assert.strictEqual(withDecl.length, 2);
  });

  test('returns nothing away from a definition', () => {
    assert.deepStrictEqual(
      provider.provideReferences(doc(SCHEMA_TEXT), positionOf('"title"'), { includeDeclaration: true }),
      [],
    );
  });
});

suite('[F30-FR-14] registerSchemaRefactorings — providers and diagnostics', () => {
  test('registers the providers, commands and diagnostic collection', () => {
    const collection = { set: () => undefined, delete: () => undefined, dispose: () => undefined };
    vscodeMock.languages.createDiagnosticCollection.returns(collection);
    const context = { subscriptions: [] as unknown[] };
    registerSchemaRefactorings(context as never);

    assert.ok(vscodeMock.languages.registerRenameProvider.called);
    assert.ok(vscodeMock.languages.registerReferenceProvider.called);
    assert.ok(vscodeMock.languages.registerCodeActionsProvider.called);
    const commands = vscodeMock.commands.registerCommand.getCalls().map(c => c.args[0]);
    assert.deepStrictEqual(commands.sort(), [
      'jsonschema.refactor.extractDefinition',
      'jsonschema.refactor.inlineRef',
      'jsonschema.refactor.removeUnusedDefinitions',
    ]);
  });
});

suite('[F26-FR-07] countBreaking — the lens value', () => {
  const base = JSON.stringify({ type: 'object', properties: { a: { type: 'string' } } });

  test('counts breaking changes against the baseline', () => {
    const next = JSON.stringify({ type: 'object', required: ['a'], properties: { a: { type: 'string' } } });
    assert.strictEqual(countBreaking(base, next, '/w/a.schema.json'), 1);
  });

  test('reports zero for a compatible change', () => {
    const next = JSON.stringify({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'number' } },
    });
    assert.strictEqual(countBreaking(base, next, '/w/a.schema.json'), 0);
  });

  test('reports nothing when the schema is unchanged', () => {
    assert.strictEqual(countBreaking(base, base, '/w/a.schema.json'), undefined);
  });

  test('reports nothing when either side does not parse', () => {
    assert.strictEqual(countBreaking('not json', base, '/w/a.schema.json'), undefined);
    assert.strictEqual(countBreaking(base, 'not json', '/w/a.schema.json'), undefined);
  });
});

suite('[F26-FR-08] CompatCodeLensProvider — never blocks typing', () => {
  test('returns no lens before the first computation completes', () => {
    vscodeMock.setConfig('jsonschema.compat', 'codeLens', true);
    const provider = new CompatCodeLensProvider();
    assert.deepStrictEqual(provider.provideCodeLenses(doc(SCHEMA_TEXT)), []);
    provider.dispose();
  });

  test('respects the disabling setting', () => {
    vscodeMock.setConfig('jsonschema.compat', 'codeLens', false);
    const provider = new CompatCodeLensProvider();
    assert.deepStrictEqual(provider.provideCodeLenses(doc(SCHEMA_TEXT)), []);
    provider.dispose();
  });

  test('returns no lens for a data file', () => {
    vscodeMock.setConfig('jsonschema.compat', 'codeLens', true);
    const provider = new CompatCodeLensProvider();
    assert.deepStrictEqual(provider.provideCodeLenses(doc(DATA_TEXT, { path: '/w/data.json' })), []);
    provider.dispose();
  });

  test('registers a CodeLens provider', () => {
    const context = { subscriptions: [] as unknown[] };
    registerCompatCodeLens(context as never);
    assert.strictEqual(vscodeMock.languages.registerCodeLensProvider.callCount, 1);
  });
});

suite('[F29-FR-11] suiteDiagnostics — failures on the failing case', () => {
  const SUITE = JSON.stringify({
    schema: './person.schema.json',
    valid: [{ instance: { name: 'Ada' } }, { instance: {} }],
  }, null, 2);

  test('positions a diagnostic on the failing case', () => {
    const diagnostics = suiteDiagnostics(SUITE, {
      total: 2, passed: 1, failed: 1,
      cases: [
        { name: 'valid[0]', expect: 'valid', pointer: '/valid/0', passed: true, keywords: [] },
        { name: 'valid[1]', expect: 'valid', pointer: '/valid/1', passed: false, message: 'boom', keywords: [] },
      ],
    });
    assert.strictEqual(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /valid\[1\]: boom/);
    assert.strictEqual(diagnostics[0].severity, vscodeMock.DiagnosticSeverity.Error);
    assert.strictEqual(diagnostics[0].code, 'schema-test');
    assert.ok(diagnostics[0].range.startLine > 0, 'the diagnostic lands on the case, not line 0');
  });

  test('falls back to the document start when the pointer cannot be located', () => {
    const diagnostics = suiteDiagnostics(SUITE, {
      total: 1, passed: 0, failed: 1,
      cases: [{ name: 'x', expect: 'valid', pointer: '/valid/99', passed: false, keywords: [] }],
    });
    assert.strictEqual(diagnostics[0].range.startLine, 0);
  });

  test('produces nothing when every case passed', () => {
    assert.deepStrictEqual(suiteDiagnostics(SUITE, { total: 1, passed: 1, failed: 0, cases: [
      { name: 'x', expect: 'valid', pointer: '/valid/0', passed: true, keywords: [] },
    ] }), []);
  });

  test('registers the run command', () => {
    vscodeMock.languages.createDiagnosticCollection.returns({ clear: () => undefined, set: () => undefined, dispose: () => undefined });
    const context = { subscriptions: [] as unknown[] };
    registerSchemaTests(context as never);
    const commands = vscodeMock.commands.registerCommand.getCalls().map(c => c.args[0]);
    assert.ok(commands.includes(RUN_TESTS_COMMAND));
  });
});

suite('[F33-FR-08][F33-FR-09] LanguageModelTools — workspace confinement', () => {
  test('confinement uses the one shared containment check (F29-FR-14)', () => {
    // Tools and schema-test suites resolve document-supplied paths through the
    // same helper, so there is one place the rule can be wrong.
    assert.strictEqual(isInsideRoot('/w', '/w/a.json'), true);
    assert.strictEqual(isInsideRoot('/w', '/etc/passwd'), false);
  });

  test('the workspace IO refuses to read outside the root', () => {
    const io = createWorkspaceIo('/w', '1.0.0');
    assert.throws(() => io.readFile('/etc/passwd'), /Refusing to read outside the workspace/);
  });

  test('the workspace IO refuses to fetch at all', async () => {
    const io = createWorkspaceIo('/w', '1.0.0');
    await assert.rejects(() => io.fetchText('https://x.test/s.json'), /do not fetch/);
  });

  test('the workspace IO refuses to walk outside the root', () => {
    assert.deepStrictEqual(createWorkspaceIo('/w', '1.0.0').walk('/etc'), []);
  });

  test('registration is a no-op when the host has no tool API', () => {
    const original = vscodeMock.lm.registerTool;
    // Simulate an older host: no registerTool on the API surface.
    (vscodeMock.lm as unknown as { registerTool?: unknown }).registerTool = undefined;
    const context = { subscriptions: [] as unknown[], extension: { packageJSON: { version: '1.0.0' } } };
    registerLanguageModelTools(context as never);
    assert.strictEqual(context.subscriptions.length, 0);
    (vscodeMock.lm as unknown as { registerTool?: unknown }).registerTool = original;
  });

  test('registers one tool per descriptor when the API is present', () => {
    const { AGENT_TOOLS } = require('../../agentTools');
    vscodeMock.lm.registerTool.returns({ dispose: () => undefined });
    const context = { subscriptions: [] as unknown[], extension: { packageJSON: { version: '1.0.0' } } };
    registerLanguageModelTools(context as never);
    assert.strictEqual(vscodeMock.lm.registerTool.callCount, AGENT_TOOLS.length);
    assert.deepStrictEqual(
      vscodeMock.lm.registerTool.getCalls().map(c => c.args[0]).sort(),
      AGENT_TOOLS.map((t: { name: string }) => t.name).sort(),
    );
  });
});
