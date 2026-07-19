// F03-FR-15 — select the AJV dialect that matches a schema's declared
// `$schema`. Under a single draft-07 Ajv with `strict: false`, keywords a
// newer draft introduced (2020-12's `prefixItems`, `$dynamicRef`; 2019-09's
// `unevaluatedProperties`, …) are silently ignored rather than enforced, so a
// schema authored against a newer draft can validate incorrectly with no
// warning. `draftOf` is a pure function of the `$schema` string; `createAjv`
// instantiates the matching dialect.

 

export type SchemaDraft = '2020-12' | '2019-09' | 'draft-07';

/** Classify a schema by its declared `$schema` URI. Absent/unknown → draft-07. */
export function draftOf(schema: unknown): SchemaDraft {
  const dollar =
    schema && typeof schema === 'object'
      ? (schema as Record<string, unknown>).$schema
      : undefined;
  if (typeof dollar === 'string') {
    if (dollar.includes('2020-12')) { return '2020-12'; }
    if (dollar.includes('2019-09')) { return '2019-09'; }
  }
  return 'draft-07';
}

/**
 * Instantiate the AJV dialect matching `schema`'s declared draft (F03-FR-15).
 * `Ajv2020` for 2020-12, `Ajv2019` for 2019-09, else the default draft-07 Ajv.
 * `opts` is forwarded to the constructor unchanged.
 */
export function createAjv(schema: unknown, opts: object): import('ajv').default {
  const draft = draftOf(schema);
  if (draft === '2020-12') {
    const Ajv2020 = require('ajv/dist/2020').default as new (o: object) => import('ajv').default;
    return new Ajv2020(opts);
  }
  if (draft === '2019-09') {
    const Ajv2019 = require('ajv/dist/2019').default as new (o: object) => import('ajv').default;
    return new Ajv2019(opts);
  }
  const Ajv = require('ajv').default as new (o: object) => import('ajv').default;
  return new Ajv(opts);
}
