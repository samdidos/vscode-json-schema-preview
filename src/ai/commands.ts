// F32 — the AI commands. VS Code-bound wiring only: each command gathers the
// artifacts it operates on, hands them to a pure prompt builder, runs the pure
// verified-generation loop, and presents the result. No prompt text, no
// extraction and no verification logic lives here.

import * as vscode from 'vscode';
import { isJsonSchemaFile } from '../PreviewWebPanel';
import { getAiMaxAttempts } from '../settings';
import { acquireModel, reportRefusal, type ModelAccess } from './model';
import {
  describePropertiesPrompt, draftSchemaPrompt, enrichSchemaPrompt,
  explainDiagnosticPrompt, sampleDataPrompt, migrationNotesPrompt,
} from './prompts';
import {
  verifySchemaResponse, runVerifiedGeneration, describeProblems,
  onlyDescriptionsChanged, noPropertyLoss,
  type VerifyProblem,
} from './verify';
import { extractJson, extractProse } from './extract';

type Ask = Extract<ModelAccess, { ok: true }>['ask'];

/** Acquire a model or explain why not; `undefined` means the command stops. */
async function ready(): Promise<Ask | undefined> {
  const access = await acquireModel();
  if (!access.ok) { await reportRefusal(access); return undefined; }
  return access.ask;
}

function activeSchemaEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isJsonSchemaFile(editor.document)) {
    vscode.window.showInformationMessage('Open a JSON Schema file to use this command.');
    return undefined;
  }
  return editor;
}

/** Run `work` under cancellable progress — model calls are long by editor standards. */
function withProgress<T>(title: string, work: (token: vscode.CancellationToken) => Promise<T>): Thenable<T> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: true },
    (_progress, token) => work(token),
  );
}

/** Open text in a new untitled editor beside the active one. */
async function openBeside(content: string, language: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ content, language });
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
}

/**
 * Present an outcome that failed verification: the candidate is shown, but
 * explicitly marked unverified alongside its problems (S20-SR-05).
 */
async function presentUnverified(text: string | undefined, problems: VerifyProblem[]): Promise<void> {
  if (!text) {
    vscode.window.showWarningMessage(`No usable result was produced.\n${describeProblems(problems)}`);
    return;
  }
  const action = await vscode.window.showWarningMessage(
    'The generated schema did not pass verification. Open it anyway?',
    { modal: true, detail: describeProblems(problems) },
    'Open unverified',
  );
  if (action === 'Open unverified') {
    await openBeside(`// UNVERIFIED — the checks below failed:\n// ${describeProblems(problems).replace(/\n/g, '\n// ')}\n${text}`, 'jsonc');
  }
}

// ── F32-FR-07 — fill in missing descriptions ─────────────────────────────────

export function describePropertiesCommand() {
  return async (): Promise<void> => {
    const editor = activeSchemaEditor();
    if (!editor) { return; }
    const ask = await ready();
    if (!ask) { return; }

    const original = editor.document.getText();
    let parsed: unknown;
    try {
      parsed = JSON.parse(original);
    } catch {
      vscode.window.showWarningMessage('Descriptions can only be drafted for a JSON schema that parses.');
      return;
    }
    const fileName = uriBaseName(editor.document.uri);

    const outcome = await withProgress('Drafting property descriptions…', token =>
      runVerifiedGeneration<string>({
        maxAttempts: getAiMaxAttempts(),
        generate: problems => ask(describePropertiesPrompt(original, fileName, problems), token),
        verify: response => {
          const result = verifySchemaResponse(response, {
            // S20-SR-04: a description pass that also retyped a property is
            // rejected, not applied.
            scopeCheck: candidate => onlyDescriptionsChanged(parsed, candidate),
          });
          return result.ok
            ? { ok: true, value: result.text }
            : { ok: false, problems: result.problems, value: result.text };
        },
      }),
    );

    if (!outcome.ok) { await presentUnverified(outcome.value, outcome.problems); return; }

    // One previewed, undoable edit over the whole document (S20-SR-04).
    const edit = new vscode.WorkspaceEdit();
    const whole = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(original.length),
    );
    edit.replace(editor.document.uri, whole, outcome.value);
    const applied = await vscode.workspace.applyEdit(edit);
    vscode.window.showInformationMessage(
      applied
        ? 'Descriptions drafted — review the change and undo if it is not what you wanted.'
        : 'The edit could not be applied.',
    );
  };
}

