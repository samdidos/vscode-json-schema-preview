// Dynamic route (S12-SR-03, S12-NFR-01): one criteria page per scoring
// dimension, generated at build time straight from the committed
// `maturity-score.json` — a rubric change appears on the next build with no
// edit under docs/. The page template is `[dimension].md`.
import { readMaturityScore } from '../.vitepress/maturitySource'

export default {
  paths() {
    return readMaturityScore().dimensions.map((d) => ({
      params: { dimension: d.slug },
      content: `# ${d.label}\n\n${d.description}\n`,
    }))
  },
}
