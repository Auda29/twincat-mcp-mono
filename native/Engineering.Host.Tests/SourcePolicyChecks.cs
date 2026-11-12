using System;
using TwinCatMcp.Engineering.Host;

internal static class SourcePolicyChecks
{
    private static int checks;
    private static string Id() { return Guid.NewGuid().ToString("D"); }
    private static void Expect(bool condition, string name)
    { if (!condition) throw new Exception(name); checks++; }
    private static void Status(SourceResult result, string expected, string name)
    { Expect(result.Status == expected, name + ": " + result.Status); }

    public static int Main()
    {
        var context = "bound-session/context-1";
        var approvals = 0;
        var unsupported = new SourcePolicy(() => context, _ => { approvals++; return true; });
        Status(unsupported.Preview(Id(), "POU:Main", "implementation", "next"), "unsupported", "default fails closed");
        Expect(approvals == 0, "unsupported consumes no approval");

        var editor = new FakeEditor(() => context);
        SourceApproval consumed = null;
        var policy = new SourcePolicy(editor, () => context, a => { approvals++; consumed = a; return true; });
        var preview = Id();
        Status(policy.Preview(preview, "POU:Main", "implementation", "next"), "succeeded", "preview");
        Expect(editor.Writes == 0 && approvals == 0, "preview never writes or approves");
        Status(policy.Preview(preview, "POU:Main", "implementation", "different"), "refused", "id reuse refused");
        var apply = Id();
        Status(policy.Apply(apply, preview), "succeeded", "apply");
        Expect(editor.Text == "next" && editor.Writes == 1, "apply changes exact live text");
        Expect(consumed.OperationId == apply && consumed.Operation == "source.apply" &&
            consumed.BaselineDigest != consumed.ProposedDigest && consumed.ContextIdentity == context,
            "approval binds operation context and both images");
        Status(policy.Apply(apply, preview), "succeeded", "apply retry cached");
        Expect(editor.Writes == 1 && approvals == 1, "retry never repeats approval or mutation");
        Status(policy.Apply(Id(), preview), "refused", "preview is single submission");
        editor.Text = "user edit";
        Status(policy.Rollback(Id(), apply), "conflict", "rollback rejects changed post image");
        editor.Text = "next";
        var undo = Id();
        Status(policy.Rollback(undo, apply), "succeeded", "rollback");
        Expect(editor.Text == "original" && editor.Writes == 2, "rollback restores exact pre image");
        Status(policy.Rollback(undo, apply), "succeeded", "rollback retry cached");
        Status(policy.Rollback(Id(), apply), "refused", "rollback single submission");

        var raced = Id();
        Status(policy.Preview(raced, "POU:Main", "implementation", "raced"), "succeeded", "race preview");
        editor.BeforeExchange = () => editor.Text = "concurrent edit";
        Status(policy.Apply(Id(), raced), "conflict", "atomic final compare rejects race");
        Expect(editor.Text == "concurrent edit" && editor.Writes == 2, "concurrent edit retained");
        editor.BeforeExchange = null;

        var uncertain = Id();
        Status(policy.Preview(uncertain, "POU:Main", "implementation", "uncertain"), "succeeded", "unknown preview");
        editor.ThrowAfterWrite = true;
        var unknownApply = Id();
        Status(policy.Apply(unknownApply, uncertain), "unknown", "exception after write unknown");
        var writes = editor.Writes;
        Status(policy.Apply(unknownApply, uncertain), "unknown", "unknown retry cached");
        var unknownJournal = policy.GetJournal(unknownApply);
        Expect(unknownJournal.Status == "succeeded" && (string)unknownJournal.Result["outcome"] == "unknown", "unknown journal remains readable");
        Status(policy.Apply(Id(), uncertain), "refused", "unknown prevents preview replay");
        Status(policy.Rollback(Id(), unknownApply), "refused", "unknown journal cannot undo without resolution");
        Expect(editor.Writes == writes, "unknown never retried");
        editor.ThrowAfterWrite = false;

        editor.Attested = false;
        Status(policy.Preview(Id(), "POU:Main", "implementation", "next"), "refused", "unattested source rejected");
        editor.Attested = true;
        Status(policy.Preview(Id(), "POU:Main", "interface", "next"), "refused", "unsupported section rejected");
        Status(policy.Preview(Id(), "POU:Main", "implementation", "\ud800"), "refused", "invalid Unicode rejected");

        var denied = new SourcePolicy(editor, () => context, _ => false);
        var deniedPreview = Id();
        Status(denied.Preview(deniedPreview, "POU:Main", "implementation", "denied"), "succeeded", "denied preview");
        Status(denied.Apply(Id(), deniedPreview), "refused", "approval refusal");
        Expect(editor.Writes == writes, "denial prevents mutation");

        var nestedEditor = new FakeEditor(() => context);
        SourcePolicy nested = null;
        var nestedPreview = Id();
        var entered = false;
        nested = new SourcePolicy(nestedEditor, () => context, _ => {
            if (!entered) { entered = true; nested.Apply(Id(), nestedPreview); }
            return true;
        });
        // Identical before/after text also needs the single-submission guard.
        Status(nested.Preview(nestedPreview, "POU:Main", "implementation", "original"), "succeeded", "reentrant preview");
        Status(nested.Apply(Id(), nestedPreview), "refused", "reentrant approval cannot submit preview twice");
        Expect(nestedEditor.Writes == 1, "only one reentrant mutation");

        var rebinding = new SourcePolicy(editor, () => context, _ => { context = "new-binding"; return true; });
        var rebindPreview = Id();
        Status(rebinding.Preview(rebindPreview, "POU:Main", "implementation", "rebind"), "succeeded", "rebind preview");
        Status(rebinding.Apply(Id(), rebindPreview), "refused", "context rechecked after approval");
        Status(policy.Read("POU:Main", "implementation"), "refused", "stale context read");
        Expect(editor.Writes == writes, "rebind prevents mutation");

        Console.WriteLine("Source policy synthetic checks passed: " + checks);
        return 0;
    }

    private sealed class FakeEditor : ISourceEditor
    {
        private readonly Func<string> context;
        internal string Text = "original";
        internal int Writes;
        internal bool Attested = true;
        internal bool ThrowAfterWrite;
        internal Action BeforeExchange;
        internal FakeEditor(Func<string> context) { this.context = context; }
        public bool HasVerifiedAtomicLiveBufferSemantics { get { return true; } }
        public SourceSnapshot Read(string contextIdentity, string objectId, string section)
        {
            return new SourceSnapshot { ContextIdentity = context(), ObjectId = objectId, Section = section,
                Text = Text, BufferText = Text, ProjectRevision = "project", BufferIdentity = this, BuildReplacement = text => text,
                IsExistingStructuredTextObject = Attested, IsOrdinaryPlcSource = Attested,
                IsUnambiguousIdentity = Attested, IsVerifiedLiveBuffer = Attested };
        }
        public SourceExchangeOutcome CompareExchange(SourceEditRequest request)
        {
            if (BeforeExchange != null) BeforeExchange();
            if (request.ContextIdentity != context() || Text != request.ExpectedText || Text != request.ExpectedBufferText || !Attested)
                return SourceExchangeOutcome.Conflict;
            Text = request.ReplacementText;
            Writes++;
            if (ThrowAfterWrite) throw new InvalidOperationException("Synthetic failure after mutation");
            return SourceExchangeOutcome.Applied;
        }
    }
}
