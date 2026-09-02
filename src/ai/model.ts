// F32-FR-02 / S20-SR-06 — the entire model-facing boundary, deliberately thin.
//
// Access goes through VS Code's Language Model API and nothing else: no vendor
// SDK, no model identifier, no endpoint, no credential handling. Swapping the
// user's provider changes nothing here, which is the point — everything with
// logic in it (prompts, extraction, verification, retry) lives in sibling
// modules that never import `vscode`.

import * as vscode from 'vscode';
import { getAiEnabled } from '../settings';

export const ENABLE_SETTING = 'jsonschema.ai.enabled';

export type ModelAccess =
  | { ok: true; ask: (prompt: string, token?: vscode.CancellationToken) => Promise<string> }
  | { ok: false; reason: 'disabled' | 'unavailable'; message: string };

/**
 * Obtain model access, or an explained refusal (F32-FR-01/02). Returns
 * `disabled` before touching any API when the opt-in setting is off, so the
 * default configuration cannot reach a request at all (S20-SR-01).
 */
export async function acquireModel(): Promise<ModelAccess> {
  if (!getAiEnabled()) {
    return {
      ok: false,
      reason: 'disabled',
      message: 'AI assistance is off. Enable it to let this command use your configured language model.',
    };
  }

  const lm = (vscode as unknown as { lm?: typeof vscode.lm }).lm;
  if (!lm?.selectChatModels) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'This VS Code build does not provide the Language Model API.',
    };
  }

  let models: readonly vscode.LanguageModelChat[] = [];
  try {
    models = await lm.selectChatModels();
  } catch (e) {
    return { ok: false, reason: 'unavailable', message: `No language model is available: ${(e as Error).message}` };
  }
  if (!models.length) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'No language model is available. Sign in to a provider (for example GitHub Copilot) and try again.',
    };
  }

  const model = models[0];
  return {
    ok: true,
    ask: async (prompt, token) => {
      const response = await model.sendRequest(
        [vscode.LanguageModelChatMessage.User(prompt)],
        {},
        token ?? new vscode.CancellationTokenSource().token,
      );
      let text = '';
      for await (const fragment of response.text) { text += fragment; }
      return text;
    },
  };
}

/**
 * Report a refusal, offering the one-click enable for the `disabled` case
 * (F32-FR-01). Returns nothing: the caller simply stops.
 */
export async function reportRefusal(refusal: Extract<ModelAccess, { ok: false }>): Promise<void> {
  if (refusal.reason !== 'disabled') {
    vscode.window.showWarningMessage(refusal.message);
    return;
  }
  const action = await vscode.window.showInformationMessage(
    refusal.message,
    'Enable AI assistance',
    'What is sent?',
  );
  if (action === 'Enable AI assistance') {
    await vscode.workspace
      .getConfiguration('jsonschema.ai')
      .update('enabled', true, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('AI assistance enabled. Run the command again.');
  } else if (action === 'What is sent?') {
    vscode.env.openExternal(
      vscode.Uri.parse('https://samdidos.github.io/vscode-json-schema-preview/guide/ai'),
    );
  }
}
