import * as sinon from 'sinon';

// ─── Per-section workspace config store ──────────────────────────────────────

const configStore: Record<string, Record<string, any>> = {};

export function setConfig(section: string, key: string, value: any): void {
  if (!configStore[section]) { configStore[section] = {}; }
  configStore[section][key] = value;
}

export function getStoredConfig(section: string, key: string): any {
  return configStore[section]?.[key];
}

// ─── Scope-differentiated config store ────────────────────────────────────────
// setConfig() above stores one value visible at every scope/resource — enough
// for most tests. Multi-root scope-resolution tests (e.g. a WorkspaceFolder-
// scoped setting that must only be visible for resources inside that folder)
// need Global/Workspace/WorkspaceFolder to genuinely differ per resource, so
// this second store layers scope-specific overrides on top of the legacy one.

interface ScopedEntry {
  globalValue?: any;
  workspaceValue?: any;
  workspaceFolderValues: Map<string, any>; // keyed by folder fsPath
}
const scopedStore: Record<string, Record<string, ScopedEntry>> = {};

export function setScopedConfig(
  section: string,
  key: string,
  scope: { global?: any; workspace?: any; workspaceFolder?: [string, any][] }
): void {
  if (!scopedStore[section]) { scopedStore[section] = {}; }
  const entry: ScopedEntry = scopedStore[section][key] ?? { workspaceFolderValues: new Map() };
  if ('global' in scope) { entry.globalValue = scope.global; }
  if ('workspace' in scope) { entry.workspaceValue = scope.workspace; }
  for (const [folderFsPath, value] of scope.workspaceFolder ?? []) {
    entry.workspaceFolderValues.set(folderFsPath, value);
  }
  scopedStore[section][key] = entry;
}

/** The workspace folder (from the mocked `workspace.workspaceFolders`) whose
 *  path contains `resource`, mirroring `vscode.workspace.getWorkspaceFolder`. */
function folderFsPathFor(resource: any): string | undefined {
  if (!resource || !_workspaceFolders) { return undefined; }
  const fsPath = typeof resource === 'string' ? resource : resource.fsPath;
  const matches = _workspaceFolders.filter((f: any) => fsPath.startsWith(f.uri.fsPath));
  matches.sort((a: any, b: any) => b.uri.fsPath.length - a.uri.fsPath.length);
  return matches[0]?.uri.fsPath;
}

function makeConfig(section: string, resource?: any) {
  if (!configStore[section]) { configStore[section] = {}; }
  const folderFsPath = folderFsPathFor(resource);
  return {
    get: <T>(key: string) => {
      const scoped = scopedStore[section]?.[key];
      if (scoped) {
        const folderValue = folderFsPath ? scoped.workspaceFolderValues.get(folderFsPath) : undefined;
        if (folderValue !== undefined) { return folderValue as T; }
        if (scoped.workspaceValue !== undefined) { return scoped.workspaceValue as T; }
        if (scoped.globalValue !== undefined) { return scoped.globalValue as T; }
      }
      return configStore[section]?.[key] as T | undefined;
    },
    update: (key: string, value: any) => {
      configStore[section][key] = value;
      return Promise.resolve();
    },
    has: (key: string) => key in configStore[section] || key in (scopedStore[section] ?? {}),
    inspect: (key: string) => {
      const scoped = scopedStore[section]?.[key];
      if (scoped) {
        return {
          globalValue: scoped.globalValue,
          workspaceValue: scoped.workspaceValue,
          workspaceFolderValue: folderFsPath ? scoped.workspaceFolderValues.get(folderFsPath) : undefined,
        };
      }
      const val = configStore[section]?.[key];
      if (val === undefined) { return undefined; }
      // Return the stored value for all scopes so tests that pre-set config
      // via setConfig() can exercise the read-modify-write path.
      return { workspaceValue: val, globalValue: val, workspaceFolderValue: val };
    },
  };
}

// ─── Shared objects ───────────────────────────────────────────────────────────

const _disposable = { dispose: sinon.stub() };

export const statusBarItem = {
  text: '',
  tooltip: undefined as string | undefined,
  command: undefined as string | { command: string; title: string; arguments?: unknown[] } | undefined,
  backgroundColor: undefined as unknown,
  show: sinon.stub(),
  hide: sinon.stub(),
  dispose: sinon.stub(),
};

// ─── Individual stubs ─────────────────────────────────────────────────────────

