// Build-time loader for the documentation depth metric (S07-SR-10..13,
// S10-SR-08, S12-SR-14): computed by the same shared library the maturity
// scorer uses, so the chart on the Docs dimension page, the "documented in"
// lists on spec pages, and the score itself can never disagree.
import { resolve } from 'node:path'
import { defineLoader } from 'vitepress'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain-Node .mjs library shared with scripts/, no declarations
import { computeDocCoverage } from '../../scripts/doc-coverage-lib.mjs'

export interface DocSection {
  /** Repo-relative source file, e.g. "docs/guide/index.md" or "README.md". */
  file: string
  /** Docs-site page path ("/guide/") or null for repository-only documents. */
  page: string | null
  /** Nearest heading's text (the section documenting the spec). */
  heading: string
  /** URL anchor for that heading, or null when the file has none. */
  anchor: string | null
  /** Words this section contributes (before overlap merging). */
  words: number
}

export interface SpecDocCoverage {
  id: string
  title: string
  file: string
  documentableRequirements: number
  expectedWords: number
  actualWords: number
  /** min(1, actual/expected) */
  coverage: number
  sections: DocSection[]
}

export interface DocCoverageData {
  wordsPerRequirement: number
  minExpectedWords: number
  specs: SpecDocCoverage[]
}

declare const data: DocCoverageData
export { data }

const ROOT = resolve(__dirname, '../..')

export default defineLoader({
  watch: [
    `${ROOT}/specs/*.md`,
    `${ROOT}/specs/traceability.json`,
    `${ROOT}/README.md`,
    `${ROOT}/docs/**/*.md`,
  ],
  load: (): DocCoverageData => computeDocCoverage(ROOT) as DocCoverageData,
})
