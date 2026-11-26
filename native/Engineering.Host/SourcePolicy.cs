using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace TwinCatMcp.Engineering.Host
{
    // XML editing uses an RDT buffer transaction. Automation Interface editing
    // uses a verified source setter and readback.
    internal interface ISourceEditor
    {
        bool HasVerifiedAtomicLiveBufferSemantics { get; }
        SourceSnapshot Read(string contextIdentity, string objectId, string section);
        // Revalidate the binding and exact expected text before submission.
        SourceExchangeOutcome CompareExchange(SourceEditRequest request);
    }

    internal enum SourceExchangeOutcome { Applied, Conflict, UnsavedEditorChanges, Unsupported, Unknown }

    internal sealed class SourceSnapshot
    {
        internal string ContextIdentity;
        internal string ObjectId;
        internal string Section;
        internal string Text;
        internal string BufferText;
        internal string ProjectRevision;
        internal string DirtyState;
        internal object BufferIdentity;
        internal Func<string, string> BuildReplacement;
        internal bool IsExistingStructuredTextObject;
        internal bool IsUnambiguousIdentity;
        internal bool IsVerifiedLiveBuffer;
        internal bool IsVerifiedAutomationSource { get; set; }
        internal string StateDigest { get; set; }
        internal bool ApplyBlockedByDirtyState { get; set; }
        internal bool IsOrdinaryPlcSource;
    }

    internal sealed class SourceEditRequest
    {
        internal string ContextIdentity;
        internal string ObjectId;
        internal string Section;
        internal string ExpectedText;
        internal string ReplacementText;
        internal string ExpectedBufferText;
        internal string ReplacementBufferText;
        internal string ProjectRevision;
        internal object BufferIdentity;
        internal Func<bool> AuthorizationCurrent;
        internal string ExpectedStateDigest;
        internal string VerifiedPostStateDigest { get; set; }
        internal bool IsRollback;
    }

    internal sealed class SourceApproval
    {
        internal string OperationId;
        internal string Operation;
        internal string ContextIdentity;
        internal string ObjectId;
        internal string Section;
        internal string BaselineDigest;
        internal string ProposedDigest;
        internal string PreviewId;
        internal string JournalId;
        internal string SectionBaselineDigest;
        internal string SectionProposedDigest;
        internal string ProjectRevision;
        internal string BeforeText, ProposedText;
    }

    internal sealed class SourceResult
    {
        internal string Status { get; private set; }
        internal string ErrorCode { get; private set; }
        internal Dictionary<string, object> Result { get; private set; }

        internal SourceResult(string status, string errorCode = null, Dictionary<string, object> result = null)
        { Status = status; ErrorCode = errorCode; Result = result; }
    }

    internal sealed class SourceUnsupportedEditor : ISourceEditor
    {
        public bool HasVerifiedAtomicLiveBufferSemantics { get { return false; } }
        public SourceSnapshot Read(string contextIdentity, string objectId, string section) { return null; }
        public SourceExchangeOutcome CompareExchange(SourceEditRequest request) { return SourceExchangeOutcome.Unsupported; }
    }

    /// <summary>
    /// Session-scoped preview and undo journal. Keep this instance for the complete
    /// bound session; discard it when the host invalidates that session. Journal
    /// entries and replay records are never evicted to admit new mutations.
    /// </summary>
    internal sealed class SourcePolicy
    {
        internal const int MaxTextLength = 65536;
        internal const int MaxBufferLength = 2 * 1024 * 1024;
        private const int MaxOperations = 128;
        private readonly object gate = new object();
        private readonly ISourceEditor editor;
        private readonly Func<string> currentContextIdentity;
        private readonly Func<SourceApproval, bool> consumeApproval;
        private readonly Func<string, bool> authorizationCurrent;
        private readonly string contextIdentity;
        private readonly bool automationInterface;
        private readonly Dictionary<string, SourcePreview> previews = new Dictionary<string, SourcePreview>(StringComparer.Ordinal);
        private readonly Dictionary<string, SourceJournal> journals = new Dictionary<string, SourceJournal>(StringComparer.Ordinal);
        private readonly Dictionary<string, SourceReplay> operations = new Dictionary<string, SourceReplay>(StringComparer.Ordinal);

        internal SourcePolicy(Func<string> currentContextIdentity, Func<SourceApproval, bool> consumeApproval)
            : this(new SourceUnsupportedEditor(), currentContextIdentity, consumeApproval) { }

        internal SourcePolicy(ISourceEditor editor, Func<string> currentContextIdentity, Func<SourceApproval, bool> consumeApproval,
            Func<string, bool> authorizationCurrent = null, bool automationInterface = false)
        {
            if (editor == null || currentContextIdentity == null || consumeApproval == null) throw new ArgumentNullException();
            this.editor = editor;
            this.automationInterface = automationInterface;
            this.currentContextIdentity = currentContextIdentity;
            this.consumeApproval = consumeApproval;
            this.authorizationCurrent = authorizationCurrent;
            contextIdentity = currentContextIdentity();
            if (string.IsNullOrWhiteSpace(contextIdentity)) throw new ArgumentException("A frozen context identity is required.");
        }

        internal SourceResult Read(string objectId, string section)
        {
            lock (gate)
            {
                var check = CheckTarget(objectId, section);
                if (check != null) return check;
                SourceSnapshot snapshot;
                check = ReadVerified(objectId, section, out snapshot);
                if (check != null) return check;
                return new SourceResult("succeeded", result: WithSource(new Dictionary<string, object> {
                    { "objectId", objectId }, { "section", section }, { "text", snapshot.Text },
                    { "digest", Digest(snapshot.Text) }, { "truncated", false }
                    , { "dirtyState", snapshot.DirtyState ?? "unknown" }, { "bufferDigest", Digest(snapshot.BufferText) }, { "projectRevision", snapshot.ProjectRevision }
                }));
            }
        }

        internal SourceResult Preview(string previewOperationId, string objectId, string section, string proposedText)
        {
            lock (gate)
            {
                previewOperationId = CanonicalId(previewOperationId);
                if (!ValidText(proposedText)) return Refused("invalid_source_text");
                if (automationInterface) proposedText = NormalizeLf(proposedText);
                return Once(previewOperationId, Fingerprint("source.preview", objectId, section, proposedText), () => {
                    var check = CheckTarget(objectId, section);
                    if (check != null) return check;
                    SourceSnapshot snapshot;
                    check = ReadVerified(objectId, section, out snapshot);
                    if (check != null) return check;
                    string proposedBuffer;
                    try { proposedBuffer = snapshot.BuildReplacement(proposedText); }
                    catch { return Refused("source_replacement_unmappable"); }
                    if (!ValidBuffer(proposedBuffer)) return Refused("source_replacement_unmappable");
                    var preview = new SourcePreview { ObjectId = objectId, Section = section, PreviewId = previewOperationId,
                        Before = snapshot.Text, After = proposedText, BeforeBuffer = snapshot.BufferText, AfterBuffer = proposedBuffer,
                        ProjectRevision = snapshot.ProjectRevision, BufferIdentity = snapshot.BufferIdentity, StateDigest = snapshot.StateDigest };
                    previews.Add(previewOperationId, preview);
                    return new SourceResult("succeeded", result: WithSource(new Dictionary<string, object> {
                        { "previewOperationId", previewOperationId }, { "objectId", objectId }, { "section", section },
                        { "baselineDigest", Digest(preview.BeforeBuffer) }, { "proposedDigest", Digest(preview.AfterBuffer) },
                        { "sectionBaselineDigest", Digest(preview.Before) }, { "sectionProposedDigest", Digest(preview.After) },
                        { "beforeText", preview.Before }, { "proposedText", preview.After }, { "projectRevision", preview.ProjectRevision },
                        { "dirtyState", snapshot.DirtyState ?? "unknown" },
                        { "truncated", false }
                    }));
                });
            }
        }

        internal SourceResult GetJournal(string applyOperationId)
        {
            lock (gate) {
                if (!ContextMatches()) return Refused("stale_context");
                applyOperationId = CanonicalId(applyOperationId);
                SourceJournal journal;
                if (applyOperationId == null || !journals.TryGetValue(applyOperationId, out journal)) return Refused("journal_not_found");
                var p = journal.Preview;
                return new SourceResult("succeeded", result: WithSource(new Dictionary<string, object> {
                    { "journalOperationId", applyOperationId }, { "previewOperationId", p.PreviewId },
                    { "objectId", p.ObjectId }, { "section", p.Section }, { "outcome", journal.Outcome },
                    { "rollbackSubmitted", journal.RollbackSubmitted }, { "rollbackOutcome", journal.RollbackOutcome },
                    { "beforeText", p.Before }, { "proposedText", p.After }, { "projectRevision", p.ProjectRevision },
                    { "baselineDigest", Digest(p.BeforeBuffer) }, { "proposedDigest", Digest(p.AfterBuffer) }
                }, includeXml: false));
            }
        }

        internal SourceResult Apply(string operationId, string previewOperationId)
        {
            lock (gate)
            {
                operationId = CanonicalId(operationId);
                previewOperationId = CanonicalId(previewOperationId);
                return Once(operationId, Fingerprint("source.apply", previewOperationId), () => {
                    SourcePreview preview;
                    if (previewOperationId == null || !previews.TryGetValue(previewOperationId, out preview)) return Refused("preview_not_found");
                    if (preview.Consumed) return Refused("preview_already_submitted");
                    var check = CheckTarget(preview.ObjectId, preview.Section);
                    if (check != null) return check;
                    return Mutate(operationId, "source.apply", preview, () => {
                        if (preview.Consumed) return false;
                        preview.Consumed = true;
                        // Keep pre/post images even when submission has an unknown outcome.
                        journals.Add(operationId, new SourceJournal { Preview = preview, Outcome = "unknown" });
                        return true;
                    }, (outcome, postState) => {
                        journals[operationId].Outcome = outcome;
                        journals[operationId].PostStateDigest = postState;
                    });
                });
            }
        }

        internal SourceResult Rollback(string operationId, string applyOperationId)
        {
            lock (gate)
            {
                operationId = CanonicalId(operationId);
                applyOperationId = CanonicalId(applyOperationId);
                return Once(operationId, Fingerprint("source.rollback", applyOperationId), () => {
                    SourceJournal journal;
                    if (applyOperationId == null || !journals.TryGetValue(applyOperationId, out journal)) return Refused("journal_not_found");
                    if (journal.Outcome != "succeeded") return Refused("apply_outcome_unresolved");
                    if (journal.RollbackSubmitted) return Refused("rollback_already_submitted");
                    var forward = journal.Preview;
                    var check = CheckTarget(forward.ObjectId, forward.Section);
                    if (check != null) return check;
                    var reverse = new SourcePreview { ObjectId = forward.ObjectId, Section = forward.Section,
                        PreviewId = forward.PreviewId, JournalId = applyOperationId, Before = forward.After, After = forward.Before,
                        BeforeBuffer = forward.AfterBuffer, AfterBuffer = forward.BeforeBuffer, ProjectRevision = forward.ProjectRevision,
                        BufferIdentity = forward.BufferIdentity, StateDigest = journal.PostStateDigest };
                    return Mutate(operationId, "source.rollback", reverse,
                        () => {
                            if (journal.RollbackSubmitted) return false;
                            journal.RollbackSubmitted = true;
                            return true;
                        }, (outcome, _) => journal.RollbackOutcome = outcome);
                });
            }
        }

        private SourceResult Mutate(string operationId, string operation, SourcePreview preview, Func<bool> submitting, Action<string, string> completed)
        {
            SourceSnapshot current;
            var check = ReadVerified(preview.ObjectId, preview.Section, out current);
            if (check != null) return check;
            if (operation == "source.apply" && current.ApplyBlockedByDirtyState)
                return new SourceResult("conflict", "unsaved_editor_changes");
            if (!string.Equals(current.StateDigest, preview.StateDigest, StringComparison.Ordinal) ||
                !string.Equals(current.Text, preview.Before, StringComparison.Ordinal) ||
                !string.Equals(current.BufferText, preview.BeforeBuffer, StringComparison.Ordinal) ||
                !string.Equals(current.ProjectRevision, preview.ProjectRevision, StringComparison.Ordinal) ||
                !ReferenceEquals(current.BufferIdentity, preview.BufferIdentity)) return new SourceResult("conflict", "baseline_changed");
            bool approved;
            try {
                approved = consumeApproval(new SourceApproval { OperationId = operationId, Operation = operation,
                    ContextIdentity = contextIdentity, ObjectId = preview.ObjectId, Section = preview.Section,
                    PreviewId = preview.PreviewId, JournalId = preview.JournalId,
                    ProjectRevision = preview.ProjectRevision,
                    BeforeText = preview.Before, ProposedText = preview.After,
                    BaselineDigest = Digest(preview.BeforeBuffer), ProposedDigest = Digest(preview.AfterBuffer),
                    SectionBaselineDigest = Digest(preview.Before), SectionProposedDigest = Digest(preview.After) });
            }
            catch { return Refused("approval_unavailable"); }
            if (!approved) return Refused("approval_required");
            if (authorizationCurrent != null && !authorizationCurrent(operationId)) return Refused("approval_expired");
            // Approval callbacks may pump messages or change the binding.
            if (!ContextMatches()) return Refused("stale_context");
            if (!editor.HasVerifiedAtomicLiveBufferSemantics) return new SourceResult("unsupported", "atomic_live_buffer_unverified");
            // A native approval dialog can reenter the UI dispatcher. Claim only
            // once after it returns, even when another operation used the preview.
            if (!submitting()) return Refused("source_already_submitted");
            var request = new SourceEditRequest { ContextIdentity = contextIdentity,
                ObjectId = preview.ObjectId, Section = preview.Section,
                ExpectedText = preview.Before, ReplacementText = preview.After,
                ExpectedBufferText = preview.BeforeBuffer, ReplacementBufferText = preview.AfterBuffer, ProjectRevision = preview.ProjectRevision,
                BufferIdentity = preview.BufferIdentity, ExpectedStateDigest = preview.StateDigest,
                IsRollback = operation == "source.rollback",
                AuthorizationCurrent = () => authorizationCurrent == null || authorizationCurrent(operationId) };
            SourceExchangeOutcome outcome;
            try { outcome = editor.CompareExchange(request); }
            catch { outcome = SourceExchangeOutcome.Unknown; }
            var status = outcome == SourceExchangeOutcome.Applied ? "succeeded" :
                outcome == SourceExchangeOutcome.Conflict || outcome == SourceExchangeOutcome.UnsavedEditorChanges ? "conflict" :
                outcome == SourceExchangeOutcome.Unsupported ? "unsupported" : "unknown";
            completed(status, request.VerifiedPostStateDigest);
            var error = status == "succeeded" ? null : outcome == SourceExchangeOutcome.UnsavedEditorChanges
                ? "unsaved_editor_changes" : "source_exchange_" + status;
            return new SourceResult(status, error, WithSource(new Dictionary<string, object> {
                { "journalOperationId", preview.JournalId ?? operationId },
                { "baselineDigest", Digest(preview.BeforeBuffer) }, { "proposedDigest", Digest(preview.AfterBuffer) },
                { "sectionBaselineDigest", Digest(preview.Before) }, { "sectionProposedDigest", Digest(preview.After) }
            }, xmlSource: status == "succeeded" ? "liveBuffer" : "unknown"));
        }

        private Dictionary<string, object> WithSource(Dictionary<string, object> result, bool includeXml = true, string xmlSource = "liveBuffer")
        {
            if (automationInterface) AutomationMetadata(result);
            else if (includeXml) result.Add("source", xmlSource);
            return result;
        }

        internal static void AutomationMetadata(Dictionary<string, object> result, string persistence = "mayPersistToDisk")
        {
            result.Add("source", "automationInterface");
            result.Add("sourceMode", "automationInterface");
            result.Add("persistence", persistence);
            result.Add("applySupported", true);
        }

        internal static string NormalizeLf(string text) { return text == null ? null : text.Replace("\r\n", "\n").Replace('\r', '\n'); }

        private SourceResult CheckTarget(string objectId, string section)
        {
            if (!ContextMatches()) return Refused("stale_context");
            if (string.IsNullOrWhiteSpace(objectId) || objectId.Length > 1024 ||
                (section != "declaration" && section != "implementation")) return Refused("invalid_source_target");
            if (!editor.HasVerifiedAtomicLiveBufferSemantics) return new SourceResult("unsupported", "atomic_live_buffer_unverified");
            return null;
        }

        private SourceResult ReadVerified(string objectId, string section, out SourceSnapshot snapshot)
        {
            snapshot = null;
            if (!ContextMatches()) return Refused("stale_context");
            try { snapshot = editor.Read(contextIdentity, objectId, section); }
            catch { return Refused("source_observation_failed"); }
            if (!ContextMatches()) return Refused("stale_context");
            if (snapshot == null || !(automationInterface ? snapshot.IsVerifiedAutomationSource : snapshot.IsVerifiedLiveBuffer) || !snapshot.IsExistingStructuredTextObject ||
                !snapshot.IsUnambiguousIdentity || !snapshot.IsOrdinaryPlcSource ||
                !string.Equals(snapshot.ContextIdentity, contextIdentity, StringComparison.Ordinal) ||
                !string.Equals(snapshot.ObjectId, objectId, StringComparison.Ordinal) ||
                !string.Equals(snapshot.Section, section, StringComparison.Ordinal) || !ValidText(snapshot.Text) ||
                !ValidBuffer(snapshot.BufferText) || string.IsNullOrEmpty(snapshot.ProjectRevision) || snapshot.BufferIdentity == null || snapshot.BuildReplacement == null)
                return Refused("source_identity_or_buffer_unverified");
            return null;
        }

        private SourceResult Once(string operationId, string fingerprint, Func<SourceResult> action)
        {
            Guid parsed;
            if (!Guid.TryParseExact(operationId, "D", out parsed) || parsed == Guid.Empty) return Refused("invalid_operation_id");
            // UUID spelling cannot create a second identity.
            operationId = parsed.ToString("D");
            if (!ContextMatches()) return Refused("stale_context");
            SourceReplay replay;
            if (operations.TryGetValue(operationId, out replay))
                return replay.Fingerprint == fingerprint ? replay.Result : Refused("operation_id_reused");
            if (operations.Count >= MaxOperations) return Refused("source_session_capacity");
            replay = new SourceReplay { Fingerprint = fingerprint, Result = new SourceResult("unknown", "operation_in_progress") };
            operations.Add(operationId, replay);
            try { replay.Result = action(); }
            catch { replay.Result = new SourceResult("unknown", "source_outcome_unknown"); }
            return replay.Result;
        }

        private bool ContextMatches()
        {
            try { return string.Equals(contextIdentity, currentContextIdentity(), StringComparison.Ordinal); }
            catch { return false; }
        }

        internal static bool ValidText(string text)
        {
            if (text == null || text.Length > MaxTextLength || text.IndexOf('\0') >= 0) return false;
            try { new UTF8Encoding(false, true).GetByteCount(text); return true; }
            catch (EncoderFallbackException) { return false; }
        }

        private static bool ValidBuffer(string text)
        {
            if (text == null || text.Length > MaxBufferLength || text.IndexOf('\0') >= 0) return false;
            try { new UTF8Encoding(false, true).GetByteCount(text); return true; }
            catch (EncoderFallbackException) { return false; }
        }

        private static SourceResult Refused(string code) { return new SourceResult("refused", code); }
        private static string CanonicalId(string value)
        {
            Guid id;
            return Guid.TryParseExact(value, "D", out id) && id != Guid.Empty ? id.ToString("D") : null;
        }
        internal static string Digest(string text)
        {
            using (var sha = SHA256.Create())
                return BitConverter.ToString(sha.ComputeHash(new UTF8Encoding(false, true).GetBytes(text))).Replace("-", "").ToLowerInvariant();
        }

        internal static string Fingerprint(params string[] parts)
        {
            var value = new StringBuilder();
            foreach (var part in parts) value.Append(part == null ? "-1:" : part.Length + ":" + part);
            return Digest(value.ToString());
        }

        private sealed class SourcePreview
        {
            internal string ObjectId, Section, Before, After, BeforeBuffer, AfterBuffer, PreviewId, JournalId, ProjectRevision, StateDigest;
            internal object BufferIdentity;
            internal bool Consumed;
        }
        private sealed class SourceJournal
        {
            internal SourcePreview Preview;
            internal string Outcome, RollbackOutcome, PostStateDigest;
            internal bool RollbackSubmitted;
        }
        private sealed class SourceReplay
        {
            internal string Fingerprint;
            internal SourceResult Result;
        }
    }
}
