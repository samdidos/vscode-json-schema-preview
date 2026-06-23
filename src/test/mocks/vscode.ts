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

function makeConfig(section: string) {
  if (!configStore[section]) { configStore[section] = {}; }
  return {
    get: <T>(key: string) => configStore[section]?.[key] as T | undefined,
    update: (key: string, value: any) => {
      configStore[section][key] = value;
      return Promise.resolve();
    },
    has: (key: string) => key in configStore[section],
    inspect: (key: string) => {
      const val = configStore[section]?.[key];
      if (val === undefined) return undefined;
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
  command: undefined as string | undefined,
  show: sinon.stub(),
  hide: sinon.stub(),
  dispose: sinon.stub(),
};

// ─── Individual stubs ─────────────────────────────────────────────────────────

// window
const _createStatusBarItem        = sinon.stub();
const _onDidChangeActiveTextEditor = sinon.stub();
const _showInformationMessage      = sinon.stub();
const _showErrorMessage            = sinon.stub();
const _showWarningMessage          = sinon.stub();
const _showQuickPick               = sinon.stub();
const _showInputBox                = sinon.stub();
const _showTextDocument            = sinon.stub();
const _showOpenDialog              = sinon.stub();
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

// commands
const _registerCommand  = sinon.stub();
const _executeCommand   = sinon.stub();
const _getCommands      = sinon.stub();

// workspace (additional listeners)
const _onDidOpenTextDocument    = sinon.stub();
const _onDidChangeTextDocument  = sinon.stub();

// languages
const _createDiagnosticCollection       = sinon.stub();
const _registerCodeActionsProvider      = sinon.stub();

// authentication
const _onDidChangeSessions = sinon.stub();
const _getSession          = sinon.stub();

const _allStubs: sinon.SinonStub[] = [
  statusBarItem.show, statusBarItem.hide, statusBarItem.dispose,
  _createStatusBarItem, _onDidChangeActiveTextEditor,
  _showInformationMessage, _showErrorMessage, _showWarningMessage,
  _showQuickPick, _showInputBox, _showTextDocument, _showOpenDialog, _createWebviewPanel, _withProgress,
  _getWorkspaceFolder, _asRelativePath, _getConfiguration,
  _findFiles, _openTextDocument, _onDidChangeConfiguration, _onDidSaveTextDocument,
  _onDidOpenTextDocument, _onDidChangeTextDocument,
  _createDiagnosticCollection, _registerCodeActionsProvider,
  _onDidChangeSessions, _getSession,
  _registerCommand, _executeCommand, _getCommands,
];

function applyDefaults() {
  _createStatusBarItem.returns(statusBarItem);
  _onDidChangeActiveTextEditor.returns(_disposable);
  _showInformationMessage.resolves(undefined);
  _showErrorMessage.resolves(undefined);
  _showWarningMessage.resolves(undefined);
  _showQuickPick.resolves(undefined);
  _showInputBox.resolves(undefined);
  _showTextDocument.resolves(undefined);
  _showOpenDialog.resolves(undefined);
  _createWebviewPanel.returns({
    title: '',
    webview: { html: '', onDidReceiveMessage: sinon.stub().returns(_disposable) },
    onDidDispose: sinon.stub().returns(_disposable),
  });
  _withProgress.callsFake((_opts: any, task: any) =>
    task({ report: () => {} }, { isCancellationRequested: false })
  );
  _getWorkspaceFolder.returns(undefined);
  _asRelativePath.callsFake((uri: any, _inc?: boolean) =>
    typeof uri === 'string' ? uri : uri.fsPath
  );
  _getConfiguration.callsFake((section = '') => makeConfig(section as string));
  _findFiles.resolves([]);
  _openTextDocument.resolves(undefined);
  _onDidChangeConfiguration.returns(_disposable);
  _onDidSaveTextDocument.returns(_disposable);
  _onDidOpenTextDocument.returns(_disposable);
  _onDidChangeTextDocument.returns(_disposable);
  _createDiagnosticCollection.returns({
    delete: sinon.stub(), set: sinon.stub(), clear: sinon.stub(), dispose: sinon.stub(),
  });
  _registerCodeActionsProvider.returns(_disposable);
  _onDidChangeSessions.returns(_disposable);
  _getSession.resolves(undefined);
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
  statusBarItem.text = '';
  statusBarItem.tooltip = undefined;
  statusBarItem.command = undefined;
  _allStubs.forEach(s => s.reset());
  applyDefaults();
}

// ─── VS Code API exports ──────────────────────────────────────────────────────

export const StatusBarAlignment = { Left: 1, Right: 2 };
export const QuickPickItemKind  = { Separator: -1, Default: 0 };
export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
export const ViewColumn = { One: 1, Two: 2, Three: 3 };

export const Uri = {
  file: (p: string) => ({ fsPath: p, scheme: 'file' }),
  joinPath: (base: any, ...parts: string[]) =>
    ({ fsPath: `${base.fsPath}/${parts.join('/')}`, scheme: 'file' }),
};

let _activeEditor: any = undefined;
export const window = {
  get activeTextEditor() { return _activeEditor; },
  set activeTextEditor(v: any) { _activeEditor = v; },
  createStatusBarItem:         _createStatusBarItem,
  onDidChangeActiveTextEditor: _onDidChangeActiveTextEditor,
  showInformationMessage:      _showInformationMessage,
  showErrorMessage:            _showErrorMessage,
  showWarningMessage:          _showWarningMessage,
  showQuickPick:               _showQuickPick,
  showInputBox:                _showInputBox,
  showTextDocument:            _showTextDocument,
  showOpenDialog:              _showOpenDialog,
  createWebviewPanel:          _createWebviewPanel,
  withProgress:                _withProgress,
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
};

export const commands = {
  registerCommand: _registerCommand,
  executeCommand:  _executeCommand,
  getCommands:     _getCommands,
};

export const extensions = {
  getExtension: sinon.stub().returns(undefined),
};

export const languages = {
  createDiagnosticCollection: _createDiagnosticCollection,
  registerCodeActionsProvider: _registerCodeActionsProvider,
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
  isPreferred?: boolean;
  constructor(public title: string, public kind?: unknown) {}
}

export class ThemeColor {
  constructor(public id: string) {}
}

export const ProgressLocation = { Notification: 15, Window: 10, SourceControl: 1 };
export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };
export class Range {
  constructor(
    public startLine: number, public startChar: number,
    public endLine: number, public endChar: number
  ) {}
}
export class Diagnostic {
  constructor(public range: Range, public message: string, public severity?: number) {}
}
