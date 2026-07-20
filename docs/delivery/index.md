<!-- spec:S14 start -->

<script setup>
import { data } from '../.vitepress/dora.data'
</script>

# Delivery performance

Where the [maturity scorecard](/maturity/) measures
**practices** (is the right machinery installed and enforced), this page
measures an **outcome**: the four
[DORA](https://dora.dev/guides/dora-metrics/) delivery-performance metrics —
the industry-standard signal of how well a team ships. Every number is computed
**from git tags and commit history alone** by
[`scripts/dora-metrics.mjs`](https://github.com/samdidos/vscode-json-schema-preview/blob/main/scripts/dora-metrics.mjs),
with no external service, and rendered here from the committed
[`dora.json`](https://github.com/samdidos/vscode-json-schema-preview/blob/main/dora.json).

::: info Release = deployment
This project has no production servers, so **a published release is the unit of
deployment**: the release-please tag → Marketplace publish pipeline is the
"deploy". Change failure rate uses a proxy — a release is counted as a failure
when a semver **patch** (a `fix:`-driven hotfix under release-please) follows
it. The DORA performance bands below target continuously-deployed services, so
they are shown for **reference**, not as a target. These metrics are
deliberately **not** part of the maturity score.
:::

<DoraMetrics />

<!-- spec:S14 end -->
