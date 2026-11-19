param([Parameter(Mandatory = $true)][string]$AssemblyPath)

$ErrorActionPreference = 'Stop'
$assembly = [System.Reflection.Assembly]::ReflectionOnlyLoadFrom([System.IO.Path]::GetFullPath($AssemblyPath))
$factory = $assembly.GetType('TwinCatMcp.Engineering.Host.EngineeringProviderFactory', $true)
$methods = @($factory.GetMethods('Public, Static, DeclaredOnly') | Where-Object Name -CEQ 'CreateWithInteropTypes')
if ($methods.Count -ne 1 -or $methods[0].ReturnType.FullName -cne 'TwinCatMcp.Engineering.Host.IEngineeringProvider') {
    throw 'Packaged helper does not expose the expected Engineering provider factory.'
}

$expected = @(
    'System.Object'
    'System.Func`2[System.String,System.Nullable`1[System.Boolean]]'
    'System.Func`1[TwinCatMcp.Engineering.Host.HostContext]'
    'System.Func`2[TwinCatMcp.Engineering.Host.ApprovalRequest,System.Boolean]'
    'System.Threading.SynchronizationContext'
    'System.Func`2[System.String,System.Object]'
    'System.Func`2[System.String,System.Boolean]'
    'System.Func`3[System.String,System.String,System.Object]'
    'System.Func`2[System.String,System.Type]'
)
$actual = @($methods[0].GetParameters() | ForEach-Object { $_.ParameterType.ToString() })
if (($actual -join '|') -cne ($expected -join '|')) {
    throw 'Packaged helper factory parameters differ from the release contract.'
}
Write-Host 'Verified packaged factory9 signature.'