// ── F32-FR-09 — natural language to a verified schema ────────────────────────

export function draftSchemaCommand() {
  return async (): Promise<void> => {
    const ask = await ready();
    if (!ask) { return; }
    const description = await vscode.window.showInputBox({
      title: 'Draft a JSON Schema',
      prompt: 'Describe the data this schema should validate.',
      placeHolder: 'An order with a customer, line items, and a shipping address',
    });
    if (!description?.trim()) { return; }

    const outcome = await withProgress('Drafting a schema…', token =>
      runVerifiedGeneration<string>({
        maxAttempts: getAiMaxAttempts(),
        generate: problems => ask(draftSchemaPrompt(description, problems), token),
        verify: response => {
          const result = verifySchemaResponse(response);
          return result.ok
            ? { ok: true, value: result.text }
            : { ok: false, problems: result.problems, value: result.text };
        },
      }),
    );

    if (!outcome.ok) { await presentUnverified(outcome.value, outcome.problems); return; }
    await openBeside(outcome.value, 'json');
  };
}

// ── F32-FR-10 — semantic enrichment of an inferred schema ────────────────────

export function enrichSchemaCommand() {
  return async (): Promise<void> => {
    const editor = activeSchemaEditor();
    if (!editor) { return; }
    const ask = await ready();
    if (!ask) { return; }

    const original = editor.document.getText();
    const parsed = extractJson(original);
    if (!parsed.ok) {
      vscode.window.showWarningMessage('This schema does not parse as JSON.');
      return;
    }
    const fileName = uriBaseName(editor.document.uri);

    const outcome = await withProgress('Enriching the schema…', token =>
      runVerifiedGeneration<string>({
        maxAttempts: getAiMaxAttempts(),
        generate: problems => ask(enrichSchemaPrompt(original, fileName, problems), token),
        verify: response => {
          const result = verifySchemaResponse(response, {
            scopeCheck: candidate => noPropertyLoss(parsed.value, candidate),
          });
          return result.ok
            ? { ok: true, value: result.text }
            : { ok: false, problems: result.problems, value: result.text };
        },
      }),
    );

    if (!outcome.ok) { await presentUnverified(outcome.value, outcome.problems); return; }
    // Opened beside rather than applied: enrichment is a bigger change than a
    // description pass, so the user diffs it themselves.
    await openBeside(outcome.value, 'json');
  };
}

// ── F32-FR-08 — explain a finding ────────────────────────────────────────────

export function explainDiagnosticCommand() {
  return async (diagnostic?: vscode.Diagnostic): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    const target = diagnostic ?? firstDiagnosticAt(editor);
    if (!target) {
      vscode.window.showInformationMessage('Put the cursor on a validation or lint finding to explain it.');
      return;
    }
    const ask = await ready();
    if (!ask) { return; }

    const prompt = explainDiagnosticPrompt({
      message: target.message,
      value: editor.document.getText(target.range),
      subschema: editor.document.getText(),
      fileName: uriBaseName(editor.document.uri),
    });

    const answer = await withProgress('Explaining the finding…', token => ask(prompt, token));
    const prose = extractProse(answer);
    if (!prose) {
      vscode.window.showWarningMessage('The model returned no explanation.');
      return;
    }
    // Prose, not an edit (F32-FR-08).
    await openBeside(`# ${target.message}\n\n${prose}\n`, 'markdown');
  };
}

function firstDiagnosticAt(editor: vscode.TextEditor): vscode.Diagnostic | undefined {
  const position = editor.selection.active;
  return vscode.languages
    .getDiagnostics(editor.document.uri)
    .find(d => d.range.contains(position));
}

// ── F32-FR-11 — realistic / adversarial sample data ──────────────────────────

