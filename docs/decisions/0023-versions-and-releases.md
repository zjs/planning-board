# 0023: Versions and releases

Status: Accepted (2026-10-11, the housekeeping slice after sprint 13). The product side is Q77, answered on 2026-10-10.

## Context

Until now the relay had one release, `relay-latest`, deleted and recreated on every merge to `main`, and its image had `latest` and a tag per commit. Someone running a relay for a team had nothing to pin, no notes on what changed, and no way to check that a download was the one CI built. The app's version was `0.0.0`. Q77 settled on a version at the end of each sprint, `v0.N.0`, with notes, checksums and attestations, starting with `v0.13.0`.

## Decision

**The version lives in `package.json`.** A sprint's release pass (`docs/housekeeping.md`) sets it and writes the notes, `docs/releases/vX.Y.Z.md`, in the same PR. A unit test in `npm run check` fails if the current version has no notes, so a missing file stops the PR, not the release.

**The release follows from the merge.** `release.yml` runs after CI passes on `main`. Its first job reads the version and asks whether tag `vX.Y.Z` exists.
- **No tag yet:** it publishes release `vX.Y.Z` from that commit, with the notes as its body and the downloads that CI run built, marks it latest, and tags the image `X.Y.Z`.
- **Either way:** it replaces `relay-latest` and the image's `latest`, as before.

Nobody pushes a tag by hand, and what's released is exactly what CI tested on `main`.

**Every download can be checked.**
- `SHA256SUMS` sits beside the downloads, on both releases.
- Each download, and the image, has a build attestation: signed provenance that `gh attestation verify` checks against this repository and workflow _(recalled)_.

**The programs don't carry the version.** The app and the relay keep naming their commit (`-version`, `/config`, the cheat sheet), and a release's notes and tag map version to commit.
- Embedding the version would make every build after `v0.13.0` also say "0.13.0" until the next release, which misleads in a bug report.
- The commit is never wrong.
- If people ask for a version on screen, a build can learn its version from the tag at release time later.

**Pinned actions.** The third-party actions in `release.yml`, which can push the image, are pinned to commit SHAs. GitHub's own actions stay on major tags. Dependabot, weekly (Q49), keeps both current.

**`v*` tags are protected** by a ruleset: they can be created, but not moved or deleted. `relay-latest` isn't covered, since it's replaced on every merge.

## Alternatives

- **Push a tag by hand to release.** It's one more step to forget, and a tag could point at a commit CI never passed on `main`.
- **Date versions (`2026.10.11`).** These say when, not what. A sprint is already the unit the PM accepts and the compatibility fixtures are cut from, and semver's `0.x` says "early" honestly.
- **Rebuild in the release workflow.** Then what's released wouldn't be what CI tested. The workflow only downloads CI's own artifacts, as it already did for `relay-latest`.

## Consequences

- **The release pass gains two steps,** the version and the notes. The notes are written for someone on the release page, with no sprint or question numbers, and the user-docs test checks them.
- **The release path only runs on `main`,** since `workflow_run` doesn't fire on PRs. A mistake in it shows up as a failed release run after merge, without touching `main` or Pages.
- **Dependabot adds weekly PRs** for npm, Go modules and Actions, which go through CI and self-review like any PR. A Go module it adds needs `npm run notices:relay`, or `go test` fails.
