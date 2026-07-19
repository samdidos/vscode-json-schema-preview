// Single place that knows how to read the committed maturity scorecard
// (S12-NFR-01): the data loader, the dynamic route, and the sidebar in
// config.ts all reach `maturity-score.json` at the repository root through
// this module, so no score, weight, slug, or justification is ever duplicated
// by hand under docs/.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// The history folder's shape/ordering rules live with the scripts that write
// it (S12-SR-09/10) — the docs site only reads.
import { readHistory } from '../../scripts/maturity-history-lib.mjs'

export const SCORE_PATH = resolve(__dirname, '../../maturity-score.json')
export const HISTORY_GLOB = resolve(__dirname, '../../maturity-history/*.json')

export interface MaturityCheck {
  /** Check id, e.g. "branch-coverage" — also the docs-page anchor (S12-SR-07). */
  id: string
  /** The check's weight in points (S12-SR-06). */
  points: number
  /** Points earned; absent when the check was skipped for this snapshot. */
  earned?: number
  /** True when the scorer dropped the check from earned/possible (S12-SR-08). */
  skipped?: boolean
  /** The observable fact the check reads. */
  note: string
  /** Justification for the check's weight (S12-SR-01). */
  why: string
}

export interface MaturityDimension {
  label: string
  /** URL-safe page slug, e.g. "spec-process" (S12-SR-01). */
  slug: string
  /** What the dimension measures (S12-SR-01). */
  description: string
  /** Dimension score on the 0..scale axis. */
  score: number
  earned: number
  possible: number
  checks: MaturityCheck[]
}

export interface MaturityScore {
  generatedAt: string
  /** Top of the score axis (5). */
  scale: number
  overall: number
  dimensions: MaturityDimension[]
}

export function readMaturityScore(): MaturityScore {
  return JSON.parse(readFileSync(SCORE_PATH, 'utf-8')) as MaturityScore
}

export interface MaturitySnapshot {
  /** UTC instant of the score change (ISO, second precision). */
  at: string
  /** Short sha of the originating commit — backfilled snapshots only. */
  commit?: string
  scale: number
  overall: number
  dimensions: { label: string; slug: string; score: number }[]
}

/** All history snapshots, oldest first (S12-SR-09/10). */
export function readMaturityHistory(): MaturitySnapshot[] {
  return readHistory(resolve(__dirname, '../..')) as MaturitySnapshot[]
}
