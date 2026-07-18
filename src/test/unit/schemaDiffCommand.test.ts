import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from '../mocks/vscode';

const { registerSchemaDiff } = require('../../SchemaDiffCommand');
const { AuthRequiredError } = require('../../SchemaAuthManager');

function fakeAuth(fetchText?: (url: string) => Promise<string>) {
  return { fetchText: fetchText ?? (async () => '{}') } as any;
}

function activate(fsPath: string, text: string, languageId = 'json') {
  vscode.window.activeTextEditor = {
    document: { languageId, getText: () => text, uri: { fsPath, scheme: 'file' } },
  } as any;
}

/** Register the command and return its handler + the content-provider callback. */
function register(auth = fakeAuth()) {
  const context = { subscriptions: [] as any[] };
  registerSchemaDiff(context, auth);
  const handler = vscode.commands.registerCommand.args.find((a: any[]) => a[0] === 'jsonschema.diffSchema')![1];
  const provider = vscode.workspace.registerTextDocumentContentProvider.firstCall.args[1];
  return { handler, provider };
}

/** Point the git extension mock at a fixed HEAD content (or make it unavailable). */
function stubGit(headContent?: string) {
  vscode.extensions.getExtension.callsFake((id: string) => {
    if (id !== 'vscode.git') { return undefined; }
    return {
      isActive: true,
      exports: {
        getAPI: () => ({
          getRepository: () => headContent === undefined ? null : { show: async () => headContent },
        }),
      },
    };
  });
}

let dir: string;
setup(() => {
  vscode.resetAll();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jspreview-diff-'));
});
teardown(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

suite('[F15-FR-01] diffSchema — gating & registration', () => {
  test('registers a content provider and the command', () => {
    register();
    assert.ok(vscode.workspace.registerTextDocumentContentProvider.calledWith('jsonschema-diff'));
    const ids = vscode.commands.registerCommand.args.map((a: any[]) => a[0]);
    assert.ok(ids.includes('jsonschema.diffSchema'));
  });

  test('non-schema file shows an info message', async () => {
    const { handler } = register();
    activate('/ws/data.json', '{"just":"data"}');
    await handler();
    assert.ok(vscode.window.showInformationMessage.calledWith('Open a JSON Schema file to diff it.'));
  });
});

suite('[F15-FR-02][F15-FR-03] diffSchema — baselines', () => {
  test('offers Git HEAD when a committed version exists and reports breaking changes', async () => {
    stubGit(JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', required: ['a'] }));
    const { handler } = register();
    activate(path.join(dir, 's.json'), JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', required: ['a', 'b'] }));
    let offered: any[] = [];
    vscode.window.showQuickPick.callsFake(async (items: any[]) => { offered = items; return items.find((i: any) => i.id === 'head'); });
    vscode.window.showInformationMessage.resolves(undefined);
    await handler();
    assert.ok(offered.some((i: any) => i.id === 'head'), 'Git HEAD option offered');
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/1 breaking/));
    // F26-FR-05: the summary leads with the backward-compatibility verdict.
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/NOT backward-compatible/));
  });

  test('[F15-FR-03] hides Git HEAD when no repository/committed version', async () => {
    stubGit(undefined);
    const { handler } = register();
    activate(path.join(dir, 's.json'), JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    let offered: any[] = [];
    vscode.window.showQuickPick.callsFake(async (items: any[]) => { offered = items; return undefined; });
    await handler();
    assert.ok(!offered.some((i: any) => i.id === 'head'));
    assert.ok(offered.some((i: any) => i.id === 'file'));
    assert.ok(offered.some((i: any) => i.id === 'url'));
  });

  test('[F15-FR-11] identical schemas report no structural changes', async () => {
    stubGit(JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'object' }));
    const { handler } = register();
    activate(path.join(dir, 's.json'), JSON.stringify({ type: 'object', $schema: 'http://json-schema.org/draft-07/schema#' }));
    vscode.window.showQuickPick.callsFake(async (items: any[]) => items.find((i: any) => i.id === 'head'));
    await handler();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/No structural changes/));
  });

  test('diffs against a chosen workspace file', async () => {
    const basePath = path.join(dir, 'base.json');
    fs.writeFileSync(basePath, JSON.stringify({ type: 'object', properties: { a: {} } }));
    stubGit(undefined);
    const { handler } = register();
    activate(path.join(dir, 's.json'), JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: { a: {}, b: {} } }));
    vscode.window.showQuickPick.callsFake(async (items: any[]) => items.find((i: any) => i.id === 'file'));
    vscode.window.showOpenDialog.resolves([{ fsPath: basePath }]);
    vscode.window.showInformationMessage.resolves(undefined);
    await handler();
    assert.ok(vscode.window.showInformationMessage.calledWithMatch(/non-breaking/));
  });

  test('[F15-FR-02] a 401 on a remote baseline offers Configure Auth', async () => {
    stubGit(undefined);
    const auth = fakeAuth(async () => { throw new AuthRequiredError('https://corp/s.json', 401); });
    const { handler } = register(auth);
    activate(path.join(dir, 's.json'), JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
    vscode.window.showQuickPick.callsFake(async (items: any[]) => items.find((i: any) => i.id === 'url'));
    vscode.window.showInputBox.resolves('https://corp/s.json');
    vscode.window.showErrorMessage.resolves(undefined);
    await handler();
    assert.ok(vscode.window.showErrorMessage.calledWithMatch(/requires authentication/));
  });
});

suite('[F15-FR-09] diffSchema — report', () => {
  test('the "Open report" button opens a read-only virtual document with the report', async () => {
    stubGit(JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', required: ['a'] }));
    const { handler, provider } = register();
    activate(path.join(dir, 's.json'), JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', required: ['a', 'b'] }));
    vscode.window.showQuickPick.callsFake(async (items: any[]) => items.find((i: any) => i.id === 'head'));
    vscode.window.showInformationMessage.resolves('Open report');
    await handler();
    assert.ok(vscode.workspace.openTextDocument.called);
    const uri = vscode.workspace.openTextDocument.lastCall.args[0];
    const content = provider.provideTextDocumentContent(uri);
    assert.match(content, /## Breaking/);
    assert.match(content, /`\/required`/);
  });
});
