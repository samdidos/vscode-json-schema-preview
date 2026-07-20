// F27 — the standalone CLI's pure core. Argument parsing, command routing, and
// report formatting live here; all I/O (reading files, fetching remote refs,
// writing streams, exiting) is injected via `CliIO` so every branch is
// unit-testable on in-memory input (F27-NFR-02). Every subcommand delegates to
// the same pure modules the VS Code extension uses — no logic is re-implemented
// (F27-FR-01) and nothing here imports `vscode` (F27-NFR-01).
import * as path from 'path';
import { parseDataText, validateInstances, languageIdForPath, lineAt } from '../workspaceValidation';
import { parseSchemaText } from '../schemaPointer';
import { languageForSchemaSource } from '../languages';
import { lintSchema } from '../schemaLinter';
import { diffSchemas, summarise, renderReport } from '../schemaDiff';
import { compatibilityVerdict, verdictExitCode, renderCompatReport } from '../schemaCompat';
import { bundleSchema, dereferenceSchema, type ResolvedDoc } from '../schemaBundler';
import { migrateSchema, type TargetDraft } from '../draftMigration';

/** Injected side-effect surface so `runCli` stays pure and testable. */
export interface CliIO {
  /** Read a file as UTF-8; throws when it cannot be read. */
  readFile(absPath: string): string;
  /** Fetch a remote (`http(s)`) document as text. */
  fetchText(url: string): Promise<string>;
  /** Directory the CLI was invoked from; file arguments resolve against it. */
  cwd: string;
  /** The CLI package version, for `--version`. */
  version: string;
}

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Exit codes, shared across every subcommand (F27-FR-10). */
export const EXIT = {
  ok: 0,
  finding: 1,
  unknown: 2,
  usage: 64,
  data: 65,
} as const;

const TARGET_DRAFTS: readonly TargetDraft[] = ['2020-12', '2019-09', 'draft-07'];

const USAGE = [
  'json-schema-tools — schema validation, linting, diff, bundling & migration',
  '',
  'Usage: json-schema-tools <command> [options]',
  '',
  'Commands:',
  '  validate <data-file> --schema <schema>   Validate a data file against a schema',
  '  lint <schema-file>                        Report schema-quality findings',
  '  diff <old-schema> <new-schema>            Show changes between two schemas',
  '      [--check] [--strict]                  …and gate on backward-compatibility',
  '  bundle <schema-file> [--dereference]      Produce one self-contained schema',
  '  migrate <schema-file> --to <draft>        Convert to 2020-12 | 2019-09 | draft-07',
  '',
  'Global options:',
  '  --json        Machine-readable output',
  '  -h, --help    Show this help',
  '  -v, --version Show version',
  '',
  'Exit codes: 0 ok · 1 finding/incompatible · 2 strict-unknown · 64 usage · 65 data',
].join('\n');

// ── Argument parsing ─────────────────────────────────────────────────────────

interface ParsedArgs {
  positionals: string[];
  values: Record<string, string>;
  flags: Set<string>;
}

/** Flags that take a value (`--schema x` or `--schema=x`); all others boolean. */
const VALUE_FLAGS = new Set(['schema', 'to']);

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { positionals.push(arg); continue; }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    const name = eq === -1 ? body : body.slice(0, eq);
    if (VALUE_FLAGS.has(name)) {
      values[name] = eq === -1 ? (argv[++i] ?? '') : body.slice(eq + 1);
    } else {
      flags.add(name);
    }
  }
  return { positionals, values, flags };
}

// ── Result helpers ───────────────────────────────────────────────────────────

function out(stdout: string, code: number = EXIT.ok, stderr = ''): CliResult {
  return { stdout, stderr, code };
}
function err(stderr: string, code: number): CliResult {
  return { stdout: '', stderr, code };
}
function jsonOut(payload: unknown, code: number): CliResult {
  return out(`${JSON.stringify({ ...(payload as object), exitCode: code }, null, 2)}\n`, code);
}

// ── Shared file loading ──────────────────────────────────────────────────────

const isRemote = (s: string): boolean => /^https?:\/\//.test(s);

/** Read + parse a schema file into a plain value, or a data-error result. */
function loadSchema(io: CliIO, file: string): { schema: unknown } | { fail: CliResult } {
  const abs = path.resolve(io.cwd, file);
  let text: string;
  try {
    text = io.readFile(abs);
  } catch {
    return { fail: err(`Cannot read file: ${file}\n`, EXIT.data) };
  }
  const schema = parseSchemaText(text, languageForSchemaSource(abs));
  if (schema === undefined) {
    return { fail: err(`Cannot parse schema: ${file}\n`, EXIT.data) };
  }
  return { schema };
}

