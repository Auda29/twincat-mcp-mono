# Release Flow

## Engineering 0.5.9 Automation Interface ST Editor

The Editor catalog gains `plc_source_create` for 16 tools. The Build and Debug
catalogs match the published 0.5.8 assets byte for byte. The Editor catalog
SHA-256 is `bd5d205ceec3f465d732fa921687e5e13b6a9e7f4c17a079bf1915f42704e954`.
The Editor provider adds project-wide Automation Interface ST discovery and
approved source editing and creation. Standalone creation requires a verified
physical parent before approval and again before submission. Missing evidence
returns `refused / creation_parent_path_unverified`. One session budget covers
stored XML and Automation Interface source images and serialized source replay
responses, including attached read-only previews. Existing journals and small
mutation receipts remain usable when the preview budget fills.
The nine-parameter host factory takes three additional authoritative type
names through its existing callback. See the
[provider contract](native-engineering-provider-v1.md#editor-profile-source-operations)
for approval and persistence details.

The isolated TwinCAT 3.1.4024.78 x86 probe passed discovery, reads, edits with
the ST editor closed and open, the dirty rollback guard, rollback after save
and all supported creation kinds. The provider refused the stock project's
build with `unsafe_build_project` because the generated `.plcproj` lacked
the required import. A direct DTE control build completed with zero failed
projects. The out-of-process probe could resolve the closed-file hierarchy
interface, but its dirty-state call returned `E_POINTER`.

### Build and verify the 0.5.9 artifacts

Build from a clean, committed checkout with `scripts/Build-EngineeringRelease.ps1`.
The builder compiles the x86 .NET Framework 4.7.2 helper and verifies factory9
and the exact schemas returned by the three packaged child modes against a
synthetic Windows named pipe.

| Owned child flag | Catalog asset | Tools |
| --- | --- | --- |
| `--host-bootstrap-stdin` | `engineering-catalog.json` | 9 build, session and diagnostic tools |
| `--host-editor-bootstrap-stdin` | `engineering-editor-catalog.json` | 16 tools including source operations |
| `--host-debug-bootstrap-stdin` | `engineering-debug-catalog.json` | 11 tools including read-only PLC observations |

Pin the schema 2 receipt and each downloaded asset from the
[0.5.9 release](https://github.com/Auda29/twincat-mcp-mono/releases/tag/engineering-v0.5.9).
Run the production audit on the assembled Core/MCP runtime and record the
advisories in the release notes. The dependency graph retains the Zod 3 and
fast-xml-parser versions flagged in 0.5.8.

## Historical Engineering 0.5.8 release

0.5.8 adds configured-port evidence and trusted host all-symbol Debug scope.
`project.online.configuredAdsPort` is an integer in 851–899 or null from the
validated `PlcProjectDef` XML. `runtimeAddressVerified` remains false.
The host may issue `symbolScope: "all"` without a symbols field, or retain the
explicit allowlist contract. This is host policy, not model-issued access.
Read-only ADS, scalar bounds, max eight symbols and target/grant rechecks remain.
The Debug catalog has updated descriptions and a new hash; tool counts and
Build/Editor definitions remain unchanged. Use the new receipt for adoption.

The release retains 0.5.7's invocation of association/build members through the selected interface's
`PropertyInfo.GetValue` and `MethodInfo.Invoke`, replacing `Type.InvokeMember`.
Member selection requires one compatible signature; ambiguous or mismatched
calls fail before invocation and no failed invocation is retried. This follows
the reported live `ITcSmTreeItem.ChildCount` dispatch access violation. Local
managed fixtures validate selection behavior, not live COM acceptance.

The release retains 0.5.6's PLC mapping parser support for `TreeItem/PlcProjectDef/ProjectPath`
alongside the earlier `TreeItem/PlcDef/ProjectPath`. Both retain strict single
definition, canonical-path and context recheck requirements. This fixes the
reported XML mismatch; no live IDE or PLC acceptance is claimed. The release
keeps the 0.5.5 protocol, native factory, profile boundaries and dependency graph.
The residual dependency advisories documented for 0.5.5 remain open; the final
release notes report the assembled artifact's audit rather than assuming it clean.

For 0.5.8, the builder uses the locked Node.js dependencies and compiles the x86 .NET
Framework 4.7.2 helper. It reflects the exact factory signature in the helper
and runs the three assembled child modes against a synthetic Windows named pipe.
Each mode must return the exact tool schemas in its catalog before the builder
writes the receipt.

| Owned child flag | Catalog asset | Tools |
| --- | --- | --- |
| `--host-bootstrap-stdin` | `engineering-catalog.json` | 9 build, session and diagnostic tools |
| `--host-editor-bootstrap-stdin` | `engineering-editor-catalog.json` | 15 tools including source operations |
| `--host-debug-bootstrap-stdin` | `engineering-debug-catalog.json` | 11 tools including read-only PLC observations |

The schema 2 receipt records the hashes of the three catalogs under
`catalogs.build`, `catalogs.editor` and `catalogs.debug`. Each catalog is a
standalone release asset and has identical bytes inside the runtime ZIP. The
receipt lists SHA-256 and size for both ZIPs, all three catalogs and all three npm
tarballs. Consumers should pin the receipt and every asset they download.
Node.js 20 or newer is required on the target host.

Hosts use `CreateWithInteropTypes` with nine parameters and supply the trusted
interop type callback. Source callbacks belong to the Editor profile.
The XML editor supports an approved apply and rollback. The ordinary TwinCAT
ST editor supports read and preview. Debug reads require a bound, already logged-in
project and a native operator grant for the confirmed ADS endpoint and exact symbols.
The fixture exercises the packaged transport and catalogs with no live PLC or IDE.

## Historical Engineering 0.5.4 diagnostics release

The `engineering-v0.5.4` GitHub channel uses the same clean-source build,
five primary assets, separate nine-tool catalog and schema 1 receipt as 0.5.3.
Read the new receipt for its exact `sourceCommit`, asset/module hashes and
`sourceTreeSha256`; the 0.5.3 pins below are historical and must not be reused.
The assembled runtime still requires external Node.js 20 or newer and contains
Core/MCP dependencies and our own x86 helper, not Pi's agent runtime or vendor
interop binaries. This tag does not invoke the `core-v*` npm publication chain.

This is a diagnostics-only change. Association failures now identify one of
eight fixed interface names and distinguish missing, ambiguous and failed
inspection of already-loaded types. Matching, fail-closed behavior and host
binding are unchanged. No vendor loading or functional interop remediation is
claimed; the actual Beta 5 missing-versus-duplicate cause remains unconfirmed.

The release keeps exactly nine default tools, `sourceFeatures:"disabled"` and
factory7 `CreateWithHostAccess` with a null editor accessor. All source-editor
development code remains retained but inactive in the release configuration.
No new feature or dependency upgrade is included. Protocol 1, receipt schema 1
and native managed ABI 1.0.0.0 remain unchanged. The prior residual dependency
and real-host acceptance limitations still apply; release notes describe the
audit of the newly assembled artifact without claiming a clean audit.

## Historical Engineering integration release 0.5.3

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
