# Native engineering provider contract, version 1

This is an integration contract, not a claim that a live provider is available.
Assistant hosts the provider in the already bound IDE process and owns the local
authenticated transport, session lifecycle, user interaction and packaging.
Engineering owns the provider and engineering policy. No component discovers
or attaches to an IDE through ROT on behalf of a request.

## Managed interface

The intended assembly is `TwinCatMcp.Engineering.Host.dll`, targeting .NET
Framework 4.7.2, with no distributed vendor interop assemblies. The host pins
the assembly version and SHA-256 in its own packaging manifest. Until verified,
only TwinCAT 4024 x86 is eligible; x64 and other versions must fail closed.

Namespace `TwinCatMcp.Engineering.Host` exposes:

```csharp
public interface IEngineeringProvider : IDisposable {
    Task<string> DispatchAsync(string requestJson, CancellationToken cancellationToken);
}
public static class EngineeringProviderFactory {
    public static IEngineeringProvider Create(
        object injectedDte,
        Func<string, bool?> authoritativeDirty,
        Func<HostContext> currentContext,
        Func<ApprovalRequest, bool> consumeApproval,
        SynchronizationContext ideContext);
}
```

`HostContext` contains `sessionId` (UUID), `idePid` (integer),
`ideStartedUtc` (UTC ISO 8601), canonical absolute `solutionFile` and
`projectFile`, and monotonically changing `contextEpoch` (string). The host
invalidates the session on rebinding, solution close or project replacement.
`authoritativeDirty` returns true, false, or null (unknown); unknown is never
clean. The host supplies the IDE UI synchronization context. Provider dispatch
must not block the UI waiting for build completion.

The host creates and keeps the random capability secret out of JSON and model
context, authenticates IPC before dispatch, and never accepts a model-selected
session or project. `consumeApproval` is host-owned, single-use and atomic;
its `ApprovalRequest` binds session, operation UUID, operation, exact context
and, for source mutation, the baseline and proposed content digests. Approval
must originate in native user action. A callback refusal fails the request.
Approval tokens and capability secrets must not be logged or returned.

## Envelope

Each request is a UTF-8 JSON object of at most 256 KiB:

```json
{"protocolVersion":1,"sessionId":"uuid","operationId":"uuid","operation":"build.start","expected":{"idePid":1,"ideStartedUtc":"2026-01-01T00:00:00Z","solutionFile":"C:\\example\\a.sln","projectFile":"C:\\example\\a.plcproj","contextEpoch":"1"},"arguments":{}}
```

The response includes `protocolVersion`, `sessionId`, `operationId`, `status`
and `provenance`; optional `output`, `diagnostics`, `result` and `error` are
bounded. Status is one of `accepted`, `running`, `succeeded`, `failed`,
`refused`, `conflict`, `cancelled`, `unknown`, or `unsupported`. Provenance
includes the observed context, observation time and source (`liveBuffer`,
`savedFile`, or `unknown`), plus dirty state (`clean`, `dirty`, or `unknown`).
Errors are sanitized and do not expose capability or approval material.

Operations are `build.start`, `operation.get`, `operation.cancel`,
`diagnostics.read`, `output.read`, `source.read`, `source.preview`,
`source.apply`, and `source.rollback`. `build.start`, `source.apply`, and
`source.rollback` require explicit native approval. Read calls cannot trigger
builds or mutation. Operations may be unsupported; a missing implementation
must return `unsupported`, not simulated success. A build returns `accepted`
and is subsequently queried by its operation UUID. Diagnostics and output
must identify their owning build UUID and never label unrelated IDE Error List
entries as fresh. Results are bounded and include truncation indicators.

All calls revalidate every context field immediately before accessing the IDE.
Operation UUID reuse with different request content is refused; retries do not
repeat an operation. Timeout or cancellation of a submitted mutation has an
`unknown` outcome until independently resolved; never automatically retry it.
Cancellation is best effort and does not assert that an IDE operation stopped.

`source.preview` covers one existing ST object and one section. It records
exact verified text, identity, baseline digest and proposed digest. Apply
requires that exact preview and approval, verifies the current live buffer and
baseline again atomically with mutation, and records a journal. Rollback is an
explicit approved operation that checks the current text equals the journaled
post-image before restoring the pre-image. Unknown buffer state, stale context,
ambiguous identity or unsupported editor semantics must refuse mutation.
Create, delete, multiple files, hardware and Safety changes are out of scope.
No operation implicitly saves, switches configuration/platform, activates,
downloads, logs in, runs, stops or forces values.
