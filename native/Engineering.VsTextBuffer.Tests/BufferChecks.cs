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
    static void Require(bool value) { if (!value) throw new Exception("check failed"); }
    static void Main()
    {
        var b = new Buffer(); var a = VsTextBufferAdapter.TryCreate(b);
        Require(a != null && a.Read(() => true) == "a\r\nb");
        Require(a.CompareExchange("wrong", "new", () => true) == SourceExchangeOutcome.Conflict && b.Disposed && b.Applies == 0);
        b.Disposed = false; b.FailReplace = true;
        Require(a.CompareExchange(b.Text, "new", () => true) == SourceExchangeOutcome.Unsupported && b.Disposed && b.Applies == 0);
        b.FailReplace = false;
        Require(a.CompareExchange(b.Text, "new", () => true) == SourceExchangeOutcome.Applied && b.Text == "new");
        b.ThrowApply = true;
        Require(a.CompareExchange("new", "changed", () => true) == SourceExchangeOutcome.Unknown && b.Text == "changed");
        b.ThrowApply = false; b.ChangeAfterApply = true;
        Require(a.CompareExchange("changed", "after", () => true) == SourceExchangeOutcome.Unknown);
        b.Denied = true; Require(a.Read(() => true) == null);
        Require(VsTextBufferAdapter.TryCreate(new object()) == null);
        Require(VsTextBufferAdapter.TryCreate(new ProjectionBuffer()) == null);
        b.Denied = false; b.Text = new string('a', 65537);
        Require(a.Read(() => true) == null && a.CompareExchange(b.Text, "x", () => true) == SourceExchangeOutcome.Unsupported);
        Console.WriteLine("VsTextBuffer checks passed");
    }
}

