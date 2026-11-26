# Native engineering provider contract, version 1

This contract has a bounded implementation; live IDE acceptance is separate.
Release 0.5.3 leaves all source-editor features dormant. The release host uses
`CreateWithHostAccess` with a null `getTextBuffer` and no section accessor.
Every `source.*` operation is rejected before service construction or approval;
all source capabilities are unsupported. The dedicated Node child exposes nine
session/build/diagnostic tools. All development source code and factories remain
present; the fifteen-tool development catalog requires trusted in-code
`enableDevelopmentSourceTools:true` in those published artifacts. Native
development factories remain opt-in host APIs.

The Assistant Editor profile can launch an owned child with the single
argument `--host-editor-bootstrap-stdin`. It authenticates the same stdin
bootstrap and pipe as `--host-bootstrap-stdin`, then adds seven source tools
to the nine build, session and diagnostic tools.

- `plc_source_targets`
- `plc_source_read`
- `plc_source_preview`
- `plc_source_apply`
- `plc_source_rollback`
- `plc_source_journal`
- `plc_source_create`

Build and Editor modes operate without ADS. The Editor profile supports
Automation Interface ST editing and creation when the native host supplies the
required callbacks and interop types. An eligible open XML buffer supports
preview, apply and rollback. The attached TwinCAT ST editor view provides
read-only previews. Apply and rollback require verified source images and a
separate native approval. For `source.create`, the approval binds the exact
request, target path and kind, expiry, and canonical creation JSON with
normalized initial text and effective defaults.

The Debug child mode `--host-debug-bootstrap-stdin` exposes the
nine build/session/diagnostic tools plus `plc_debug_state` and
`plc_debug_read`. It omits all source mutation tools. A Debug tool makes the
internal `debug.context` request on the authenticated host channel with empty
arguments, using the same correlated session, operation and context envelope.
Only the native host can issue a grant for the selected active project chat.
The native host owns Debug access policy, including automatic read-only access
when enabled in its settings. The child never issues a grant or supplies a
default address/port. The host must recheck the bound online project and its
target on every context request. Configured address evidence must not be
labelled proof of the actual endpoint of an existing login.

A verified response has status `succeeded` and result
`{ loggedIn: true, grantId, amsNetId, adsPort, symbols }` for a legacy allowlist,
optionally with `symbolScope: "allowlist"`. Alternatively the host may return
`{ loggedIn: true, grantId, amsNetId, adsPort, symbolScope: "all" }`, with no
`symbols` field, to allow any valid requested symbol name. Mixed or unknown
scope claims fail closed. Port must be an integer in 851–899. The grant ID is a
nonzero UUID. The list contains between one and 32 unique, case-sensitive names,
at most 160 ASCII characters each. Names support dot-qualified identifiers and
numeric array indexes. The native host rechecks the project mapping, configured
Net ID, configured port and login before issuing or returning any grant.
Changing the profile, chat, bound project, mapping or configured target revokes
approval. A logged-out, stale or unverified session must return a refusal.
The grant records host policy and is not an automated attestation of the
login's ADS endpoint. A grant's scope, identity or endpoint change discards
in-flight read results. `plc_debug_state` reports `symbolScope: "all"` for that
scope, or the allowlisted `symbols` array for compatibility.

The child checks the grant before opening ADS, before each approved symbol
read and again before returning the samples. Each read uses the local ADS
router, disables writes and closes its connection. Responses return at most
eight timestamped scalar samples and discard readings if the grant changes.
The host-side runtime observation and consent flow must be implemented before
this catalog can be adopted.

The in-process `project.online` operation is a read-only observation for the
native host. It takes no arguments and requires authoritative interop bindings.
It reuses the exact PLC association and checks `ITcPlcOnline.IsLoggedIn` on
the selected nested PLC project. The configured Net ID is reported separately,
when canonical. `configuredAdsPort` is an integer in 851–899 or null, read only
from one attribute-free, plain-text direct `PlcProjectDef/AdsPort` in the exact
validated mapping XML. Missing, malformed, ambiguous, namespaced or legacy
`PlcDef` port evidence stays null. No port is guessed. The XML is rechecked
after login observation as well. A changed mapping, target or login state during capture is refused.
The result always carries `runtimeAddressVerified: false`: configuration and
login observations do not verify the ADS port or authorize a Debug grant.

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
    // Unreleased host-authoritative binding opt-in; no fallback to an older factory.
    public static IEngineeringProvider CreateWithInteropTypes(
        object injectedDte, Func<string, bool?> authoritativeDirty,
        Func<HostContext> currentContext, Func<ApprovalRequest, bool> consumeApproval,
        SynchronizationContext ideContext, Func<string, object> getTextBuffer,
        Func<string, bool> navigateExactErrorItem,
        Func<string, string, object> getSectionEditor,
        Func<string, Type> getInteropType);
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

