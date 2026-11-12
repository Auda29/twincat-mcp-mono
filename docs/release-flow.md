# Release Flow

## Engineering integration release 0.5.3

The `engineering-v0.5.3` GitHub release distributes an assembled runtime,
package tarballs, provider source archive and an integrity receipt. This tag
does not trigger the separate `core-v*` npm publication chain. Package versions
remain lockstep; a GitHub artifact release does not claim npm publication.

The release host uses factory7 `CreateWithHostAccess` with a null text-buffer
accessor and no section accessor. It must also deny `source.*` before provider
dispatch and keep the source UI hidden. The provider advertises unsupported
source capabilities and denies every source operation in this mode. Its Node
child exposes nine session/build/diagnostic tools. The previous fifteen-tool
development catalog, editor factories and all source implementation remain
in source control, behind explicit trusted in-code development opt-in.

CI runs locked Node/workspace checks and Windows .NET Framework 4.7.2 provider
build/fixtures. These checks and independent code review do not establish live
XAE acceptance. Normal-ST writes remain unsupported even in development until
an exact attached-section atomic transaction and synchronization/failure
contract is proven. The discovered searchable-text MEF bridge does not provide
that contract. Journals are session-memory only and no global IDE cancellation
is performed. Runtime, PLC, deployment and operator actions remain separate.

Run `scripts/Build-EngineeringRelease.ps1` from a clean release commit to
produce the receipt and archives. Consumers must verify release commit and
asset SHA-256 before extraction. Assistant rebuilds the provider from that
exact source and pins its own resulting module bytes. No TwinCAT/VS vendor
assemblies or NuGet packages are distributed with the helper.

The `twincat-mcp` monorepo uses a coordinated lockstep release flow for the
root project, `twincat-mcp-core`, `pi-twincat-ads`, and `twincat-mcp`.

## Version Policy

- Keep the root project, `twincat-mcp-core`, `pi-twincat-ads`, and
  `twincat-mcp` on the same version.
- Keep internal package references on the matching released
  `twincat-mcp-core` version so local npm installs and published manifests use
  the same dependency shape.
- Do not introduce Changesets yet. The repository should remain compatible with
  a later Changesets migration by keeping release notes package-scoped and by
  avoiding ad hoc per-package version bumps.

## Pre-Release Checks

Run the root checks before publishing any package:

```sh
npm run check
npm run check:workspace
npm test
npm run build
npm run pack:dry-run
```

`npm run pack:dry-run` validates the package contents for all three published
packages:

- `twincat-mcp-core`
- `pi-twincat-ads`
- `twincat-mcp`

## Publish Order

1. Publish `twincat-mcp-core`.
2. Publish `pi-twincat-ads` after it resolves the freshly published core.
3. Publish `twincat-mcp` after it resolves the freshly published core.

The Pi and MCP packages both depend on the core package. Publishing the core
first avoids consumers receiving package metadata that points at an unavailable
runtime dependency.

For lockstep releases, push the Core release tag first:

```sh
git push origin core-vX.Y.Z
```

After the Core publish workflow completes successfully, the Pi and MCP publish
workflows start automatically from the same commit through `workflow_run`. Pi
and MCP package tags may be pushed afterwards as release markers; they do not
start publish jobs.

## Package Publish Workflows

The package publish workflows use npm trusted publishing. Configure each npm
package's trusted publisher for GitHub Actions with repository
`Auda29/twincat-mcp-mono` and the matching workflow filename:

| Package | Workflow | Release trigger | Default publish dist-tag |
| --- | --- | --- | --- |
| `twincat-mcp-core` | `publish-core.yml` | `core-v*` tag or Core GitHub Release | `latest` |
| `pi-twincat-ads` | `publish-pi.yml` | successful Core publish workflow | `latest` |
| `twincat-mcp` | `publish-mcp.yml` | successful Core publish workflow | `latest` |

On npmjs.com, fill the Trusted Publisher form as:

- Organization or user: `Auda29`
- Repository: `twincat-mcp-mono`
- Workflow filename: the package-specific filename from the table above
- Environment name: leave empty unless the workflow job also declares a GitHub
  Actions environment with the same name

Each workflow can be started manually with `workflow_dispatch`, by pushing a
Core package version tag, or by publishing a Core GitHub Release whose tag uses
the `core-v*` prefix. The Pi and MCP workflows start automatically after a
successful Core workflow for a `core-v*` tag. Manual runs are always `--dry-run`;
only Core version tags, Core published releases, or Core-triggered follow-up
runs execute the real publish step. npm automatically generates provenance for
trusted publishing from this public repository. Publish jobs skip the publish
step when the package version already exists on npm, so reruns remain safe.

## Changesets Preparation

Changesets can be added later without changing the package boundaries. When that
happens, use a fixed/linked group for `twincat-mcp-core`, `pi-twincat-ads`,
and `twincat-mcp`.
