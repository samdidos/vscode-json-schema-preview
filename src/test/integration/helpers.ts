// Shared helpers for driving the real vscode API deterministically inside the
// Extension Host (S08-SR-01). Since the test code and the extension under test
// share one loaded `vscode` module instance in the same process, temporarily
// reassigning vscode.window.* here affects calls made from extension source
// too — the standard technique for automating VS Code's UI-blocking APIs
// (QuickPick, input boxes, message prompts) in integration tests.
import * as fs from 'fs';
import * as vscode from 'vscode';

/**
 * Stubs vscode.window.showQuickPick for the duration of `fn`, always restoring
 * the original afterward (even if `fn` throws). `pick` is called once per
 * showQuickPick invocation with the resolved item list and a 0-based call
 * index, and returns whichever item (or undefined) that call should resolve to.
 */
export async function withQuickPick<T>(
  pick: (items: readonly any[], call: number) => any,
  fn: () => Promise<T>,
): Promise<T> {
  const original = vscode.window.showQuickPick;
  let call = 0;
  (vscode.window as any).showQuickPick = async (items: any) => {
    const resolved = await items;
    return pick(resolved, call++);
  };
  try {
    return await fn();
  } finally {
    (vscode.window as any).showQuickPick = original;
  }
}

export interface CapturedMessages<T> {
  result: T;
  info: string[];
  warnings: string[];
  errors: string[];
}

/**
 * Stubs vscode.window.show{Information,Warning,Error}Message for the duration
 * of `fn`, capturing every message shown and auto-dismissing (resolving
 * `undefined`, i.e. no action picked) so a prompt never blocks automation.
 */
export async function withCapturedMessages<T>(fn: () => Promise<T>): Promise<CapturedMessages<T>> {
  const info: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const origInfo = vscode.window.showInformationMessage;
  const origWarn = vscode.window.showWarningMessage;
  const origErr = vscode.window.showErrorMessage;
  (vscode.window as any).showInformationMessage = async (msg: string) => { info.push(msg); return undefined; };
  (vscode.window as any).showWarningMessage = async (msg: string) => { warnings.push(msg); return undefined; };
  (vscode.window as any).showErrorMessage = async (msg: string) => { errors.push(msg); return undefined; };
  try {
    const result = await fn();
    return { result, info, warnings, errors };
  } finally {
    (vscode.window as any).showInformationMessage = origInfo;
    (vscode.window as any).showWarningMessage = origWarn;
    (vscode.window as any).showErrorMessage = origErr;
  }
}

export function readJsonFile(fsPath: string): any {
  return JSON.parse(fs.readFileSync(fsPath, 'utf-8'));
}

export function writeFile(fsPath: string, content: string): void {
  fs.writeFileSync(fsPath, content, 'utf-8');
}

/** Closes every open editor tab so each test starts from a clean editor state. */
export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
