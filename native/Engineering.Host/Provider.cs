using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace TwinCatMcp.Engineering.Host
{
    public sealed class HostContext
    {
        public Guid SessionId { get; }
        public int IdePid { get; }
        public DateTime IdeStartedUtc { get; }
        public string SolutionFile { get; }
        public string ProjectFile { get; }
        public string ContextEpoch { get; }
        public HostContext(Guid sessionId, int idePid, DateTime ideStartedUtc, string solutionFile, string projectFile, string contextEpoch)
        { SessionId = sessionId; IdePid = idePid; IdeStartedUtc = ideStartedUtc; SolutionFile = solutionFile; ProjectFile = projectFile; ContextEpoch = contextEpoch; }
    }

    public sealed class ApprovalRequest
    {
        public Guid SessionId { get; }
        public Guid OperationId { get; }
        public string Operation { get; }
        public HostContext Expected { get; }
        public string TargetObjectId { get; }
        public string Section { get; }
        public string PreviewId { get; }
        public string JournalId { get; }
        public DateTime ExpiresUtc { get; }
        public string CanonicalRequestDigest { get; }
        public string BaselineDigest { get; }
        public string ProposedDigest { get; }
        public string RawRequestJson { get; }
        public string BeforeText { get; }
        public string ProposedText { get; }
        public string Configuration { get; }
        public string Platform { get; }
        public ApprovalRequest(Guid sessionId, Guid operationId, string operation, HostContext expected,
            string targetObjectId, string section, string previewId, string journalId, DateTime expiresUtc,
            string canonicalRequestDigest, string baselineDigest, string proposedDigest)
            : this(sessionId, operationId, operation, expected, targetObjectId, section, previewId, journalId, expiresUtc,
                canonicalRequestDigest, baselineDigest, proposedDigest, null, null, null, null, null) { }
        public ApprovalRequest(Guid sessionId, Guid operationId, string operation, HostContext expected,
            string targetObjectId, string section, string previewId, string journalId, DateTime expiresUtc,
            string canonicalRequestDigest, string baselineDigest, string proposedDigest,
            string rawRequestJson, string beforeText, string proposedText, string configuration, string platform)
        { SessionId = sessionId; OperationId = operationId; Operation = operation; Expected = expected;
          TargetObjectId = targetObjectId; Section = section; PreviewId = previewId; JournalId = journalId;
          ExpiresUtc = expiresUtc; CanonicalRequestDigest = canonicalRequestDigest;
          BaselineDigest = baselineDigest; ProposedDigest = proposedDigest;
          RawRequestJson = rawRequestJson; BeforeText = beforeText; ProposedText = proposedText;
          Configuration = configuration; Platform = platform; }
    }

    public interface IEngineeringProvider : IDisposable
    {
        Task<string> DispatchAsync(string requestJson, CancellationToken cancellationToken);
    }

    public static class EngineeringProviderFactory
    {
        public static IEngineeringProvider Create(object injectedDte, Func<string, bool?> authoritativeDirty,
            Func<HostContext> currentContext, Func<ApprovalRequest, bool> consumeApproval,
            SynchronizationContext ideContext)
        {
            if (injectedDte == null || authoritativeDirty == null || currentContext == null ||
                consumeApproval == null || ideContext == null) throw new ArgumentNullException();
            return new EngineeringProvider(injectedDte, authoritativeDirty, currentContext, consumeApproval, ideContext);
        }

        // The callback must return the exact already-open RDT/MEF document buffer
        // from this bound IDE, or null. It must never open or save a document.
        public static IEngineeringProvider CreateWithEditorAccess(object injectedDte, Func<string, bool?> authoritativeDirty,
            Func<HostContext> currentContext, Func<ApprovalRequest, bool> consumeApproval,
            SynchronizationContext ideContext, Func<string, object> getTextBuffer)
        {
            if (injectedDte == null || authoritativeDirty == null || currentContext == null || consumeApproval == null || ideContext == null || getTextBuffer == null)
                throw new ArgumentNullException();
            return new EngineeringProvider(injectedDte, authoritativeDirty, currentContext, consumeApproval, ideContext, getTextBuffer);
        }
        public static IEngineeringProvider CreateWithHostAccess(object injectedDte, Func<string, bool?> authoritativeDirty,
            Func<HostContext> currentContext, Func<ApprovalRequest, bool> consumeApproval, SynchronizationContext ideContext,
            Func<string, object> getTextBuffer, Func<string, bool> navigateExactErrorItem)
        {
            if (injectedDte == null || authoritativeDirty == null || currentContext == null || consumeApproval == null || ideContext == null || navigateExactErrorItem == null)
                throw new ArgumentNullException();
            return new EngineeringProvider(injectedDte, authoritativeDirty, currentContext, consumeApproval, ideContext, getTextBuffer, navigateExactErrorItem);
        }
        public static IEngineeringProvider CreateWithEditorViews(object injectedDte, Func<string, bool?> authoritativeDirty,
            Func<HostContext> currentContext, Func<ApprovalRequest, bool> consumeApproval, SynchronizationContext ideContext,
            Func<string, object> getTextBuffer, Func<string, bool> navigateExactErrorItem, Func<string, string, object> getSectionEditor)
        {
            if (injectedDte == null || authoritativeDirty == null || currentContext == null || consumeApproval == null || ideContext == null || getTextBuffer == null || navigateExactErrorItem == null || getSectionEditor == null)
                throw new ArgumentNullException();
            return new EngineeringProvider(injectedDte, authoritativeDirty, currentContext, consumeApproval, ideContext, getTextBuffer, navigateExactErrorItem, getSectionEditor);
        }
        // Host-only opt-in. Null editor callbacks retain the dormant source lane.
        // The authoritative Type callback is captured once, never model-selected.
        public static IEngineeringProvider CreateWithInteropTypes(object injectedDte, Func<string, bool?> authoritativeDirty,
            Func<HostContext> currentContext, Func<ApprovalRequest, bool> consumeApproval, SynchronizationContext ideContext,
            Func<string, object> getTextBuffer, Func<string, bool> navigateExactErrorItem,
            Func<string, string, object> getSectionEditor, Func<string, Type> getInteropType)
        {
            if (injectedDte == null || authoritativeDirty == null || currentContext == null || consumeApproval == null ||
                ideContext == null || navigateExactErrorItem == null || getInteropType == null) throw new ArgumentNullException();
            return new EngineeringProvider(injectedDte, authoritativeDirty, currentContext, consumeApproval, ideContext,
                getTextBuffer, navigateExactErrorItem, getSectionEditor, new EngineeringInteropTypes(getInteropType));
        }
    }

    internal sealed class EngineeringProvider : IEngineeringProvider
    {
        private readonly Func<HostContext> currentContext;
        private readonly SynchronizationContext ideContext;
        private readonly object dte;
        private readonly Func<string, bool?> dirty;
        private readonly Func<ApprovalRequest, bool> approval;
        private readonly Func<string, object> getTextBuffer;
        private readonly Func<string, bool> navigateExactErrorItem;
        private readonly Func<string, string, object> getSectionEditor;
        private readonly EngineeringInteropTypes interopTypes;
        private const int MaxRequestBytes = 1024 * 1024, MaxResponseBytes = 1024 * 1024;
        private readonly SourcePolicy.RetentionBudget retention = new SourcePolicy.RetentionBudget();
        private SourcePolicy sources, automationSources;
        private AutomationStSourceEditor automationEditor;
        private readonly HashSet<Guid> automationPreviews = new HashSet<Guid>();
        private readonly HashSet<Guid> automationJournals = new HashSet<Guid>();
        private XmlStSourceEditor sourceEditor;
        private CustomStReader customStReader;
        private readonly HashSet<Guid> customReadPreviews = new HashSet<Guid>();
        private readonly Dictionary<Guid, SourceCall> sourceCalls = new Dictionary<Guid, SourceCall>();
        private readonly Dictionary<Guid, Tuple<string, string>> requests = new Dictionary<Guid, Tuple<string, string>>();
        private NativeBuildService builds;
        private bool disposed;
        internal EngineeringProvider(object dte, Func<string, bool?> dirty, Func<HostContext> currentContext,
            Func<ApprovalRequest, bool> approval, SynchronizationContext ideContext, Func<string, object> getTextBuffer = null,
            Func<string, bool> navigateExactErrorItem = null, Func<string, string, object> getSectionEditor = null, EngineeringInteropTypes interopTypes = null)
        { this.dte = dte; this.dirty = dirty; this.currentContext = currentContext; this.approval = approval; this.ideContext = ideContext; this.getTextBuffer = getTextBuffer;
          this.navigateExactErrorItem = navigateExactErrorItem; this.getSectionEditor = getSectionEditor;
          this.interopTypes = interopTypes ?? new EngineeringInteropTypes(); }

        private sealed class SourceCall
        {
            internal Guid Session, OperationId;
            internal string Operation, RequestDigest, RawRequestJson, Baseline, Proposed, ProjectRevision;
            internal DateTime Expires;
            internal HostContext Bound;
            internal Dictionary<string, object> Expected;
        }

        public Task<string> DispatchAsync(string requestJson, CancellationToken cancellationToken)
        {
            if (requestJson == null || System.Text.Encoding.UTF8.GetByteCount(requestJson) > MaxRequestBytes)
                throw new ArgumentException("Invalid request size.", nameof(requestJson));
            var completion = new TaskCompletionSource<string>();
            if (cancellationToken.IsCancellationRequested) { completion.SetCanceled(); return completion.Task; }
            ideContext.Post(_ => {
                if (cancellationToken.IsCancellationRequested) { completion.TrySetCanceled(); return; }
                try { completion.TrySetResult(Dispatch(requestJson)); }
                catch { completion.TrySetResult("{\"protocolVersion\":1,\"status\":\"unknown\",\"error\":\"dispatch failed; do not retry a submitted operation\"}"); }
            }, null);
            return completion.Task;
        }

        private string Dispatch(string requestJson)
        {
            if (disposed) throw new ObjectDisposedException(nameof(EngineeringProvider));
            UniqueJsonKeys.Validate(requestJson);
            var json = new JavaScriptSerializer { MaxJsonLength = MaxResponseBytes, RecursionLimit = 32 };
            var request = json.DeserializeObject(requestJson) as Dictionary<string, object>;
            if (request == null || Convert.ToInt32(request["protocolVersion"], CultureInfo.InvariantCulture) != 1)
                throw new ArgumentException();
            Guid session, operation;
            if (!Guid.TryParse(request["sessionId"] as string, out session) || session == Guid.Empty ||
                !Guid.TryParse(request["operationId"] as string, out operation) || operation == Guid.Empty)
                throw new ArgumentException();
            try { ValidateContext(request["expected"] as Dictionary<string, object>, currentContext(), session); }
            catch { return Failure(json, session, operation, "conflict", "context_changed"); }
            var requestedName = request["operation"] as string;
            // Observations never consume the non-evicting mutation replay budget.
            // Their UUIDs are not cached: repeating a poll obtains a fresh view.
            if (requestedName == "session.ping" || requestedName == "session.describe" ||
                requestedName == "project.association" || requestedName == "project.online" || requestedName == "operation.get" || requestedName == "diagnostics.read" || requestedName == "output.read" || requestedName == "source.read" || requestedName == "source.journal" || requestedName == "source.targets")
            {
                try { return DispatchValidated(requestJson, request, json, session, operation, out _); }
                catch { return Failure(json, session, operation, "unknown", "dispatch_failed"); }
            }
            string fingerprint = Hash(requestJson);
            Tuple<string, string> previousRequest;
            if (requests.TryGetValue(operation, out previousRequest))
            {
                if (previousRequest.Item1 != fingerprint) return Failure(json, session, operation, "refused", "operation_id_reused");
                return previousRequest.Item2;
            }
            if (requests.Count >= 128) return Failure(json, session, operation, "refused", "operation_limit");
            // Reserve before a callback can reenter the dispatcher. A lost or
            // interrupted result is unknown and must never repeat submission.
            requests.Add(operation, Tuple.Create(fingerprint, Failure(json, session, operation, "unknown", "operation_in_progress")));
            string result;
            bool previewRetained = false;
            try { result = DispatchValidated(requestJson, request, json, session, operation, out previewRetained); }
            catch { result = Failure(json, session, operation, "unknown", "dispatch_failed"); }
            finally
            {
                if (requestedName == "source.preview" && !previewRetained)
                {
                    sources?.DiscardPreview(operation.ToString("D"));
                    automationSources?.DiscardPreview(operation.ToString("D"));
                }
            }
            if (!previewRetained && requestedName != null && requestedName.StartsWith("source.", StringComparison.Ordinal))
                retention.RetainReceipt(result.Length + fingerprint.Length);
            requests[operation] = Tuple.Create(fingerprint, result);
            return result;
        }

        private string Failure(JavaScriptSerializer json, Guid session, Guid operation, string status, string error)
        {
            return json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = operation.ToString("D"), status,
                provenance = Provenance(null), error });
        }

        private object Provenance(string buildOperationId, string source = "unknown", string dirtyState = "unknown", string persistence = null)
        {
            HostContext observed = null;
            try { observed = currentContext(); } catch { }
            var result = new Dictionary<string, object> {
                { "source", source }, { "dirtyState", dirtyState }, { "observedAt", DateTime.UtcNow.ToString("o") },
                { "buildOperationId", buildOperationId },
                { "context", observed == null ? null : new { sessionId = observed.SessionId.ToString("D"), idePid = observed.IdePid,
                    ideStartedUtc = observed.IdeStartedUtc.ToUniversalTime().ToString("o"), solutionFile = observed.SolutionFile,
                    projectFile = observed.ProjectFile, contextEpoch = observed.ContextEpoch } }
            };
            if (persistence != null) result.Add("persistence", persistence);
            return result;
        }

        private string DispatchValidated(string requestJson, Dictionary<string, object> request, JavaScriptSerializer json,
            Guid session, Guid operation, out bool previewRetained)
        {
            previewRetained = false;
            var expected = request["expected"] as Dictionary<string, object>;
            var current = currentContext();
            ValidateContext(expected, current, session);
            var name = request["operation"] as string;
            var args = request.ContainsKey("arguments") ? request["arguments"] as Dictionary<string, object> : null;
            BuildSnapshot snapshot = null;
            try
            {
                // A null editor accessor is the release boundary. Reject every
                // source operation before constructing a source service or approval.
                if (name != null && name.StartsWith("source.", StringComparison.Ordinal) && getTextBuffer == null && getSectionEditor == null)
                    return Failure(json, session, operation, "unsupported", "source_features_disabled");
                if (name == "diagnostics.navigate")
                {
                    Guid buildId;
                    var diagnosticId = args != null && args.ContainsKey("diagnosticId") ? args["diagnosticId"] as string : null;
                    if (args == null || args.Count != 2 || !args.ContainsKey("targetOperationId") || !Guid.TryParseExact(args["targetOperationId"] as string, "D", out buildId) || buildId == Guid.Empty ||
                        diagnosticId == null || !System.Text.RegularExpressions.Regex.IsMatch(diagnosticId, "^[0-9a-f]{64}$")) return Failure(json, session, operation, "refused", "invalid_navigation_request");
                    if (navigateExactErrorItem == null || builds == null) return Failure(json, session, operation, "unsupported", "native_navigation_unavailable");
                    var navigationStatus = builds.Navigate(buildId, diagnosticId, (diagnostic, baseline) => {
                        ValidateContext(expected, currentContext(), session);
                        var payload = json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), requestOperationId = operation.ToString("D"),
                            buildOperationId = buildId.ToString("D"), diagnosticId, expected,
                            diagnostic = new { file = diagnostic.File, line = diagnostic.Line, column = diagnostic.Column, severity = diagnostic.Severity, code = diagnostic.Code ?? "", message = diagnostic.Message },
                            baseline = new { projectFile = baseline.ProjectFile, projectDigest = baseline.ProjectDigest, sourceFile = baseline.SourceFile, sourceDigest = baseline.SourceDigest,
                                objectId = baseline.ObjectId, qualifiedName = baseline.QualifiedName, memberPath = baseline.MemberPath ?? "", section = baseline.Section, coordinateKind = baseline.CoordinateKind } });
                        if (Encoding.UTF8.GetByteCount(payload) > 16384 || disposed) return false;
                        return navigateExactErrorItem(payload);
                    });
                    return json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = operation.ToString("D"), status = navigationStatus,
                        provenance = Provenance(buildId.ToString("D")), result = new { diagnosticId, navigationKind = "nativeErrorItemExactMatchRequired", navigationInvoked = navigationStatus == "succeeded" } });
                }
                if (name == "session.ping")
                    return json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = operation.ToString("D"), status = "succeeded",
                        provenance = Provenance(null), result = new { contextValidated = true,
                            capabilities = new { projectAssociation = "conditional", build = "unassessed", plcBuild = "unassessed", diagnostics = "unassessed", output = "unassessed", sourceRead = "unsupported", sourcePreview = "unsupported", sourceApply = "unsupported", sourceRollback = "unsupported" } } });
                if (name == "session.describe")
                {
                    BuildTarget assessed = null; string reason = null;
                    try { assessed = BuildService().Assess(current.SolutionFile, current.ProjectFile, () => ValidateContext(expected, currentContext(), session)); }
                    catch (NativeBuildException e) { reason = e.Code; }
                    catch (PlcProjectAssociationException e) { reason = e.Code; }
                    catch { reason = "build_preflight_unavailable"; }
                    ValidateContext(expected, currentContext(), session);
                    if (getTextBuffer != null || getSectionEditor != null) InitializeSources(current);
                    var automation = automationEditor != null;
                    var read = getTextBuffer != null || getSectionEditor != null ? "conditional" : "unsupported";
                    var edit = getTextBuffer != null || automation ? "conditional" : "unsupported";
                    return json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = operation.ToString("D"), status = "succeeded",
                        provenance = Provenance(null), result = new { contextValidated = true, configuration = assessed == null ? null : assessed.Configuration,
                            platform = assessed == null ? null : assessed.Platform, buildScope = "plcProject", targetProjectFile = current.ProjectFile, buildUnavailableReason = reason,
                            capabilities = new { projectAssociation = "conditional", build = assessed == null ? "unsupported" : "supported", plcBuild = assessed == null ? "unsupported" : "supported",
                                diagnostics = assessed != null && assessed.OutputCaptureAvailable ? "supported" : "unsupported", output = assessed != null && assessed.OutputCaptureAvailable ? "supported" : "unsupported",
                                sourceRead = read, sourcePreview = read, sourceApply = edit, sourceRollback = edit,
                                sourceCreate = automation ? "conditional" : "unsupported" },
                            sourceEditorKind = automation ? (getTextBuffer == null ? "automationInterface" : "automationInterfaceAndOpenXmlBuffer")
                                : getSectionEditor != null ? "rawXmlAndAttachedCustomStReadOnly" : getTextBuffer == null ? null : "openTcPouXmlBuffer" } });
                }
                if (name == "source.targets" || name == "source.read" || name == "source.preview" || name == "source.apply" ||
                    name == "source.rollback" || name == "source.journal" || name == "source.create")
                {
                    if (args == null) return Failure(json, session, operation, "refused", "invalid_source_arguments");
                    InitializeSources(current);
                    SourceResult result;
                    bool attachedPreview = false, isPreview = name == "source.preview";
                    SourcePolicy previewPolicy = null;
                    if (name == "source.create")
                    {
                        if (automationEditor == null) return Failure(json, session, operation, "unsupported", "automation_source_unavailable");
                        var creation = AutomationSourceCreation.Parse(args);
                        if (creation == null) return Failure(json, session, operation, "refused", "invalid_source_create_arguments");
                        var expiry = ParseExpiry((string)args["approvalExpiresUtc"]);
                        var payload = creation.CanonicalPayload();
                        Func<bool> authorizationCurrent = () => AuthorizationCurrent(expected, session, expiry);
                        result = automationEditor.Create(creation, () => authorizationCurrent() &&
                            approval(new ApprovalRequest(session, operation, name, current, creation.TargetPath, creation.Kind,
                                null, null, expiry, Hash(requestJson), Hash(""), Hash(payload), requestJson, "", payload, null, null)),
                            authorizationCurrent);
                    }
                    else if (name == "source.targets")
                    {
                        object value;
                        args.TryGetValue("moniker", out value);
                        if (args.Count > 0 && (args.Count != 1 || !(value is string) || string.IsNullOrWhiteSpace((string)value)))
                            return Failure(json, session, operation, "refused", "invalid_source_arguments");
                        var moniker = value as string;
                        result = moniker == null ? null : sourceEditor?.Targets(moniker);
                        if (result?.Status != "succeeded" && automationEditor != null) result = automationEditor.Targets(moniker);
                        if (result?.Status != "succeeded" && moniker != null && getSectionEditor != null)
                            result = CustomReader(current).Targets(moniker) ?? result;
                        if (result == null) result = new SourceResult("unsupported", "source_targets_unavailable");
                    }
                    else if (name == "source.read" || name == "source.preview")
                    {
                        if (args.Count != (name == "source.read" ? 2 : 3) || !args.ContainsKey("objectId") || !args.ContainsKey("section"))
                            return Failure(json, session, operation, "refused", "invalid_source_arguments");
                        var objectId = args["objectId"] as string;
                        var isAutomation = objectId != null && objectId.Count(c => c == '|') == 1;
                        var source = isAutomation ? automationSources : sources;
                        result = source == null ? new SourceResult("unsupported", "automation_source_unavailable") :
                            name == "source.read" ? source.Read(objectId, args["section"] as string)
                            : source.Preview(operation.ToString("D"), objectId, args["section"] as string,
                                args.ContainsKey("proposedText") ? args["proposedText"] as string : null, deferPublication: true);
                        if (isPreview && result.Status == "succeeded") previewPolicy = source;
                        if (!isAutomation && result.Status != "succeeded" && result.ErrorCode != "source_session_memory_limit" && getSectionEditor != null)
                        {
                            var attached = name == "source.read" ? CustomReader(current).Read(args["objectId"] as string, args["section"] as string)
                                : CustomReader(current).Preview(args["objectId"] as string, args["section"] as string, args.ContainsKey("proposedText") ? args["proposedText"] as string : null);
                            if (attached != null)
                            {
                                attachedPreview = name == "source.preview";
                                result = new SourceResult("succeeded", result: new Dictionary<string, object> {
                                    { "objectId", attached.ObjectId }, { "section", attached.Section }, { "text", attached.Text },
                                    { "beforeText", attached.Text }, { "proposedText", attached.ProposedText }, { "documentDigest", attached.Digest },
                                    { "proposedDocumentDigest", attached.ProposedDigest }, { "projectRevision", attached.ProjectRevision },
                                    { "dirtyState", attached.DirtyState }, { "source", "liveAttachedDocument" }, { "captureKind", "attachedTwinCatTextDocument" },
                                    { "sourceMode", "customStReadOnly" }, { "atomicWriteSupported", false }, { "applySupported", false }, { "truncated", false },
                                    { "diff", name == "source.preview" ? new { offset = attached.ChangeOffset, deletedText = attached.DeletedText, insertedText = attached.InsertedText } : null }
                                });
                            }
                        }
                    }
                    else if (name == "source.journal")
                    {
                        if (args.Count != 1 || !args.ContainsKey("journalId")) return Failure(json, session, operation, "refused", "invalid_source_arguments");
                        var journalId = args["journalId"] as string;
                        var source = Guid.TryParseExact(journalId, "D", out var id) && automationJournals.Contains(id) ? automationSources : sources;
                        result = source.GetJournal(journalId);
                    }
                    else
                    {
                        var idKey = name == "source.apply" ? "previewId" : "journalId";
                        Guid referenced;
                        if (args.Count != 5 || !args.ContainsKey(idKey) || !Guid.TryParseExact(args[idKey] as string, "D", out referenced) || referenced == Guid.Empty ||
                            !args.ContainsKey("approvalExpiresUtc") || !args.ContainsKey("baselineDigest") || !args.ContainsKey("proposedDigest") || !args.ContainsKey("projectRevision"))
                            return Failure(json, session, operation, "refused", "invalid_source_arguments");
                        if (customReadPreviews.Contains(referenced)) return Failure(json, session, operation, "unsupported", "custom_editor_atomic_transaction_unverified");
                        var auth = new SourceCall { Session = session, OperationId = operation, Operation = name, Bound = current, Expected = expected,
                            RequestDigest = Hash(requestJson), RawRequestJson = requestJson, Expires = ParseExpiry(args["approvalExpiresUtc"] as string),
                            Baseline = args["baselineDigest"] as string, Proposed = args["proposedDigest"] as string, ProjectRevision = args["projectRevision"] as string };
                        sourceCalls.Add(operation, auth);
                        var isApply = name == "source.apply";
                        var isAutomation = isApply ? automationPreviews.Contains(referenced) : automationJournals.Contains(referenced);
                        var source = isAutomation ? automationSources : sources;
                        // Reserve the route so a reentrant journal read during submission reaches the same policy.
                        if (isAutomation && isApply) automationJournals.Add(operation);
                        try
                        {
                            result = isApply ? source.Apply(operation.ToString("D"), referenced.ToString("D")) :
                                source.Rollback(operation.ToString("D"), referenced.ToString("D"));
                        }
                        finally { sourceCalls.Remove(operation); }
                    }
                    var sourceName = SourceResultField(result, "source") ?? "unknown";
                    var sourceDirty = SourceResultField(result, "dirtyState") ?? "unknown";
                    string response;
                    try
                    {
                        response = json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = operation.ToString("D"), status = result.Status,
                            provenance = Provenance(null, sourceName, sourceDirty, SourceResultField(result, "persistence")),
                            error = result.ErrorCode, result = result.Result });
                    }
                    catch (InvalidOperationException) when (isPreview)
                    {
                        // The serializer enforces a character limit before the UTF-8 byte check.
                        return Failure(json, session, operation, "refused", "source_preview_too_large");
                    }
                    if (Encoding.UTF8.GetByteCount(response) > MaxResponseBytes)
                        return isPreview ? Failure(json, session, operation, "refused", "source_preview_too_large") :
                            Failure(json, session, operation, "unknown", "source_response_too_large");
                    if (isPreview && result.Status == "succeeded")
                    {
                        const int fingerprintChars = 64; // SHA-256 hex in requests.
                        if (!retention.TryReserve(response.Length + fingerprintChars))
                            return Failure(json, session, operation, "refused", "source_session_memory_limit");
                        if (attachedPreview) customReadPreviews.Add(operation);
                        else
                        {
                            previewPolicy.PublishPreview(operation.ToString("D"));
                            if (previewPolicy == automationSources) automationPreviews.Add(operation);
                        }
                        previewRetained = true;
                    }
                    return response;
                }
                if (name == "project.online")
                {
                    if (args == null || args.Count != 0) return Failure(json, session, operation, "refused", "invalid_online_arguments");
                    if (!interopTypes.IsAuthoritative) return Failure(json, session, operation, "unsupported", "online_interop_unavailable");
                    PlcOnlineObservation observation = null;
                    var association = new PlcProjectAssociationService(dte, interopTypes).Resolve(current.SolutionFile, current.ProjectFile,
                        () => ValidateContext(expected, currentContext(), session), (manager, plc, _, configuredPort) =>
                        {
                            try { observation = PlcOnlineObservation.Capture(interopTypes, manager, plc, configuredPort); }
                            catch { /* No trustworthy observation is available. */ }
                        });
                    if (association.Status != "succeeded") return Failure(json, session, operation, association.Status, association.ErrorCode);
                    if (observation == null) return Failure(json, session, operation, "unsupported", "online_observation_unavailable");
                    return json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = operation.ToString("D"),
                        status = "succeeded", provenance = Provenance(null),
                        result = new { loggedIn = observation.LoggedIn, configuredAmsNetId = observation.ConfiguredAmsNetId,
                            configuredAdsPort = observation.ConfiguredAdsPort,
                            runtimeAddressVerified = false, mappingDigest = association.MappingDigest, observedAtUtc = association.ObservedAtUtc } });
                }
                if (name == "project.association")
                {
                    if (args == null || args.Count != 0) throw new PlcProjectAssociationException("refused", "invalid_association_arguments");
                    var association = new PlcProjectAssociationService(dte, interopTypes).Resolve(current.SolutionFile, current.ProjectFile,
                        () => ValidateContext(expected, currentContext(), session));
                    return json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = operation.ToString("D"),
                        status = association.Status, provenance = Provenance(null), error = association.ErrorCode,
                        result = new { solutionFile = association.SolutionFile, plcProjectFile = association.PlcProjectFile,
                            twinCatProjectFile = association.TwinCatProjectFile, associationCount = association.AssociationCount,
                            owningTwinCatPlcChildCount = association.OwningTwinCatPlcChildCount, buildScopeStatus = association.BuildScopeStatus,
                            mappingDigest = association.MappingDigest, observedAtUtc = association.ObservedAtUtc,
                            observationConsistency = association.ObservationConsistency,
                            captureKind = association.CaptureKind, editorState = association.EditorState, dirtyState = association.DirtyState } });
                }
                if (name == "build.start")
                {
                    DateTimeOffset expires;
                    var expiresText = args != null && args.ContainsKey("approvalExpiresUtc") ? args["approvalExpiresUtc"] as string : null;
                    var configuration = args != null && args.ContainsKey("configuration") ? args["configuration"] as string : null;
                    var platform = args != null && args.ContainsKey("platform") ? args["platform"] as string : null;
                    if (args == null || args.Count != 3 || string.IsNullOrEmpty(configuration) || string.IsNullOrEmpty(platform) || string.IsNullOrEmpty(expiresText) ||
                        !System.Text.RegularExpressions.Regex.IsMatch(expiresText, @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$") ||
                        !DateTimeOffset.TryParse(expiresText, CultureInfo.InvariantCulture, DateTimeStyles.None, out expires) || expires.Offset != TimeSpan.Zero ||
                        expires.UtcDateTime <= DateTime.UtcNow || expires.UtcDateTime > DateTime.UtcNow.AddMinutes(2))
                        throw new NativeBuildException("refused", "invalid_approval_expiry");
                    var requestApproval = new ApprovalRequest(session, operation, name, current, current.ProjectFile, null, null, null,
                        expires.UtcDateTime, Hash(requestJson), null, null, requestJson, null, null, configuration, platform);
                    snapshot = BuildService().Start(operation, current.SolutionFile, current.ProjectFile,
                        () => ValidateContext(expected, currentContext(), session),
                        () => { if (!approval(requestApproval) || DateTime.UtcNow >= expires.UtcDateTime) throw new NativeBuildException("refused", "approval_denied_or_expired"); },
                        configuration, platform,
                        () => { if (disposed || DateTime.UtcNow >= expires.UtcDateTime) throw new NativeBuildException("refused", "approval_expired_or_disposed"); });
                }
                else if (name == "operation.get" || name == "operation.cancel" || name == "output.read" || name == "diagnostics.read")
                {
                    Guid target;
                    if (args == null || !Guid.TryParse(args.ContainsKey("targetOperationId") ? args["targetOperationId"] as string : null, out target) || target == Guid.Empty || target == operation || builds == null)
                        throw new NativeBuildException("refused", "invalid_target_operation");
                    snapshot = name == "operation.cancel" ? builds.Cancel(target) : builds.Get(target);
                }
                if (snapshot != null)
                    return json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = operation.ToString("D"), status = snapshot.Status,
                        provenance = Provenance(snapshot.BuildOperationId),
                        result = new { buildOperationId = snapshot.BuildOperationId, configuration = snapshot.Configuration, platform = snapshot.Platform,
                            cancellationRequested = snapshot.CancellationRequested, outputAvailable = snapshot.OutputAvailable, outputTruncated = snapshot.OutputTruncated,
                            diagnosticsTruncated = snapshot.DiagnosticsTruncated }, output = snapshot.Output,
                        diagnostics = snapshot.Diagnostics.Select(d => new { file = d.File, severity = d.Severity, message = d.Message,
                            code = d.Code, line = d.Line, column = d.Column, diagnosticId = d.DiagnosticId,
                            navigationAvailable = navigateExactErrorItem != null && d.NavigationCandidate != null && d.NavigationCandidate.Status == "candidate",
                            navigationKind = d.NavigationCandidate != null && d.NavigationCandidate.Status == "candidate" ? "nativeErrorItemExactMatchRequired" : null,
                            navigationReason = navigateExactErrorItem == null ? "Native click navigation is unavailable." : d.NavigationCandidate == null ? "Build source baseline is unavailable or stale." : d.NavigationCandidate.Status,
                            sourceBaseline = d.NavigationCandidate == null ? null : new { projectDigest = d.NavigationCandidate.ProjectSha256, sourceFile = d.NavigationCandidate.File, sourceDigest = d.NavigationCandidate.FileSha256,
                                objectId = d.NavigationCandidate.ObjectId.HasValue ? d.NavigationCandidate.ObjectId.Value.ToString("D") : null, qualifiedName = d.NavigationCandidate.QualifiedName, memberPath = d.NavigationCandidate.MemberPath ?? "" } }).ToArray() });
            }
            catch (NativeBuildException e)
            {
                return json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = operation.ToString("D"), status = e.Status,
                    provenance = Provenance(null), error = e.Code });
            }
            catch (PlcProjectAssociationException e)
            {
                return Failure(json, session, operation, e.Status, e.Code);
            }
            return json.Serialize(new { protocolVersion = 1, sessionId = session.ToString(), operationId = operation.ToString(),
                status = "unsupported", provenance = Provenance(null),
                error = "Operation is not implemented by this provider." });
        }

        private static string Hash(string value)
        {
            using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(value))).Replace("-", "").ToLowerInvariant();
        }

        private NativeBuildService BuildService()
        {
            if (builds == null) builds = new NativeBuildService(dte, dirty, interopTypes);
            return builds;
        }

        private static DateTime ParseExpiry(string text)
        {
            DateTimeOffset value;
            if (string.IsNullOrEmpty(text) || !System.Text.RegularExpressions.Regex.IsMatch(text, @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$") ||
                !DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out value) || value.Offset != TimeSpan.Zero ||
                value.UtcDateTime <= DateTime.UtcNow || value.UtcDateTime > DateTime.UtcNow.AddMinutes(2)) throw new NativeBuildException("refused", "invalid_approval_expiry");
            return value.UtcDateTime;
        }

        private string ContextKey()
        {
            if (disposed) return null;
            var c = currentContext();
            if (c == null) return null;
            return Hash(new JavaScriptSerializer().Serialize(new { session = c.SessionId.ToString("D"), c.IdePid, started = c.IdeStartedUtc.ToUniversalTime().Ticks,
                c.SolutionFile, c.ProjectFile, c.ContextEpoch }));
        }

        private void InitializeSources(HostContext bound)
        {
            if (sources != null) return;
            var key = ContextKey();
            if (getTextBuffer != null)
                sourceEditor = new XmlStSourceEditor(bound.ProjectFile, getTextBuffer, dirty, ContextKey, key);
            automationEditor = AutomationStSourceEditor.TryCreate(dte, interopTypes, bound, dirty, getTextBuffer, ContextKey, key);
            sources = new SourcePolicy((ISourceEditor)sourceEditor ?? new SourceUnsupportedEditor(), ContextKey, ConsumeSourceApproval,
                SourceAuthorizationCurrent, retention: retention);
            if (automationEditor != null)
                automationSources = new SourcePolicy(automationEditor, ContextKey, ConsumeSourceApproval, SourceAuthorizationCurrent,
                    automationInterface: true, retention: retention);
        }

        private bool ConsumeSourceApproval(SourceApproval spec)
        {
            Guid id;
            SourceCall call;
            if (!Guid.TryParseExact(spec.OperationId, "D", out id) || !sourceCalls.TryGetValue(id, out call) || !SourceAuthorizationCurrent(spec.OperationId) ||
                call.Operation != spec.Operation || call.Baseline != spec.BaselineDigest || call.Proposed != spec.ProposedDigest ||
                call.ProjectRevision != spec.ProjectRevision) return false;
            return approval(new ApprovalRequest(call.Session, id, call.Operation, call.Bound, spec.ObjectId, spec.Section, spec.PreviewId, spec.JournalId,
                call.Expires, call.RequestDigest, spec.BaselineDigest, spec.ProposedDigest, call.RawRequestJson, spec.BeforeText, spec.ProposedText, null, null));
        }

        private static string SourceResultField(SourceResult result, string name)
        {
            object value;
            return result.Result != null && result.Result.TryGetValue(name, out value) ? value as string : null;
        }

        private CustomStReader CustomReader(HostContext bound)
        {
            if (customStReader == null) customStReader = new CustomStReader(bound.ProjectFile, getSectionEditor, dirty, ContextKey, ContextKey());
            return customStReader;
        }

        private bool SourceAuthorizationCurrent(string operationId)
        {
            Guid id; SourceCall call;
            if (!Guid.TryParseExact(operationId, "D", out id) || !sourceCalls.TryGetValue(id, out call)) return false;
            return AuthorizationCurrent(call.Expected, call.Session, call.Expires);
        }

        private bool AuthorizationCurrent(Dictionary<string, object> expected, Guid session, DateTime expires)
        {
            try { ValidateContext(expected, currentContext(), session); return !disposed && DateTime.UtcNow < expires; } catch { return false; }
        }

        private static void ValidateContext(Dictionary<string, object> expected, HostContext current, Guid session)
        {
            if (expected == null || current == null || current.SessionId != session ||
                Convert.ToInt32(expected["idePid"], CultureInfo.InvariantCulture) != current.IdePid ||
                !string.Equals(expected["solutionFile"] as string, current.SolutionFile, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(expected["projectFile"] as string, current.ProjectFile, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(expected["contextEpoch"] as string, current.ContextEpoch, StringComparison.Ordinal) ||
                !DateTime.TryParse(expected["ideStartedUtc"] as string, CultureInfo.InvariantCulture,
                    DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var started) ||
                started != current.IdeStartedUtc.ToUniversalTime()) throw new ArgumentException();
        }

        public void Dispose() { disposed = true; if (builds != null) builds.Dispose(); }
    }
}