// ── validate (F27-FR-04) ─────────────────────────────────────────────────────

function cmdValidate(args: ParsedArgs, io: CliIO): CliResult {
  const [dataFile] = args.positionals;
  const schemaFile = args.values.schema;
  if (!dataFile || !schemaFile) {
    return err(`validate requires a data file and --schema <schema>.\n\n${USAGE}\n`, EXIT.usage);
  }
  const loaded = loadSchema(io, schemaFile);
  if ('fail' in loaded) { return loaded.fail; }

  const dataAbs = path.resolve(io.cwd, dataFile);
  let dataText: string;
  try {
    dataText = io.readFile(dataAbs);
  } catch {
    return err(`Cannot read file: ${dataFile}\n`, EXIT.data);
  }
  const languageId = languageIdForPath(dataAbs) ?? 'json';
  let issues;
  try {
    const items = parseDataText(dataText, languageId);
    issues = validateInstances(items, loaded.schema, dataText, languageId);
  } catch (e) {
    return err(`Cannot validate ${dataFile}: ${(e as Error).message}\n`, EXIT.data);
  }

  const code = issues.length ? EXIT.finding : EXIT.ok;
  if (args.flags.has('json')) {
    return jsonOut({
      valid: issues.length === 0,
      issues: issues.map((i) => ({ message: i.message, line: i.line === undefined ? null : i.line + 1 })),
    }, code);
  }
  if (!issues.length) {
    return out(`✓ ${path.basename(dataFile)} is valid against ${path.basename(schemaFile)}.\n`);
  }
  const lines = issues.map((i) => {
    const at = i.line === undefined ? '' : `line ${i.line + 1}: `;
    return `  ${at}${i.message}`;
  });
  return out(
    `✗ ${issues.length} validation error${issues.length === 1 ? '' : 's'} in ${path.basename(dataFile)}:\n${lines.join('\n')}\n`,
    EXIT.finding,
  );
}

// ── lint (F27-FR-05) ─────────────────────────────────────────────────────────

function cmdLint(args: ParsedArgs, io: CliIO): CliResult {
  const [schemaFile] = args.positionals;
  if (!schemaFile) {
    return err(`lint requires a schema file.\n\n${USAGE}\n`, EXIT.usage);
  }
  const abs = path.resolve(io.cwd, schemaFile);
  let text: string;
  try {
    text = io.readFile(abs);
  } catch {
    return err(`Cannot read file: ${schemaFile}\n`, EXIT.data);
  }
  const languageId = languageForSchemaSource(abs);
  const findings = lintSchema(text, languageId)
    .map((f) => ({ ...f, line: lineAt(text, f.offset) + 1 }))
    .sort((a, b) => a.offset - b.offset);

  const hasWarning = findings.some((f) => f.defaultSeverity === 'warning');
  const code = hasWarning ? EXIT.finding : EXIT.ok;

  if (args.flags.has('json')) {
    return jsonOut({
      findings: findings.map((f) => ({ ruleId: f.ruleId, message: f.message, line: f.line, severity: f.defaultSeverity })),
    }, code);
  }
  if (!findings.length) {
    return out(`✓ ${path.basename(schemaFile)}: no schema-quality findings.\n`);
  }
  const lines = findings.map((f) => `  line ${f.line} [${f.ruleId}] ${f.message}`);
  return out(`${path.basename(schemaFile)}: ${findings.length} finding(s)\n${lines.join('\n')}\n`, code);
}

// ── diff (F27-FR-06) ─────────────────────────────────────────────────────────

function cmdDiff(args: ParsedArgs, io: CliIO): CliResult {
  const [oldFile, newFile] = args.positionals;
  if (!oldFile || !newFile) {
    return err(`diff requires two schema files.\n\n${USAGE}\n`, EXIT.usage);
  }
  const oldLoaded = loadSchema(io, oldFile);
  if ('fail' in oldLoaded) { return oldLoaded.fail; }
  const newLoaded = loadSchema(io, newFile);
  if ('fail' in newLoaded) { return newLoaded.fail; }

  const entries = diffSchemas(oldLoaded.schema, newLoaded.schema);
  const header = `${path.basename(newFile)} vs ${path.basename(oldFile)}`;
  const strict = args.flags.has('strict');

  if (args.flags.has('check')) {
    const verdict = compatibilityVerdict(entries, { strict });
    const code = verdictExitCode(verdict);
    if (args.flags.has('json')) { return jsonOut({ verdict, header }, code); }
    return out(`${renderCompatReport(entries, header, { strict })}\n`, code);
  }

  if (args.flags.has('json')) {
    return jsonOut({ header, summary: summarise(entries), entries }, EXIT.ok);
  }
  return out(`${renderReport(entries, header)}\n`);
}

