<!-- spec:S12 start -->

<script setup>
import { data } from '../.vitepress/maturity.data'
</script>

# Project maturity

This project keeps a **computed** maturity scorecard: every score below is
produced by
[`scripts/maturity-score.mjs`](https://github.com/samdidos/vscode-json-schema-preview/blob/main/scripts/maturity-score.mjs)
from observable facts in the repository — coverage numbers, workflow config,
the traceability matrix, file presence, lint output — never a hand-set number.
This page renders the committed
[`maturity-score.json`](https://github.com/samdidos/vscode-json-schema-preview/blob/main/maturity-score.json)
at build time, so it always matches the repository. Methodology, history, and
known limitations live in
[`MATURITY.md`](https://github.com/samdidos/vscode-json-schema-preview/blob/main/MATURITY.md).

<p class="maturity-overall">
  <span class="maturity-overall-value">{{ data.overall.toFixed(1) }}<small> / {{ data.scale }}</small></span>
  <span class="maturity-overall-caption">overall — mean of the dimension scores, snapshot of {{ data.generatedAt }}</span>
</p>

Hover a dimension for its exact score; click it (or any entry in the list
below) to see that dimension's criteria — each check's weight and the
justification for that weight.

<MaturityRadar />

## Scores by dimension

<MaturityScoreList />

> This is a **self-relative** rubric: it tracks this repository's trend over
> time and is not a certification comparable across projects.

<style scoped>
.maturity-overall {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 24px;
}
.maturity-overall-value {
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
  color: var(--vp-c-text-1);
}
.maturity-overall-value small {
  font-size: 18px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}
.maturity-overall-caption {
  font-size: 13px;
  color: var(--vp-c-text-2);
}
</style>

<!-- spec:S12 end -->
