import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscodeMock from '../mocks/vscode';

const {
  isJsonSchemaFile, looksLikeSchemaFileName, hasSchemaShape,
} = require('../../PreviewWebPanel');
const { getValidateOnSave } = require('../../settings');
const { AGENT_TOOLS } = require('../../agentTools');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf-8'));
const contributes = pkg.contributes;

const doc = (text: string, fsPath = '/w/data.json', languageId = 'json') => ({
  languageId,
  getText: () => text,
  uri: { path: fsPath, fsPath },
});

setup(() => vscodeMock.resetAll());

suite('[F34-FR-10][F01-FR-02] schema detection — file names', () => {
  test('recognises conventional schema file names', () => {
    for (const name of [
      '/w/order.schema.json', '/w/order.schema.yaml', '/w/order.schema.yml',
      '/w/schema.json', '/w/nested/dir/thing.schema.json', '/w/Order.Schema.JSON',
    ]) {
      assert.ok(looksLikeSchemaFileName(name), `${name} should look like a schema`);
    }
  });

  test('does not recognise ordinary data file names', () => {
    for (const name of [
      '/w/package.json', '/w/data.json', '/w/schema-notes.json',
      '/w/myschema.json', '/w/schema.test.json', '/w/config.yaml',
    ]) {
      assert.ok(!looksLikeSchemaFileName(name), `${name} should not look like a schema`);
    }
  });

  test('normalises Windows separators', () => {
    assert.ok(looksLikeSchemaFileName('C:\\work\\order.schema.json'));
  });

  test('a schema-named file with no $schema line is detected', () => {
    assert.strictEqual(
      isJsonSchemaFile(doc('{"properties":{"a":{"type":"string"}}}', '/w/order.schema.json')),
      true,
    );
  });

  test('detection survives a document that does not parse yet', () => {
    // The toolbar must not flicker off while a schema is being typed.
    assert.strictEqual(isJsonSchemaFile(doc('{ "properties": {', '/w/order.schema.json')), true);
    assert.strictEqual(isJsonSchemaFile(doc('{ "properties": {', '/w/data.json')), false);
  });
});

suite('[F34-FR-10] schema detection — structural heuristic', () => {
  test('recognises properties alongside a definitions container', () => {
    assert.strictEqual(hasSchemaShape({ properties: {}, $defs: {} }), true);
    assert.strictEqual(hasSchemaShape({ properties: {}, definitions: {} }), true);
  });

  test('recognises properties alongside type: object', () => {
    assert.strictEqual(hasSchemaShape({ type: 'object', properties: {} }), true);
  });

  test('rejects a bare properties key, which is common in ordinary config', () => {
    assert.strictEqual(hasSchemaShape({ properties: { a: 1 } }), false);
  });

  test('rejects non-objects and objects with no properties', () => {
    for (const value of [null, 42, 'x', [], { type: 'object' }, { $defs: {} }]) {
      assert.strictEqual(hasSchemaShape(value), false, `${JSON.stringify(value)} should not be a schema`);
    }
  });

  test('a schema-shaped document with an ordinary name is detected', () => {
    assert.strictEqual(
      isJsonSchemaFile(doc('{"type":"object","properties":{"a":{"type":"string"}}}', '/w/thing.json')),
      true,
    );
  });

  test('detects a schema-shaped YAML document', () => {
    const yaml = ['type: object', 'properties:', '  a:', '    type: string'].join('\n');
    assert.strictEqual(isJsonSchemaFile(doc(yaml, '/w/thing.yaml', 'yaml')), true);
  });

  test('detects a YAML document with $defs and properties', () => {
    const yaml = ['properties:', '  a: {}', '$defs:', '  A: {}'].join('\n');
    assert.strictEqual(isJsonSchemaFile(doc(yaml, '/w/thing.yaml', 'yaml')), true);
  });

  test('leaves ordinary YAML data alone', () => {
    assert.strictEqual(isJsonSchemaFile(doc('name: Ada\nage: 36', '/w/p.yaml', 'yaml')), false);
  });
});