// window
const _createStatusBarItem        = sinon.stub();
const _onDidChangeActiveTextEditor = sinon.stub();
const _onDidChangeTextEditorVisibleRanges = sinon.stub();
const _showInformationMessage      = sinon.stub();
const _showErrorMessage            = sinon.stub();
const _showWarningMessage          = sinon.stub();
const _showQuickPick               = sinon.stub();
const _createQuickPick             = sinon.stub();
const _showInputBox                = sinon.stub();
const _showTextDocument            = sinon.stub();
const _showOpenDialog              = sinon.stub();
const _showSaveDialog              = sinon.stub();
const _createWebviewPanel          = sinon.stub();
const _withProgress                = sinon.stub();

// workspace
const _getWorkspaceFolder       = sinon.stub();
const _asRelativePath           = sinon.stub();
const _getConfiguration         = sinon.stub();
const _findFiles                = sinon.stub();
const _openTextDocument         = sinon.stub();
const _onDidChangeConfiguration = sinon.stub();
const _onDidSaveTextDocument    = sinon.stub();
const _applyEdit                = sinon.stub();

// commands
const _registerCommand  = sinon.stub();
const _executeCommand   = sinon.stub();
const _getCommands      = sinon.stub();

// workspace (additional listeners)
const _onDidOpenTextDocument    = sinon.stub();
const _onDidChangeTextDocument  = sinon.stub();
const _onDidCloseTextDocument   = sinon.stub();
const _registerTextDocumentContentProvider = sinon.stub();

// languages
const _createDiagnosticCollection       = sinon.stub();
const _registerCodeActionsProvider      = sinon.stub();
const _registerDefinitionProvider       = sinon.stub();
const _registerHoverProvider            = sinon.stub();
const _registerCompletionItemProvider   = sinon.stub();

// authentication
const _onDidChangeSessions = sinon.stub();
const _getSession          = sinon.stub();

// extensions
const _getExtension = sinon.stub();

// env
const _clipboardWriteText = sinon.stub();

const _allStubs: sinon.SinonStub[] = [
  statusBarItem.show, statusBarItem.hide, statusBarItem.dispose,
  _createStatusBarItem, _onDidChangeActiveTextEditor, _onDidChangeTextEditorVisibleRanges,
  _showInformationMessage, _showErrorMessage, _showWarningMessage,
  _showQuickPick, _createQuickPick, _showInputBox, _showTextDocument, _showOpenDialog, _showSaveDialog, _createWebviewPanel, _withProgress,
  _getWorkspaceFolder, _asRelativePath, _getConfiguration,
  _findFiles, _openTextDocument, _onDidChangeConfiguration, _onDidSaveTextDocument, _applyEdit,
  _onDidOpenTextDocument, _onDidChangeTextDocument, _onDidCloseTextDocument,
  _registerTextDocumentContentProvider,
  _createDiagnosticCollection, _registerCodeActionsProvider,
  _registerDefinitionProvider, _registerHoverProvider, _registerCompletionItemProvider,
  _onDidChangeSessions, _getSession,
  _getExtension,
  _registerCommand, _executeCommand, _getCommands,
  _clipboardWriteText,
];

