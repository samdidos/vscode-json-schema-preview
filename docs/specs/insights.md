<!-- spec:S10 start -->
# Spec insights

What the spec corpus looks like in aggregate: how many requirements exist and
in what state, how well they are tested and documented, and what the advisory
[effort](./S13) and [value](./S16) estimates add up to.

Every number — and every chart — is derived at build time from the files in
[`specs/`](https://github.com/samdidos/vscode-json-schema-preview/tree/main/specs) —
the same source the [matrix](./matrix) reads, so the two can never disagree.
Counted facts and advisory estimates are kept in separate sections on purpose:
an estimate is a judgement, and mixing the two would lend it an authority it
has not earned.

The counted section charts each spec's requirements by status in the same
colors as the status badges. The advisory section plots customer value
against effort for every scored feature: the [S16](./S16) tier bands sit
behind the dots and the diagonal guides mark constant RICE, so
value-per-effort reads as slope. The per-spec RICE ranking itself lives on
the [matrix](./matrix) page, whose RICE column sorts and carries a
proportional bar — this page deliberately does not repeat it.

Two further charts join artifacts the repository already keeps but never
plotted together: each [S13](./S13) estimate's committed size snapshot against
the size of that code today, which surfaces the estimates that have aged out
of their band, and the [S08](./S08) demo registry against the value ranking,
which surfaces the features nothing demonstrates.

<!-- spec:S18 start -->
## Test strength

Line coverage is gated at 80% on all four axes and every spec clears it,
sitting between 90% and 99% — the gate working, but also a measurement with no
range left to rank anything by. The **mutation score** replaces it as the
test-strength axis: it mutates the source and asks whether the tests notice,
so it measures whether tests *assert* rather than merely execute.

Because a full mutation run takes orders of magnitude longer than the commit
gate, it is never part of `npm run verify`. Refresh it on demand:

```bash
npm run test:mutation   # runs Stryker, writes reports/mutation/mutation.json
npm run mutation:score  # distils it into mutation-score.json
```

That committed artifact stores the mutant tallies per file alongside the
derived score, so the number can be audited and recomputed rather than taken
on trust, and it records the date it was generated — the score is a snapshot of
code that keeps moving, so the charts show its age. If the artifact is absent
the site reports the score as *not measured*; a missing measurement is never
drawn as a zero.
<!-- spec:S18 end -->

<SpecInsights />
<!-- spec:S10 end -->
