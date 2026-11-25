import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscodeMock from '../mocks/vscode';

const {
  registerMcpServerDefinition, serverDefinitionSpec,
  MCP_PROVIDER_ID, MCP_PACKAGE, MCP_PACKAGE_VERSION, MCP_SERVER_LABEL,
} = require('../../McpServerDefinition');
const { confirm, CONFIRMATION_MS } = require('../../notify');
const { registerSchemaDiff } = require('../../SchemaDiffCommand');

const ROOT = path.join(__dirname, '..', '..', '..');

/** The checkout as it was authored: `ROOT` itself normally, the parent
 *  repository when the tests run from Stryker's sandbox copy
 *  (`<repo>/.stryker-tmp/sandbox-xxxxxx`, per stryker.config.json's default
 *  `tempDirName`).
 *
 *  Load-bearing for the source scan below, which is a lint over source *text*.
 *  Stryker instruments everything it mutates: string literals become
 *  `stryMutAct_9fa48(…) ? … : …` ternaries and a call spread over several
 *  lines collapses onto one. The sandbox therefore contains lines the authored
 *  sources never did — SchemaBundleCommand.ts's multi-line toast collapses into
 *  exactly the one-line shape this scan treats as an offender, even though it
 *  reports a stripped-keyword outcome rather than a bare confirmation and so is
 *  not what F34-FR-12 bans. That failed Stryker's initial test run, which aborts the
 *  whole mutation run before a single mutant is tested. Scanning the pristine
 *  sources makes the lint assert the same thing in both places, and costs
 *  nothing in mutation terms: file text is identical for every mutant, so this
 *  test can kill none of them either way.
 */
const CHECKOUT = ((): string => {
  const escaped = ROOT.replace(/[/\\]\.stryker-tmp[/\\]sandbox-[^/\\]+$/, '');
  return fs.existsSync(path.join(escaped, 'src')) ? escaped : ROOT;
})();

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
    assert.deepStrictEqual(spec.args, ['-y', `${MCP_PACKAGE}@${MCP_PACKAGE_VERSION}`, 'mcp']);
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

suite('[F33-FR-17] MCP server definition pins the CLI version', () => {
  test('npx is given an exact version, never a bare package name', () => {
    const [, pkgArg] = serverDefinitionSpec('1').args;
    assert.match(pkgArg, /^json-schema-toolkit@\d+\.\d+\.\d+$/);
  });

  test('the pinned version is the CLI package version', () => {
    assert.strictEqual(MCP_PACKAGE, cliPkg.name);
    assert.strictEqual(MCP_PACKAGE_VERSION, cliPkg.version);
  });
});

