import * as assert from 'assert';

// The extension's behaviour for these requirements is declared in
// package.json#contributes / #activationEvents / #capabilities — VS Code reads
// the manifest, so asserting the manifest IS the verification (no mock needed).
 
const pkg = require('../../../package.json');

const activationEvents: string[] = pkg.activationEvents ?? [];
const menus = pkg.contributes?.menus ?? {};
const commandPalette: any[] = menus.commandPalette ?? [];
const editorTitle: any[] = menus['editor/title'] ?? [];
const editorContext: any[] = menus['editor/context'] ?? [];
const explorerContext: any[] = menus['explorer/context'] ?? [];

const whenFor = (list: any[], command: string): string[] =>
  list.filter(m => m.command === command).map(m => m.when ?? '');

// ── Activation ─────────────────────────────────────────────────────────────────

suite('[F01-FR-01] activation events', () => {
  test('activates on json, jsonc, yaml, yml, and jsonl', () => {
    for (const lang of ['json', 'jsonc', 'yaml', 'yml', 'jsonl']) {
      assert.ok(activationEvents.includes(`onLanguage:${lang}`), `missing onLanguage:${lang}`);
    }
  });
});

suite('[F11-FR-01] TOML activation', () => {
  test('activates on toml', () => {
    assert.ok(activationEvents.includes('onLanguage:toml'));
  });
});

suite('[F11-FR-05] TOML dependency', () => {
  test('smol-toml is a production dependency', () => {
    assert.ok(pkg.dependencies?.['smol-toml'], 'smol-toml must be in dependencies');
  });
});

suite('[F18-NFR-03] quicktype-core version pin', () => {
  test('quicktype-core is pinned to an exact version (no ^/~ range)', () => {
    const spec = pkg.dependencies?.['quicktype-core'];
    assert.ok(spec, 'quicktype-core must be in dependencies');
    assert.match(spec, /^\d+\.\d+\.\d+$/, `"${spec}" must be an exact version — codegen determinism (F18-FR-09) depends on it`);
  });
});

// ── Bind Schema menus (F04) ─────────────────────────────────────────────────────

suite('[F04-FR-09] editor context menu — Bind Schema', () => {
  test('offers Bind Schema for supported data files (not schema files)', () => {
    const when = whenFor(editorContext, 'jsonschema.bindToCurrentFile');
    assert.strictEqual(when.length, 1);
    assert.match(when[0], /!jsonschema\.isJsonSchema/);
    for (const lang of ['json', 'jsonc', 'jsonl', 'yaml', 'yml']) {
      assert.ok(when[0].includes(`resourceLangId == ${lang}`), `context bind missing ${lang}`);
    }
  });
});

suite('[F04-FR-10] explorer context menu — Bind Schema', () => {
  test('offers Bind Schema for the required file extensions', () => {
    const when = whenFor(explorerContext, 'jsonschema.bindToCurrentFile');
    assert.strictEqual(when.length, 1);
    for (const ext of ['.json', '.jsonc', '.jsonl', '.yaml', '.yml']) {
      assert.ok(when[0].includes(`resourceExtname == ${ext}`), `explorer bind missing ${ext}`);
    }
  });
});

// ── Generate Schema (F06) ───────────────────────────────────────────────────────

suite('[F06-FR-01] inferSchema command availability', () => {
  test('is offered in the command palette', () => {
    assert.ok(commandPalette.some(m => m.command === 'jsonschema.inferSchema'));
  });
});

suite('[F06-FR-02] Generate Schema toolbar icon', () => {
  test('appears only for data files (!isJsonSchema)', () => {
    const when = whenFor(editorTitle, 'jsonschema.inferSchema');
    assert.strictEqual(when.length, 1);
    assert.match(when[0], /!jsonschema\.isJsonSchema/);
  });

  test('is never hidden on account of an existing binding', () => {
    const when = whenFor(editorTitle, 'jsonschema.inferSchema');
    assert.doesNotMatch(when[0], /hasSchemaBinding/);
  });
});

// ── Preview toolbar gating (F01) ────────────────────────────────────────────────

suite('[F01-FR-09] Preview toolbar icon gating', () => {
  test('the editor-title Preview icon requires jsonschema.isJsonSchema', () => {
    const when = whenFor(editorTitle, 'jsonschema.preview');
    assert.ok(when.length >= 1);
    assert.ok(when.every(w => /jsonschema\.isJsonSchema/.test(w) && !/!jsonschema\.isJsonSchema/.test(w)));
  });
});

// ── TOML menu scoping (F11) ─────────────────────────────────────────────────────

suite('[F11-FR-18] data-file menus include TOML', () => {
  test('Bind Schema and Generate Schema when-clauses list toml', () => {
    assert.match(whenFor(editorContext, 'jsonschema.bindToCurrentFile')[0], /resourceLangId == toml/);
    assert.match(whenFor(editorTitle, 'jsonschema.inferSchema')[0], /resourceLangId == toml/);
  });
});

suite('[F11-FR-19] schema-only commands exclude TOML', () => {
  test('preview, edit, and configure never target toml and require a schema file', () => {
    for (const cmd of ['jsonschema.preview', 'jsonschema.edit', 'jsonschema.configure']) {
      for (const when of whenFor(editorTitle, cmd)) {
        assert.ok(!when.includes('toml'), `${cmd} must not target toml`);
        assert.match(when, /jsonschema\.isJsonSchema/);
      }
    }
  });
});

// ── Workspace-trust / virtual-workspace capabilities (S02) ──────────────────────

suite('[S02-SR-01] untrusted-workspace capability', () => {
  test('declares limited support with a preview-disabled description', () => {
    const cap = pkg.capabilities?.untrustedWorkspaces;
    assert.strictEqual(cap?.supported, 'limited');
    assert.match(cap.description, /preview|disabled/i);
  });
});

suite('[S02-SR-02] virtual-workspace capability', () => {
  test('declares virtual workspaces unsupported', () => {
    assert.strictEqual(pkg.capabilities?.virtualWorkspaces?.supported, false);
  });
});
