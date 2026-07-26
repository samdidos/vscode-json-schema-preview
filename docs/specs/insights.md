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

<SpecInsights />
<!-- spec:S10 end -->
