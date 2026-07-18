#!/usr/bin/env node
// F26 — headless backward-compatibility gate for CI. Compares two schema files
// with F15's classifier and F26's verdict, prints a verdict-led report, and
// exits 0 (compatible) / 1 (breaking) / 2 (strict "unknown"). It reuses the
// compiled extension modules under out/ (no duplicated logic, no vscode import).
// The `schema:compat` npm script builds those first, so run:
//   npm run schema:compat -- <old> <new> [--strict] [--json]
//
// Usage errors and unreadable/unparseable files exit with a distinct non-zero
// code (64 usage, 65 data) so a pipeline can tell them from a verdict.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const load = (m) => require(path.join(here, '..', 'out', m));

const USAGE =
  'Usage: npm run schema:compat -- <old-schema> <new-schema> [--strict] [--json]\n' +
  '  Exit: 0 backward-compatible, 1 breaking, 2 strict-mode compatibility unknown.';

function fail(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function languageIdFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') { return 'yaml'; }
  if (ext === '.jsonc') { return 'jsonc'; }
  return 'json';
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }
  const strict = argv.includes('--strict');
  const json = argv.includes('--json');
  const positionals = argv.filter((a) => !a.startsWith('--') && a !== '-h');
  if (positionals.length < 2) {
    fail(64, `Expected two schema files.\n${USAGE}`);
  }
  const [oldPath, newPath] = positionals;

  let diffSchemas, parseSchemaText, compat;
  try {
    ({ diffSchemas } = load('schemaDiff.js'));
    ({ parseSchemaText } = load('schemaPointer.js'));
    compat = load('schemaCompat.js');
  } catch (e) {
    fail(65, `Could not load compiled modules from out/ — run \`npm run compile-tests\` first.\n${(e && e.message) || e}`);
  }

  const parseFile = (file) => {
    let text;
    try {
      text = readFileSync(file, 'utf-8');
    } catch {
      fail(65, `Cannot read file: ${file}`);
    }
    const parsed = parseSchemaText(text, languageIdFor(file));
    if (parsed === undefined) { fail(65, `Cannot parse schema: ${file}`); }
    return parsed;
  };

  const oldSchema = parseFile(oldPath);
  const newSchema = parseFile(newPath);

  const entries = diffSchemas(oldSchema, newSchema);
  const verdict = compat.compatibilityVerdict(entries, { strict });
  const exitCode = compat.verdictExitCode(verdict);
  const header = `${path.basename(newPath)} vs ${path.basename(oldPath)}`;

  if (json) {
    process.stdout.write(`${JSON.stringify({ verdict, exitCode, header }, null, 2)}\n`);
  } else {
    process.stdout.write(`${compat.renderCompatReport(entries, header, { strict })}\n`);
  }
  process.exit(exitCode);
}

main();
