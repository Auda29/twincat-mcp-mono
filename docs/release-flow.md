# Release Flow

## Engineering integration release 0.5.3

The `engineering-v0.5.3` GitHub release distributes an assembled runtime,
package tarballs, provider source archive and an integrity receipt. This tag
does not trigger the separate `core-v*` npm publication chain. Package versions
remain lockstep; a GitHub artifact release does not claim npm publication.

Published release: [Engineering MCP 0.5.3](https://github.com/Auda29/twincat-mcp-mono/releases/tag/engineering-v0.5.3).
The tag points to merge commit `99de69b8cedec780a68a89a631132ea6eb76cf0b`.
Both hosted [post-merge CI jobs](https://github.com/Auda29/twincat-mcp-mono/actions/runs/43231859449)
passed. The development implementation at `83a7d226` remains in that history.

### Published assets and installation boundary

Download assets from the release above. Node.js 20 or newer is required and is
not bundled. The archive is an integration artifact, not a TwinCAT installer or
automatic IDE attachment mechanism.

| Asset | Contents |
| --- | --- |
| `engineering-v0.5.3-runtime-win-x86.zip` | Core/MCP production dependencies, `packages/mcp/dist/index.js`, own `host/x86/TwinCatMcp.Engineering.Host.dll`, provider source and catalog |
| `engineering-v0.5.3-sources.zip` | Complete tracked source at the release commit, including dormant development editor code |
| `engineering-v0.5.3-receipt.json` | Schema 1 source/module/catalog pin and five primary asset SHA-256 values/sizes |
| `engineering-catalog.json` | Exact nine released tool schemas; hash is bound by the receipt |
| `twincat-mcp-core-0.5.3.tgz`, `twincat-mcp-0.5.3.tgz`, `pi-twincat-ads-0.5.3.tgz` | Separate package tarballs, not new npm registry publications |

Pi's agent dependencies are not included in the assembled runtime. Its only
native binary is this project's helper DLL; no TwinCAT/VS vendor or NuGet
binaries are included. The ordinary entry point can use a normal configuration
file. Only Assistant's owned child uses `--host-bootstrap-stdin`, with secret
bootstrap through owned-child stdin and the host's exact bound session. Do not
put capability material in config, environment, command-line arguments or logs.

### Verify the release pin before use

The published receipt SHA-256 is
`155a298523117c2e7e7485de092943650bc59d061db0d8c997da8d1065526385`.
Download all seven assets to a dedicated directory and verify before extraction
or execution. For example, in PowerShell:

```powershell
$ErrorActionPreference = 'Stop'
$releaseDir = 'C:\downloads\engineering-v0.5.3'
$receiptPath = Join-Path $releaseDir 'engineering-v0.5.3-receipt.json'
$expectedReceipt = '155a298523117c2e7e7485de092943650bc59d061db0d8c997da8d1065526385'
if ((Get-FileHash -LiteralPath $receiptPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedReceipt) {
    throw 'Release receipt mismatch'
}
$receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
if ($receipt.schemaVersion -ne 1 -or $receipt.version -ne '0.5.3' -or
    $receipt.sourceCommit -ne '99de69b8cedec780a68a89a631132ea6eb76cf0b') {
    throw 'Unexpected release identity'
}
foreach ($asset in $receipt.assets) {
    $path = Join-Path $releaseDir $asset.filename
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.sha256 -or
        (Get-Item -LiteralPath $path).Length -ne $asset.size) {
        throw "Asset mismatch: $($asset.filename)"
    }
}
$catalogPath = Join-Path $releaseDir $receipt.catalog.path
if ((Get-FileHash -LiteralPath $catalogPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.catalog.sha256) {
    throw 'Tool catalog mismatch'
}
```

The runtime ZIP SHA-256 is
`0086cfc31cfb697075efbd1332f58b4146a95f544f5c34daa8a2d65b0f43b5f1`.
The receipt also records module assembly version `1.0.0.0`, protocol 1,
`sourceFeatures: "disabled"`, the seven-argument null-accessor factory, module
bytes and native source-tree hash. Assistant rebuilds the provider from the
exact released source and pins its own module hash; independently built DLL
bytes may differ across build paths or SDKs. Do not substitute an arbitrary
developer-folder DLL or treat matching assembly names as integrity proof.

### Released engineering scope

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

The runtime dependency audit is not clean. In particular, retained Zod 3 is
affected by GHSA-mrhx-c7xc-m3w5, an availability issue when validating oversized
typed collections. The nine live-tool inputs have no array collections, but
ordinary stdio tools do, and `.max()` does not fully mitigate the advisory.
SDK stdin limits are separate from the smaller authenticated provider frame
limits. A Zod major migration is deferred, not claimed fixed or universally
unreachable. Consumers should use trusted local clients and retain this risk
in their release assessment. The final assembled runtime audit also reported
one low fast-xml-parser advisory,
[GHSA-474x-hrwr-fgx4](https://github.com/advisories/GHSA-474x-hrwr-fgx4).
The high Zod advisory is
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
These two findings describe the released runtime snapshot, not every development
or Pi dependency in the full workspace. No clean audit or universal
non-exploitability claim is made.

## Separate npm publication flow

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
