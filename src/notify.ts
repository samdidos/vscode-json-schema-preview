// F34-FR-12 — quiet success confirmations. A message that only says "the thing
// you asked for happened" belongs in the status bar for a few seconds, not in a
// toast the user has to dismiss. Toasts stay for choices, warnings and errors.

import * as vscode from 'vscode';

/** How long a confirmation stays visible before fading. */
export const CONFIRMATION_MS = 5_000;

/**
 * Show an action-less success confirmation transiently in the status bar.
 * Returns the disposable so a caller that must clear it early can.
 */
export function confirm(message: string): vscode.Disposable {
  return vscode.window.setStatusBarMessage(`$(check) ${message}`, CONFIRMATION_MS);
}
