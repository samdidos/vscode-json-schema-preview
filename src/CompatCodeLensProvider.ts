// F26-FR-07/08 — the passive surface for the compatibility verdict: a CodeLens
// on a schema's first line reading how many breaking changes it carries against
// its Git baseline, so "can I ship this?" is visible while editing rather than
// only on demand.
//
// The classification comes from the same `schemaDiff`/`schemaCompat` modules the
// command and the CLI use — never a second implementation (F26-FR-07).

import * as vscode from 'vscode';
import { diffSchemas, summarise } from './schemaDiff';
import { compatibilityVerdict } from './schemaCompat';
import { parseSchemaText } from './schemaPointer';
import { isJsonSchemaFile } from './PreviewWebPanel';
import { languageForSchemaSource } from './languages';
import { getCompatCodeLensEnabled } from './settings';
import { ALL_LANGS } from './languages';

/** Debounce window for recomputation; typing must never wait on a diff. */
const RECOMPUTE_DEBOUNCE_MS = 800;

interface LensState {
  /** Breaking-change count, or undefined when there is no baseline / no change. */
  breaking?: number;
  /** Document version the state was computed for. */
  version: number;
}

/** Content of `doc` at Git HEAD, or undefined when git has no version of it. */
async function gitHeadContent(doc: vscode.TextDocument): Promise<string | undefined> {
  try {
    const gitExt = vscode.extensions.getExtension('vscode.git');
    if (!gitExt) { return undefined; }
    if (!gitExt.isActive) { await gitExt.activate(); }
    const api = gitExt.exports?.getAPI?.(1);
    const repo = api?.getRepository?.(doc.uri);
    if (!repo) { return undefined; }
    return await repo.show('HEAD', doc.uri.fsPath);
  } catch {
    return undefined;
  }
}

/**
 * Count the breaking changes between a baseline and the current text, or
 * `undefined` when either side does not parse.
 */
export function countBreaking(baselineText: string, currentText: string, fsPath: string): number | undefined {
  const languageId = languageForSchemaSource(fsPath);
  const baseline = parseSchemaText(baselineText, languageId);
  const current = parseSchemaText(currentText, languageId);
  if (baseline === undefined || current === undefined) { return undefined; }
  const entries = diffSchemas(baseline, current);
  if (!entries.length) { return undefined; }
  const verdict = compatibilityVerdict(entries);
  return verdict.compatible ? 0 : summarise(entries).breaking;
}

export class CompatCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  /** Last computed state per document, reused while a recompute is in flight. */
  private readonly states = new Map<string, LensState>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!getCompatCodeLensEnabled() || !isJsonSchemaFile(document)) { return []; }

    const key = document.uri.toString();
    const state = this.states.get(key);

    // F26-FR-08 — never block typing: schedule a recompute and serve whatever
    // the previous one produced in the meantime.
    if (!state || state.version !== document.version) { this.schedule(document); }
    if (state?.breaking === undefined) { return []; }

    const range = new vscode.Range(0, 0, 0, 0);
    const count = state.breaking;
    return [new vscode.CodeLens(range, {
      title: count === 0
        ? '$(check) Backward-compatible vs HEAD'
        : `$(warning) ${count} breaking change${count === 1 ? '' : 's'} vs HEAD`,
      command: 'jsonschema.diffSchema',
      tooltip: 'Open the full schema diff report',
    })];
  }

  private schedule(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const pending = this.timers.get(key);
    if (pending) { clearTimeout(pending); }
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      void this.recompute(document);
    }, RECOMPUTE_DEBOUNCE_MS));
  }

  private async recompute(document: vscode.TextDocument): Promise<void> {
    const key = document.uri.toString();
    const version = document.version;
    let breaking: number | undefined;
    const baseline = await gitHeadContent(document);
    if (baseline !== undefined) {
      breaking = countBreaking(baseline, document.getText(), document.uri.fsPath);
    }
    const previous = this.states.get(key);
    this.states.set(key, { breaking, version });
    if (previous?.breaking !== breaking) { this.changed.fire(); }
  }

  dispose(): void {
    for (const timer of this.timers.values()) { clearTimeout(timer); }
    this.timers.clear();
    this.changed.dispose();
  }
}

export function registerCompatCodeLens(context: vscode.ExtensionContext): void {
  const provider = new CompatCodeLensProvider();
  context.subscriptions.push(
    provider,
    vscode.languages.registerCodeLensProvider(
      ALL_LANGS.map(language => ({ language, scheme: 'file' })),
      provider,
    ),
  );
}
