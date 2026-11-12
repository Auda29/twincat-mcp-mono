using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using TwinCatMcp.Engineering.Host;
using Microsoft.VisualStudio.Text;

namespace Microsoft.VisualStudio.Text
{
    public interface ITextBuffer { bool CheckEditAccess(); ITextEdit CreateEdit(); ITextSnapshot CurrentSnapshot { get; } }
    public interface ITextBufferEdit { ITextSnapshot Snapshot { get; } ITextSnapshot Apply(); }
    public interface ITextEdit : ITextBufferEdit, IDisposable { bool Replace(int start, int length, string text); bool HasFailedChanges { get; } }
    public interface ITextSnapshot { int Length { get; } string GetText(); }
    namespace Projection { public interface IProjectionBufferBase : ITextBuffer { } }
}
sealed class Snapshot : ITextSnapshot
{
    readonly string text;
    internal Snapshot(string value) { text = value; }
    public int Length { get { return text.Length; } }
    public string GetText() { return text; }
}
sealed class Buffer : ITextBuffer
{
    internal string Text;
    internal int Applies;
    internal Action AfterApply;
    public bool CheckEditAccess() { return true; }
    public ITextSnapshot CurrentSnapshot { get { return new Snapshot(Text); } }
    public ITextEdit CreateEdit() { return new Edit(this); }
    sealed class Edit : ITextEdit
    {
        readonly Buffer buffer; readonly ITextSnapshot snapshot; string replacement;
        internal Edit(Buffer b) { buffer = b; snapshot = b.CurrentSnapshot; }
        public ITextSnapshot Snapshot { get { return snapshot; } }
        public bool Replace(int start, int length, string text) { replacement = text; return true; }
        public bool HasFailedChanges { get { return false; } }
        public ITextSnapshot Apply() { buffer.Text = replacement; buffer.Applies++; var result = buffer.CurrentSnapshot; if (buffer.AfterApply != null) buffer.AfterApply(); return result; }
        public void Dispose() { }
    }
}
static class Checks
{
    sealed class Inline : SynchronizationContext { public override void Post(SendOrPostCallback cb, object state) { cb(state); } }
    static void Require(bool value, string text) { if (!value) throw new Exception(text); }
    static string Hash(string text) { using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(text))).Replace("-", "").ToLowerInvariant(); }
    static Dictionary<string, object> Result(Dictionary<string, object> response) { return (Dictionary<string, object>)response["result"]; }
    static string Status(Dictionary<string, object> response) { return (string)response["status"]; }
    static void Main()
    {
        string dir = Path.Combine(Path.GetTempPath(), "provider-source-" + Guid.NewGuid().ToString("D"));
        Directory.CreateDirectory(dir);
        try {
            string project = Path.Combine(dir, "Test.plcproj"), source = Path.Combine(dir, "Main.TcPOU"), solution = Path.Combine(dir, "Test.sln");
            string projectXml = @"<Project xmlns=""http://schemas.microsoft.com/developer/msbuild/2003""><ItemGroup><Compile Include=""Main.TcPOU"" /></ItemGroup><Import Project=""$(MSBuildExtensionsPath)\Beckhoff\TwinCAT\v3.1\TcPlcProject.targets"" /></Project>";
            File.WriteAllText(project, projectXml); File.WriteAllText(source, "untouched fixture");
            string original = "<TcPlcObject><POU Name=\"Main\" Id=\"{11111111-1111-1111-1111-111111111111}\"><Declaration><![CDATA[PROGRAM Main]]></Declaration><Implementation><ST><![CDATA[a := 1;]]></ST></Implementation></POU></TcPlcObject>";
            var buffer = new Buffer { Text = original }; object active = buffer;
            string target = source + "|11111111-1111-1111-1111-111111111111|Main";
            var session = Guid.NewGuid(); var started = DateTime.UtcNow;
            var context = new HostContext(session, 123, started, solution, project, "epoch");
            var json = new JavaScriptSerializer(); ApprovalRequest observed = null;
            string lastRequest = null; int approvals = 0;
            bool suspended = false;
            Guid expectedOperation = Guid.Empty; string expectedOperationName = null, expectedPreview = null, expectedJournal = null;
            string expectedBaseline = null, expectedProposed = null; DateTime expectedExpiry = default(DateTime);
            using (var provider = EngineeringProviderFactory.CreateWithEditorAccess(new object(), p => p == project ? (bool?)false : true,
                () => context, approval => {
                    observed = approval; approvals++;
                    return !suspended && approval.SessionId == session && approval.OperationId == expectedOperation && approval.Operation == expectedOperationName &&
                        ReferenceEquals(approval.Expected, context) && approval.TargetObjectId == target && approval.Section == "implementation" &&
                        approval.PreviewId == expectedPreview && approval.JournalId == expectedJournal && approval.BaselineDigest == expectedBaseline &&
                        approval.ProposedDigest == expectedProposed && approval.CanonicalRequestDigest == Hash(lastRequest) &&
                        approval.RawRequestJson == lastRequest && Hash(approval.RawRequestJson) == approval.CanonicalRequestDigest &&
                        approval.ExpiresUtc == expectedExpiry && approval.ExpiresUtc > DateTime.UtcNow;
                }, new Inline(), _ => active)) {
                Func<Guid, string, object, Dictionary<string, object>> call = (id, operation, args) => {
                    lastRequest = json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = id.ToString("D"), operation,
                        expected = new { idePid = 123, ideStartedUtc = started.ToString("o"), solutionFile = solution, projectFile = project, contextEpoch = "epoch" }, arguments = args });
                    return (Dictionary<string, object>)json.DeserializeObject(provider.DispatchAsync(lastRequest, CancellationToken.None).GetAwaiter().GetResult());
                };
                var discovered = call(Guid.NewGuid(), "source.targets", new { moniker = source });
                Require(Status(discovered) == "succeeded", "source.targets: " + json.Serialize(discovered));
                var targets = (object[])Result(discovered)["targets"];
                Require(targets.Length == 1 && (string)((Dictionary<string, object>)targets[0])["objectId"] == target, "source targets owns GUID/name mapping");
                var read = call(Guid.NewGuid(), "source.read", new { objectId = target, section = "implementation" });
                Require(Status(read) == "succeeded" && (string)Result(read)["text"] == "a := 1;", "source.read: " + json.Serialize(read));
                File.WriteAllText(project, projectXml.Replace("Include=\"Main.TcPOU\"", "Include=\"Main.TcPOU\" Exclude=\"Main.TcPOU\""));
                Require(Status(call(Guid.NewGuid(), "source.read", new { objectId = target, section = "implementation" })) == "refused", "Exclude rejected");
                File.WriteAllText(project, projectXml.Replace("</Project>", "<Target Name=\"Alter\" /></Project>"));
                Require(Status(call(Guid.NewGuid(), "source.read", new { objectId = target, section = "implementation" })) == "refused", "Target rejected");
                File.WriteAllText(project, projectXml);
                Require(Status(call(Guid.NewGuid(), "source.preview", new { objectId = target, section = "implementation", proposedText = new string('x', 16385) })) == "refused", "section limit");
                Guid previewId = Guid.NewGuid();
                var preview = call(previewId, "source.preview", new { objectId = target, section = "implementation", proposedText = "a := 2;" });
                Require(Status(preview) == "succeeded", "preview: " + json.Serialize(preview));
                var p = Result(preview);
                string baseline = (string)p["baselineDigest"], proposed = (string)p["proposedDigest"], projectRevision = (string)p["projectRevision"];
                Require((string)p["beforeText"] == "a := 1;" && (string)p["proposedText"] == "a := 2;", "preview images");
                Require(baseline == Hash(original) && proposed == Hash(original.Replace("a := 1;", "a := 2;")), "whole-buffer digest");
                int priorApprovals = approvals;
                var rejectedDigest = call(Guid.NewGuid(), "source.apply", new { previewId = previewId.ToString("D"), approvalExpiresUtc = DateTime.UtcNow.AddSeconds(90).ToString("o"), baselineDigest = new string('0', 64), proposedDigest = proposed, projectRevision });
                Require(Status(rejectedDigest) == "refused" && approvals == priorApprovals, "wrong digest rejected");
                var expired = call(Guid.NewGuid(), "source.apply", new { previewId = previewId.ToString("D"), approvalExpiresUtc = DateTime.UtcNow.AddSeconds(-1).ToString("o"), baselineDigest = baseline, proposedDigest = proposed, projectRevision });
                Require(Status(expired) == "refused" && approvals == priorApprovals, "expired approval rejected");
                var applyId = Guid.NewGuid(); var expiry = DateTime.UtcNow.AddSeconds(90);
                expectedOperation = applyId; expectedOperationName = "source.apply"; expectedPreview = previewId.ToString("D"); expectedJournal = null;
                expectedBaseline = baseline; expectedProposed = proposed; expectedExpiry = expiry;
                var applied = call(applyId, "source.apply", new { previewId = previewId.ToString("D"), approvalExpiresUtc = expiry.ToString("o"), baselineDigest = baseline, proposedDigest = proposed, projectRevision });
                Require(Status(applied) == "succeeded", "apply: " + json.Serialize(applied));
                Require(observed != null && observed.SessionId == session && observed.OperationId == applyId && observed.Operation == "source.apply" &&
                    observed.TargetObjectId == target && observed.Section == "implementation" && observed.PreviewId == previewId.ToString("D") && observed.JournalId == null &&
                    observed.BaselineDigest == baseline && observed.ProposedDigest == proposed && observed.CanonicalRequestDigest == Hash(lastRequest) &&
                    observed.ExpiresUtc == expiry && observed.ExpiresUtc > DateTime.UtcNow, "apply approval binding");
                Require(buffer.Text == original.Replace("a := 1;", "a := 2;") && buffer.Applies == 1, "apply exact content");
                Require(observed.BeforeText == "a := 1;" && observed.ProposedText == "a := 2;", "approval diff comes from trusted cached preview");
                var undoId = Guid.NewGuid(); expiry = DateTime.UtcNow.AddSeconds(90);
                expectedOperation = undoId; expectedOperationName = "source.rollback"; expectedJournal = applyId.ToString("D");
                expectedBaseline = proposed; expectedProposed = baseline; expectedExpiry = expiry;
                var rollback = call(undoId, "source.rollback", new { journalId = applyId.ToString("D"), approvalExpiresUtc = expiry.ToString("o"), baselineDigest = proposed, proposedDigest = baseline, projectRevision });
                Require(Status(rollback) == "succeeded", "rollback: " + json.Serialize(rollback));
                Require((string)Result(rollback)["journalOperationId"] == applyId.ToString("D"), "rollback returns original queryable journal");
                Require(observed.OperationId == undoId && observed.Operation == "source.rollback" && observed.TargetObjectId == target && observed.Section == "implementation" &&
                    observed.PreviewId == previewId.ToString("D") && observed.JournalId == applyId.ToString("D") && observed.BaselineDigest == proposed && observed.ProposedDigest == baseline &&
                    observed.CanonicalRequestDigest == Hash(lastRequest) && observed.ExpiresUtc == expiry && buffer.Text == original, "rollback approval binding");
                Require(observed.BeforeText == "a := 2;" && observed.ProposedText == "a := 1;", "rollback approval diff is trusted reverse image");
                previewId = Guid.NewGuid(); preview = call(previewId, "source.preview", new { objectId = target, section = "implementation", proposedText = "a := 9;" }); p = Result(preview);
                var ownEditId = Guid.NewGuid(); expiry = DateTime.UtcNow.AddSeconds(90);
                expectedOperation = ownEditId; expectedOperationName = "source.apply"; expectedPreview = previewId.ToString("D"); expectedJournal = null;
                expectedBaseline = (string)p["baselineDigest"]; expectedProposed = (string)p["proposedDigest"]; expectedExpiry = expiry;
                buffer.AfterApply = () => suspended = true;
                var ownEdit = call(ownEditId, "source.apply", new { previewId = previewId.ToString("D"), approvalExpiresUtc = expiry.ToString("o"), baselineDigest = expectedBaseline, proposedDigest = expectedProposed, projectRevision });
                Require(Status(ownEdit) == "succeeded" && suspended && ReferenceEquals(active, buffer), "own edit suspension: " + json.Serialize(ownEdit));
                suspended = false; buffer.AfterApply = null; buffer.Text = original;
                previewId = Guid.NewGuid(); preview = call(previewId, "source.preview", new { objectId = target, section = "implementation", proposedText = "a := 3;" }); p = Result(preview);
                buffer.Text = buffer.Text.Replace("PROGRAM Main", "PROGRAM Other");
                int before = approvals;
                var stale = call(Guid.NewGuid(), "source.apply", new { previewId = previewId.ToString("D"), approvalExpiresUtc = DateTime.UtcNow.AddSeconds(90).ToString("o"), baselineDigest = (string)p["baselineDigest"], proposedDigest = (string)p["proposedDigest"], projectRevision = (string)p["projectRevision"] });
                Require(Status(stale) == "conflict" && approvals == before, "stale source: " + json.Serialize(stale));
                buffer.Text = original; previewId = Guid.NewGuid(); preview = call(previewId, "source.preview", new { objectId = target, section = "implementation", proposedText = "a := 4;" }); p = Result(preview);
                var uncertainId = Guid.NewGuid(); buffer.AfterApply = () => active = null;
                expiry = DateTime.UtcNow.AddSeconds(90);
                expectedOperation = uncertainId; expectedOperationName = "source.apply"; expectedPreview = previewId.ToString("D"); expectedJournal = null;
                expectedBaseline = (string)p["baselineDigest"]; expectedProposed = (string)p["proposedDigest"]; expectedExpiry = expiry;
                var uncertain = call(uncertainId, "source.apply", new { previewId = previewId.ToString("D"), approvalExpiresUtc = expiry.ToString("o"), baselineDigest = (string)p["baselineDigest"], proposedDigest = (string)p["proposedDigest"], projectRevision = (string)p["projectRevision"] });
                Require(Status(uncertain) == "unknown", "identity loss: " + json.Serialize(uncertain));
                var repeat = call(uncertainId, "source.apply", new { previewId = previewId.ToString("D"), approvalExpiresUtc = expiry.ToString("o"), baselineDigest = (string)p["baselineDigest"], proposedDigest = (string)p["proposedDigest"], projectRevision = (string)p["projectRevision"] });
                Require(Status(repeat) == "unknown" && buffer.Applies == 4, "unknown replay must not mutate");
                var journal = call(Guid.NewGuid(), "source.journal", new { journalId = uncertainId.ToString("D") });
                Require(Status(journal) == "succeeded" && (string)Result(journal)["outcome"] == "unknown" && (string)Result(journal)["proposedText"] == "a := 4;", "unknown journal: " + json.Serialize(journal));
                Require(File.ReadAllText(source) == "untouched fixture", "source disk modified");
            }
            Console.WriteLine("Provider source end-to-end fixture checks passed");
        } finally {
            if (!Path.GetFullPath(dir).StartsWith(Path.Combine(Path.GetTempPath(), "provider-source-"), StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException();
            Directory.Delete(dir, true);
        }
    }
}
