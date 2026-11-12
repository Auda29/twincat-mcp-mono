param(
    [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'build/engineering-release-0.5.3')
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$version = '0.5.3'
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
        foreach ($package in @('twincat-mcp-core', 'twincat-mcp', 'pi-twincat-ads')) {
            Invoke-Checked npm @('pack', '--workspace', $package, '--pack-destination', $output)
        }
        $stage = Join-Path $output 'runtime-stage'
        New-Item -ItemType Directory -Path $stage | Out-Null
        Copy-Item package.json, package-lock.json, LICENSE -Destination $stage
        foreach ($package in @('core', 'mcp', 'pi')) {
            $destination = Join-Path $stage "packages/$package"
            New-Item -ItemType Directory -Path $destination -Force | Out-Null
            Copy-Item "packages/$package/package.json", "packages/$package/README.md", "packages/$package/LICENSE" -Destination $destination
            Copy-Item "packages/$package/dist" -Destination $destination -Recurse
        }
        Push-Location $stage
        try { Invoke-Checked npm @('ci', '--omit=dev', '--ignore-scripts') } finally { Pop-Location }
        $hostDestination = Join-Path $stage 'host/x86'
        New-Item -ItemType Directory -Path $hostDestination -Force | Out-Null
        Copy-Item $dll -Destination $hostDestination
        $nativeDestination = Join-Path $stage 'native/Engineering.Host'
        New-Item -ItemType Directory -Path $nativeDestination -Force | Out-Null
        Copy-Item (Join-Path $snapshot 'native/Engineering.Host/*.cs') -Destination $nativeDestination
        Copy-Item $hostProject -Destination $nativeDestination
        $catalog = Join-Path $stage 'engineering-catalog.json'
        $helper = Join-Path $snapshot 'scripts/engineering-release-catalog.mjs'
        Invoke-Checked node @($helper, 'catalog', $snapshot, $catalog)
        $catalogHash = Get-Sha256 $catalog
        $materialized = Join-Path $output 'runtime-materialized'
        Invoke-Checked node @($helper, 'copy-runtime', $stage, $materialized)
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $runtimeZip = Join-Path $output "$tag-runtime-win-x86.zip"
        [System.IO.Compression.ZipFile]::CreateFromDirectory($materialized, $runtimeZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
        $assets = @($sourceZip, $runtimeZip) + @(Get-ChildItem -LiteralPath $output -Filter '*.tgz' | ForEach-Object FullName)
        if ($assets.Count -ne 5) { throw 'Expected source, runtime and three npm package assets.' }
        $receipt = [ordered]@{
            schemaVersion = 1; version = $version; tag = $tag; sourceCommit = $commit; protocolVersion = 1; sourceFeatures = 'disabled'
            nativeFactory = [ordered]@{ type = 'TwinCatMcp.Engineering.Host.EngineeringProviderFactory'; method = 'CreateWithHostAccess'; parameterCount = 7; getTextBuffer = $null }
            module = [ordered]@{ assembly = 'TwinCatMcp.Engineering.Host.dll'; assemblyVersion = $assemblyVersion; sha256 = (Get-Sha256 $dll); sourceTreeSha256 = $sourceDigest }
            catalog = [ordered]@{ path = 'engineering-catalog.json'; sha256 = $catalogHash }
            runtimeEntry = 'packages/mcp/dist/index.js'
            assets = @($assets | ForEach-Object { $item = Get-Item -LiteralPath $_; [ordered]@{ filename = $item.Name; sha256 = (Get-Sha256 $item.FullName); size = $item.Length } })
        }
        Write-Json (Join-Path $output "$tag-receipt.json") $receipt
        Write-Host "Release assets and receipt written to $output"
    } finally { Pop-Location }
} finally { Pop-Location }
