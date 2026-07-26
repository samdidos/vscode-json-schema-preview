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

  test('[S11-SR-06] schema $id embeds a major-version segment', () => {
    assert.match(String(schema.$id), /^https?:\/\/.+\/v\d+\//, `$id must carry a /vN/ segment: ${schema.$id}`);
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

  // --- lifecycle stamps (S11-SR-07/08/09) ---------------------------------

  const checker = read('scripts/check-traceability.mjs');
  const entries = Object.entries(matrix.requirements) as [string, Record<string, string>][];

  test('[S11-SR-07] the schema declares both lifecycle stamps as optional ISO dates', () => {
    const props = schema.$defs.requirement.properties;
    for (const field of ['specifiedAt', 'implementedAt']) {
      assert.ok(props[field], `schema must declare ${field}`);
      assert.equal(props[field].type, 'string');
      assert.match(props[field].pattern, /\\d\{4\}/);
      assert.ok(
        !(schema.$defs.requirement.required ?? []).includes(field),
        `${field} must stay optional — most entries predate stamping`,
      );
    }
  });

  test('[S11-SR-07] the --init rewrite carries the stamps through', () => {
    // saveMatrix() rebuilds every entry from scratch, so a field it does not
    // copy is a field it deletes. This is the guard against that.
    const save = checker.slice(checker.indexOf('function saveMatrix'), checker.indexOf('// --- main'));
    assert.match(save, /e\.specifiedAt/);
    assert.match(save, /e\.implementedAt/);
  });

  test('[S11-SR-08] --init stamps the dates and validation never writes them', () => {
    const initBlock = checker.slice(checker.indexOf('if (init) {'), checker.indexOf('const errors = []'));
    assert.match(initBlock, /specifiedAt: today\(\)/);
    assert.match(initBlock, /entry\.implementedAt = today\(\)/);
    // Everything after the --init branch is the read-only validation pass.
    const validation = checker.slice(checker.indexOf('const errors = []'));
    assert.ok(
      !/writeFileSync|saveMatrix\(/.test(validation),
      'validation must not write the matrix',
    );
    // A missing stamp is a warning, never an error.
    assert.match(validation, /warnings\.push\([^)]*implementedAt/);
  });

  test('[S11-SR-08] an out-of-order or orphaned stamp is an error', () => {
    const validation = checker.slice(checker.indexOf('const errors = []'));
    assert.match(validation, /implementedAt.*precedes.*specifiedAt/);
    assert.match(validation, /implementedAt but no specifiedAt/);
  });

  test('[S11-SR-08] an impossible calendar date is rejected, not just a bad shape', () => {
    // The schema pattern accepts 2026-13-45; only a real date check rejects it,
    // and this Ajv is built without ajv-formats so `format: "date"` would be
    // silently ignored. The checker must carry the check itself.
    assert.ok(
      !JSON.stringify(schema).includes('"format":"date"'),
      'an inert format keyword would imply a check that never runs',
    );
    assert.match(checker, /invalid \$\{field\} date/);
    // An Invalid Date throws from toISOString(), so the checker must guard
    // before round-tripping or it crashes instead of reporting.
    assert.match(checker, /Number\.isNaN\(parsed\.getTime\(\)\)/);
    const roundTrip = (v: string) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    };
    assert.ok(!roundTrip('2026-13-45'), 'the check must reject an impossible date');
    assert.ok(!roundTrip('2026-02-30'), 'the check must reject a date that overflows its month');
    assert.ok(roundTrip('2026-07-26'), 'the check must accept a real date');
  });

  test('[S11-SR-09] requirements predating stamping are left unstamped, never backfilled', () => {
    const unstamped = entries.filter(([, e]) => !e.specifiedAt);
    assert.ok(
      unstamped.length > 0,
      'the pre-stamping corpus must stay unstamped — a backfill would fabricate dates',
    );
    // Nothing may carry an end date without a start date.
    for (const [id, e] of entries) {
      if (e.implementedAt) {assert.ok(e.specifiedAt, `${id} has implementedAt without specifiedAt`);}
    }
  });

  test('[S11-SR-09] every stamp that exists is a well-formed, ordered date pair', () => {
    for (const [id, e] of entries) {
      if (e.specifiedAt) {assert.match(e.specifiedAt, /^\d{4}-\d{2}-\d{2}$/, `${id} specifiedAt`);}
      if (e.implementedAt) {
        assert.match(e.implementedAt, /^\d{4}-\d{2}-\d{2}$/, `${id} implementedAt`);
        assert.ok(e.implementedAt >= e.specifiedAt, `${id} implementedAt precedes specifiedAt`);
      }
    }
  });
});
