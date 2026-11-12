$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$nativeRoot = Join-Path $repoRoot 'native'
$hostProject = Join-Path $nativeRoot 'Engineering.Host/TwinCatMcp.Engineering.Host.csproj'
$fixtures = @(Get-ChildItem -Path $nativeRoot -Directory -Filter 'Engineering.*.Tests' | Sort-Object Name | ForEach-Object {
    $project = Join-Path $_.FullName ($_.Name + '.csproj')
    if (-not (Test-Path -LiteralPath $project -PathType Leaf)) {
        throw "Missing fixture project: $project"
    }
    $project
})

if ($fixtures.Count -eq 0) {
    throw 'No native fixture projects found.'
}

Write-Host "Building native host: $hostProject"
& dotnet build $hostProject --configuration Release
if ($LASTEXITCODE -ne 0) { throw "Native host build failed with exit code $LASTEXITCODE." }

foreach ($project in $fixtures) {
    Write-Host "Running native fixture: $project"
    & dotnet run --project $project --configuration Release
    if ($LASTEXITCODE -ne 0) { throw "Native fixture failed with exit code ${LASTEXITCODE}: $project" }
}
