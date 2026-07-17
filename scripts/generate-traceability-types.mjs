// S11-SR-03 — regenerate docs/.vitepress/traceability.types.ts from
// specs/traceability.schema.json using the project's OWN F18 code generator
// (src/typeGenerator.ts → out/typeGenerator.js), i.e. the same schema→types
// path the extension exposes to users (S11-NFR-01). The schema is
// self-contained (S11-SR-01), so no F14 bundling is needed before F18.
//
//   npm run codegen:traceability          # write the file
//   node scripts/generate-traceability-types.mjs --check   # fail on drift
//
// The npm script compiles out/typeGenerator.js (tsconfig.codegen.json) first.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = resolve(ROOT, 'specs/traceability.schema.json');
const OUT_PATH = resolve(ROOT, 'docs/.vitepress/traceability.types.ts');
const GENERATOR_PATH = resolve(ROOT, 'out/typeGenerator.js');

const BANNER = `// AUTO-GENERATED — DO NOT EDIT.
// Generated from specs/traceability.schema.json by the project's own F18
// code generator (src/typeGenerator.ts) via \`npm run codegen:traceability\`.
// Edit the schema and regenerate; never hand-edit this file (S11-SR-03/04).

`;

async function render() {
  if (!existsSync(GENERATOR_PATH)) {
    throw new Error(
      `Missing ${GENERATOR_PATH}. Run \`npm run codegen:traceability\` (which ` +
        `compiles it via tsconfig.codegen.json) rather than this script directly.`,
    );
  }
  const { generateTypeScript } = await import(GENERATOR_PATH);
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
  const body = await generateTypeScript(schema, 'TraceabilityMatrix');
  return BANNER + body;
}

const check = process.argv.includes('--check');
const generated = await render();

if (check) {
  const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf-8') : '';
  if (current !== generated) {
    console.error(
      'traceability.types.ts is out of sync with specs/traceability.schema.json.\n' +
        'Run `npm run codegen:traceability` and commit the result.',
    );
    process.exit(1);
  }
  console.log('traceability.types.ts is up to date.');
} else {
  writeFileSync(OUT_PATH, generated);
  console.log(`Wrote ${OUT_PATH}`);
}
