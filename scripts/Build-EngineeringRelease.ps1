param(
    [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'build/engineering-release-0.5.12')
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$version = '0.5.12'
$tag = "engineering-v$version"

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE." }
}
function Get-Sha256([string]$Path) { (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() }
function Write-Json([string]$Path, $Value) {
    $json = ($Value | ConvertTo-Json -Depth 30) + "`n"
    [System.IO.File]::WriteAllText($Path, $json, [System.Text.UTF8Encoding]::new($false))
}

Push-Location $repo
try {
    $status = @(git status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect repository status.' }
    if ($status.Count -gt 0) { throw 'The release must be built from a clean committed repository.' }
    $commit = (git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') { throw 'Unable to resolve source commit.' }
    foreach ($file in @('package.json', 'packages/core/package.json', 'packages/mcp/package.json', 'packages/pi/package.json')) {
        if ((Get-Content -Raw -LiteralPath $file | ConvertFrom-Json).version -ne $version) { throw "Unexpected version in $file." }
    }
    $output = [System.IO.Path]::GetFullPath($OutputDir)
    if (Test-Path -LiteralPath $output) { throw "Output path already exists: $output" }
    New-Item -ItemType Directory -Path $output | Out-Null
    $sourceZip = Join-Path $output "$tag-sources.zip"
    $sourceTar = Join-Path $output 'native-source-tree.tar'
    Invoke-Checked git @('archive', '--format=zip', "--output=$sourceZip", $commit)
    Invoke-Checked git @('archive', '--format=tar', "--output=$sourceTar", $commit, 'native/Engineering.Host')
    $sourceDigest = Get-Sha256 $sourceTar
    $snapshot = Join-Path $output 'source-work'
    Expand-Archive -LiteralPath $sourceZip -DestinationPath $snapshot
    Push-Location $snapshot
    try {
        Invoke-Checked npm @('ci', '--ignore-scripts')
        Invoke-Checked npm @('run', 'build')
        $hostProject = Join-Path $snapshot 'native/Engineering.Host/TwinCatMcp.Engineering.Host.csproj'
        Invoke-Checked dotnet @('build', $hostProject, '--configuration', 'Release', '-p:PlatformTarget=x86')
        $dll = Join-Path $snapshot 'native/Engineering.Host/bin/Release/net472/TwinCatMcp.Engineering.Host.dll'
        $assemblyVersion = [System.Reflection.AssemblyName]::GetAssemblyName($dll).Version.ToString()
        if ($assemblyVersion -ne '1.0.0.0') { throw "Unexpected host assembly version: $assemblyVersion" }
        Invoke-Checked powershell.exe @('-NoProfile', '-NonInteractive', '-File', (Join-Path $snapshot 'scripts/Test-EngineeringReleaseFactory.ps1'), $dll)
        foreach ($package in @('twincat-mcp-core', 'twincat-mcp', 'pi-twincat-ads')) {
            Invoke-Checked npm @('pack', '--workspace', $package, '--pack-destination', $output)
        }
        $stage = Join-Path $output 'runtime-stage'
        New-Item -ItemType Directory -Path $stage | Out-Null
        Copy-Item package.json, package-lock.json, LICENSE -Destination $stage
        foreach ($package in @('core', 'mcp')) {
            $destination = Join-Path $stage "packages/$package"
            New-Item -ItemType Directory -Path $destination -Force | Out-Null
            Copy-Item "packages/$package/package.json", "packages/$package/README.md", "packages/$package/LICENSE" -Destination $destination
            Copy-Item "packages/$package/dist" -Destination $destination -Recurse
        }
        Push-Location $stage
        try { Invoke-Checked npm @('ci', '--workspace', 'twincat-mcp-core', '--workspace', 'twincat-mcp', '--include-workspace-root=false', '--omit=dev', '--ignore-scripts') } finally { Pop-Location }
        $vendorBinaries = @(Get-ChildItem -LiteralPath (Join-Path $stage 'node_modules') -Recurse -File | Where-Object { $_.Extension -in @('.node', '.dll', '.exe') })
        if ($vendorBinaries.Count -gt 0) { throw "Runtime dependencies contain native binaries: $($vendorBinaries.FullName -join ', ')" }
        $hostDestination = Join-Path $stage 'host/x86'
        New-Item -ItemType Directory -Path $hostDestination -Force | Out-Null
        Copy-Item $dll -Destination $hostDestination
        $nativeDestination = Join-Path $stage 'native/Engineering.Host'
        New-Item -ItemType Directory -Path $nativeDestination -Force | Out-Null
        Copy-Item (Join-Path $snapshot 'native/Engineering.Host/*.cs') -Destination $nativeDestination
        Copy-Item $hostProject -Destination $nativeDestination
        $helper = Join-Path $snapshot 'scripts/engineering-release-catalog.mjs'
        $catalogPaths = [ordered]@{
            build = 'engineering-catalog.json'
            editor = 'engineering-editor-catalog.json'
            debug = 'engineering-debug-catalog.json'
        }
        $catalogs = [ordered]@{}
        foreach ($profile in $catalogPaths.Keys) {
            $filename = $catalogPaths[$profile]
            $catalog = Join-Path $output $filename
            Invoke-Checked node @($helper, 'catalog', $snapshot, $catalog, $profile)
            $catalogs[$profile] = [ordered]@{ path = $filename; sha256 = (Get-Sha256 $catalog) }
            Copy-Item -LiteralPath $catalog -Destination $stage
        }
        $materialized = Join-Path $output 'runtime-materialized'
        Invoke-Checked node @($helper, 'copy-runtime', $stage, $materialized)
        $previousTestRuntime = $env:TWINCAT_MCP_RELEASE_RUNTIME
        try {
            $env:TWINCAT_MCP_RELEASE_RUNTIME = $materialized
            Invoke-Checked npm @('run', 'test', '--workspace', 'twincat-mcp', '--', 'tests/engineering-bootstrap-integration.test.ts')
        } finally {
            $env:TWINCAT_MCP_RELEASE_RUNTIME = $previousTestRuntime
        }
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $runtimeZip = Join-Path $output "$tag-runtime-win-x86.zip"
        $archive = [System.IO.Compression.ZipFile]::Open($runtimeZip, [System.IO.Compression.ZipArchiveMode]::Create)
        try {
            $prefix = $materialized.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
            Get-ChildItem -LiteralPath $materialized -Recurse -File -Force | ForEach-Object {
                $entry = $_.FullName.Substring($prefix.Length).Replace('\', '/')
                [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
            }
        } finally { $archive.Dispose() }
        $npmAssets = @(Get-ChildItem -LiteralPath $output -Filter '*.tgz' | ForEach-Object FullName)
        if ($npmAssets.Count -ne 3) { throw 'Expected three npm package assets.' }
        $assets = @($sourceZip, $runtimeZip) + @($catalogPaths.Values | ForEach-Object { Join-Path $output $_ }) + $npmAssets
        $receipt = [ordered]@{
            schemaVersion = 2; version = $version; tag = $tag; sourceCommit = $commit; protocolVersion = 1; sourceFeatures = 'profile-scoped'
            nativeFactory = [ordered]@{
                type = 'TwinCatMcp.Engineering.Host.EngineeringProviderFactory'
                method = 'CreateWithInteropTypes'
                parameterCount = 9
                getTextBuffer = 'editor-only'
                getSectionEditor = 'editor-only'
                getInteropType = 'required'
            }
            module = [ordered]@{ assembly = 'TwinCatMcp.Engineering.Host.dll'; assemblyVersion = $assemblyVersion; sha256 = (Get-Sha256 $dll); sourceTreeSha256 = $sourceDigest }
            catalogs = $catalogs
            runtimeEntry = 'packages/mcp/dist/index.js'
            assets = @($assets | ForEach-Object { $item = Get-Item -LiteralPath $_; [ordered]@{ filename = $item.Name; sha256 = (Get-Sha256 $item.FullName); size = $item.Length } })
        }
        Write-Json (Join-Path $output "$tag-receipt.json") $receipt
        Write-Host "Release assets and receipt written to $output"
    } finally { Pop-Location }
} finally { Pop-Location }