suite('[F34-FR-11] schema detection — a bound data file is always data', () => {
  test('an inline binding wins over a schema-looking name', () => {
    assert.strictEqual(
      isJsonSchemaFile(doc('{"$schema":"./person.schema.json","name":"Ada"}', '/w/order.schema.json')),
      false,
    );
  });

  test('an inline binding wins over a schema-looking shape', () => {
    assert.strictEqual(
      isJsonSchemaFile(doc('{"$schema":"./s.json","type":"object","properties":{}}', '/w/a.json')),
      false,
    );
  });

  test('a meta-$schema still means the document is a schema', () => {
    assert.strictEqual(
      isJsonSchemaFile(doc('{"$schema":"https://json-schema.org/draft/2020-12/schema"}', '/w/a.json')),
      true,
    );
  });

  test('the same precedence holds for YAML', () => {
    assert.strictEqual(
      isJsonSchemaFile(doc('$schema: ./s.json\ntype: object\nproperties:\n  a: {}', '/w/a.schema.yaml', 'yaml')),
      false,
    );
  });

  test('JSONL is never a schema, whatever its name', () => {
    assert.strictEqual(isJsonSchemaFile(doc('{"a":1}', '/w/a.schema.json', 'jsonl')), false);
  });
});

suite('[F03-FR-17] validate-on-save setting', () => {
  test('defaults to off', () => {
    assert.strictEqual(getValidateOnSave(), 'off');
  });

  test('accepts bound and always', () => {
    vscodeMock.setConfig('jsonschema.validation', 'onSave', 'bound');
    assert.strictEqual(getValidateOnSave(), 'bound');
    vscodeMock.setConfig('jsonschema.validation', 'onSave', 'always');
    assert.strictEqual(getValidateOnSave(), 'always');
  });

  test('falls back to off for an unrecognised value', () => {
    vscodeMock.setConfig('jsonschema.validation', 'onSave', 'sometimes');
    assert.strictEqual(getValidateOnSave(), 'off');
  });

  test('is contributed with the documented default and enum', () => {
    const setting = contributes.configuration.properties['jsonschema.validation.onSave'];
    assert.strictEqual(setting.default, 'off');
    assert.deepStrictEqual(setting.enum, ['off', 'bound', 'always']);
    assert.strictEqual(setting.enumDescriptions.length, 3);
    assert.match(setting.markdownDescription, /silent/);
    assert.match(setting.markdownDescription, /never fetch/);
  });
});

const DOCS_HOST = 'samdidos.github.io';

/**
 * The hosts a markdown description actually links to.
 *
 * Neither `/samdidos\.github\.io/` nor `.includes('samdidos.github.io')` is a
 * host check — both are satisfied by `https://evil.example/samdidos.github.io`,
 * which is what CodeQL's js/regex/missing-regexp-anchor and
 * js/incomplete-url-substring-sanitization each say in turn. Parsing the URL
 * and comparing `hostname` is the check that was meant all along.
 *
 * Splitting on whitespace and markdown's link delimiters is deliberately not a
 * URL pattern: a regex that looks like one, used on a URL, is the shape those
 * queries flag. The delimiters matter — each description ends in a
 * `[label](url)` link, so `(` and `[` have to break the token too.
 */
function linkedHosts(description: string): string[] {
  return description
    .split(/[\s()[\]]+/)
    .filter(token => token.startsWith('https://') || token.startsWith('http://'))
    .flatMap(token => {
      try {
        return [new URL(token).hostname];
      } catch {
        return [];
      }
    });
}

