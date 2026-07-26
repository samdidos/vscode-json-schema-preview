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

<!-- spec:S19 start -->
## Recording what broke

Conventional Commits already marks which commits are fixes; what it never
captured is *what they fixed*. Every `fix:` commit now names the requirement it
repaired in a trailer, checked by the same `commit-msg` hook that runs
commitlint:

```
fix(auth): treat an unauthenticated GitHub 404 as auth-required

Fixes: F07-FR-03
```

The hook rejects a `fix:` with no trailer, a malformed id, or an id that is not
in the traceability matrix. Dependency patches are exempt — use the `deps`
scope, since patching an advisory repairs no requirement of this project. There
is no other escape hatch: if a fix repairs behaviour no requirement describes,
the requirement gets written first, because behaviour here is specified before
it is built.

Attribution was **not** backfilled onto existing history, and it is not
inferred from the files a commit touched. That inference was tried and
measured: the 8 fix commits in the history touch files claimed by 29 different
specs, correlating 0.89 with raw commit churn — it measures which files are
shared, not which requirements break. Counts come from `git log` on each docs
build, and the count of unattributed fixes is always shown beside them so an
empty column reads as "not recorded yet" rather than "never breaks".
<!-- spec:S19 end -->

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
