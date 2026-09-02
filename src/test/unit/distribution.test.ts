import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscodeMock from '../mocks/vscode';

const {
  registerMcpServerDefinition, serverDefinitionSpec,
  MCP_PROVIDER_ID, MCP_PACKAGE, MCP_SERVER_LABEL,
} = require('../../McpServerDefinition');
const { confirm, CONFIRMATION_MS } = require('../../notify');
const { registerSchemaDiff } = require('../../SchemaDiffCommand');

const ROOT = path.join(__dirname, '..', '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const cliPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'cli', 'package.json'), 'utf-8'));
const serverJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'cli', 'server.json'), 'utf-8'));

setup(() => vscodeMock.resetAll());

suite('[F33-FR-15] MCP server definition provider — the Marketplace route', () => {
  test('the manifest contributes the provider under the shared id', () => {
    assert.deepStrictEqual(pkg.contributes.mcpServerDefinitionProviders, [
      { id: MCP_PROVIDER_ID, label: MCP_SERVER_LABEL },
    ]);
  });

  test('the definition launches the published CLI, not a bundled copy', () => {
    const spec = serverDefinitionSpec('1.2.3');
    assert.strictEqual(spec.command, 'npx');
    assert.deepStrictEqual(spec.args, ['-y', MCP_PACKAGE, 'mcp']);
    assert.strictEqual(spec.version, '1.2.3');
    assert.ok(!fs.existsSync(path.join(ROOT, 'dist', 'cli.js')), 'the CLI bundle must not ship in the .vsix');
  });

  test('registers on a capable host and provides one stdio definition', () => {
    const context = { subscriptions: [] as unknown[], extension: { packageJSON: { version: '1.2.3' } } };
    assert.strictEqual(registerMcpServerDefinition(context as never), true);
    assert.strictEqual(vscodeMock.lm.registerMcpServerDefinitionProvider.callCount, 1);
    const [id, provider] = vscodeMock.lm.registerMcpServerDefinitionProvider.firstCall.args;
    assert.strictEqual(serverDefinitionSpec('1.2.3').label, MCP_SERVER_LABEL);
    assert.strictEqual(id, MCP_PROVIDER_ID);
    const [definition] = provider.provideMcpServerDefinitions();
    assert.ok(definition instanceof vscodeMock.McpStdioServerDefinition);
    assert.strictEqual(definition.command, 'npx');
    assert.strictEqual(definition.version, '1.2.3');
    assert.strictEqual(context.subscriptions.length, 1);
  });

  test('is a no-op on a host without the API', () => {
    const original = vscodeMock.lm.registerMcpServerDefinitionProvider;
    (vscodeMock.lm as { registerMcpServerDefinitionProvider?: unknown }).registerMcpServerDefinitionProvider = undefined;
    const context = { subscriptions: [] as unknown[], extension: { packageJSON: { version: '1' } } };
    assert.strictEqual(registerMcpServerDefinition(context as never), false);
    assert.strictEqual(context.subscriptions.length, 0);
    (vscodeMock.lm as { registerMcpServerDefinitionProvider?: unknown }).registerMcpServerDefinitionProvider = original;
  });
});