suite('[F34-FR-01][F34-FR-02][F34-FR-03][F34-NFR-03] the walkthrough', () => {
  const walkthrough = contributes.walkthroughs?.[0];

  test('is contributed with the four onboarding steps', () => {
    assert.ok(walkthrough, 'no walkthrough is contributed');
    assert.deepStrictEqual(
      walkthrough.steps.map((s: { id: string }) => s.id),
      ['preview', 'validate', 'generate', 'private'],
    );
  });

  test('every step has a completion event tied to an observable command', () => {
    for (const step of walkthrough.steps) {
      assert.ok(step.completionEvents?.length, `${step.id} has no completion event`);
      for (const event of step.completionEvents) {
        assert.match(event, /^onCommand:jsonschema\./, `${step.id}: ${event} is not an observable command`);
      }
    }
  });

  test('every step links to the docs site and ships its media file', () => {
    for (const step of walkthrough.steps) {
      // `.some(=== )` rather than `.includes(...)`: this is an array of
      // hostnames, so the two are equivalent — but CodeQL reads any
      // `.includes(hostLiteral)` on URL-derived data as a substring check
      // (js/incomplete-url-substring-sanitization) and cannot see that the
      // receiver is an array. An explicit equality comparison is unambiguous
      // to both readers.
      assert.ok(
        linkedHosts(step.description).some(host => host === DOCS_HOST),
        `${step.id} has no docs link`,
      );
      const media = path.join(__dirname, '..', '..', '..', step.media.markdown);
      assert.ok(fs.existsSync(media), `${step.id}: missing ${step.media.markdown}`);
    }
  });

  test('[F34-FR-03] the docs-link check compares the host, not a substring', () => {
    // The regression this guards: both a substring match and an unanchored
    // regex accept a lookalike that merely mentions the docs host in its path.
    assert.deepStrictEqual(
      linkedHosts('[Open the guide](https://evil.example/samdidos.github.io/)'),
      ['evil.example'],
    );
    assert.deepStrictEqual(
      linkedHosts('[Open the guide](https://samdidos.github.io/vscode-json-schema-preview/guide/)'),
      [DOCS_HOST],
    );
    assert.deepStrictEqual(linkedHosts('no link here'), []);
  });
});

suite('[F34-FR-04][F34-FR-05] keybindings', () => {
  test('binds preview and validate to the documented chords', () => {
    const byCommand = Object.fromEntries(
      contributes.keybindings.map((k: { command: string }) => [k.command, k]),
    );
    assert.strictEqual(byCommand['jsonschema.preview'].key, 'ctrl+k v');
    assert.strictEqual(byCommand['jsonschema.preview'].mac, 'cmd+k v');
    assert.strictEqual(byCommand['jsonschema.validateFile'].key, 'ctrl+k j');
  });

  test('every binding is scoped by a when clause', () => {
    for (const binding of contributes.keybindings) {
      assert.ok(binding.when, `${binding.command} has no when clause`);
      assert.match(binding.when, /jsonschema\.isJsonSchema/);
    }
  });
});

suite('[F34-FR-06][F34-FR-07][F34-FR-08] menus', () => {
  test('the title bar shows at most three icons per file kind', () => {
    const navigation = contributes.menus['editor/title'].filter(
      (e: { group?: string }) => e.group?.startsWith('navigation'),
    );
    const schemaIcons = navigation.filter((e: { when: string }) => /&& jsonschema\.isJsonSchema/.test(e.when));
    const dataIcons = navigation.filter((e: { when: string }) => /&& !jsonschema\.isJsonSchema/.test(e.when));
    assert.ok(schemaIcons.length <= 3, `${schemaIcons.length} schema icons in the title bar`);
    assert.ok(dataIcons.length <= 3, `${dataIcons.length} data icons in the title bar`);
  });

  test('everything else lives under one submenu', () => {
    assert.deepStrictEqual(
      contributes.submenus.map((s: { id: string }) => s.id),
      ['jsonschema.schemaMenu'],
    );
    assert.ok(contributes.menus['jsonschema.schemaMenu'].length >= 10);
  });

  test('the submenu is grouped by purpose, in a stable order', () => {
    const groups = contributes.menus['jsonschema.schemaMenu'].map((e: { group: string }) => e.group.split('@')[0]);
    assert.deepStrictEqual([...new Set(groups)], ['1_view', '2_generate', '3_transform', '4_analyse', '5_ai']);
  });

  test('the submenu is reachable from the editor context menu', () => {
    assert.ok(contributes.menus['editor/context'].some(
      (e: { submenu?: string }) => e.submenu === 'jsonschema.schemaMenu',
    ));
  });

  test('every submenu entry names a contributed command', () => {
    const declared = new Set(contributes.commands.map((c: { command: string }) => c.command));
    for (const entry of contributes.menus['jsonschema.schemaMenu']) {
      assert.ok(declared.has(entry.command), `${entry.command} is not a contributed command`);
    }
  });
});

