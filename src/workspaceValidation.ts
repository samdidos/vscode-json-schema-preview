// F20 — workspace validation, the pure part. Classification, data parsing,
// Ajv validation, error location, result aggregation, and the Markdown
// report are plain text/data functions with no VS Code dependency
// (F20-NFR-01); all I/O and UI live in WorkspaceValidateCommand.ts.

import * as YAML from 'yaml';
import { isYaml, isToml, stripJsoncComments, parseJsonl, parseToml } from './languages';
import { createAjv } from './ajvFactory';

/** Files above this size are skipped with a note (F20-FR-03). */
export const MAX_FILE_BYTES = 1024 * 1024;
/** Default scan cap when the setting is missing/invalid (F20-FR-03). */
export const DEFAULT_MAX_FILES = 2000;

export interface ValidationIssue {
  message: string;
  /** 0-based line, when the issue could be located in the file. */
  line?: number;
}

type FileStatus = 'valid' | 'errors' | 'binding-failed' | 'lint-findings' | 'clean-schema';

export interface FileResult {
  /** Workspace-relative path used for grouping and the report. */
  relPath: string;
  /** Workspace folder name the file belongs to ('' for single-root). */
  folder: string;
  kind: 'data' | 'schema';
  status: FileStatus;
  /** The schema reference a data file was validated against. */
  schemaRef?: string;
  issues: ValidationIssue[];
}

export interface RunMeta {
  truncated: boolean;
  maxFiles: number;
  untrusted: boolean;
  skippedLarge: number;
}

// ── Classification ───────────────────────────────────────────────────────────

/** Language id for a data/schema file path, by extension. */
export function languageIdForPath(fsPath: string): string | undefined {
  const ext = /\.([a-z0-9]+)$/i.exec(fsPath)?.[1]?.toLowerCase();
  switch (ext) {
    case 'json': return 'json';
    case 'jsonc': return 'jsonc';
    case 'jsonl': return 'jsonl';
    case 'yaml': case 'yml': return 'yaml';
    case 'toml': return 'toml';
    default: return undefined;
  }
}

/** True when a `$schema` value names a JSON Schema meta-schema — such a file
 *  is a schema to lint, not a data file bound to a schema (F20-FR-02). */
export function isMetaSchemaRef(ref: string): boolean {
  return /^https?:\/\/json-schema\.org\/(draft[-/])/i.test(ref);
}

// ── Data parsing & validation (the pure core of the F03 pipeline) ────────────

/** Parse data text into the instance(s) to validate, by language (F03).
 *  Throws with a descriptive message on unparsable input. */
export function parseDataText(text: string, languageId: string): unknown[] {
  if (isYaml(languageId)) { return [YAML.parse(text)]; }
  if (isToml(languageId)) { return [parseToml(text)]; }
  if (languageId === 'jsonl') { return parseJsonl(text); }
  if (languageId === 'jsonc') { return [JSON.parse(stripJsoncComments(text))]; }
  return [JSON.parse(text)];
}

/**
 * Validate parsed instances against a schema with the F03 Ajv pipeline
 * (draft-aware via `createAjv`, F03-FR-15). Returns one issue per Ajv error,
 * located best-effort in `text`. Throws when the schema does not compile.
 */
export function validateInstances(items: unknown[], schema: unknown, text: string): ValidationIssue[] {
  const ajv = createAjv(schema, { allErrors: true, strict: false });
  const validate = ajv.compile(schema as object);
  const issues: ValidationIssue[] = [];
  for (const data of items) {
    if (validate(data)) { continue; }
    for (const err of validate.errors ?? []) {
      const label = err.instancePath || '(root)';
      issues.push({
        message: `${label}: ${err.message ?? 'validation error'}`,
        line: locateInstancePath(text, err.instancePath ?? ''),
      });
    }
  }
  return issues;
}

/** Best-effort 0-based line of an Ajv instance path in the source text —
 *  the deepest non-numeric segment found as a quoted key (mirrors F03's
 *  locator, text-based so unopened files can be mapped). */
export function locateInstancePath(text: string, instancePath: string): number | undefined {
  const parts = instancePath.split('/').filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) { continue; }
    const line = locateKeyLine(text, parts[i]);
    if (line !== undefined) { return line; }
  }
  return undefined;
}

/** 0-based line containing text offset `index`. */
export function lineAt(text: string, index: number): number {
  return (text.slice(0, index).match(/\n/g) ?? []).length;
}

/** 0-based line of the first match of a *fixed* regex literal in `text`.
 *  Only ever pass a static pattern here — never one built from data-file
 *  content, which `locateKeyLine` below handles without a RegExp. */
