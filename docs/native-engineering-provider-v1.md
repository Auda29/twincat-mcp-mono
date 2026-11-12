# Native engineering provider contract, version 1

This contract has a bounded implementation; live IDE acceptance is separate.
Release 0.5.3 leaves all source-editor features dormant. The release host uses
`CreateWithHostAccess` with a null `getTextBuffer` and no section accessor.
Every `source.*` operation is rejected before service construction or approval;
all source capabilities are unsupported. The dedicated Node child exposes nine
session/build/diagnostic tools. All development source code and factories remain
present; the fifteen-tool development catalog requires trusted in-code
`enableDevelopmentSourceTools:true` and is never enabled by CLI/bootstrap/model
arguments. Native development factories remain opt-in host APIs.

The published tag `engineering-v0.5.3` pins commit
`99de69b8cedec780a68a89a631132ea6eb76cf0b`; see
[release assets and integrity verification](release-flow.md). Protocol 1 and
managed assembly version 1.0.0.0 are unchanged. The release nine-tool catalog is
`tc_session_describe`, `tc_project_association`, `tc_build_project`,
`plc_build_project`, `tc_build_and_get_errors`, `tc_error_list`, `tc_output_read`,
`tc_operation_get` and `tc_operation_cancel`. The default child has no ADS
runtime-write, activation, download, login, run/stop or force tool.

Assistant hosts the provider in the already bound IDE process and owns the local
authenticated transport, session lifecycle, user interaction and packaging.
Engineering owns the provider and engineering policy. No component discovers
or attaches to an IDE through ROT on behalf of a request.

