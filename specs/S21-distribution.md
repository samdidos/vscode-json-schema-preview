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
- **S21-SR-06** The standalone CLI (F27) MUST be released to npm by
  `.github/workflows/publish-cli.yml` through **staged publishing** only:
  the workflow authenticates with npm trusted publishing (OIDC — no stored
  npm token, no `NODE_AUTH_TOKEN`), runs `npm stage publish --provenance`, and
  never `npm publish`, so a version goes live only after a maintainer approves
  it with 2FA. A compromised or mistaken workflow run can therefore at most
  queue a version, never ship one to `npx` users (including the extension's
  pinned MCP server, F33-FR-17). The npm CLI that stages it MUST be installed
  at an exact version (≥ 11.15.0, the first with `npm stage`).
- **S21-SR-07** The CLI workflow MUST run in the `npm` GitHub environment (the
  trusted publisher is bound to it), MUST refuse to stage a version that
  differs from `cli/package.json`'s (a release whose CLI was not bumped, or a
  hand-pushed `cli-v*` tag that does not match), and MUST offer a manual dry
  run that builds and validates the package without staging it.
- **S21-SR-08** The CLI MUST share the extension's version and MUST be
  released by release-please with it: every release PR MUST set
  `cli/package.json`'s `version`, both versions in `cli/server.json` and
  `MCP_PACKAGE_VERSION` (F33-FR-17) to the release version, through
  `extra-files` in `.github/release-please/config.json`, so no version is
  bumped by hand and the extension never pins a CLI version that was not
  released with it. When a release is cut, the CLI workflow MUST stage the CLI
  from the release tag without manual action, detecting the release from the
  release tag pointing at the commit release-please ran on (a tag pushed with
  `GITHUB_TOKEN` fires no `push` workflow), and once staged MUST tag that
  commit `cli-v<version>` from a job that does not hold the npm OIDC
  permission.

## Non-Functional Requirements

- **S21-NFR-01** The Open VSX job MUST hold only the permissions it uses
  (`contents: read`, `attestations: read`) and reach Open VSX with a token
  scoped to the `samdidos` namespace, stored as a secret, never in the
  repository.

## Out of Scope

- Approving a staged CLI version: a maintainer's 2FA step on npm, outside CI.
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

- **2026-11-24** — Added S21-SR-06/07: the CLI moves into this spec's scope
  and is released through npm staged publishing with trusted publishing, so
  CI can only queue a version for a maintainer's 2FA approval.

- **2026-11-25** — Added S21-SR-08 and amended S21-SR-07: the CLI follows the
  extension's version and is released by release-please, instead of a separate
  hand-bumped version and hand-pushed `cli-v*` tag.
