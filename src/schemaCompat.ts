// F26 — backward-compatibility verdict & CI gate. Pure and VS Code-free: reduces
// F15's classified diff entries to a single "is the new schema backward-
// compatible?" verdict, maps it to a CI exit code, and renders a verdict-led
// report. Builds only on schemaDiff (F15); the extension command and the
// headless CLI (scripts/schema-compat.mjs) both call in here so they never
// disagree.

import { type DiffEntry, summarise, renderReport } from './schemaDiff';

export interface CompatVerdict {
  compatible: boolean;
  strict: boolean;
  breaking: number;
  nonBreaking: number;
  informational: number;
  unclassified: number;
}

/**
 * Reduce classified diff entries to a verdict (F26-FR-01/02). `compatible` is
 * true when there are no breaking changes; in `strict` mode an unclassified
 * change (safety unproven) also makes it incompatible.
 */
export function compatibilityVerdict(entries: DiffEntry[], opts: { strict?: boolean } = {}): CompatVerdict {
  const c = summarise(entries);
  const strict = opts.strict === true;
  const compatible = c.breaking === 0 && (!strict || c.unclassified === 0);
  return {
    compatible,
    strict,
    breaking: c.breaking,
    nonBreaking: c['non-breaking'],
    informational: c.informational,
    unclassified: c.unclassified,
  };
}

/**
 * CI exit code for a verdict (F26-FR-03): `0` compatible, `1` breaking, `2`
 * strict-mode "compatibility unknown" (no breaking changes but ≥ 1 unclassified).
 */
export function verdictExitCode(verdict: CompatVerdict): 0 | 1 | 2 {
  if (verdict.breaking > 0) { return 1; }
  if (verdict.strict && verdict.unclassified > 0) { return 2; }
  return 0;
}

/** One-line verdict headline conveying severity by text, not colour (S06). */
export function verdictHeadline(verdict: CompatVerdict): string {
  if (verdict.breaking > 0) {
    return `⛔ NOT backward-compatible — ${verdict.breaking} breaking change(s)`;
  }
  if (verdict.strict && verdict.unclassified > 0) {
    return `⚠ Compatibility unknown — ${verdict.unclassified} unclassified change(s) (strict mode)`;
  }
  const suffix = verdict.unclassified > 0 ? ` (${verdict.unclassified} unclassified — not counted)` : '';
  return `✅ Backward-compatible${suffix}`;
}

/** Short verb for the diff command's summary notification (F26-FR-05). */
export function verdictVerb(verdict: CompatVerdict): string {
  return verdict.breaking > 0 ? 'NOT backward-compatible' : 'backward-compatible';
}

/** Verdict-led Markdown report: the headline, then F15's grouped change list. */
export function renderCompatReport(entries: DiffEntry[], header: string, opts: { strict?: boolean } = {}): string {
  const verdict = compatibilityVerdict(entries, opts);
  const body = entries.length ? renderReport(entries, header) : `# Schema diff — ${header}\n\n_No structural changes._`;
  return `${verdictHeadline(verdict)}\n\n${body}`;
}