function applyDefaults() {
  _createStatusBarItem.returns(statusBarItem);
  _onDidChangeActiveTextEditor.returns(_disposable);
  _onDidChangeTextEditorVisibleRanges.returns(_disposable);
  _showInformationMessage.resolves(undefined);
  _showErrorMessage.resolves(undefined);
  _showWarningMessage.resolves(undefined);
  _showQuickPick.resolves(undefined);
  _showInputBox.resolves(undefined);
  _showTextDocument.resolves(undefined);
  _showOpenDialog.resolves(undefined);
  _showSaveDialog.resolves(undefined);
  _createWebviewPanel.returns({
    title: '',
    webview: { html: '', onDidReceiveMessage: sinon.stub().returns(_disposable) },
    onDidDispose: sinon.stub().returns(_disposable),
  });
  _withProgress.callsFake((_opts: any, task: any) =>
    task({ report: () => {} }, { isCancellationRequested: false })
  );
  // Fresh QuickPick stand-in per call; tests drive selection by calling the
  // captured onDidAccept/onDidHide handlers after setting selectedItems.
  _createQuickPick.callsFake(() => {
    const qp: any = {
      title: '', placeholder: '', value: '',
      matchOnDescription: false, matchOnDetail: false, busy: false,
      items: [] as any[], selectedItems: [] as any[],
      show: sinon.stub(), hide: sinon.stub(), dispose: sinon.stub(),
      onDidAccept: (cb: () => void) => { qp._accept = cb; return _disposable; },
      onDidHide: (cb: () => void) => { qp._hide = cb; return _disposable; },
      onDidChangeValue: (_cb: (v: string) => void) => _disposable,
    };
    return qp;
  });
  _getWorkspaceFolder.returns(undefined);
  _asRelativePath.callsFake((uri: any, _inc?: boolean) =>
    typeof uri === 'string' ? uri : uri.fsPath
  );
  _getConfiguration.callsFake((section = '', resource?: any) => makeConfig(section as string, resource));
  _findFiles.resolves([]);
  _openTextDocument.resolves(undefined);
  _onDidChangeConfiguration.returns(_disposable);
  _onDidSaveTextDocument.returns(_disposable);
  _applyEdit.resolves(true);
  _onDidOpenTextDocument.returns(_disposable);
  _onDidChangeTextDocument.returns(_disposable);
  _onDidCloseTextDocument.returns(_disposable);
  _registerTextDocumentContentProvider.returns(_disposable);
  _createDiagnosticCollection.returns({
    delete: sinon.stub(), set: sinon.stub(), clear: sinon.stub(), dispose: sinon.stub(),
  });
  _registerCodeActionsProvider.returns(_disposable);
  _registerDefinitionProvider.returns(_disposable);
  _registerHoverProvider.returns(_disposable);
  _registerCompletionItemProvider.returns(_disposable);
  _onDidChangeSessions.returns(_disposable);
  _getSession.resolves(undefined);
  _getExtension.returns(undefined);
  // `extensions` is declared later in the module; this reset also runs once at
  // load time (before that declaration is initialised), so guard the access.
  if (typeof extensions !== 'undefined') { extensions.all = []; }
  _clipboardWriteText.resolves(undefined);
  _registerCommand.returns(_disposable);
  _executeCommand.resolves(undefined);
  _getCommands.resolves([]);
}

applyDefaults();

// ─── Reset helper (call in beforeEach) ───────────────────────────────────────

export function resetAll(): void {
  window.activeTextEditor = undefined;
  workspace.workspaceFolders = undefined;
  workspace.isTrusted = true;
  Object.keys(configStore).forEach(k => delete configStore[k]);
  Object.keys(scopedStore).forEach(k => delete scopedStore[k]);
  statusBarItem.text = '';
  statusBarItem.tooltip = undefined;
  statusBarItem.command = undefined;
  statusBarItem.backgroundColor = undefined;
  _allStubs.forEach(s => s.reset());
  applyDefaults();
}

// ─── VS Code API exports ──────────────────────────────────────────────────────

export const StatusBarAlignment = { Left: 1, Right: 2 };
export const QuickPickItemKind  = { Separator: -1, Default: 0 };
export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
export const ViewColumn = { One: 1, Two: 2, Three: 3 };

export const Uri = {
  file: (p: string) => ({ fsPath: p, scheme: 'file', toString: () => `file://${p}` }),
  joinPath: (base: any, ...parts: string[]) =>
    ({ fsPath: `${base.fsPath}/${parts.join('/')}`, scheme: 'file' }),
  parse: (uriString: string) =>
    uriString.startsWith('file://')
      ? { fsPath: uriString.slice('file://'.length), scheme: 'file', toString: () => uriString }
      : { fsPath: uriString, scheme: uriString.split(':')[0], toString: () => uriString },
};

let _activeEditor: any = undefined;
export const window = {
  get activeTextEditor() { return _activeEditor; },
  set activeTextEditor(v: any) { _activeEditor = v; },
  createStatusBarItem:         _createStatusBarItem,
  onDidChangeActiveTextEditor: _onDidChangeActiveTextEditor,
  onDidChangeTextEditorVisibleRanges: _onDidChangeTextEditorVisibleRanges,
  showInformationMessage:      _showInformationMessage,
  showErrorMessage:            _showErrorMessage,
  showWarningMessage:          _showWarningMessage,
  showQuickPick:               _showQuickPick,
  createQuickPick:             _createQuickPick,
  showInputBox:                _showInputBox,
  showTextDocument:            _showTextDocument,
  showOpenDialog:              _showOpenDialog,
  showSaveDialog:              _showSaveDialog,
  createWebviewPanel:          _createWebviewPanel,
  withProgress:                _withProgress,
  createOutputChannel:         sinon.stub().returns({
    name: 'mock', trace: sinon.stub(), debug: sinon.stub(), info: sinon.stub(),
    warn: sinon.stub(), error: sinon.stub(), append: sinon.stub(),
    appendLine: sinon.stub(), clear: sinon.stub(), show: sinon.stub(),
    hide: sinon.stub(), dispose: sinon.stub(),
  }),
};

