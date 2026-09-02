// F32 — prompt construction. Pure and VS Code-free (F32-NFR-01), and the one
// place that decides what leaves the machine: every builder here takes exactly
// the artifacts its command operates on, plus a file's base name, and nothing
// else (F32-FR-13 / S20-SR-07). Absolute paths, workspace layout, credentials
// and unrelated files never reach a prompt because they are never parameters.

import type { VerifyProblem } from './verify';

/** Shared preamble: the model is drafting, and the result will be checked. */
const SCHEMA_RULES = [
  'You are drafting JSON Schema. Reply with a single JSON document and nothing else.',
  'Target draft 2020-12 unless the input declares another $schema.',
  'The result is verified automatically: it must parse, compile under Ajv, lint clean,',
  'and admit at least one valid instance. A schema nothing can satisfy is a failure.',
].join('\n');

/** Cap on how much of a document is sent, so a huge file cannot blow the window. */
const MAX_CHARS = 24_000;

function clip(text: string, max = MAX_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n… (truncated)`;
}

function fence(text: string, lang = 'json'): string {
  return ['```' + lang, clip(text), '```'].join('\n');
}

/** Feedback block appended on a retry (F32-FR-04). Empty on the first attempt. */
export function problemsBlock(problems: VerifyProblem[]): string {
  if (!problems.length) { return ''; }
  return [
    '',
    'Your previous answer was rejected by the automatic checks:',
    ...problems.map(p => `- [${p.stage}] ${p.message}`),
    'Fix exactly these problems and reply with the corrected document.',
  ].join('\n');
}

/** F32-FR-07 — draft a `description` for every property that lacks one. */
export function describePropertiesPrompt(schemaText: string, fileName: string, problems: VerifyProblem[] = []): string {
  return [
    SCHEMA_RULES,
    '',
    `Add a "description" to every property in ${fileName} that does not already have one.`,
    'Write one plain sentence per property, describing what the value means to someone',
    'filling it in — not a restatement of its type. Keep existing descriptions unchanged.',
    'Change NOTHING else: no new or removed properties, no type changes, no reordering.',
    '',
    fence(schemaText),
    problemsBlock(problems),
  ].join('\n');
}

/** F32-FR-09 — a first draft from a natural-language description. */
export function draftSchemaPrompt(description: string, problems: VerifyProblem[] = []): string {
  return [
    SCHEMA_RULES,
    '',
    'Write a JSON Schema for the following data, described by its author:',
    '',
    clip(description, 4_000),
    '',
    'Include a title, a description for every property, an explicit "required" list,',
    'and "additionalProperties": false on object schemas unless openness is clearly wanted.',
    problemsBlock(problems),
  ].join('\n');
}

/** F32-FR-10 — a semantic pass over a structurally-inferred schema. */
export function enrichSchemaPrompt(schemaText: string, fileName: string, problems: VerifyProblem[] = []): string {
  return [
    SCHEMA_RULES,
    '',
    `The schema below was inferred structurally from example data (${fileName}), so it`,
    'carries types but no meaning. Refine it, additively:',
    '- add "format" where a string clearly is a date-time, date, email, uri, uuid or hostname;',
    '- add "enum" where a string is clearly one of a small fixed set;',
    '- add a "title" and per-property "description";',
    '- lift repeated shapes into "$defs" with meaningful names.',
    'Never remove a property and never change an existing property\'s "type".',
    '',
    fence(schemaText),
    problemsBlock(problems),
  ].join('\n');
}

/** F32-FR-08 — explain one finding against the value and subschema that produced it. */
export function explainDiagnosticPrompt(args: {
  message: string;
  value: string;
  subschema: string;
  fileName: string;
}): string {
  return [
    'Explain this JSON Schema validation finding to a developer who did not write the schema.',
    'Answer in at most four sentences of plain prose, no code fences, no restating the error verbatim.',
    'End with the single concrete change that would fix it.',
    '',
    `File: ${args.fileName}`,
    `Reported: ${clip(args.message, 1_000)}`,
    '',
    'The offending value:',
    fence(args.value),
    '',
    'The subschema that rejected it:',
    fence(args.subschema),
  ].join('\n');
}

/** F32-FR-11 — realistic or adversarial instances, gated by Ajv afterwards. */
export function sampleDataPrompt(args: {
  schemaText: string;
  count: number;
  adversarial: boolean;
  problems?: VerifyProblem[];
}): string {
  const goal = args.adversarial
    ? [
      `Produce ${args.count} instances that VIOLATE this schema in ways a real person plausibly would:`,
      'a wrong type, a missing required field, an out-of-range number, a near-miss enum value,',
      'a mistyped property name. Each must be a document someone could realistically write by mistake.',
    ].join('\n')
    : [
      `Produce ${args.count} instances that SATISFY this schema and read like real documents:`,
      'plausible names, dates, identifiers and prose — not "string", "foo" or lorem ipsum.',
      'Vary them meaningfully; do not emit near-duplicates.',
    ].join('\n');

  return [
    'Reply with a single JSON array and nothing else.',
    'Every element is validated against the schema afterwards, and elements that fail the',
    `expectation are discarded — so ${args.adversarial ? 'an accidentally valid' : 'an invalid'} element is wasted output.`,
    '',
    goal,
    '',
    fence(args.schemaText),
    problemsBlock(args.problems ?? []),
  ].join('\n');
}

/** F32-FR-12 — release notes from a computed diff and verdict. */
export function migrationNotesPrompt(args: {
  report: string;
  verdict: string;
  fileName: string;
}): string {
  return [
    'Turn this schema diff into release notes for the consumers of the schema.',
    'The diff and the compatibility verdict below were computed by a rule-based classifier;',
    'treat them as fact and do not re-derive or dispute them.',
    '',
    'Write Markdown with: a one-paragraph summary, then "### Breaking changes" and',
    '"### Other changes" (omit either if empty). For every breaking change, state what',
    'consumers must do, and propose a backward-compatible alternative that would have',
    'avoided it.',
    '',
    `Schema: ${args.fileName}`,
    `Verdict: ${args.verdict}`,
    '',
    fence(args.report, 'markdown'),
  ].join('\n');
}
