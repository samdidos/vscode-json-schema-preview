// F13-FR-14..16 — `$ref` completion: VS Code glue over refCompletion.ts.
// Offline and in-process: candidates come from the open document and from
// schema files already on disk; remote references are never fetched.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { refCandidates, refCompletionContext } from './refCompletion';
import { parseSchemaText } from './schemaPointer';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { languageForSchemaSource } from './languages';

const SELECTOR: vscode.DocumentSelector = [
  { language: 'json' }, { language: 'jsonc' }, { language: 'yaml' }, { language: 'yml' },
];

/** Same discovery rule as the F04 picker (SchemaBindingManager.findWorkspaceSchemas). */
const SCHEMA_GLOB = '**/*.{json,yaml,yml}';
const SCHEMA_EXCLUDE = '{**/node_modules/**,**/dist/**,**/.git/**}';
const MAX_FILES = 500;
const DECLARES_SCHEMA = /"?\$schema"?\s*:/;
/** How long a workspace scan is reused across keystrokes. */
const FILE_LIST_TTL_MS = 10_000;

export class SchemaRefCompletionProvider implements vscode.CompletionItemProvider {
  private fileList: { at: number; files: Promise<string[]> } | undefined;

  constructor(private readonly now: () => number = Date.now) {}

  static register(): vscode.Disposable {
    // `"` and `'` open a value, `#` starts a fragment, `/` steps into a pointer
    // or a directory (F13-FR-16).
    return vscode.languages.registerCompletionItemProvider(
      SELECTOR, new SchemaRefCompletionProvider(), '"', "'", '#', '/',
    );
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[] | undefined> {
    if (document.uri.scheme !== 'file' || !isJsonSchemaFile(document)) { return undefined; }
    const text = document.getText();
    const ctx = refCompletionContext(text, document.languageId, document.offsetAt(position));
    if (!ctx) { return undefined; }

    const dir = path.dirname(document.uri.fsPath);
    const needFiles = !ctx.prefix.includes('#');
    const files = needFiles ? await this.relativeSchemaFiles(document.uri.fsPath) : [];
    const candidates = refCandidates(
      ctx.prefix,
      parseSchemaText(text, document.languageId),
      files,
      rel => loadSchemaFile(path.resolve(dir, rel)),
    );

    const range = new vscode.Range(document.positionAt(ctx.contentStart), document.positionAt(ctx.contentEnd));
    return candidates.map((c, i) => {
      const item = new vscode.CompletionItem(
        c.value,
        c.kind === 'file' ? vscode.CompletionItemKind.File : vscode.CompletionItemKind.Reference,
      );
      item.range = range;
      item.filterText = c.value;
      item.insertText = c.value;
      // Keep document order: local targets first, then files (F13-FR-15).
      item.sortText = String(i).padStart(5, '0');
      item.detail = c.kind === 'file' ? 'schema file' : '$ref target';
      return item;
    });
  }

  /** Other workspace schema files, relative to `selfPath`'s directory, POSIX-style. */
  private async relativeSchemaFiles(selfPath: string): Promise<string[]> {
    const t = this.now();
    if (!this.fileList || t - this.fileList.at > FILE_LIST_TTL_MS) {
      this.fileList = { at: t, files: discoverSchemaFiles() };
    }
    const dir = path.dirname(selfPath);
    return (await this.fileList.files)
      .filter(f => path.resolve(f) !== path.resolve(selfPath))
      .map(f => toRelativeRef(dir, f))
      .sort();
  }
}

/** `./x.json` / `../y/z.json` from `fromDir` to `file`, always with `/`. */
export function toRelativeRef(fromDir: string, file: string): string {
  const rel = path.relative(fromDir, file).split(path.sep).join('/');
  return rel.startsWith('../') ? rel : `./${rel}`;
}

async function discoverSchemaFiles(): Promise<string[]> {
  const uris = await vscode.workspace.findFiles(SCHEMA_GLOB, SCHEMA_EXCLUDE, MAX_FILES);
  const hits = await Promise.all(uris.map(async uri => {
    try {
      const raw = await fs.promises.readFile(uri.fsPath, 'utf-8');
      return DECLARES_SCHEMA.test(raw) ? uri.fsPath : undefined;
    } catch {
      return undefined;
    }
  }));
  return hits.filter((f): f is string => f !== undefined);
}

function loadSchemaFile(file: string): unknown {
  try {
    return parseSchemaText(fs.readFileSync(file, 'utf-8'), languageForSchemaSource(file));
  } catch {
    return undefined;
  }
}
