// Build-time loader for the maturity evolution diagram (S12-SR-11,
// S12-NFR-01): exposes every committed maturity-history/ snapshot, oldest
// first, so the docs site plots exactly the score changes the repository
// records — nothing under docs/ restates a number.
import { defineLoader } from 'vitepress'
import { HISTORY_GLOB, readMaturityHistory, type MaturitySnapshot } from './maturitySource'

declare const data: MaturitySnapshot[]
export { data }
export type { MaturitySnapshot } from './maturitySource'

export default defineLoader({
  watch: [HISTORY_GLOB],
  load: (): MaturitySnapshot[] => readMaturityHistory(),
})
