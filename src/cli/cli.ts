// F27 — the standalone CLI's pure core. Argument parsing, command routing, and
// report formatting live here; all I/O (reading files, fetching remote refs,
// writing streams, exiting) is injected via `CliIO` so every branch is
// unit-testable on in-memory input (F27-NFR-02). Every subcommand delegates to
// the same pure modules the VS Code extension uses — no logic is re-implemented
// (F27-FR-01) and nothing here imports `vscode` (F27-NFR-01).
import * as path from 'path';
import { createSchema } from 'genson-js';
import {
  parseDataText, validateInstances, languageIdForPath, lineAt,
  isMetaSchemaRef, renderMarkdownReport,
  type FileResult, type RunMeta,
} from '../workspaceValidation';
import { parseSchemaText, parseRef, parseJsonPointer, resolvePointer } from '../schemaPointer';
import { languageForSchemaSource } from '../languages';
import { lintSchema } from '../schemaLinter';
import { diffSchemas, summarise, renderReport } from '../schemaDiff';
import { compatibilityVerdict, verdictExitCode, renderCompatReport } from '../schemaCompat';
import { bundleSchema, dereferenceSchema, type ResolvedDoc } from '../schemaBundler';
import { migrateSchema, META_SCHEMA, type TargetDraft } from '../draftMigration';
import { generateAndValidate } from '../sampleDataGenerator';
import { computeCoverage, renderCoverageReport } from '../schemaCoverage';
import { TARGET_LANGUAGES, generateCode } from '../typeGenerator';
import { buildRefGraph, detectCycle, summarizeGraph, renderAdjacencyList, layoutGraph, renderGraphSvg } from '../refGraph';
import {
  parseTestSuite, runTestSuite, renderSuiteReport,
  type SuiteResult, type SuiteProblem, type CaseResult,
} from '../schemaTests';
import { enrichInferredSchema } from '../inferenceEnrich';

