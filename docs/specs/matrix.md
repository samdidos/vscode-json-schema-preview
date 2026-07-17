<!-- spec:S10 start -->
# Requirement matrix

Every requirement in the [specs](./) has an entry in
[`specs/traceability.json`](https://github.com/samdidos/vscode-json-schema-preview/blob/main/specs/traceability.json)
recording its implementation status. This table is generated from that file at
build time — it always matches the repository.

Use the **Kind** and **Status** dropdowns to filter — each is multi-select, so
you can pick several values at once (a status keeps the specs that have at
least one requirement in that status). Selections within a dropdown combine as
OR; the two dropdowns and the search box combine as AND. Search by id or title,
and click a spec to read its full text and per-requirement breakdown.

<SpecMatrix />
<!-- spec:S10 end -->