let _workspaceFolders: any[] | undefined = undefined;
export const workspace = {
  get workspaceFolders() { return _workspaceFolders; },
  set workspaceFolders(v: any) { _workspaceFolders = v; },
  isTrusted:                true,
  getWorkspaceFolder:       _getWorkspaceFolder,
  asRelativePath:           _asRelativePath,
  getConfiguration:         _getConfiguration,
  findFiles:                _findFiles,
  openTextDocument:         _openTextDocument,
  onDidChangeConfiguration: _onDidChangeConfiguration,
  onDidSaveTextDocument:    _onDidSaveTextDocument,
  onDidOpenTextDocument:    _onDidOpenTextDocument,
  onDidChangeTextDocument:  _onDidChangeTextDocument,
  onDidCloseTextDocument:   _onDidCloseTextDocument,
  registerTextDocumentContentProvider: _registerTextDocumentContentProvider,
  applyEdit:                _applyEdit,
};

export const commands = {
  registerCommand: _registerCommand,
  executeCommand:  _executeCommand,
  getCommands:     _getCommands,
};

export const extensions = {
  getExtension: _getExtension,
  // Installed extensions, read by native-schema detection (F04-FR-15). Tests
  // assign their own fixtures; reset to empty in resetAll().
  all: [] as any[],
};

export const env = {
  clipboard: { writeText: _clipboardWriteText },
};

export const languages = {
  createDiagnosticCollection: _createDiagnosticCollection,
  registerCodeActionsProvider: _registerCodeActionsProvider,
  registerDefinitionProvider: _registerDefinitionProvider,
  registerHoverProvider: _registerHoverProvider,
  registerCompletionItemProvider: _registerCompletionItemProvider,
};

export const authentication = {
  onDidChangeSessions: _onDidChangeSessions,
  getSession:          _getSession,
};

export const CodeActionKind = {
  QuickFix: { value: 'quickfix', append: (s: string) => ({ value: `quickfix.${s}` }) },
  Empty:    { value: '', append: (s: string) => ({ value: s }) },
};

export class CodeAction {
  diagnostics?: unknown[];
  command?: unknown;
  edit?: unknown;
  isPreferred?: boolean;
  constructor(public title: string, public kind?: unknown) {}
}

export const CompletionItemKind = { Field: 4, Value: 11, Property: 9, EnumMember: 19 };

export class CompletionItem {
  detail?: string;
  documentation?: unknown;
  sortText?: string;
  insertText?: string;
  constructor(public label: string, public kind?: number) {}
}

export class ThemeColor {
  constructor(public id: string) {}
}

export const ProgressLocation = { Notification: 15, Window: 10, SourceControl: 1 };
export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };
export const DiagnosticTag = { Unnecessary: 1, Deprecated: 2 };
export class Position {
  constructor(public line: number, public character: number) {}
}
export class Range {
  public startLine: number;
  public startChar: number;
  public endLine: number;
  public endChar: number;
  // Mirrors both real vscode.Range overloads: (startLine, startChar, endLine, endChar)
  // and (start: Position, end: Position).
  constructor(a: number | Position, b: number | Position, c?: number, d?: number) {
    if (typeof a === 'number') {
      this.startLine = a;
      this.startChar = b as number;
      this.endLine = c as number;
      this.endChar = d as number;
    } else {
      this.startLine = a.line;
      this.startChar = a.character;
      this.endLine = (b as Position).line;
      this.endChar = (b as Position).character;
    }
  }
  get start(): Position { return new Position(this.startLine, this.startChar); }
  get end(): Position { return new Position(this.endLine, this.endChar); }
}
export class Diagnostic {
  code?: string | number;
  source?: string;
  tags?: number[];
  constructor(public range: Range, public message: string, public severity?: number) {}
}

export class Location {
  constructor(public uri: any, public range: Range) {}
}

export class MarkdownString {
  constructor(public value = '') {}
  appendMarkdown(v: string): this { this.value += v; return this; }
}

export class Hover {
  contents: unknown[];
  constructor(contents: unknown, public range?: Range) {
    this.contents = Array.isArray(contents) ? contents : [contents];
  }
}

export interface MockWorkspaceEditOp {
  uri: any;
  range: Range;
  newText: string;
}

/** Minimal stand-in for vscode.WorkspaceEdit — records replace() calls for
 *  test inspection instead of touching any real document. */
export class WorkspaceEdit {
  readonly edits: MockWorkspaceEditOp[] = [];
  replace(uri: any, range: Range, newText: string): void {
    this.edits.push({ uri, range, newText });
  }
}