suite('[F34-FR-09] Command Palette visibility', () => {
  test('every contributed command has a palette entry', () => {
    const inPalette = new Set(contributes.menus.commandPalette.map((e: { command: string }) => e.command));
    for (const command of contributes.commands) {
      assert.ok(inPalette.has(command.command), `${command.command} has no commandPalette entry`);
    }
  });

  test('the diff-driven migration-notes command is hidden from the palette', () => {
    const entry = contributes.menus.commandPalette.find(
      (e: { command: string }) => e.command === 'jsonschema.ai.migrationNotes',
    );
    assert.strictEqual(entry.when, 'false', 'it takes a computed diff, so it is offered from the diff result');
  });
});

suite('[F33-FR-07] language model tools are generated from the shared table', () => {
  test('the manifest lists exactly the descriptor table', () => {
    assert.deepStrictEqual(
      contributes.languageModelTools.map((t: { name: string }) => t.name).sort(),
      AGENT_TOOLS.map((t: { name: string }) => t.name).sort(),
    );
  });

  test('every contributed tool carries the descriptor\'s own description and schema', () => {
    for (const descriptor of AGENT_TOOLS) {
      const contributed = contributes.languageModelTools.find(
        (t: { name: string }) => t.name === descriptor.name,
      );
      assert.strictEqual(contributed.modelDescription, descriptor.description);
      assert.deepStrictEqual(contributed.inputSchema, descriptor.inputSchema);
      assert.ok(contributed.canBeReferencedInPrompt);
      assert.ok(contributed.toolReferenceName);
    }
  });
});

suite('[F34-NFR-02][F34-NFR-01] marketplace metadata', () => {
  test('keywords cover the formats and capabilities people search for', () => {
    for (const keyword of ['json schema', 'yaml', 'toml', 'validation', 'mcp']) {
      assert.ok(pkg.keywords.includes(keyword), `missing keyword: ${keyword}`);
    }
  });

  test('every new command is contributed with a title and an icon', () => {
    for (const id of [
      'jsonschema.runSchemaTests',
      'jsonschema.refactor.extractDefinition',
      'jsonschema.refactor.inlineRef',
      'jsonschema.refactor.removeUnusedDefinitions',
      'jsonschema.ai.describeProperties',
      'jsonschema.ai.draftSchema',
      'jsonschema.ai.enrichSchema',
      'jsonschema.ai.explainDiagnostic',
      'jsonschema.ai.generateRealisticData',
      'jsonschema.ai.migrationNotes',
    ]) {
      const command = contributes.commands.find((c: { command: string }) => c.command === id);
      assert.ok(command, `${id} is not contributed`);
      assert.match(command.title, /^JSON Schema: /);
      assert.ok(command.icon, `${id} has no icon`);
    }
  });

  test('the lint rule list documents the two new rules', () => {
    const description = contributes.configuration.properties['jsonschema.lint.rules'].markdownDescription;
    assert.match(description, /valid-examples/);
    assert.match(description, /valid-default/);
  });
});
