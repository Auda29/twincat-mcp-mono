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
        public ApprovalRequest(Guid sessionId, Guid operationId, string operation, HostContext expected,
            string targetObjectId, string section, string previewId, string journalId, DateTime expiresUtc,
            string canonicalRequestDigest, string baselineDigest, string proposedDigest)
        { SessionId = sessionId; OperationId = operationId; Operation = operation; Expected = expected;
          TargetObjectId = targetObjectId; Section = section; PreviewId = previewId; JournalId = journalId;
          ExpiresUtc = expiresUtc; CanonicalRequestDigest = canonicalRequestDigest;
          BaselineDigest = baselineDigest; ProposedDigest = proposedDigest; }
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
    }

    internal sealed class EngineeringProvider : IEngineeringProvider
    {
        private readonly Func<HostContext> currentContext;
        private readonly SynchronizationContext ideContext;
        private readonly object dte;
        private readonly Func<string, bool?> dirty;
        private readonly Func<ApprovalRequest, bool> approval;
        private readonly Dictionary<Guid, string> submitted = new Dictionary<Guid, string>();
        private readonly Dictionary<Guid, Tuple<string, string>> requests = new Dictionary<Guid, Tuple<string, string>>();
        private NativeBuildService builds;
        private bool disposed;
        internal EngineeringProvider(object dte, Func<string, bool?> dirty, Func<HostContext> currentContext,
            Func<ApprovalRequest, bool> approval, SynchronizationContext ideContext)
        { this.dte = dte; this.dirty = dirty; this.currentContext = currentContext; this.approval = approval; this.ideContext = ideContext; }

        public Task<string> DispatchAsync(string requestJson, CancellationToken cancellationToken)
        {
            if (requestJson == null || System.Text.Encoding.UTF8.GetByteCount(requestJson) > 262144)
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
            var json = new JavaScriptSerializer { MaxJsonLength = 262144, RecursionLimit = 32 };
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
                requestedName == "project.association" || requestedName == "operation.get" || requestedName == "diagnostics.read" || requestedName == "output.read" || requestedName == "source.read")
            {
                try { return DispatchValidated(requestJson, request, json, session, operation); }
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
            try { result = DispatchValidated(requestJson, request, json, session, operation); }
            catch { result = Failure(json, session, operation, "unknown", "dispatch_failed"); }
            requests[operation] = Tuple.Create(fingerprint, result);
            return result;
        }

        private string Failure(JavaScriptSerializer json, Guid session, Guid operation, string status, string error)
        {
            return json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = operation.ToString("D"), status,
                provenance = Provenance(null), error });
        }

        private object Provenance(string buildOperationId)
        {
            HostContext observed = null;
            try { observed = currentContext(); } catch { }
            return new { source = "unknown", dirtyState = "unknown", observedAt = DateTime.UtcNow.ToString("o"), buildOperationId,
                context = observed == null ? null : new { sessionId = observed.SessionId.ToString("D"), idePid = observed.IdePid,
                    ideStartedUtc = observed.IdeStartedUtc.ToUniversalTime().ToString("o"), solutionFile = observed.SolutionFile,
                    projectFile = observed.ProjectFile, contextEpoch = observed.ContextEpoch } };
        }

        private string DispatchValidated(string requestJson, Dictionary<string, object> request, JavaScriptSerializer json, Guid session, Guid operation)
        {
            var expected = request["expected"] as Dictionary<string, object>;
            var current = currentContext();
            ValidateContext(expected, current, session);
            var name = request["operation"] as string;
            var args = request.ContainsKey("arguments") ? request["arguments"] as Dictionary<string, object> : null;
            BuildSnapshot snapshot = null;
            try
            {
                if (name == "session.ping" || name == "session.describe")
                    return json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = operation.ToString("D"), status = "succeeded",
                        provenance = Provenance(null), result = new { contextValidated = true,
                            capabilities = new { projectAssociation = "conditional", build = "unsupported", plcBuild = "unsupported", diagnostics = "unsupported", output = "unsupported", sourceRead = "unsupported", sourcePreview = "unsupported", sourceApply = "unsupported", sourceRollback = "unsupported" } } });
                if (name == "project.association")
                {
                    if (args == null || args.Count != 0) throw new PlcProjectAssociationException("refused", "invalid_association_arguments");
                    var association = new PlcProjectAssociationService(dte).Resolve(current.SolutionFile, current.ProjectFile,
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
                    if (args == null || args.Count != 1 || string.IsNullOrEmpty(expiresText) ||
                        !System.Text.RegularExpressions.Regex.IsMatch(expiresText, @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$") ||
                        !DateTimeOffset.TryParse(expiresText, CultureInfo.InvariantCulture, DateTimeStyles.None, out expires) || expires.Offset != TimeSpan.Zero ||
                        expires.UtcDateTime <= DateTime.UtcNow || expires.UtcDateTime > DateTime.UtcNow.AddMinutes(2))
                        throw new NativeBuildException("refused", "invalid_approval_expiry");
                    throw new NativeBuildException("unsupported", "unverified_build_scope");
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
                            code = d.Code, line = d.Line, column = d.Column, navigationAvailable = false,
                            navigationReason = "No verified project source item and baseline are available." }).ToArray() });
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