### Engineering 0.5.4 loaded-interop diagnostics

The published 0.5.3 helper returns `association_interop_unavailable` for both
zero and multiple distinct loaded type matches. This diagnostic update separates
those cases without changing the assembly allowlist, interface matching, public
factory signatures or protocol. It does not load an interop assembly or attach
to an IDE. The new codes are not retroactively part of the published 0.5.3
release. Version 0.5.4 preserves its nine-tool, null-editor-accessor release
boundary and does not claim a functional fix for the unconfirmed incident.

All remain `unsupported`, with a fixed interface identifier appended:

- `association_interop_missing_<interface>`: no matching type was found in the
  already-loaded, allowlisted assemblies. An installed PIA file does not prove
  that it is loaded in the provider's AppDomain.
- `association_interop_ambiguous_<interface>`: more than one distinct reflected
  type matched. The resolver does not select the first candidate. Repeated
  references to the same type remain deduplicated.
- `association_interop_inspection_failed_<interface>`: loaded-assembly/type
  inspection threw. Raw loader exception text and file paths are not exposed.

Identifiers are fixed: `envdte_dte`, `envdte_solution`, `envdte_projects`,
`envdte_project`, `envdte_projectitems`, `envdte_projectitem`,
`tcatsysmanagerlib_itcsysmanager` and `tcatsysmanagerlib_itcsmtreeitem`.
Unknown names use `unknown_interface`, not caller-supplied text. The diagnostic
reaches `session.describe.result.buildUnavailableReason` and the association
operation's `error` without adding response fields.

The Beta 5 report establishes an association failure, not which of these cases
occurred. Offline fixtures demonstrate the distinction; they do not reproduce
the user's loaded IDE process. Host readiness must establish its trusted interop
types in the same AppDomain and report ambiguity instead of loading arbitrary
paths or choosing a global candidate. Strong-name authentication and later
EnvDTE80 navigation readiness are separate host concerns; this resolver still
uses its existing loaded-assembly simple-name allowlist.

### Unreleased host-authoritative interop binding

The November 18 Beta 6 report identifies
`association_interop_ambiguous_tcatsysmanagerlib_itcsysmanager`. That establishes
multiple distinct reflected matches, not their assembly identities or COM
equivalence. The historical November 12 missing-versus-duplicate uncertainty
must not be used to reinterpret this newer reason code.

`CreateWithInteropTypes` is an additive, explicitly selected nine-parameter
factory. Its first eight parameters match `CreateWithEditorViews`; the ninth
is the host-only `Func<string,Type> getInteropType`. It is not present in the
published 0.5.4 artifact. Existing factories remain available, and selecting
the new path must not silently fall back to a released factory if absent.
For the dormant release source lane, both editor callbacks remain null; the
navigation callback and other existing host callbacks remain required.

The provider invokes `getInteropType` exactly once for each of these fixed keys
at creation, retaining successes, nulls and failures for its lifetime:

- `EnvDTE.DTE`, `EnvDTE.Events`, `EnvDTE._dispBuildEvents_Event`,
  `EnvDTE.Solution`, `EnvDTE.Projects`, `EnvDTE.Project`,
  `EnvDTE.ProjectItems`, `EnvDTE.ProjectItem`, `EnvDTE.Documents`,
  `EnvDTE.Document`, `EnvDTE.SolutionBuild`, `EnvDTE.SolutionConfiguration`,
  `EnvDTE.SolutionContexts`, `EnvDTE.SolutionContext`,
  `EnvDTE.BuildDependencies`, `EnvDTE.BuildDependency`, `EnvDTE.Windows`,
  `EnvDTE.Window`, `EnvDTE.OutputWindow`, `EnvDTE.OutputWindowPanes`,
  `EnvDTE.OutputWindowPane`, `EnvDTE.TextDocument`, `EnvDTE.TextPoint`,
  `EnvDTE.EditPoint`.
- `EnvDTE80.SolutionConfiguration2`.
- `TCatSysManagerLib.ITcSysManager`, `TCatSysManagerLib.ITcSmTreeItem`,
  `TCatSysManagerLib.ITcSysManager7`, `TCatSysManagerLib.ITcConfigManager`,
  `TCatSysManagerLib.ITcProjectRoot`, `TCatSysManagerLib.ITcPlcDeclaration`,
  and `TCatSysManagerLib.ITcPlcImplementation`.