Beckhoff documents selective compilation using the full `.plcproj` path in
`SolutionBuild.BuildProject`. The adapter resolves that PLC through its owning
TwinCAT project, verifies the existing solution/PLC configuration and target
platform, and submits the exact PLC path without switching settings. Microsoft
documents dependency builds too, so this implementation refuses any nonempty or
unverifiable dependency array. It never substitutes a `.tsproj` build.
See [Beckhoff's compilation API](https://infosys.beckhoff.com/content/1033/tc3_automationinterface/21842451979.html)
and [Microsoft's dependency scope](https://learn.microsoft.com/en-us/dotnet/api/envdte.solutionbuild.buildproject?view=visualstudiosdk-2017).

## Managed interface

The intended assembly is `TwinCatMcp.Engineering.Host.dll`, targeting .NET
Framework 4.7.2, with no distributed vendor interop assemblies. The host pins
the assembly version and SHA-256 in its own packaging manifest. Until verified,
only TwinCAT 4024 x86 is eligible; x64 and other versions must fail closed.
The injecting host must enforce the agreed exact TcXaeShell/Shell15 x86
15.0.0.0 and TwinCAT 3.1.4024.78 identity before creating the provider. The
factory trusts that native gate; interface presence is not version eligibility.

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
    public static IEngineeringProvider CreateWithEditorAccess(
        object injectedDte,
        Func<string, bool?> authoritativeDirty,
        Func<HostContext> currentContext,
        Func<ApprovalRequest, bool> consumeApproval,
        SynchronizationContext ideContext,
        Func<string, object> getTextBuffer);
    public static IEngineeringProvider CreateWithHostAccess(
        object injectedDte, Func<string, bool?> authoritativeDirty,
        Func<HostContext> currentContext, Func<ApprovalRequest, bool> consumeApproval,
        SynchronizationContext ideContext, Func<string, object> getTextBuffer,
        Func<string, bool> navigateExactErrorItem);
    public static IEngineeringProvider CreateWithEditorViews(
        object injectedDte, Func<string, bool?> authoritativeDirty,
        Func<HostContext> currentContext, Func<ApprovalRequest, bool> consumeApproval,
        SynchronizationContext ideContext, Func<string, object> getTextBuffer,
        Func<string, bool> navigateExactErrorItem,
        Func<string, string, object> getSectionEditor);
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
The original constructor remains available. An additive constructor appends
get-only `RawRequestJson`, `BeforeText`, `ProposedText`, `Configuration` and
`Platform` string properties. The JSON is the exact hashed request. Source
images come from the cached preview or reverse journal, never caller-supplied
diff fields. Build configuration/platform come from the exact validated request.
The host may use this payload for an explicitly opted-in Editor-profile native
confirmation; Analysis must never cause a mutation popup or approval grant.

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
`diagnostics.read`, `diagnostics.navigate`, `output.read`, `source.targets`, `source.read`, `source.preview`,
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

`build.start` requires exactly `approvalExpiresUtc`, `configuration` and
`platform`. `approvalExpiresUtc` is an ISO 8601
UTC timestamp ending in `Z`, strictly in the future and no more than two minutes
away. The provider passes that exact instant to `ApprovalRequest.ExpiresUtc`;
the request digest includes the supplied timestamp. A diagnostic path alone is
not navigation proof. The navigation contract below controls clickable rows.
`session.describe` performs read-only preflight. Only a successful preflight
reports `capabilities.plcBuild: "supported"` with `result.configuration`,
`result.platform`, `buildScope: "plcProject"` and `targetProjectFile` equal to
the bound PLC project. The submitted strings must match before and after native
approval. A supported preflight is not evidence that a real build completed.

`project.association` takes empty `arguments` and observes the injected DTE
solution. It reports `solutionFile`, `plcProjectFile`, `twinCatProjectFile`
(only for a unique match), `associationCount`, `owningTwinCatPlcChildCount`,
`buildScopeStatus`, `captureKind`, `editorState`, and `dirtyState`.
Successful results also include `mappingDigest`, lowercase SHA-256 of the
exact selected XML string encoded as UTF-8, and `observedAtUtc`, a UTC timestamp.
`observationConsistency: "selectedMappingRechecked"` means the provider
reacquired the selected owner and rechecked its path, direct child count and
selected mapping XML before returning. This is a sequential observation.
It does not detect every concurrent change, including a duplicate mapping added
to a different owner after the initial scan, a change that reverts between reads,
or a change after the last check. It is not an atomic solution snapshot or a
source-file/editor baseline. The digest, timestamp and consistency label are null
on non-success.
The child count covers direct `TIPC` children of the unique owner. It does not
describe dependencies or attest build scope; `buildScopeStatus` is `unknown`.
Only the unnamespaced `TreeItem/PlcDef/ProjectPath` XML shape is supported.
An absent, ambiguous, relative or unverifiable mapping fails
closed. This observation does not authorize a build or a source edit. It is
conditional on the host's loaded Automation Interface and remains unverified
against a live XAE instance.

The following source contract is retained development functionality, not an
active release capability. In an explicitly enabled development host,
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

### Development-only live XML editor scope (inactive in release)

`Create` exposes no editor access. `CreateWithEditorAccess` receives a trusted
host callback for an exact canonical, already-open RDT moniker. The host must
verify its bound IDE, cookie, document data and MEF document-buffer identity,
returning the actual `ITextBuffer` or null. It must not open a document. Fresh
read-only reacquisition during transient own-edit suspension may return the same
validated buffer; new native approval must still be refused while suspended.

The implemented source adapter supports a raw `.TcPOU` XML document buffer.
It verifies the source file's direct, unconditional, static `Compile Include`
in a known-clean `.plcproj`, holding a read-only file lease while checking its
bytes. It maps a unique existing POU or direct Method/Action GUID and exact
qualified name to one CDATA declaration or ST implementation. It refuses
properties, projection buffers, custom ST-only editor buffers, namespaces,
unsupported XML metadata and dynamic project membership. Sections are limited
to 16,384 UTF-16 code units and the full buffer to 65,536 code units.

The source object ID is `<canonical .TcPOU path>|<lowercase GUID-D>|<qualifiedName>`.
The provider operations are:

- `source.targets`: `{moniker}` discovers supported existing IDs in the live XML.
- `source.read`: `{objectId,section}` reads the exact current section.
- `source.preview`: `{objectId,section,proposedText}` returns `previewOperationId`,
  `beforeText`, `proposedText`, `projectRevision`, whole-buffer `baselineDigest`
  and `proposedDigest`, and separate section digest fields.
- `source.apply`: `{previewId,approvalExpiresUtc,baselineDigest,proposedDigest,projectRevision}`.
- `source.rollback`: the same approval fields with `journalId` instead of
  `previewId`, using the reverse whole-buffer digests.
- `source.journal`: `{journalId}` reads the original apply journal, including
  unknown and rollback outcomes.

Apply and rollback compare the exact whole XML buffer, buffer object identity,
project revision, context and approval immediately before an `ITextEdit`
transaction. Only the mapped CDATA span changes. There is no disk source write
or save. The transaction's returned snapshot and current buffer must match the
exact post-image; identity loss or uncertainty after submission yields `unknown`.
Legacy `IVsTextLines.LockBuffer` is not used as an atomicity guarantee.

The journal keeps pre/post images in provider memory before submission. It is
not evicted to admit another source mutation, and unknown mutations are never
automatically retried. It survives transient suspension while the provider and
session remain retained, but does not survive provider disposal or a process
restart. A journal does not authorize rollback; rollback needs a new native
approval and exact current post-image. Specialized TwinCAT editor compatibility
and live IDE acceptance remain unverified.

### Development-only attached ST reads and previews (inactive in release)

`CreateWithEditorViews` adds `Func<string,string,object> getSectionEditor` to
the seven-argument `CreateWithHostAccess` factory. Arguments are the exact
`objectId` above and `declaration` or `implementation`. The host returns the
actual attached `_3S.CoDeSys.Core.Views.IEditorView`, or null. On every call it
must verify the physical file, current qualified name, exact bound project,
RDT cookie/document-data identity, object GUID and requested POU/method child
slot. It must not open a document, choose a focused view or infer a section.
For a declaration wrapper it may return the unique concrete IEC text editor
inside that already validated slot, with the same object/project identity.

The provider reflects only public types from already loaded `Core`,
`IECTextEditor.plugin` and `TextDocument` assemblies. It verifies the exact
GUID, pinned positive project handle and `IsDeclarationEditor()`, reads
`GetTextDocument(false).GetText(0, Length)`, then rechecks view, editor,
document, text, context, project revision and known dirty state. It never calls
a text setter. A source may be dirty; its `.plcproj` must be known clean with
verified static Compile membership. Text is bounded to 16,384 UTF-16 units.

`source.targets {moniker}` accepts the canonical physical `.TcPOU` filename.
If the raw XML adapter cannot read it, persisted GUID/name metadata supplies
candidate IDs only. Each returned object and section must independently pass
the attached-editor checks. Results contain `targets` with `objectId`,
`qualifiedName`, `kind`, `sections` and `atomicWriteSupported:false`, plus
`count`, `truncated:false`, `sourceMode:"customStReadOnly"`,
`identitySource:"persistedObjectMetadataAndNativeView"`, `applySupported:false`,
`source:"liveBuffer"`, `dirtyState` and `projectRevision`. Stale metadata that
cannot be matched to the current native view produces no supported target.

For this mode, `source.read` returns live `text`. `source.preview` returns
`beforeText`, `proposedText` and `diff:{offset,deletedText,insertedText}` without
changing the document. Both include `sourceMode:"customStReadOnly"`,
`captureKind:"attachedTwinCatTextDocument"`, `documentDigest`,
`proposedDocumentDigest` (null on read), `projectRevision`, `dirtyState`,
`truncated:false`, `atomicWriteSupported:false` and `applySupported:false`.
Provenance reports `liveBuffer` and the observed dirty state. No mutation-ready
preview ID or whole-buffer mutation digest is issued.

Normal ST custom-editor apply/rollback remain unsupported. Installed metadata
exposes `ITextDocument` setters and `MetaObjectModifyTransaction<T>`, but does
not establish a conditional atomic edit, editor synchronization or failure
rollback contract. Those methods are not used as a substitute for verified
transaction semantics. Properties and other custom editor kinds remain outside
this supported read scope. Assembly inspection and fixtures do not establish
live IDE acceptance.

### Compiler diagnostic navigation

The provider captures a bounded build-source baseline before final build
preflight and DTE submission. It covers direct static Compile sources, exact
project/source bytes and known-clean state, at most 256 files and 16 MiB total.
At most four build baselines are retained; eviction disables navigation for
that build without evicting its effectful operation/replay record. Diagnostics
remain historical output from their explicit completed build operation.

Rows carry a stable lowercase 64-hex `diagnosticId`. Eligible current rows with
an injected host callback report `navigationAvailable:true` and
`navigationKind:"nativeErrorItemExactMatchRequired"`. This means a native
click can attempt an exact current ErrorItem match; it does not attest fresh
Error List contents. Unknown, stale, ambiguous or evicted evidence disables it.

`diagnostics.navigate` takes exactly `{targetOperationId,diagnosticId}`. It is
not exposed as a model MCP tool. The native host must register an explicit
single-use click bound to request/build/diagnostic identity before dispatch.
`CreateWithHostAccess` adds `Func<string,bool> navigateExactErrorItem` to
`CreateWithEditorAccess`. Its text-buffer callback may be null for the dormant
source release mode; the navigation callback does not grant source access.
The provider invokes the navigation callback once, on the IDE thread,
with this bounded JSON proof:

```text
{protocolVersion:1,sessionId,requestOperationId,buildOperationId,diagnosticId,
 expected:{idePid,ideStartedUtc,solutionFile,projectFile,contextEpoch},
 diagnostic:{file,line,column,severity,code,message},
 baseline:{projectFile,projectDigest,sourceFile,sourceDigest,objectId,
           qualifiedName,memberPath,section:null,coordinateKind:"nativeErrorItem"}}
```

The project and selected source have read-only file leases through the native
callback. All captured inputs and context are rechecked before navigation.
Plain physical ErrorItem filenames have null object/qualified-name proof and
empty `memberPath`; an explicit semicolon member suffix must map uniquely.
The host must retain and recheck the unique actual COM ErrorItem and match
file, project, coordinates, severity and exact Description before Navigate.
There is no standalone ErrorItem code/member property. An empty code requires
Description equal to message; a nonempty code requires the exact
`code + ": " + message` relation. No guessed member or path-only fallback is
allowed. Callback entry followed by loss of proof returns `unknown`, with no
automatic retry or claim that navigation did not occur.

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
