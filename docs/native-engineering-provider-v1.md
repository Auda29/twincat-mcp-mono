# Native engineering provider contract, version 1

This is an integration contract, not a claim that a live provider is available.
Assistant hosts the provider in the already bound IDE process and owns the local
authenticated transport, session lifecycle, user interaction and packaging.
Engineering owns the provider and engineering policy. No component discovers
or attaches to an IDE through ROT on behalf of a request.

Current limitation: Beckhoff documents `SolutionBuild.BuildProject` targeting
the DTE TwinCAT `.tsproj`; the bound `.plcproj` is located through the TwinCAT
tree rather than directly through DTE. The present build adapter searches DTE for
the bound `.plcproj`, so it may refuse normal projects and has not been verified
to build one. `build.start` is disabled pending a verified target and separately
approved scope. A `.tsproj` build must not be represented as a PLC-only build.
`plc_build_project` is unsupported until a separately scoped command is verified.
The documented path distinction is described in [Beckhoff's project-path
documentation](https://infosys.beckhoff.com/content/1033/tc3_automationinterface/21842608907.html).

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
`projectFile`, and monotonically changing `contextEpoch` (string). The session
is a separate engineering UUID, not a chat ID. The host invalidates it on
rebinding, solution close or project replacement, even on same-path reopen.
The C# `HostContext` has get-only PascalCase properties and constructor
`(Guid sessionId, int idePid, DateTime ideStartedUtc, string solutionFile,
string projectFile, string contextEpoch)`.
`authoritativeDirty` returns true, false, or null (unknown); unknown is never
clean. The host supplies the IDE UI synchronization context. Provider dispatch
must not block the UI waiting for build completion.

The host creates and keeps the random capability secret out of JSON and model
context, authenticates IPC before dispatch, and never accepts a model-selected
session or project. `consumeApproval` is host-owned, single-use and atomic;
its `ApprovalRequest` binds session, operation UUID, operation, exact context,
the exact target object/member, section, preview or journal ID, expiry, canonical
action/request digest and, for source mutation, baseline and proposed content
digests. `ApprovalRequest` has get-only PascalCase properties `SessionId` and
`OperationId` (Guid), `Operation` (string), `Expected` (HostContext),
`TargetObjectId`, `Section`, `PreviewId`, `JournalId` (string), `ExpiresUtc`
(DateTime), `CanonicalRequestDigest`, `BaselineDigest`, and `ProposedDigest`
(string), in that constructor order. Consume immediately before the guarded
action on the IDE thread. `CanonicalRequestDigest` is lowercase SHA-256 of the
exact UTF-8 request JSON bytes before parsing. Duplicate keys at any depth are
rejected. Approval
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

Operations include `session.ping`, `session.describe`, `project.association`,
`build.start`, `operation.get`, `operation.cancel`,
`diagnostics.read`, `output.read`, `source.read`, `source.preview`,
`source.apply`, and `source.rollback`. `build.start`, `source.apply`, and
`source.rollback` require explicit native approval. Read calls cannot trigger
builds or mutation. `operation.get` and `operation.cancel` use a distinct
`arguments.targetOperationId` UUID; cancel is not an Analysis read operation.
Operations may be unsupported; a missing implementation
must return `unsupported`, not simulated success. A build returns `accepted`
and is subsequently queried by its operation UUID. Diagnostics and output
must identify their owning build UUID and never label unrelated IDE Error List
entries as fresh. Results are bounded and include truncation indicators.

All calls revalidate every context field immediately before accessing the IDE.
Effectful operation UUID reuse with different request content is refused; a
bounded, non-evicting session record prevents automatic re-execution. Pure
observational requests are not cached; repeated polls read current state and do
not consume that budget. Timeout or cancellation of a submitted mutation has an
`unknown` outcome until independently resolved; never automatically retry it.
Cancellation is best effort and does not assert that an IDE operation stopped.

`build.start` requires exactly one argument, `approvalExpiresUtc`, an ISO 8601
UTC timestamp ending in `Z`, strictly in the future and no more than two minutes
away. The provider passes that exact instant to `ApprovalRequest.ExpiresUtc`;
the request digest includes the supplied timestamp. Parsed diagnostics include
`navigationAvailable: false` because no exact project-item and source-baseline
attestation has yet been established. A diagnostic path is not navigation proof.

`project.association` takes empty `arguments` and observes the injected DTE
solution. It reports `solutionFile`, `plcProjectFile`, `twinCatProjectFile`
(only for a unique match), `associationCount`, `owningTwinCatPlcChildCount`,
`buildScopeStatus`, `captureKind`, `editorState`, and `dirtyState`.
The child count covers direct `TIPC` children of the unique owner. It does not
describe dependencies or attest build scope; `buildScopeStatus` is `unknown`.
Only the unnamespaced `TreeItem/PlcDef/ProjectPath` XML shape is supported.
An absent, ambiguous, relative or unverifiable mapping fails
closed. This observation does not authorize a build or a source edit. It is
conditional on the host's loaded Automation Interface and remains unverified
against a live XAE instance.

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

## Authenticated pipe framing

The host provisions a fresh 32-byte secret to its owned Node child through
stdin only. Each connection uses one dispatch and a 30-second total deadline.
Frames are strict, exact-key UTF-8 JSON objects terminated by LF. Hex strings
are lowercase; nonces are 32 random bytes. Server hello is
`{protocolVersion:1,sessionId,serverNonce}`; client hello is
`{clientNonce,proof}`; server acknowledgement is `{proof}`. The HMAC-SHA256
key is the raw secret; client proof signs UTF-8
`TCMCP1\nclient\n<sessionId>\n<serverNonce>\n<clientNonce>`, and the server
proof uses `server` in place of `client`.

After mutual proof, the client sends exactly
`{protocolVersion:1,request:<provider JSON string>,proof}`. Its proof signs
the same transcript with domain `request` followed by LF and lowercase SHA-256
of the UTF-8 request string. The response is exactly
`{response:<provider JSON string>,proof}`, signed in the same way with domain
`response` and the response string's digest. Proof comparisons are constant
time. No secret is included in frames. Encoded request, response and handshake
frames are capped at 256 KiB, 512 KiB and 4 KiB respectively. Authentication
failure closes the connection; no dispatch is retried after a timeout.
