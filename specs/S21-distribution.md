# S21 — Distribution

## Overview

The extension is built once per release and published from
`.github/workflows/publish.yml`. Until this spec it went to one registry, the
Visual Studio Marketplace, whose terms limit it to Microsoft's own products.
Editors built on VS Code that cannot use it — VSCodium, Cursor, Windsurf,
Gitpod, Eclipse Theia — install from [Open VSX](https://open-vsx.org), where
the extension did not exist, so their users had to download the `.vsix` from a
GitHub release and install it by hand, with no updates (#254).

Publishing to a second registry must not weaken the supply-chain posture the
first one has: the `.vsix` carries SLSA build provenance, and actions are
SHA-pinned. So the rule is **one build, two registries** — Open VSX receives
the identical, attested file, never a second build.

## User Stories

- As a VSCodium or Cursor user, I want to install the extension from my
  editor's extension view and receive updates, like any other extension.
- As a maintainer, I want an Open VSX problem never to block a Marketplace
  release, and a missing Open VSX token to be visible rather than silent.
- As a security-minded user, I want the Open VSX file to be byte-identical to
  the one whose provenance is attested.

## Functional Requirements

- **S21-SR-01** Each extension release published to the Visual Studio
  Marketplace MUST also be published to Open VSX under the same
  `publisher.name` (`samdidos.json-schema-preview`), by the release workflow
  (`.github/workflows/publish.yml`), with no manual step beyond approving the
  release.
- **S21-SR-02** The file published to Open VSX MUST be the `.vsix` attached to
  the GitHub release — the one the Marketplace received — and the workflow
  MUST verify it against the SLSA build provenance recorded for the release
  (`gh attestation verify`) before publishing it. It MUST NOT be rebuilt. The
  publishing tool (`ovsx`) MUST be run at an exact version.
- **S21-SR-03** Open VSX publishing MUST run as its own job after the
  Marketplace job, so its failure cannot stop the Marketplace publish, the
  release asset upload, or the draft-to-published flip. When the `OVSX_PAT`
  secret is absent the job MUST skip publishing and emit a workflow warning
  naming the tag, rather than fail; a failure with the token present MUST fail
  that job visibly (no `continue-on-error`, S09-SR-08).
- **S21-SR-04** The README's install instructions MUST link the Open VSX
  listing alongside the Marketplace one.

- **S21-SR-05** A manual run of the release workflow MUST be able to publish
  an **existing** release to Open VSX alone (`open_vsx_only`), skipping the
  Marketplace job entirely, so a release that is already on the Marketplace —
  one published before S21, or whose Open VSX job never ran because a later
  step of the Marketplace job failed — can still reach Open VSX. It MUST use
  the same job, and so the same release asset and attestation check, as an
  ordinary release (S21-SR-02). Without that input the Open VSX job MUST still
  run only after a successful Marketplace publish.

## Non-Functional Requirements

- **S21-NFR-01** The Open VSX job MUST hold only the permissions it uses
  (`contents: read`, `attestations: read`) and reach Open VSX with a token
  scoped to the `samdidos` namespace, stored as a secret, never in the
  repository.

## Out of Scope

- Publishing the standalone CLI (F27), which goes to npm (`publish-cli.yml`).
- Other registries (e.g. JetBrains Marketplace) — the extension targets the VS
  Code extension API only.
- Claiming the Open VSX namespace and creating the token: a one-time
  maintainer step outside the repository.

## Acceptance Criteria

1. With `OVSX_PAT` set, a release appears on Open VSX with the same version as
   on the Marketplace, and the job log shows the attestation check passing.
2. With `OVSX_PAT` unset, the release still publishes to the Marketplace and
   GitHub, and the run shows a warning that Open VSX was skipped.
3. A failed Open VSX publish leaves the Marketplace release and the published
   GitHub release intact, and shows as a failed job.
4. The README links both registries.

## History

- **2026-11-23** — Created for #254: publish the same attested `.vsix` to Open
  VSX in a job of its own, skipping with a warning until the namespace token
  exists.

- **2026-11-24** — Added S21-SR-05: an "Open VSX only" manual run, to publish
  v0.21.0 (released before S21) and any release whose Open VSX job was skipped.
  A re-run of the whole workflow cannot do it, because the Marketplace step
  fails on a version that is already published.