/** Injected side-effect surface so `runCli` stays pure and testable. */
export interface CliIO {
  /** Read a file as UTF-8; throws when it cannot be read. */
  readFile(absPath: string): string;
  /** Fetch a remote (`http(s)`) document as text. */
  fetchText(url: string): Promise<string>;
  /** List every file path (recursively) under a directory, for `--workspace`. */
  walk(dir: string): string[];
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
  'jstk (json-schema-toolkit) — schema validation, linting, diff, bundling & migration',
  '',
  'Usage: jstk <command> [options]',
  '',
  'Commands:',
  '  validate <data-file> --schema <schema>   Validate a data file against a schema',
  '  validate <dir> --workspace               Validate every inline-$schema file under a dir',
  '  lint <schema-file>                        Report schema-quality findings',
  '  diff <old-schema> <new-schema>            Show changes between two schemas',
  '      [--check] [--strict]                  …and gate on backward-compatibility',
  '  bundle <schema-file> [--dereference]      Produce one self-contained schema',
  '  migrate <schema-file> --to <draft>        Convert to 2020-12 | 2019-09 | draft-07',
  '  infer <data-file> [--to <draft>] [--plain] Infer a schema from data (default 2020-12)',
  '  sample <schema-file>                      Generate a valid sample instance',
  '  types <schema-file> [--lang <id>]         Generate typed code (default typescript)',
  '  coverage <data-file...> --schema <schema> Report schema coverage from one or more data files',
  '  graph <schema-file> [--svg]               Print the $ref dependency graph',
  '  test <suite-file...>                      Run *.schema.test.json suites',
  '  mcp                                       Serve the tool surface over MCP (stdio)',
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
const VALUE_FLAGS = new Set(['schema', 'to', 'lang']);

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

// ── infer (F27-FR-11) ─────────────────────────────────────────────────────────

function cmdInfer(args: ParsedArgs, io: CliIO): CliResult {
  const [dataFile] = args.positionals;
  if (!dataFile) {
    return err(`infer requires a data file.\n\n${USAGE}\n`, EXIT.usage);
  }
  const target = (args.values.to ?? '2020-12') as TargetDraft;
  if (!TARGET_DRAFTS.includes(target)) {
    return err(`infer's --to must be one of <${TARGET_DRAFTS.join(' | ')}>.\n\n${USAGE}\n`, EXIT.usage);
  }
  const abs = path.resolve(io.cwd, dataFile);
  let text: string;
  try {
    text = io.readFile(abs);
  } catch {
    return err(`Cannot read file: ${dataFile}\n`, EXIT.data);
  }
  const languageId = languageIdForPath(abs) ?? 'json';
  let data: unknown;
  try {
    const items = parseDataText(text, languageId);
    // A JSONL file infers over the array of its records; every other format is a
    // single document, which parseDataText wraps in a one-element array.
    data = languageId === 'jsonl' ? items : items[0];
  } catch (e) {
    return err(`Cannot parse ${dataFile}: ${(e as Error).message}\n`, EXIT.data);
  }
  const structural = createSchema(data as object) as Record<string, unknown>;
  // F06-FR-13/14 — add format/enum from the observed values unless --plain asks
  // for the structural pass alone (F06-FR-15).
  const schema = (args.flags.has('plain') ? structural : enrichInferredSchema(structural, data)) as Record<string, unknown>;
  // Declare the target draft's meta-schema (F06/F22), default 2020-12 (latest).
  const withDraft = { $schema: META_SCHEMA[target], ...schema };
  if (args.flags.has('json')) { return jsonOut({ schema: withDraft }, EXIT.ok); }
  return out(`${JSON.stringify(withDraft, null, 2)}\n`);
}

// ── sample (F27-FR-12) ────────────────────────────────────────────────────────

function cmdSample(args: ParsedArgs, io: CliIO): CliResult {
  const [schemaFile] = args.positionals;
  if (!schemaFile) {
    return err(`sample requires a schema file.\n\n${USAGE}\n`, EXIT.usage);
  }
  const loaded = loadSchema(io, schemaFile);
  if ('fail' in loaded) { return loaded.fail; }

  // Resolve same-document ($ref "#/…") pointers against the root schema (F16).
  const resolveRef = (ref: string): unknown => {
    const { uri, fragment } = parseRef(ref);
    if (uri !== '') { return undefined; } // external refs are out of scope for sample
    return resolvePointer(loaded.schema, parseJsonPointer(fragment));
  };
  const result = generateAndValidate(loaded.schema, { resolveRef });
  if (!result.ok) {
    return err(`Cannot generate a valid sample for ${path.basename(schemaFile)}:\n${result.errors.map((e) => `  ${e}`).join('\n')}\n`, EXIT.data);
  }
  if (args.flags.has('json')) { return jsonOut({ sample: result.value }, EXIT.ok); }
  return out(`${JSON.stringify(result.value, null, 2)}\n`);
}

// ── types (F27-FR-13) ─────────────────────────────────────────────────────────

async function cmdTypes(args: ParsedArgs, io: CliIO): Promise<CliResult> {
  const [schemaFile] = args.positionals;
  if (!schemaFile) {
    return err(`types requires a schema file.\n\n${USAGE}\n`, EXIT.usage);
  }
  const langId = args.values.lang ?? 'typescript';
  const target = TARGET_LANGUAGES.find((t) => t.id === langId);
  if (!target) {
    const ids = TARGET_LANGUAGES.map((t) => t.id).join(', ');
    return err(`Unknown --lang "${langId}". Supported: ${ids}.\n`, EXIT.usage);
  }
  const rootAbs = path.resolve(io.cwd, schemaFile);
  const loaded = loadSchema(io, schemaFile);
  if ('fail' in loaded) { return loaded.fail; }

  // F18 runs on a self-contained schema, so bundle external refs first (F14).
  const stem = path.basename(schemaFile).replace(/\.[^.]+$/, '');
  let code: string;
  try {
    const bundled = await bundleSchema(loaded.schema, makeResolver(io, rootAbs));
    code = await generateCode(bundled.schema, stem, target);
  } catch (e) {
    return err(`Cannot generate ${target.label} types for ${schemaFile}: ${(e as Error).message}\n`, EXIT.data);
  }
  if (args.flags.has('json')) { return jsonOut({ lang: target.id, code }, EXIT.ok); }
  return out(code.endsWith('\n') ? code : `${code}\n`);
}

// ── coverage (F27-FR-14) ──────────────────────────────────────────────────────

function cmdCoverage(args: ParsedArgs, io: CliIO): CliResult {
  const dataFiles = args.positionals;
  const schemaFile = args.values.schema;
  if (!dataFiles.length || !schemaFile) {
    return err(`coverage requires one or more data files and --schema <schema>.\n\n${USAGE}\n`, EXIT.usage);
  }
  const loaded = loadSchema(io, schemaFile);
  if ('fail' in loaded) { return loaded.fail; }

  const instances: unknown[] = [];
  for (const dataFile of dataFiles) {
    const dataAbs = path.resolve(io.cwd, dataFile);
    try {
      instances.push(...parseDataText(io.readFile(dataAbs), languageIdForPath(dataAbs) ?? 'json'));
    } catch (e) {
      return err(`Cannot read or parse ${dataFile}: ${(e as Error).message}\n`, EXIT.data);
    }
  }
  const result = computeCoverage(loaded.schema, instances);
  const header = `${dataFiles.map((f) => path.basename(f)).join(', ')} vs ${path.basename(schemaFile)}`;
  if (args.flags.has('json')) {
    return jsonOut({
      total: result.total,
      exercised: result.exercised.map((p) => p.dataPath),
      unexercised: result.unexercised.map((p) => p.dataPath),
      percent: result.percent,
    }, EXIT.ok);
  }
  return out(`${renderCoverageReport(result, header)}\n`);
}

// ── test (F27-FR-17) ─────────────────────────────────────────────────────────

/** Read + parse a suite fixture file into its single instance. */
function loadInstanceFile(io: CliIO, baseDir: string, relPath: string): unknown {
  const abs = path.resolve(baseDir, relPath);
  return parseDataText(io.readFile(abs), languageIdForPath(abs) ?? 'json')[0];
}

async function cmdTest(args: ParsedArgs, io: CliIO): Promise<CliResult> {
  const suiteFiles = args.positionals;
  if (!suiteFiles.length) {
    return err(`test requires one or more suite files.\n\n${USAGE}\n`, EXIT.usage);
  }

  const reports: string[] = [];
  const payloads: Array<{ suite: string; result: SuiteResult }> = [];
  let failed = 0;

  for (const suiteFile of suiteFiles) {
    const suiteAbs = path.resolve(io.cwd, suiteFile);
    let raw: unknown;
    try {
      raw = parseDataText(io.readFile(suiteAbs), languageIdForPath(suiteAbs) ?? 'json')[0];
    } catch (e) {
      return err(`Cannot read or parse ${suiteFile}: ${(e as Error).message}\n`, EXIT.data);
    }
    const parsed = parseTestSuite(raw);
    if (!parsed.ok) {
      const problems = parsed.problems
        .map((p: SuiteProblem) => `  ${p.pointer || '(root)'}: ${p.message}`)
        .join('\n');
      return err(`Malformed suite ${suiteFile}:\n${problems}\n`, EXIT.data);
    }

    const suiteDir = path.dirname(suiteAbs);
    const ref = parsed.suite.schemaRef;
    let schema: unknown;
    try {
      // The runner never fetches (F29-NFR-02), so the schema is resolved here.
      const source = isRemote(ref) ? ref : path.resolve(suiteDir, ref);
      const text = isRemote(source) ? await io.fetchText(source) : io.readFile(source);
      schema = parseSchemaText(text, languageForSchemaSource(source));
      if (schema === undefined) { throw new Error('schema does not parse'); }
    } catch (e) {
      return err(`Cannot load schema "${ref}" for ${suiteFile}: ${(e as Error).message}\n`, EXIT.data);
    }

    const result = runTestSuite(parsed.suite, schema, {
      loadInstance: (relPath: string) => loadInstanceFile(io, suiteDir, relPath),
    });
    failed += result.failed;
    payloads.push({ suite: path.basename(suiteFile), result });
    reports.push(renderSuiteReport(result, path.basename(suiteFile)));
  }

  const code = failed ? EXIT.finding : EXIT.ok;
  if (args.flags.has('json')) {
    return jsonOut({
      suites: payloads.map(({ suite, result }) => ({
        suite,
        total: result.total,
        passed: result.passed,
        failed: result.failed,
        cases: result.cases.map((c: CaseResult) => ({
          name: c.name, expect: c.expect, passed: c.passed, message: c.message ?? null,
        })),
      })),
      failed,
    }, code);
  }
  return out(`${reports.join('\n')}\n`, code);
}

// ── graph (F27-FR-16) ─────────────────────────────────────────────────────────

function cmdGraph(args: ParsedArgs, io: CliIO): CliResult {
  const [schemaFile] = args.positionals;
  if (!schemaFile) {
    return err(`graph requires a schema file.\n\n${USAGE}\n`, EXIT.usage);
  }
  const loaded = loadSchema(io, schemaFile);
  if ('fail' in loaded) { return loaded.fail; }

  const graph = buildRefGraph(loaded.schema);
  if (args.flags.has('svg')) {
    return out(`${renderGraphSvg(layoutGraph(graph))}\n`);
  }
  if (args.flags.has('json')) {
    return jsonOut({ summary: summarizeGraph(graph), cycle: detectCycle(graph) ?? null, nodes: graph.nodes, edges: graph.edges }, EXIT.ok);
  }
  const cycle = detectCycle(graph);
  const cycleLine = cycle ? `\ncycle: ${cycle.join(' → ')}` : '';
  return out(`${summarizeGraph(graph)}${cycleLine}\n\n${renderAdjacencyList(graph)}\n`);
}

// ── validate --workspace (F27-FR-15) ──────────────────────────────────────────

/** The inline `$schema` binding of a parsed data document, or undefined — a
 *  non-meta-schema `$schema` string is a data-file binding (F10/F20-FR-02); a
 *  meta-schema value means the file is itself a schema, not a bound data file. */
function inlineSchemaRef(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { return undefined; }
  const ref = (parsed as Record<string, unknown>).$schema;
  if (typeof ref !== 'string' || isMetaSchemaRef(ref)) { return undefined; }
  return ref;
}

async function cmdValidateWorkspace(args: ParsedArgs, io: CliIO): Promise<CliResult> {
  const [dirArg] = args.positionals;
  const dir = path.resolve(io.cwd, dirArg ?? '.');
  const files = io.walk(dir)
    .filter((f) => languageIdForPath(f) !== undefined)
    .sort();

  const results: FileResult[] = [];
  for (const abs of files) {
    const relPath = path.relative(dir, abs) || path.basename(abs);
    const languageId = languageIdForPath(abs) ?? 'json';
    let items: unknown[];
    try {
      items = parseDataText(io.readFile(abs), languageId);
    } catch {
      continue; // unparseable / unreadable file — not a schema-bound data file
    }
    const ref = inlineSchemaRef(items[0]);
    if (!ref) { continue; } // only inline-$schema-bound data files are in scope

    const schemaAbs = isRemote(ref) ? ref : path.resolve(path.dirname(abs), ref);
    let schema: unknown;
    try {
      const text = isRemote(schemaAbs) ? await io.fetchText(schemaAbs) : io.readFile(schemaAbs);
      schema = parseSchemaText(text, languageForSchemaSource(schemaAbs));
      if (schema === undefined) { throw new Error('schema does not parse'); }
    } catch (e) {
      results.push({ relPath, folder: '', kind: 'data', status: 'binding-failed', schemaRef: ref, issues: [{ message: `Cannot load schema "${ref}": ${(e as Error).message}` }] });
      continue;
    }
    let issues;
    try {
      issues = validateInstances(items, schema, io.readFile(abs), languageId);
    } catch (e) {
      issues = [{ message: `Cannot validate: ${(e as Error).message}` }];
    }
    results.push({ relPath, folder: '', kind: 'data', status: issues.length ? 'errors' : 'valid', schemaRef: ref, issues });
  }

  const meta: RunMeta = { truncated: false, maxFiles: files.length, untrusted: false, skippedLarge: 0 };
  const hasErrors = results.some((r) => r.status === 'errors' || r.status === 'binding-failed');
  const code = hasErrors ? EXIT.finding : EXIT.ok;
  if (args.flags.has('json')) {
    return jsonOut({ results, checked: results.length }, code);
  }
  if (!results.length) {
    return out(`No inline-$schema-bound data files found under ${dirArg ?? '.'}.\n`);
  }
  return out(`${renderMarkdownReport(results, meta)}\n`, code);
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
    case 'validate': return args.flags.has('workspace') ? cmdValidateWorkspace(args, io) : cmdValidate(args, io);
    case 'lint': return cmdLint(args, io);
    case 'diff': return cmdDiff(args, io);
    case 'bundle': return cmdBundle(args, io);
    case 'migrate': return cmdMigrate(args, io);
    case 'infer': return cmdInfer(args, io);
    case 'sample': return cmdSample(args, io);
    case 'types': return cmdTypes(args, io);
    case 'coverage': return cmdCoverage(args, io);
    case 'graph': return cmdGraph(args, io);
    case 'test': return cmdTest(args, io);
    case 'mcp':
      // The stdio server loop lives in the binary layer (F33-FR-13), which
      // intercepts this command before runCli ever sees it. Reaching here means
      // the pure core was called directly.
      return err('mcp is a stdio server: launch it from an MCP client.\n', EXIT.usage);
    default:
      return err(`Unknown command: ${command}\n\n${USAGE}\n`, EXIT.usage);
  }
}