An accepted value is an actual nongeneric public interface Type with the exact
ordinal FullName, from an assembly already execution-loaded before callback
capture. Wrappers, dynamic and reflection-only types are rejected. One exact
Assembly instance must own the supplied EnvDTE family, and one must own all
supplied TwinCAT interfaces. The EnvDTE80 platform interface must inherit the
exact selected EnvDTE SolutionConfiguration type. `IsImport` is not required
universally because the event interface is managed event plumbing. Missing
optional output/platform types fail their dependent use, not unrelated
association queries. There is no retry or global-discovery fallback in this
authoritative mode. Callback mutation and later assembly arrivals do not change
the frozen choices. Changing that map requires a new provider/session, not a
callback retry or resubmission of an uncertain operation. Fixed `invalid`, `family_mismatch` and
`inheritance_mismatch` diagnostics join the existing bounded failure reasons.

The same binding instance is used by provider association, build preflight,
its nested association/current-context checks, TwinCAT platform access,
EnvDTE80 configuration access, event subscription and build submission.
Unsubscription retains the exact selected event and delegate. Legacy discovery
remains unique-only and no longer selects the first EnvDTE build assembly;
conflicting family views refuse rather than mixing adapters.

Association and build access invoke the selected interface's `PropertyInfo`
getter or `MethodInfo` directly, including inherited interface members and
indexed getters. They do not use `Type.InvokeMember` dispatch or discover
members on the concrete target. A member must have exactly one compatible
signature with the supplied argument count and types; ambiguous overloads,
implicit conversions, omitted optional arguments, generic and by-reference
calls are refused before invocation. A failed invocation is never retried.
Managed metadata fixtures validate these selection rules; they do not establish
live COM compatibility or reproduce the reported native access violation.

The host, not the model or JSON request, authenticates the provenance of its
compiled references. Before candidate adoption it needs actual runtime Type
assembly identities and MVIDs, not only installed-file/ReflectionOnly evidence.
For the conflicting candidates, a separately authorized metadata report should
capture assembly-qualified names, module MVID, public-key token/version,
interface/import/type-equivalence attributes and pairwise `IsEquivalentTo`.
The existing status-only diagnostic report does not already supply these facts.
The helper does not authenticate a PIA merely from its simple name and never
loads an arbitrary vendor path. EnvDTE80 readiness remains unsupported until
the host establishes a trusted reference.

