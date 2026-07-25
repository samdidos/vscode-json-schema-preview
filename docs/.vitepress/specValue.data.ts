// Build-time loader for the advisory customer-value estimates (S16-SR-07):
// reads specs/value.json — the committed, provenance-carrying judgement — and
// joins it to specs/effort.json to derive RICE at build time (S16-SR-05: the
// ratio is never stored). The validator (npm run check:spec-value) guarantees
// the score and tier already agree with the calibration chart.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineLoader } from 'vitepress'

export interface SpecValueEstimate {
  reach: number
  impact: number
  confidence: number
  factors: string[]
  score: number
  tier: string
  justification: string
  estimator: string
  estimatedAt: string
  /** Derived here, not stored: score ÷ S13 effort points. */
  rice: number | null
  points: number | null
}

export interface SpecValueData {
  rubricVersion: number
  features: Record<string, SpecValueEstimate>
}

declare const data: SpecValueData
export { data }

const VALUE_PATH = resolve(__dirname, '../../specs/value.json')
const EFFORT_PATH = resolve(__dirname, '../../specs/effort.json')

export default defineLoader({
  watch: [VALUE_PATH, EFFORT_PATH],
  load: (): SpecValueData => {
    const raw = JSON.parse(readFileSync(VALUE_PATH, 'utf-8'))
    const effort = JSON.parse(readFileSync(EFFORT_PATH, 'utf-8'))
    const features: Record<string, SpecValueEstimate> = {}
    for (const [id, v] of Object.entries(raw.features as Record<string, SpecValueEstimate>)) {
      const points = effort.specs?.[id]?.points ?? null
      features[id] = {
        ...v,
        points,
        rice: points ? Math.round((v.score / points) * 100) / 100 : null,
      }
    }
    return { rubricVersion: raw.rubricVersion, features }
  },
})
