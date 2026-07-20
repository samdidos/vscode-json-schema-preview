// Build-time loader for the advisory spec-effort estimates (S13-SR-05):
// reads specs/effort.json — the committed, provenance-carrying judgement —
// and derives nothing itself; the validator (npm run check:spec-effort)
// guarantees the three formats already agree with the calibration chart.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineLoader } from 'vitepress'

export interface SpecEffortEstimate {
  points: number
  basePoints: number
  tshirt: string
  hoursMin: number
  hoursMax: number | null
  factors: string[]
  justification: string
  estimator: string
  estimatedAt: string
  evidence: { implFiles: number; implLoc: number; taggedTests: number; requirements: number }
}

export interface SpecEffortData {
  rubricVersion: number
  specs: Record<string, SpecEffortEstimate>
}

declare const data: SpecEffortData
export { data }

const EFFORT_PATH = resolve(__dirname, '../../specs/effort.json')

export default defineLoader({
  watch: [EFFORT_PATH],
  load: (): SpecEffortData => {
    const raw = JSON.parse(readFileSync(EFFORT_PATH, 'utf-8'))
    return { rubricVersion: raw.rubricVersion, specs: raw.specs }
  },
})
