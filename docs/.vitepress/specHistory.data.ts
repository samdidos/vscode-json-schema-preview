// Build-time loader for each spec page's "Changes over time" section
// (S10-SR-14/15): the spec file's own git history *is* its changelog, so
// nothing under docs/ hand-maintains one — a change to specs/*.md shows up on
// the next docs build with no manual step (S10-NFR-01). The git plumbing
// itself lives in gitHistory.ts, shared with specs.data.ts's Release column
// (S10-SR-17), which needs each spec's oldest commit to resolve the release
// that first shipped it.
import { defineLoader } from 'vitepress'
import { SPECS_DIR, listSpecFiles } from './specsSource'
import { readSpecHistory, type SpecCommit } from './gitHistory'

export type { SpecCommit }
export { readSpecHistory }

export type SpecHistoryData = Record<string, SpecCommit[]>

declare const data: SpecHistoryData
export { data }

export default defineLoader({
  watch: [`${SPECS_DIR}/*.md`],
  load(): SpecHistoryData {
    const out: SpecHistoryData = {}
    for (const { id, file } of listSpecFiles()) {
      out[id] = readSpecHistory(file)
    }
    return out
  },
})