// ── bundle (F27-FR-07) ───────────────────────────────────────────────────────

async function cmdBundle(args: ParsedArgs, io: CliIO): Promise<CliResult> {
  const [schemaFile] = args.positionals;
  if (!schemaFile) {
    return err(`bundle requires a schema file.\n\n${USAGE}\n`, EXIT.usage);
  }
  const rootAbs = path.resolve(io.cwd, schemaFile);
  const loaded = loadSchema(io, schemaFile);
  if ('fail' in loaded) { return loaded.fail; }

  const resolver = makeResolver(io, rootAbs);
  let bundled;
  try {
    bundled = args.flags.has('dereference')
      ? await dereferenceSchema(loaded.schema, resolver)
      : await bundleSchema(loaded.schema, resolver);
  } catch (e) {
    return err(`Cannot bundle ${schemaFile}: ${(e as Error).message}\n`, EXIT.data);
  }
  // Emit only the self-contained schema; strippedIds is internal bookkeeping.
  if (args.flags.has('json')) { return jsonOut({ schema: bundled.schema }, EXIT.ok); }
  return out(`${JSON.stringify(bundled.schema, null, 2)}\n`);
}

/** A filesystem/HTTP `$ref` resolver over the injected IO (mirrors the
 *  extension's resolver, minus auth/cache). Reads relative/absolute refs from
 *  disk and fetches remote ones; caches each resolved document by its id. The
 *  root document's own relative refs resolve against `rootAbs` (the bundler
 *  seeds the root walk with an empty baseId). */
function makeResolver(io: CliIO, rootAbs: string) {
  const cache = new Map<string, Promise<ResolvedDoc>>();
  const load = async (id: string): Promise<ResolvedDoc> => {
    const text = isRemote(id) ? await io.fetchText(id) : io.readFile(id);
    return { id, schema: parseSchemaText(text, languageForSchemaSource(id)) ?? {} };
  };
  return (uri: string, baseId: string): Promise<ResolvedDoc> => {
    const base = baseId || rootAbs;
    let id: string;
    if (isRemote(uri)) { id = uri; }
    else if (isRemote(base)) { id = new URL(uri, base).toString(); }
    else { id = path.resolve(path.dirname(base), uri); }
    let pending = cache.get(id);
    if (!pending) {
      pending = load(id);
      cache.set(id, pending);
      pending.catch(() => cache.delete(id));
    }
    return pending;
  };
}

// ── migrate (F27-FR-08) ──────────────────────────────────────────────────────

function cmdMigrate(args: ParsedArgs, io: CliIO): CliResult {
  const [schemaFile] = args.positionals;
  const target = args.values.to as TargetDraft | undefined;
  if (!schemaFile) {
    return err(`migrate requires a schema file.\n\n${USAGE}\n`, EXIT.usage);
  }
  if (!target || !TARGET_DRAFTS.includes(target)) {
    return err(`migrate requires --to <${TARGET_DRAFTS.join(' | ')}>.\n\n${USAGE}\n`, EXIT.usage);
  }
  const loaded = loadSchema(io, schemaFile);
  if ('fail' in loaded) { return loaded.fail; }

  const { schema, changes } = migrateSchema(loaded.schema, target);
  if (args.flags.has('json')) { return jsonOut({ schema, changes }, EXIT.ok); }

  const changeLog = changes.length
    ? `${changes.length} change(s):\n${changes.map((c) => `  ${c.path || '(root)'}: ${c.change}`).join('\n')}\n`
    : 'No changes — schema already conforms to the target draft.\n';
  return out(`${JSON.stringify(schema, null, 2)}\n`, EXIT.ok, changeLog);
}

// ── Router (F27-FR-02/03) ────────────────────────────────────────────────────

/** Route `argv` (already stripped of node + script) to a subcommand and return
 *  the streams + exit code. Pure: all effects happen through `io`. */
export async function runCli(argv: string[], io: CliIO): Promise<CliResult> {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    return out(`${USAGE}\n`);
  }
  if (command === '--version' || command === '-v') {
    return out(`${io.version}\n`);
  }
  const args = parseArgs(rest);
  switch (command) {
    case 'validate': return cmdValidate(args, io);
    case 'lint': return cmdLint(args, io);
    case 'diff': return cmdDiff(args, io);
    case 'bundle': return cmdBundle(args, io);
    case 'migrate': return cmdMigrate(args, io);
    default:
      return err(`Unknown command: ${command}\n\n${USAGE}\n`, EXIT.usage);
  }
}