suite('[F33-FR-16] MCP Registry metadata', () => {
  const VENDORED = path.join(ROOT, 'cli', 'schema', 'server.schema.2025-12-11.json');
  const registrySchema = JSON.parse(fs.readFileSync(VENDORED, 'utf-8'));

  test('server.json declares the vendored registry schema and validates against it', () => {
    assert.strictEqual(serverJson.$schema, registrySchema.$id);
    // The registry schema is draft-07; strict off for its `example` annotations
    // and unregistered formats — the structure and limits are what we check.
    const Ajv = require('ajv').default;
    const validate = new Ajv({ allErrors: true, strict: false, logger: false }).compile(registrySchema);
    assert.ok(validate(serverJson), JSON.stringify(validate.errors, null, 2));
  });

  test('a stale or over-long manifest fails the schema check', () => {
    const Ajv = require('ajv').default;
    const validate = new Ajv({ allErrors: true, strict: false, logger: false }).compile(registrySchema);
    assert.ok(!validate({ ...serverJson, description: 'x'.repeat(101) }), '100-character description limit');
    const [npm] = serverJson.packages;
    // The 2025-07-09 manifest this replaced: registryType spelled registry_type.
    const stale = JSON.parse(JSON.stringify(npm).replace('"registryType"', '"registry_type"'));
    assert.ok(!validate({ ...serverJson, packages: [stale] }),
      'the retired snake_case field names must not pass');
  });

  test('server.json and package.json agree on name, package and version', () => {
    assert.strictEqual(serverJson.name, cliPkg.mcpName);
    assert.match(serverJson.name, /^io\.github\.samdidos\//);
    assert.strictEqual(serverJson.version, cliPkg.version);
    const [npm] = serverJson.packages;
    assert.strictEqual(npm.registryType, 'npm');
    assert.strictEqual(npm.identifier, cliPkg.name);
    assert.strictEqual(npm.version, cliPkg.version);
    assert.deepStrictEqual(npm.transport, { type: 'stdio' });
  });

  test('the registry entry launches the same subcommand the extension does', () => {
    const [npm] = serverJson.packages;
    assert.deepStrictEqual(npm.packageArguments.map((a: { value: string }) => a.value), ['mcp']);
    assert.ok(serverDefinitionSpec('x').args.includes('mcp'));
  });

  test('server.json ships with the npm package; the vendored schema does not', () => {
    assert.ok(cliPkg.files.includes('server.json'));
    assert.ok(!cliPkg.files.some((f: string) => f.startsWith('schema')));
  });

  test('the docs publish with the official mcp-publisher, never an npx package name', () => {
    const guide = fs.readFileSync(path.join(CHECKOUT, 'docs', 'guide', 'ai.md'), 'utf-8');
    assert.match(guide, /mcp-publisher login github/);
    assert.match(guide, /github\.com\/modelcontextprotocol\/registry\/releases/);
    assert.doesNotMatch(guide, /npx\s+(-y\s+)?(@modelcontextprotocol\/publisher|mcp-publisher)/);
  });
});

suite('[F33-FR-18] publish-cli.yml lists each CLI release in the MCP Registry', () => {
  const YAML = require('yaml');
  type Step = { name?: string; run?: string; uses?: string; 'working-directory'?: string };
  type Job = { needs?: string[]; if?: string; environment?: string; permissions?: Record<string, string>; env?: Record<string, string>; steps: Step[] };
  const workflow = YAML.parse(fs.readFileSync(path.join(CHECKOUT, '.github', 'workflows', 'publish-cli.yml'), 'utf-8'));
  const job: Job = workflow.jobs['publish-mcp-registry'];
  const runs = (): string[] => job.steps.map((s) => s.run ?? '');

  test('runs as its own job, after the CLI is staged, never on a dry run', () => {
    assert.ok(job, 'publish-cli.yml must define a publish-mcp-registry job');
    assert.deepStrictEqual(job.needs, ['resolve', 'publish-cli']);
    assert.strictEqual(job.if, "needs.resolve.outputs.ref != '' && !(github.event_name == 'workflow_dispatch' && inputs.dry_run)");
    assert.ok(!workflow.jobs['publish-cli'].steps.some((s: Step) => (s.run ?? '').includes('mcp-publisher')),
      'the registry publish must not be a step of the npm job');
  });

  test('refuses to publish until the staged version is approved and live on npm', () => {
    const check = runs().findIndex((r) => r.includes('npm view "json-schema-toolkit@${VERSION}" mcpName'));
    const login = runs().findIndex((r) => r.includes('mcp-publisher login'));
    assert.ok(check >= 0 && check < login, 'the live check must come before anything touches the registry');
    assert.match(runs()[check], /require\('\.\/cli\/server\.json'\)\.name/);
    assert.match(runs()[check], /::error::[^\n]*Approve the staged version[^\n]*re-run this job/);
    assert.match(runs()[check], /exit 1/);
  });

  test('runs in its own mcp-registry environment, not the npm one', () => {
    assert.strictEqual(job.environment, 'mcp-registry');
    assert.notStrictEqual(job.environment, workflow.jobs['publish-cli'].environment);
  });

  test('uses the official publisher at a pinned release, signature-verified before it runs', () => {
    assert.match(job.env?.MCP_PUBLISHER_VERSION ?? '', /^v\d+\.\d+\.\d+$/);
    const all = runs().join('\n');
    assert.match(all, /https:\/\/github\.com\/modelcontextprotocol\/registry\/releases\/download\/\$\{MCP_PUBLISHER_VERSION\}/);
    assert.doesNotMatch(all, /releases\/latest|npx|npm (exec|install)/);
    assert.match(all, /--certificate-identity "https:\/\/github\.com\/modelcontextprotocol\/registry\/\.github\/workflows\/release\.yml@refs\/tags\/\$\{MCP_PUBLISHER_VERSION\}"/);
    const verify = runs().findIndex((r) => r.includes('cosign verify-blob'));
    const login = runs().findIndex((r) => r.includes('mcp-publisher login'));
    const publish = runs().findIndex((r) => /mcp-publisher publish/.test(r));
    assert.ok(verify >= 0 && verify < login && login < publish, 'verify, then log in, then publish');
    assert.ok(job.steps.every((s) => !s.uses || /@[0-9a-f]{40}\b/.test(s.uses)), 'actions are SHA-pinned');
  });

  test('authenticates with GitHub OIDC and holds no other permission', () => {
    assert.ok(runs().some((r) => /mcp-publisher login github-oidc\b/.test(r)));
    assert.deepStrictEqual(job.permissions, { contents: 'read', 'id-token': 'write' });
    assert.ok(!JSON.stringify(job).includes('secrets.'), 'no stored registry credential');
    const publish = job.steps.find((s) => /mcp-publisher publish/.test(s.run ?? ''));
    assert.strictEqual(publish?.['working-directory'], 'cli', 'publishes cli/server.json');
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
    const src = path.join(CHECKOUT, 'src');
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
          // Belt and braces for CHECKOUT above: an instrumented line is not an
          // authored one, so it is never evidence of an offender.
          if (trimmed.includes('stryMutAct_')) { continue; }
          const isBare = trimmed.startsWith('vscode.window.showInformationMessage(')
            && trimmed.endsWith(');')
            && !trimmed.includes("',")
            && !trimmed.includes('`,');
          if (isBare && DONE_WORDS.some(w => trimmed.includes(w))) {
            offenders.push(`${path.relative(CHECKOUT, full)}: ${trimmed}`);
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

suite('S21 — Open VSX publishing', () => {
  const YAML = require('yaml');
  type Step = { name?: string; if?: string; run?: string; uses?: string; env?: Record<string, string> };
  type Job = { needs?: string[]; permissions?: Record<string, string>; steps: Step[] };
  const workflow = YAML.parse(fs.readFileSync(path.join(CHECKOUT, '.github', 'workflows', 'publish.yml'), 'utf-8'));
  const job: Job = workflow.jobs['publish-open-vsx'];
  const runs = (): string[] => job.steps.map((s) => s.run ?? '');

  test('[S21-SR-01] every release that reaches the Marketplace job is also published to Open VSX', () => {
    assert.ok(job, 'publish.yml must define a publish-open-vsx job');
    assert.ok(job.needs?.includes('publish'));
    assert.ok(runs().some((r) => /\bovsx@[^ ]+ publish json-schema-preview\.vsix/.test(r)));
  });

  test('[S21-SR-02] publishes the released, attested .vsix at a pinned ovsx version — never a rebuild', () => {
    const all = runs().join('\n');
    assert.match(all, /gh release download "\$TAG"[^\n]*json-schema-preview\.vsix/);
    assert.match(all, /gh attestation verify json-schema-preview\.vsix/);
    assert.match(all, /ovsx@\d+\.\d+\.\d+ /);
    assert.doesNotMatch(all, /vsce package|npm ci|npm run/);
    const verify = runs().findIndex((r) => r.includes('attestation verify'));
    const publish = runs().findIndex((r) => r.includes('ovsx@'));
    assert.ok(verify >= 0 && verify < publish, 'the attestation check must come before publishing');
  });

  test('[S21-SR-03] runs as its own job, skips with a warning without the token, and never hides a failure', () => {
    assert.ok(!workflow.jobs.publish.steps.some((s: Step) => (s.run ?? '').includes('ovsx')),
      'Open VSX must not be a step of the Marketplace job');
    const check = job.steps[0];
    assert.match(check.run ?? '', /::warning[^\n]*Open VSX/);
    assert.match(check.run ?? '', /-z "\$OVSX_PAT"/);
    for (const step of job.steps.slice(1)) {
      assert.strictEqual(step.if, "steps.token.outputs.present == 'true'", `${step.name ?? step.uses} must be skipped without the token`);
    }
    assert.ok(job.steps.every((s) => !('continue-on-error' in s)));
  });

  test('[S21-SR-04] the README links the Open VSX listing next to the Marketplace', () => {
    const readme = fs.readFileSync(path.join(CHECKOUT, 'README.md'), 'utf-8');
    // Compare whole link targets for equality rather than matching a URL
    // fragment anywhere in the text, which would also accept a lookalike host.
    const links = new Set([...readme.matchAll(/\]\((https:\/\/[^)\s]+)\)/g)].map(([, url]) => url));
    assert.ok(links.has('https://open-vsx.org/extension/samdidos/json-schema-preview'), 'Open VSX listing');
    assert.ok(links.has('https://marketplace.visualstudio.com/items?itemName=samdidos.json-schema-preview'), 'Marketplace listing');
  });

  test('[S21-SR-05] a manual "Open VSX only" run publishes an existing release without the Marketplace job', () => {
    const input = workflow.on.workflow_dispatch.inputs.open_vsx_only;
    assert.strictEqual(input.type, 'boolean');
    assert.strictEqual(input.default, false);
    assert.match(workflow.jobs.publish.if, /&& !inputs\.open_vsx_only$/, 'the Marketplace job is skipped');
    const gate = (job as Job & { if: string }).if.replace(/\s+/g, ' ');
    assert.match(gate, /^!cancelled\(\) && needs\.resolve-tag\.outputs\.tag != '' && /);
    assert.match(gate, /needs\.publish\.result == 'success'/, 'an ordinary release still waits for the Marketplace');
    assert.match(gate, /inputs\.open_vsx_only && needs\.publish\.result == 'skipped'/, 'a skipped Marketplace job only counts in Open VSX-only runs');
    assert.doesNotMatch(gate, /always\(\)/);
  });

  test('[S21-NFR-01] the job holds only read permissions and takes the token from a secret', () => {
    assert.deepStrictEqual(job.permissions, { contents: 'read', attestations: 'read' });
    const publish = job.steps.find((s) => (s.run ?? '').includes('ovsx@'));
    assert.strictEqual(publish?.env?.OVSX_PAT, '${{ secrets.OVSX_PAT }}');
  });
});

suite('S21 — CLI staged publishing', () => {
  const YAML = require('yaml');
  type Step = { name?: string; if?: string; run?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, string> };
  const text = fs.readFileSync(path.join(CHECKOUT, '.github', 'workflows', 'publish-cli.yml'), 'utf-8');
  const workflow = YAML.parse(text);
  const job: { environment: string; permissions: Record<string, string>; steps: Step[] } = workflow.jobs['publish-cli'];
  const runs = job.steps.map((s) => s.run ?? '').join('\n');
  /** The workflow without its comment lines, which explain `npm publish` rather than run it. */
  const directives = text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

  test('[S21-SR-06] stages with provenance and never publishes directly', () => {
    assert.match(runs, /npm stage publish --provenance --access public/);
    assert.doesNotMatch(runs.replace(/npm stage publish/g, ''), /npm publish/, 'a plain npm publish would go live without approval');
  });

  test('[S21-SR-06] authenticates through trusted publishing, with no stored token', () => {
    assert.strictEqual(job.permissions['id-token'], 'write');
    assert.doesNotMatch(directives, /NODE_AUTH_TOKEN|NPM_TOKEN|secrets\./);
    const setupNode = job.steps.find((s) => (s.uses ?? '').startsWith('actions/setup-node@'));
    assert.ok(setupNode && !('registry-url' in (setupNode.with ?? {})), 'registry-url would write a token-based .npmrc');
  });

  test('[S21-SR-06] installs an exact npm version that has `npm stage`', () => {
    const m = /npm install -g npm@(\d+)\.(\d+)\.(\d+)\b/.exec(runs);
    assert.ok(m, 'npm must be pinned to an exact version');
    const [major, minor] = [Number(m[1]), Number(m[2])];
    assert.ok(major > 11 || (major === 11 && minor >= 15), `npm ${m[1]}.${m[2]} predates npm stage (11.15.0)`);
    const install = runs.indexOf('npm install -g npm@');
    assert.ok(install >= 0 && install < runs.indexOf('npm stage publish'));
  });

  const resolveRun = (workflow.jobs.resolve.steps as Step[]).map((st) => st.run ?? '').join('\n');

  test('[S21-SR-07] runs in the npm environment, refuses a mismatched version, and offers a dry run', () => {
    assert.strictEqual(job.environment, 'npm');
    assert.deepStrictEqual(workflow.on.push.tags, ['cli-v*']);
    assert.match(resolveRun, /version="\$\{GITHUB_REF_NAME#cli-v\}"/);
    // Both a release and a hand-pushed tag are checked against cli/package.json.
    assert.strictEqual((resolveRun.match(/if \[ "\$cli_version" != "\$version" \]/g) ?? []).length, 2);
    assert.strictEqual(workflow.on.workflow_dispatch.inputs.dry_run.default, true);
    assert.match(runs, /npm stage publish --dry-run/);
  });

  test('[S21-SR-08] a release cut by release-please stages the CLI from its tag, then tags it cli-v', () => {
    assert.deepStrictEqual(workflow.on.workflow_run, { workflows: ['Release Please'], types: ['completed'] });
    // The release is detected from the release tag naming the commit release-please ran on.
    assert.match(resolveRun, /tag="v\$version"/);
    assert.match(resolveRun, /if \[ "\$tag_sha" != "\$HEAD_SHA" \]/);
    assert.strictEqual(workflow.jobs['publish-cli'].if, "needs.resolve.outputs.ref != ''");
    const tagJob = workflow.jobs['tag-cli'];
    assert.deepStrictEqual(tagJob.needs, ['resolve', 'publish-cli'], 'tag only what was staged');
    assert.deepStrictEqual(tagJob.permissions, { contents: 'write' }, 'the tagging job never holds the npm OIDC permission');
    assert.ok(!('id-token' in (workflow.jobs.resolve.permissions ?? {})) && !('environment' in tagJob));
    assert.match((tagJob.steps as Step[]).map((st) => st.run ?? '').join('\n'), /git push origin "refs\/tags\/\$TAG"/);
  });

  test('[S21-SR-08] every release PR bumps the CLI, its registry manifest and the MCP pin to the release version', () => {
    const config = JSON.parse(fs.readFileSync(path.join(CHECKOUT, '.github', 'release-please', 'config.json'), 'utf-8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(CHECKOUT, '.github', 'release-please', 'manifest.json'), 'utf-8'));
    assert.deepStrictEqual(Object.keys(config.packages), ['.'], 'one version for the extension and the CLI');
    assert.deepStrictEqual(config.packages['.']['extra-files'], [
      { type: 'json', path: 'cli/package.json', jsonpath: '$.version' },
      { type: 'json', path: 'cli/server.json', jsonpath: '$..version' },
      { type: 'generic', path: 'src/McpServerDefinition.ts' },
    ]);
    const source = fs.readFileSync(path.join(CHECKOUT, 'src', 'McpServerDefinition.ts'), 'utf-8');
    const marked = source.split('\n').filter((l) => l.includes('x-release-please-version'));
    assert.deepStrictEqual(marked, [`export const MCP_PACKAGE_VERSION = '${cliPkg.version}'; // x-release-please-version`],
      'the generic updater rewrites every version on a marked line, so only the pin may carry the marker');
    assert.strictEqual(cliPkg.version, manifest['.'], 'the CLI shares the extension version');
  });
});
