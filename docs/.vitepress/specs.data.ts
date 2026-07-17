// Build-time loader for the Specs section (S10-SR-03, S10-NFR-01): joins the
// spec files with the traceability matrix from `specs/` at the repository
// root, so the site is always generated from the source of truth — nothing
// under docs/ duplicates a title, requirement id, or status by hand.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineLoader } from 'vitepress'
import { SPECS_DIR, listSpecFiles } from './specsSource'

export interface SpecRequirement {
  id: string
  status: string
  impl: string[]
  note?: string
}

export interface SpecEntry {
  /** Spec id, e.g. "F01" or "S07". */
  id: string
  /** File basename, e.g. "F01-preview.md" — used for repo links. */
  file: string
  /** Human title from the file's H1, e.g. "Schema Preview Panel". */
  title: string
  kind: 'feature' | 'system'
  requirements: SpecRequirement[]
  /** Requirement count per status, e.g. { implemented: 10, manual: 2 }. */
  counts: Record<string, number>
}

export interface SpecsData {
  specs: SpecEntry[]
  /** Status name → human description, from traceability.json. */
  statuses: Record<string, string>
}

declare const data: SpecsData
export { data }

export default defineLoader({
  watch: [`${SPECS_DIR}/*.md`, `${SPECS_DIR}/traceability.json`],
  load(): SpecsData {
    const matrix = JSON.parse(
      readFileSync(resolve(SPECS_DIR, 'traceability.json'), 'utf-8'),
    ) as {
      statuses: Record<string, string>
      requirements: Record<string, { status: string; impl?: string[]; note?: string }>
    }

    // Group matrix requirements by their spec prefix (F01, S07, …).
    const bySpec = new Map<string, SpecRequirement[]>()
    for (const [id, entry] of Object.entries(matrix.requirements)) {
      const spec = id.split('-')[0]
      const list = bySpec.get(spec) ?? []
      list.push({ id, status: entry.status, impl: entry.impl ?? [], note: entry.note })
      bySpec.set(spec, list)
    }

    const specs: SpecEntry[] = listSpecFiles().map(({ id, file, title, kind }) => {
      const requirements = (bySpec.get(id) ?? []).sort((a, b) => a.id.localeCompare(b.id))
      const counts: Record<string, number> = {}
      for (const r of requirements) counts[r.status] = (counts[r.status] ?? 0) + 1
      return { id, file, title, kind, requirements, counts }
    })

    return { specs, statuses: matrix.statuses }
  },
})