export function lineOfMatch(text: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(text);
  return match ? lineAt(text, match.index) : undefined;
}

/**
 * Best-effort 0-based line of a key token: `key` optionally double-quoted,
 * followed by optional spaces/tabs and `:` (JSON/YAML) or `=` (TOML). A
 * literal substring scan — `key` comes from the data file being validated,
 * so it is never used to build a RegExp (a hand-escaped string is not a
 * sanitizer a static analyzer can recognize as safe).
 */
function locateKeyLine(text: string, key: string): number | undefined {
  if (!key) { return undefined; }
  for (let i = 0; i + key.length <= text.length; i++) {
    if (!text.startsWith(key, i)) { continue; }
    let j = i + key.length;
    if (text[j] === '"') { j++; }
    while (text[j] === ' ' || text[j] === '\t') { j++; }
    if (text[j] === ':' || text[j] === '=') { return lineAt(text, i); }
  }
  return undefined;
}

// ── Aggregation & report (F20-FR-06/07) ──────────────────────────────────────

export interface RunSummary {
  filesChecked: number;
  valid: number;
  withErrors: number;
  schemasLinted: number;
  bindingsFailed: number;
}

export function summarize(results: FileResult[]): RunSummary {
  const data = results.filter(r => r.kind === 'data');
  return {
    filesChecked: data.length,
    valid: data.filter(r => r.status === 'valid').length,
    withErrors: data.filter(r => r.status === 'errors').length,
    schemasLinted: results.filter(r => r.kind === 'schema').length,
    bindingsFailed: data.filter(r => r.status === 'binding-failed').length,
  };
}

/** One-line human summary for the finish notification (F20-FR-06). */
export function summaryLine(summary: RunSummary, meta: RunMeta): string {
  const parts = [
    `${summary.filesChecked} file${summary.filesChecked === 1 ? '' : 's'} checked`,
    `${summary.valid} valid`,
    `${summary.withErrors} with errors`,
    `${summary.schemasLinted} schema${summary.schemasLinted === 1 ? '' : 's'} linted`,
    `${summary.bindingsFailed} binding${summary.bindingsFailed === 1 ? '' : 's'} failed`,
  ];
  let line = `Workspace validation: ${parts.join(', ')}.`;
  if (meta.truncated) { line += ` Scan capped at ${meta.maxFiles} files.`; }
  if (meta.untrusted) { line += ' Untrusted workspace: remote schemas served from the local cache only.'; }
  return line;
}

const STATUS_LABEL: Record<FileStatus, string> = {
  'valid': '✅ valid',
  'errors': '❌ errors',
  'binding-failed': '⚠️ binding failed',
  'lint-findings': '💡 lint findings',
  'clean-schema': '✅ clean',
};

/**
 * Markdown report grouped by workspace folder (F20-FR-07): per-file status
 * with error lines, folder counts, and truncation/trust notes — ready to
 * paste into a PR comment.
 */
export function renderMarkdownReport(results: FileResult[], meta: RunMeta): string {
  const summary = summarize(results);
  const lines: string[] = ['## Workspace validation report', ''];
  lines.push(
    `**${summary.filesChecked}** data file(s) checked — ` +
    `**${summary.valid}** valid, **${summary.withErrors}** with errors, ` +
    `**${summary.bindingsFailed}** binding failure(s); ` +
    `**${summary.schemasLinted}** schema(s) linted.`,
  );
  if (meta.truncated) { lines.push('', `> ⚠️ Scan capped at ${meta.maxFiles} files — results are partial.`); }
  if (meta.skippedLarge > 0) { lines.push('', `> ${meta.skippedLarge} file(s) over 1 MiB skipped.`); }
  if (meta.untrusted) { lines.push('', '> Untrusted workspace: remote schemas were served from the local cache only.'); }

  const byFolder = new Map<string, FileResult[]>();
  for (const r of results) {
    const list = byFolder.get(r.folder) ?? [];
    list.push(r);
    byFolder.set(r.folder, list);
  }
  for (const [folder, group] of [...byFolder.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push('', `### ${folder || 'Workspace'} (${group.length} file(s))`, '');
    for (const r of [...group].sort((a, b) => a.relPath.localeCompare(b.relPath))) {
      const against = r.schemaRef ? ` — \`${r.schemaRef}\`` : '';
      lines.push(`- ${STATUS_LABEL[r.status]} \`${r.relPath}\`${against}`);
      for (const issue of r.issues) {
        const at = issue.line !== undefined ? `line ${issue.line + 1}: ` : '';
        lines.push(`  - ${at}${issue.message}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}