suite('[F33-FR-16] MCP Registry metadata', () => {
  test('server.json and package.json agree on name, package and version', () => {
    assert.strictEqual(serverJson.name, cliPkg.mcpName);
    assert.match(serverJson.name, /^io\.github\.samdidos\//);
    assert.strictEqual(serverJson.version, cliPkg.version);
    const [npm] = serverJson.packages;
    assert.strictEqual(npm.registry_type, 'npm');
    assert.strictEqual(npm.identifier, cliPkg.name);
    assert.strictEqual(npm.version, cliPkg.version);
    assert.deepStrictEqual(npm.transport, { type: 'stdio' });
  });

  test('the registry entry launches the same subcommand the extension does', () => {
    const [npm] = serverJson.packages;
    assert.deepStrictEqual(npm.package_arguments.map((a: { value: string }) => a.value), ['mcp']);
    assert.ok(serverDefinitionSpec('x').args.includes('mcp'));
  });

  test('server.json ships with the npm package', () => {
    assert.ok(cliPkg.files.includes('server.json'));
  });
});

suite('[F34-FR-12] confirm() — quiet success confirmations', () => {
  test('uses a transient status-bar message, never a toast', () => {
    confirm('Schema bundled.');
    assert.ok(vscodeMock.window.setStatusBarMessage.calledOnce);
    const [text, timeout] = vscodeMock.window.setStatusBarMessage.firstCall.args;
    assert.match(text, /\$\(check\) Schema bundled\./);
    assert.strictEqual(timeout, CONFIRMATION_MS);
    assert.strictEqual(vscodeMock.window.showInformationMessage.callCount, 0);
  });

  test('no action-less success confirmation remains a toast in the sources', () => {
    const src = path.join(ROOT, 'src');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== 'test') { walk(full); } continue; }
        if (!full.endsWith('.ts')) { continue; }
        const DONE_WORDS = ['saved', 'bundled', 'dereferenced', 'copied', 'refreshed', 'removed', 'configured'];
        for (const line of fs.readFileSync(full, 'utf-8').split('\n')) {
          // A bare showInformationMessage whose text is a past-tense "done"
          // statement and which offers no button is the pattern F34-FR-12 bans.
          // Checked by scanning rather than a pattern: the obvious regex needs
          // two unbounded `[^,]*` runs, which is the shape CodeQL flags.
          const trimmed = line.trim();
          const isBare = trimmed.startsWith('vscode.window.showInformationMessage(')
            && trimmed.endsWith(');')
            && !trimmed.includes("',")
            && !trimmed.includes('`,');
          if (isBare && DONE_WORDS.some(w => trimmed.includes(w))) {
            offenders.push(`${path.relative(ROOT, full)}: ${trimmed}`);
          }
        }
      }
    };
    walk(src);
    assert.deepStrictEqual(offenders, []);
  });
});

suite('[F32-FR-12] the diff result offers migration notes only when AI is on', () => {
  const doc = {
    languageId: 'json',
    uri: { fsPath: '/w/api.schema.json', path: '/w/api.schema.json' },
    getText: () => JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object', required: ['a'], properties: { a: { type: 'string' } },
    }),
  };
  const baselineText = JSON.stringify({ type: 'object', properties: { a: { type: 'string' } } });

  async function runDiff(): Promise<string[]> {
    const context = { subscriptions: [] as unknown[] };
    vscodeMock.window.activeTextEditor = { document: doc };
    vscodeMock.window.showOpenDialog.resolves([{ fsPath: '/w/old.json' }]);
    // Baseline picker: choose "another file", which the command reads from disk.
    vscodeMock.window.showQuickPick.resolves({ id: 'file' });
    const fsMod = require('fs');
    const original = fsMod.readFileSync;
    fsMod.readFileSync = (p: string, enc?: unknown) => (p === '/w/old.json' ? baselineText : original(p, enc));
    try {
      registerSchemaDiff(context as never, { fetchText: async () => '' } as never);
      const handler = vscodeMock.commands.registerCommand.getCalls()
        .find(c => c.args[0] === 'jsonschema.diffSchema')!.args[1];
      await handler();
    } finally {
      fsMod.readFileSync = original;
    }
    const call = vscodeMock.window.showInformationMessage.getCalls().find(c => /Schema diff/.test(c.args[0]));
    assert.ok(call, 'the diff summary was shown');
    return call.args.slice(1);
  }

  test('offers only the report when assistance is disabled', async () => {
    assert.deepStrictEqual(await runDiff(), ['Open report']);
  });

  test('offers migration notes too when assistance is enabled, and forwards the computed diff', async () => {
    vscodeMock.setConfig('jsonschema.ai', 'enabled', true);
    vscodeMock.window.showInformationMessage.resolves('Migration notes (AI)');
    const actions = await runDiff();
    assert.deepStrictEqual(actions, ['Open report', 'Migration notes (AI)']);
    const forwarded = vscodeMock.commands.executeCommand.getCalls()
      .find(c => c.args[0] === 'jsonschema.ai.migrationNotes');
    assert.ok(forwarded, 'the AI command received the diff');
    const [, report, verdict, fileName] = forwarded.args;
    assert.match(report, /breaking/i);
    assert.match(verdict, /NOT backward-compatible|not backward/i);
    assert.strictEqual(fileName, 'api.schema.json');
  });
});