export function generateRealisticDataCommand() {
  return async (): Promise<void> => {
    const editor = activeSchemaEditor();
    if (!editor) { return; }

    const mode = await vscode.window.showQuickPick(
      [
        { label: 'Realistic', description: 'Documents that satisfy the schema and read like real data' },
        { label: 'Adversarial', description: 'Documents that violate it in ways a person plausibly would' },
      ],
      { title: 'Generate sample data' },
    );
    if (!mode) { return; }
    const adversarial = mode.label === 'Adversarial';

    const ask = await ready();
    if (!ask) { return; }

    const schemaText = editor.document.getText();
    const parsed = extractJson(schemaText);
    if (!parsed.ok) {
      vscode.window.showWarningMessage('This schema does not parse as JSON.');
      return;
    }

    const count = 5;
    const answer = await withProgress('Generating sample data…', token =>
      ask(sampleDataPrompt({ schemaText, count, adversarial }), token),
    );

    const extracted = extractJson(answer);
    if (!extracted.ok || !Array.isArray(extracted.value)) {
      vscode.window.showWarningMessage('The model did not return a JSON array of instances.');
      return;
    }

    // The Ajv gate is what makes this trustworthy: instances that do not match
    // the requested expectation are discarded, never shown (F32-FR-11).
    const kept = filterByExpectation(extracted.value, parsed.value, adversarial);
    if (!kept.length) {
      vscode.window.showWarningMessage(
        `None of the ${extracted.value.length} generated instances were ${adversarial ? 'invalid' : 'valid'}; nothing to show.`,
      );
      return;
    }
    await openBeside(JSON.stringify(kept, null, 2), 'json');
    vscode.window.showInformationMessage(
      `Kept ${kept.length} of ${extracted.value.length} generated instances.`,
    );
  };
}

/** Keep only instances matching the requested expectation (F32-FR-11). */
export function filterByExpectation(
  instances: unknown[],
  schema: unknown,
  adversarial: boolean,
): unknown[] {

  const Ajv = require('ajv').default as new (o: object) => import('ajv').default;
  let validate: (value: unknown) => boolean;
  try {
    const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
    const target = schema && typeof schema === 'object' && !Array.isArray(schema)
      ? Object.fromEntries(Object.entries(schema as Record<string, unknown>).filter(([k]) => k !== '$schema'))
      : schema;
    validate = ajv.compile(target as object) as (value: unknown) => boolean;
  } catch {
    return [];
  }
  return instances.filter(instance => validate(instance) !== adversarial);
}

// ── F32-FR-12 — migration notes from a computed diff ─────────────────────────

export function migrationNotesCommand() {
  return async (report?: string, verdict?: string, fileName?: string): Promise<void> => {
    if (!report || !verdict) {
      vscode.window.showInformationMessage('Run JSON Schema: Diff Against Baseline first, then ask for migration notes.');
      return;
    }
    const ask = await ready();
    if (!ask) { return; }

    const answer = await withProgress('Writing migration notes…', token =>
      ask(migrationNotesPrompt({ report, verdict, fileName: fileName ?? 'schema' }), token),
    );
    const prose = extractProse(answer);
    if (!prose) {
      vscode.window.showWarningMessage('The model returned no notes.');
      return;
    }
    await openBeside(prose, 'markdown');
  };
}

function uriBaseName(uri: vscode.Uri): string {
  const parts = uri.path.split('/');
  return parts[parts.length - 1] || 'schema';
}

/** Every AI command, for registration in `extension.ts`. */
export function aiCommands(): Array<[string, (...args: never[]) => unknown]> {
  return [
    ['jsonschema.ai.describeProperties', describePropertiesCommand()],
    ['jsonschema.ai.draftSchema', draftSchemaCommand()],
    ['jsonschema.ai.enrichSchema', enrichSchemaCommand()],
    ['jsonschema.ai.explainDiagnostic', explainDiagnosticCommand()],
    ['jsonschema.ai.generateRealisticData', generateRealisticDataCommand()],
    ['jsonschema.ai.migrationNotes', migrationNotesCommand()],
  ] as Array<[string, (...args: never[]) => unknown]>;
}