No automatic equivalence merge is performed. Microsoft's
[Type.IsEquivalentTo contract](https://learn.microsoft.com/en-us/dotnet/api/system.type.isequivalentto?view=netframework-4.8.1)
permits different embedded member views. The offline fixture demonstrates two
compiled synthetic COM interfaces that are CLR-equivalent despite different
method sets. Equality of name/GUID alone also does not establish a safe reflected
contract. This candidate is guarded by explicit host authority and target checks;
it is not evidence that the user's actual conflicting pair is equivalent or
that live build/navigation acceptance has passed.

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

Provider requests and responses are UTF-8 JSON objects of at most 1 MiB each.
Their authenticated frames embed the payload as a JSON string and can use up to
2 MiB each.

```json
{"protocolVersion":1,"sessionId":"uuid","operationId":"uuid","operation":"build.start","expected":{"idePid":1,"ideStartedUtc":"2026-01-01T00:00:00Z","solutionFile":"C:\\example\\a.sln","projectFile":"C:\\example\\a.plcproj","contextEpoch":"1"},"arguments":{}}
```

The response includes `protocolVersion`, `sessionId`, `operationId`, `status`
and `provenance`; optional `output`, `diagnostics`, `result` and `error` are
bounded. Status is one of `accepted`, `running`, `succeeded`, `failed`,
`refused`, `conflict`, `cancelled`, `unknown`, or `unsupported`. Provenance
includes the observed context, time and source. Source values include `liveBuffer`,
`liveAttachedDocument`, `automationInterface`, `savedFile` and `unknown`. Automation
Interface provenance reports persistence. Dirty state is `clean`, `dirty` or `unknown`.
Errors are sanitized and do not expose capability or approval material.

Operations include `session.ping`, `session.describe`, `project.association`,
`build.start`, `operation.get`, `operation.cancel`,
`diagnostics.read`, `diagnostics.navigate`, `output.read`, `source.targets`, `source.read`, `source.preview`,
`source.apply`, `source.rollback`, `source.journal` and `source.create`.
`build.start`, `source.apply`, `source.rollback` and `source.create` require explicit native approval. Read calls cannot trigger
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
The unnamespaced `TreeItem/PlcProjectDef/ProjectPath` shape reported by TwinCAT
3.1.4024.78 is supported, alongside the earlier `TreeItem/PlcDef/ProjectPath`
shape. Exactly one definition and one plain-text, attribute-free `ProjectPath`
are required; mixed or duplicate definitions, namespaces, and nested path
elements are rejected. Sibling project metadata does not select the target.
An absent, ambiguous, relative or unverifiable mapping fails
closed. This observation does not authorize a build or a source edit. It is
conditional on the host's loaded Automation Interface and remains unverified
against a live XAE instance.

### Editor profile source operations

With source callbacks and the authoritative interop types, the Editor profile
resolves the bound PLC with `TIPC` and `ITcProjectRoot.NestedProject`.
`session.describe` reports conditional read, preview, apply, rollback and creation.
With both source adapters enabled, `sourceEditorKind` is
`automationInterfaceAndOpenXmlBuffer`.

`source.targets` accepts `{}` to list up to 512 project-wide targets. An optional
canonical physical `moniker` filters results to that file, preferring verified
open XML targets. Automation Interface IDs have the form
`<canonicalPhysicalFile>|<treeRelativePath>`, for example
`C:\plc\POUs\FB_Motor.TcPOU|POUs^FB_Motor^M_Run`. Members share the owning
file. Rows include `qualifiedName`, `kind`, `sections`, `sourceMode: "automationInterface"`,
`applySupported: true`, `language: "ST"` and `treePath`. Every implementation must
attest `IECLANGUAGE_ST` (value `1`). Graphical POUs and their members are excluded.
Declaration-only DUTs, interfaces and GVLs are supported. An ST owner with
unsupported or non-ST members returns `unsupported / mixed_language_owner_unsupported`
on read, preview, apply, rollback and member creation.

Automation Interface section text is normalized to LF and limited to 65,536
UTF-16 units. Source responses are bounded to 1 MiB. Baseline and proposed
digests hash the normalized section text. The `projectRevision` hashes the
length-prefixed association mapping digest and target ID. Apply compares the
bound target, section baseline and owning object's source image, then reads
back the exact proposed text. It checks both the authoritative dirty callback
and matching DTE documents, including member monikers. Unexplained dirty state
returns `conflict / unsaved_editor_changes`. An existing dirty flag is accepted
only while the session's verified post-image and document evidence still match.
A matching unsaved DTE document must expose a stable text observation for a
second write, including rollback. A semicolon suffix can identify a known member
only when the full moniker identifies no separate file on disk. Unrecognized
suffixes mark the owner dirty without contributing text evidence.
A verified pre-setter conflict leaves the preview or rollback journal available
for a new operation ID once the exact baseline or post-image is restored.
The original operation ID replays its conflict. An unknown outcome after
submission keeps the claim. Rollback checks the exact journaled post-image
before restoring the pre-image.
Results and provenance report `source: "automationInterface"` and
`persistence: "mayPersistToDisk"`.

The provider shares a session budget of 16,777,216 UTF-16 units across XML and
Automation Interface preview and journal images and serialized source replay
responses, including attached read-only previews. If storing either a preview's
images or its replay response would exceed the budget, the provider returns
`refused / source_session_memory_limit` and retains no preview ID or images for
that request. The 128 replay slots bound the small receipts, which can still
record apply, rollback and create outcomes at the preview limit. Existing
journals remain readable and usable for rollback. A preview exceeding the
1 MiB transport response limit returns `refused / source_preview_too_large`.

`source.create` accepts these fields.

| Field | Rule |
| --- | --- |
| `parentPath` | Required caret-separated path. Standalone objects require the corresponding `POUs`, `DUTs` or `GVLs` folder or descendant folder. Members require an ST program or function block. |
| `name` | Required non-reserved IEC identifier matching `^[A-Za-z_][A-Za-z0-9_]{0,63}$`. Sibling names are unique without regard to case. |
| `kind` | `fb`, `prg`, `fun`, `method`, `action`, `property`, `dut_struct` or `gvl`. |
| `returnType` | IEC elementary type or non-reserved user-defined type identifier. Required for `fun` and `property`. Omit for void methods and other kinds. |
| `access` | `PUBLIC`, `PRIVATE`, `PROTECTED` or `INTERNAL` for `method` and `property`. The default is `PUBLIC`. |
| `createGet`, `createSet` | Optional property-only booleans. An omitted flag leaves that accessor absent. |
| `declarationText` | Optional initial declaration, up to 65,536 UTF-16 units, normalized to LF. Actions have no declaration. |
| `implementationText` | Optional initial implementation, up to 65,536 UTF-16 units, normalized to LF. Properties, DUT structs and GVLs have no implementation. |
| `approvalExpiresUtc` | Required future UTC timestamp within two minutes. The MCP tool supplies it. |

The creation checks reserve IEC and TwinCAT keywords without regard to case,
including [TwinCAT keywords and export identifiers](https://infosys.beckhoff.com/content/1033/tc3_plc_intro/2529971595.html).

Apply, rollback and creation use the existing `ApprovalRequest` with the operation,
bound context, target, expiry, exact request JSON and request digest. Apply and
rollback include the exact text images, digests and preview or journal IDs.
For create, `TargetObjectId` is `parentPath + "^" + name`, `Section` is `kind`,
`BeforeText` is empty, and `ProposedText` is the canonical creation JSON with
normalized text and effective defaults. `BaselineDigest` hashes the empty string.
`ProposedDigest` hashes the canonical creation JSON. `PreviewId` and `JournalId`
are null for creation.

The provider checks the parent and duplicate name before approval and again
before `CreateChild`. Member owners and standalone destinations must be inside
the PLC project directory. Windows final directory paths establish project
membership and reparse points at or below the project root are rejected. For
standalone objects, the provider uses a single canonical folder `FullPath` from
Automation Interface XML. Otherwise, it requires an unlinked, project-relative
`Folder` item or `Compile` path from the bound `.plcproj`, plus agreement from
every readable standalone sibling path. The project XML is limited to 1 MiB
and cannot use DTDs. Insufficient directory evidence returns
`refused / creation_parent_path_unverified`. An existing file or directory at a
standalone destination, including a case-insensitive name collision, returns
`conflict / target_file_already_exists` for ordinary entries. The provider creates
the selected accessors and verifies the initial sections.
TwinCAT writes the object file or modifies the owning POU file and leaves project
changes pending save. Success reports `persistence: "fileWrittenProjectPendingSave"`
and the created target metadata. An unknown outcome can represent partial
creation. Inspect the project tree before taking further action. The provider
keeps operation IDs in its session replay cache and never retries a submission.

Host integration supplies the three source interop types, accepts `source.create`
in the native approval UI and supports the larger transport bounds. Build and
Debug profiles leave both source callbacks null. Activation, download, online
change, login, runtime writes, forcing, start, stop and deletion remain excluded.

### Open XML editor scope

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
to 65,536 UTF-16 code units and the full XML buffer to 2,097,152 code units.

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

### Attached ST reads and previews

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
verified static Compile membership. Text is bounded to 65,536 UTF-16 units.

`source.targets {moniker}` accepts the canonical physical `.TcPOU` filename.
When raw XML and Automation Interface discovery are unavailable, persisted GUID/name metadata supplies
candidate IDs only. Each returned object and section must independently pass
the attached-editor checks. Results contain `targets` with `objectId`,
`qualifiedName`, `kind`, `sections` and `atomicWriteSupported:false`, plus
`count`, `truncated:false`, `sourceMode:"customStReadOnly"`,
`identitySource:"persistedObjectMetadataAndNativeView"`, `applySupported:false`,
`source:"liveAttachedDocument"`, `dirtyState` and `projectRevision`. Stale metadata that
cannot be matched to the current native view produces no supported target.

For this mode, `source.read` returns live `text`. `source.preview` returns
`beforeText`, `proposedText` and `diff:{offset,deletedText,insertedText}` without
changing the document. Both include `sourceMode:"customStReadOnly"`,
`captureKind:"attachedTwinCatTextDocument"`, `documentDigest`,
`proposedDocumentDigest` (null on read), `projectRevision`, `dirtyState`,
`truncated:false`, `atomicWriteSupported:false` and `applySupported:false`.
Provenance reports `liveAttachedDocument` and the observed dirty state. No mutation-ready
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
time. No secret is included in frames. Provider request and response payloads
are capped at 1 MiB each. The authenticated request and response frames are
capped at 2 MiB each. Handshake frames are capped at 4 KiB. Authentication
failure closes the connection. The client pipe timeout defaults to 30 seconds.
MCP dispatch uses 125 seconds for mutations that carry a native approval
expiry (`build.start`, `source.apply`, `source.rollback`, and `source.create`).
A timeout never triggers another dispatch.
