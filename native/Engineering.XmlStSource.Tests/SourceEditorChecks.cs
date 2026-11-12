using System;
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
class Buffer : ITextBuffer
{
    internal string Text = "a\r\nb";
    internal bool Denied, FailReplace, ThrowApply, Disposed, ChangeAfterApply;
    internal int Applies;
    public bool CheckEditAccess() { return !Denied; }
    public ITextSnapshot CurrentSnapshot { get { return new Snapshot(Text); } }
    public ITextEdit CreateEdit() { return new Edit(this); }
    sealed class Edit : ITextEdit
    {
        readonly Buffer buffer;
        readonly ITextSnapshot snapshot;
        string replacement;
        internal Edit(Buffer b) { buffer = b; snapshot = b.CurrentSnapshot; }
        public ITextSnapshot Snapshot { get { return snapshot; } }
        public bool Replace(int start, int length, string text) { if (buffer.FailReplace) return false; replacement = text; return true; }
        public bool HasFailedChanges { get { return buffer.FailReplace; } }
        public ITextSnapshot Apply() { buffer.Applies++; buffer.Text = replacement; if (buffer.ThrowApply) throw new InvalidOperationException(); var result = buffer.CurrentSnapshot; if (buffer.ChangeAfterApply) buffer.Text += "x"; return result; }
        public void Dispose() { buffer.Disposed = true; }
    }
}
sealed class ProjectionBuffer : Buffer, Microsoft.VisualStudio.Text.Projection.IProjectionBufferBase { }

static class Checks
{
    static void Require(bool value, string name) { if (!value) throw new Exception(name); }
    static string Id() { return Guid.NewGuid().ToString("D"); }
    static void Main()
    {
        string dir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "xmlst-" + Id());
        System.IO.Directory.CreateDirectory(dir);
        try {
            string project = System.IO.Path.Combine(dir, "Test.plcproj"), source = System.IO.Path.Combine(dir, "Main.TcPOU");
            string projectXml = "<Project><ItemGroup><Compile Include=\"Main.TcPOU\" /></ItemGroup><Import Project=\"$(MSBuildExtensionsPath)\\Beckhoff\\TwinCAT\\v3.1\\TcPlcProject.targets\" /></Project>";
            System.IO.File.WriteAllText(project, projectXml); System.IO.File.WriteAllText(source, "fixture");
            var buffer = new Buffer { Text = "<TcPlcObject><POU Name=\"Main\" Id=\"{11111111-1111-1111-1111-111111111111}\"><Declaration><![CDATA[PROGRAM Main]]></Declaration><Implementation><ST><![CDATA[a := 1;]]></ST></Implementation></POU></TcPlcObject>" };
            string objectId = source + "|11111111-1111-1111-1111-111111111111|Main";
            string context = "session"; bool? projectDirty = false, sourceDirty = true;
            object currentBuffer = buffer;
            var editor = new XmlStSourceEditor(project, _ => currentBuffer, p => p == project ? projectDirty : sourceDirty, () => context, context);
            var discovered = editor.Targets(source);
            Require(discovered.Status == "succeeded" && (int)discovered.Result["count"] == 1 && (string)discovered.Result["dirtyState"] == "dirty", "targets");
            var rows = (System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>>)discovered.Result["targets"];
            Require((string)rows[0]["objectId"] == objectId && (string)rows[0]["kind"] == "pou" && ((string[])rows[0]["sections"]).Length == 2, "target contents");
            Require(editor.Targets(source + "|not-moniker").Status == "unsupported", "invalid moniker");
            int bufferCalls = 0;
            var switched = new XmlStSourceEditor(project, _ => ++bufferCalls == 1 ? (object)buffer : new object(), p => p == project ? projectDirty : sourceDirty, () => context, context);
            Require(switched.Targets(source).Status == "unsupported", "target discovery rejects changed buffer identity");
            SourceApproval approval = null;
            var policy = new SourcePolicy(editor, () => context, a => { approval = a; return true; });
            Require(policy.Read(objectId, "implementation").Status == "succeeded", "read");
            string preview = Id();
            var pr = policy.Preview(preview, objectId, "implementation", "a := 2;");
            Require(pr.Status == "succeeded" && (string)pr.Result["beforeText"] == "a := 1;" && (string)pr.Result["proposedText"] == "a := 2;", "preview");
            string original = buffer.Text;
            currentBuffer = new Buffer { Text = original };
            Require(policy.Apply(Id(), preview).Status == "conflict" && buffer.Applies == 0, "buffer identity conflict");
            currentBuffer = buffer;
            System.IO.File.WriteAllText(project, projectXml + " ");
            Require(policy.Apply(Id(), preview).Status == "conflict" && buffer.Applies == 0, "project revision conflict");
            System.IO.File.WriteAllText(project, projectXml);
            buffer.Text = original.Replace("PROGRAM Main", "PROGRAM Changed");
            Require(policy.Apply(Id(), preview).Status == "conflict" && buffer.Applies == 0, "unrelated XML conflict");
            buffer.Text = original; preview = Id();
            Require(policy.Preview(preview, objectId, "implementation", "a := 2;").Status == "succeeded", "preview again");
            var op = Id(); Require(policy.Apply(op, preview).Status == "succeeded", "apply");
            Require(approval.PreviewId == preview && approval.JournalId == null && approval.BaselineDigest != approval.ProposedDigest && approval.ProjectRevision.Length == 64, "approval");
            Require(buffer.Text == original.Replace("a := 1;", "a := 2;"), "only section changed");
            Require(policy.Rollback(Id(), op).Status == "succeeded" && buffer.Text == original && approval.JournalId == op, "rollback");
            Require(policy.GetJournal(op).Status == "succeeded" && (string)policy.GetJournal(op).Result["outcome"] == "succeeded", "journal");
            sourceDirty = null; Require(policy.Read(objectId, "implementation").Status == "refused" && editor.Targets(source).Status == "unsupported", "unknown dirty"); sourceDirty = false;
            projectDirty = true; Require(policy.Read(objectId, "implementation").Status == "refused", "dirty project"); projectDirty = false;
            currentBuffer = new object(); Require(policy.Read(objectId, "implementation").Status == "refused", "not buffer"); currentBuffer = buffer;
            System.IO.File.WriteAllText(project, projectXml.Replace("</ItemGroup>", "<Compile Include=\"Main.TcPOU\" /></ItemGroup>"));
            Require(policy.Read(objectId, "implementation").Status == "refused", "duplicate membership");
            System.IO.File.WriteAllText(project, projectXml);
            Require(policy.Read(source + "|11111111-1111-1111-1111-111111111111|Other", "implementation").Status == "refused", "wrong name");
            Require(System.IO.File.ReadAllText(source) == "fixture", "source file untouched");
            Console.WriteLine("XML ST source editor checks passed");
        } finally {
            if (!System.IO.Path.GetFullPath(dir).StartsWith(System.IO.Path.Combine(System.IO.Path.GetTempPath(), "xmlst-"), StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException();
            System.IO.Directory.Delete(dir, true);
        }
    }
}
