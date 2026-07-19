// Build-time loader for the Maturity section (S12-NFR-01): exposes the
// committed `maturity-score.json` to the overview diagram and the per-
// dimension criteria pages, so the site always renders the score the
// repository actually carries — nothing under docs/ restates a number.
import { defineLoader } from 'vitepress'
import { SCORE_PATH, readMaturityScore, type MaturityScore } from './maturitySource'

declare const data: MaturityScore
export { data }
export type { MaturityScore, MaturityDimension, MaturityCheck } from './maturitySource'

export default defineLoader({
  watch: [SCORE_PATH],
  load: (): MaturityScore => readMaturityScore(),
})
