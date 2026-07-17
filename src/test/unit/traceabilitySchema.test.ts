// S11 — the traceability matrix has a JSON Schema, its TypeScript types are
// generated from that schema by the project's own F18 generator, and neither
// the data nor the generated file may drift from it. These tests are the
// mechanical guarantee behind S11-SR-02/04.
import * as assert from 'assert';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createAjv } from '../../ajvFactory';
import { generateTypeScript } from '../../typeGenerator';

const ROOT = resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8');

const schema = JSON.parse(read('specs/traceability.schema.json'));
const matrix = JSON.parse(read('specs/traceability.json'));

suite('S11 — traceability matrix schema & generated types', () => {
  test('[S11-SR-01] schema declares a draft and is self-contained (no external $ref)', () => {
    assert.match(String(schema.$schema), /2020-12/);
    const refs = JSON.stringify(schema).match(/"\$ref":"([^"]*)"/g) ?? [];
    for (const ref of refs) {
      assert.ok(ref.includes('"#'), `schema must not reference an external $ref: ${ref}`);
    }
  });

  test('[S11-SR-02] traceability.json validates against its schema', () => {
    const ajv = createAjv(schema, { allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    assert.ok(validate(matrix), ajv.errorsText(validate.errors));
  });

  test('[S11-SR-02] traceability.json binds the schema inline via $schema', () => {
    assert.equal(matrix.$schema, './traceability.schema.json');
  });

  test('[S11-SR-03] generated types expose TraceabilityMatrix, Requirement and a Status union', async () => {
    const ts = await generateTypeScript(schema, 'TraceabilityMatrix');
    assert.match(ts, /export interface TraceabilityMatrix/);
    assert.match(ts, /export interface Requirement/);
    assert.match(ts, /export type Status =[^\n]*"implemented"/);
  });

  test('[S11-SR-04] committed traceability.types.ts matches a fresh generation', async () => {
    const body = await generateTypeScript(schema, 'TraceabilityMatrix');
    const committed = read('docs/.vitepress/traceability.types.ts');
    assert.ok(committed.startsWith('// AUTO-GENERATED'), 'generated banner missing');
    assert.ok(
      committed.trimEnd().endsWith(body.trimEnd()),
      'docs/.vitepress/traceability.types.ts is stale — run `npm run codegen:traceability`',
    );
  });

  test('[S11-SR-05] the docs data loader consumes the generated type, not an inline shape', () => {
    const loader = read('docs/.vitepress/specs.data.ts');
    assert.match(loader, /from '\.\/traceability\.types'/);
    assert.match(loader, /as TraceabilityMatrix/);
  });

  test('[S11-NFR-01] the codegen script reuses the shipped F18 generator', () => {
    const script = read('scripts/generate-traceability-types.mjs');
    assert.match(script, /typeGenerator/);
    assert.match(script, /generateTypeScript/);
  });

  test('[S11-NFR-02] generation is deterministic for an unchanged schema', async () => {
    const [a, b] = await Promise.all([
      generateTypeScript(schema, 'TraceabilityMatrix'),
      generateTypeScript(schema, 'TraceabilityMatrix'),
    ]);
    assert.equal(a, b);
  });
});
