using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using EnvDTE;
using TCatSysManagerLib;
using TwinCatMcp.Engineering.Host;

internal sealed class AutomationSourceChecks : IDisposable
{
    private readonly JavaScriptSerializer serializer = new JavaScriptSerializer { MaxJsonLength = 1024 * 1024 };
    private readonly HostContext context;
    private readonly object expected;
    private readonly Plc plc;
    private readonly TreeNode root, pous, duts, gvls, folder;
    private readonly FullSource main, method, ladder;
    private readonly Collection documents = new Collection();
    private readonly OpenDocument document;
    private readonly HashSet<string> dirtyPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    private readonly IEngineeringProvider provider;
    private readonly string mainId, methodId;
    private bool grant = true;
    private Action onApproval;
    private readonly List<ApprovalRequest> approvals = new List<ApprovalRequest>();
    private static int assertions;

    private AutomationSourceChecks(bool enable = true)
    {
        var directory = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "automation-source-fixture-" + Guid.NewGuid().ToString("N")));
        context = new HostContext(Guid.NewGuid(), 1234, DateTime.UtcNow, Path.Combine(directory, "Fixture.sln"),
            Path.Combine(directory, "Fixture.plcproj"), "epoch");
        expected = new { idePid = context.IdePid, ideStartedUtc = context.IdeStartedUtc.ToString("o"),
            solutionFile = context.SolutionFile, projectFile = context.ProjectFile, contextEpoch = context.ContextEpoch };
        root = new TreeNode { Name = "Application", ItemType = 600 };
        plc = new Plc { Name = "Fixture", ItemType = 56, ProjectFile = context.ProjectFile, NestedProject = root };
        var tipc = new TreeNode { Name = "TIPC", ItemType = 1 };
        tipc.Add(plc);
        pous = root.Add(Folder("POUs", directory));
        pous.PhysicalFile = Path.Combine(directory, "POUs;Sources");
        duts = root.Add(Folder("DUTs", directory));
        gvls = root.Add(Folder("GVLs", directory));
        folder = pous.Add(Folder("SubFolder", pous.PhysicalFile));
        main = (FullSource)pous.Add(new FullSource { Name = "Main", ItemType = 604,
            PhysicalFile = Path.Combine(pous.PhysicalFile, "Main.TcPOU"), Written = MarkDirty });
        method = (FullSource)main.Add(new FullSource { Name = "Run", ItemType = 609, PhysicalFile = main.PhysicalFile, Written = MarkDirty });
        main.Add(new ImplementationNode { Name = "Tick", ItemType = 608 });
        var property = main.Add(new DeclarationNode { Name = "Value", ItemType = 611 });
        property.Add(new FullSource { Name = "Get", ItemType = 613 });
        property.Add(new FullSource { Name = "Set", ItemType = 614 });
        ladder = (FullSource)pous.Add(new FullSource { Name = "Graphical", ItemType = 602, Language = LanguageType.LD,
            PhysicalFile = Path.Combine(pous.PhysicalFile, "Graphical.TcPOU") });
        ladder.Add(new FullSource { Name = "LooksST", ItemType = 609 });
        pous.Add(new DeclarationNode { Name = "I_Device", ItemType = 618, PhysicalFile = Path.Combine(pous.PhysicalFile, "I_Device.TcIO") });
        duts.Add(new DeclarationNode { Name = "E_Mode", ItemType = 605, PhysicalFile = Path.Combine(duts.PhysicalFile, "E_Mode.TcDUT") });
        gvls.Add(new DeclarationNode { Name = "Globals", ItemType = 615, PhysicalFile = Path.Combine(gvls.PhysicalFile, "Globals.TcGVL") });
        mainId = main.PhysicalFile + "|POUs^Main";
        methodId = mainId + "^Run";
        document = new OpenDocument { FullName = main.PhysicalFile + ";Run" };
        documents.Values.Add(document);
        var projects = new Collection();
        projects.Values.Add(new ActiveProject { FileName = Path.Combine(directory, "Fixture.tsproj"), Object = new Manager { Tipc = tipc } });
        var dte = new ActiveDte { Documents = documents, Solution = new ActiveSolution { FullName = context.SolutionFile, Projects = projects } };
        provider = EngineeringProviderFactory.CreateWithInteropTypes(dte, file => dirtyPaths.Contains(file), () => context, request => {
            approvals.Add(request);
            var callback = onApproval;
            onApproval = null;
            callback?.Invoke();
            return grant;
        }, new Immediate(), enable ? new Func<string, object>(_ => null) : null, _ => false, null,
            name => typeof(AutomationSourceChecks).Assembly.GetType(name));
    }

    private TreeNode Folder(string name, string parent) => new TreeNode {
        Name = name, ItemType = 601, PhysicalFile = Path.Combine(parent, name), Written = MarkDirty
    };

    private void MarkDirty(string file)
    {
        dirtyPaths.Add(file);
        if (file == main.PhysicalFile) document.Saved = false;
    }

    private void Clean()
    {
        dirtyPaths.Clear();
        document.Saved = true;
    }

    private static void Expect(bool value, string message)
    {
        if (!value) throw new Exception(message);
        assertions++;
    }

    private Dictionary<string, object> Call(string operation, object args, Guid? id = null)
    {
        var raw = serializer.Serialize(new { protocolVersion = 1, sessionId = context.SessionId.ToString("D"),
            operationId = (id ?? Guid.NewGuid()).ToString("D"), operation, expected, arguments = args });
        var count = approvals.Count;
        var response = Map(serializer.DeserializeObject(provider.DispatchAsync(raw, CancellationToken.None).GetAwaiter().GetResult()));
        if (approvals.Count > count)
            Expect(approvals.Last().RawRequestJson == raw && approvals.Last().CanonicalRequestDigest == Hash(raw), "Approval must preserve exact raw request and digest");
        return response;
    }

    private static Dictionary<string, object> Map(object value) => (Dictionary<string, object>)value;
    private static Dictionary<string, object> Result(Dictionary<string, object> response) => Map(response["result"]);
    private static string Hash(string value)
    {
        using (var hash = SHA256.Create())
            return BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(value))).Replace("-", "").ToLowerInvariant();
    }
    private static void Status(Dictionary<string, object> response, string status, string error = null)
    {
        Expect(response["status"].Equals(status) && (error == null || response["error"].Equals(error)),
            "Expected " + status + "/" + error + ", received " + new JavaScriptSerializer().Serialize(response));
    }
    private Dictionary<string, object> Preview(string target, string text, string section = "implementation")
    {
        var response = Call("source.preview", new { objectId = target, section, proposedText = text });
        Status(response, "succeeded");
        return Result(response);
    }
    private static object ApplyArgs(Dictionary<string, object> p, string expiry = null) => new { previewId = p["previewOperationId"],
        approvalExpiresUtc = expiry ?? Expiry(), baselineDigest = p["baselineDigest"], proposedDigest = p["proposedDigest"], projectRevision = p["projectRevision"] };
    private static object RollbackArgs(Dictionary<string, object> p, Guid applyId) => new { journalId = applyId.ToString("D"),
        approvalExpiresUtc = Expiry(), baselineDigest = p["proposedDigest"], proposedDigest = p["baselineDigest"], projectRevision = p["projectRevision"] };
    private static string Expiry() => DateTime.UtcNow.AddSeconds(90).ToString("o");

    private void Discover()
    {
        var describe = Result(Call("session.describe", new { }));
        Expect((string)describe["sourceEditorKind"] == "automationInterfaceAndOpenXmlBuffer" &&
            (string)Map(describe["capabilities"])["sourceCreate"] == "conditional", "Describe editor capabilities");
        var response = Call("source.targets", new { });
        Status(response, "succeeded");
        var rows = ((object[])Result(response)["targets"]).Select(Map).ToArray();
        Expect(rows.Length == 9 && rows.All(row => !((string)row["objectId"]).Contains("Graphical") &&
            (string)row["sourceMode"] == "automationInterface" && (string)row["language"] == "ST" && (bool)row["applySupported"]), "Discover only supported ST and declarations");
        var methodRow = rows.Single(row => (string)row["objectId"] == methodId);
        Expect((string)methodRow["qualifiedName"] == "Main.Run" && (string)methodRow["treePath"] == "POUs^Main^Run" &&
            (string)methodRow["kind"] == "method" && ((object[])methodRow["sections"]).Length == 2, "Method identity and two sections");
        Expect(rows.Single(row => (string)row["kind"] == "action")["sections"] is object[] action && action.SequenceEqual(new[] { "implementation" }), "Actions expose implementation only");
        Expect(rows.Single(row => (string)row["kind"] == "property")["sections"] is object[] property && property.SequenceEqual(new[] { "declaration" }), "Properties expose declaration only");
        Expect(rows.Any(row => (string)row["kind"] == "property_get") && rows.Any(row => (string)row["kind"] == "property_set"), "Discover accessors");
        Expect((int)Result(Call("source.targets", new { moniker = main.PhysicalFile }))["count"] == 6, "Moniker includes nested members of the same file");
        Status(Call("source.targets", new { moniker = "relative.TcPOU" }), "refused", "invalid_source_moniker");
        Status(Call("source.read", new { objectId = ladder.PhysicalFile + "|POUs^Graphical", section = "implementation" }), "refused");
        Status(Call("source.read", new { objectId = mainId + "^Tick", section = "declaration" }), "refused");
        for (int i = 0; i < 510; i++)
            pous.Add(new FullSource { Name = "Large_" + i, ItemType = 604, PhysicalFile = Path.Combine(pous.PhysicalFile, "Large_" + i + ".TcPOU") });
        var bounded = Result(Call("source.targets", new { }));
        Expect((int)bounded["count"] == 512 && (bool)bounded["truncated"], "Discovery returns at most 512 targets");
    }

    private void Edit()
    {
        var read = Call("source.read", new { objectId = methodId, section = "implementation" });
        Status(read, "succeeded");
        var content = Result(read);
        Expect((string)content["text"] == "a := 0;\n" && (string)content["digest"] == Hash("a := 0;\n") &&
            ((string)content["projectRevision"]).Length == 64 && (string)Map(read["provenance"])["persistence"] == "mayPersistToDisk", "Normalized read, digest, and provenance");
        var p = Preview(methodId, "a := 1;\r\n");
        Expect((string)p["proposedText"] == "a := 1;\n" && (string)p["proposedDigest"] == Hash("a := 1;\n"), "Preview normalizes before approval");
        document.Saved = false;
        Status(Call("source.apply", ApplyArgs(p)), "conflict", "unsaved_editor_changes");
        Expect(approvals.Count == 0, "DTE member moniker with a semicolon in the physical path refuses before approval");
        document.FullName = main.PhysicalFile;
        Status(Call("source.apply", ApplyArgs(p)), "conflict", "unsaved_editor_changes");
        Expect(approvals.Count == 0, "The exact physical moniker with a semicolon also refuses before approval");
        document.FullName += ";Run";
        Clean();
        dirtyPaths.Add(main.PhysicalFile);
        Status(Call("source.apply", ApplyArgs(p)), "conflict", "unsaved_editor_changes");
        Clean();
        grant = false;
        Status(Call("source.apply", ApplyArgs(p)), "refused", "approval_required");
        grant = true;
        var applyId = Guid.NewGuid();
        var request = ApplyArgs(p);
        var applied = Call("source.apply", request, applyId);
        Status(applied, "succeeded");
        Expect((string)Result(applied)["source"] == "automationInterface" && method.Impl == "a := 1;\n" && !document.Saved, "Apply writes and verifies the method");
        var approval = approvals.Last();
        Expect(approval.Operation == "source.apply" && approval.OperationId == applyId && approval.SessionId == context.SessionId &&
            approval.BeforeText == "a := 0;\n" && approval.ProposedText == "a := 1;\n" && approval.TargetObjectId == methodId &&
            approval.Section == "implementation" && approval.PreviewId == (string)p["previewOperationId"] &&
            approval.JournalId == null && approval.BaselineDigest == (string)p["baselineDigest"] &&
            approval.ProposedDigest == (string)p["proposedDigest"], "Approval carries exact source, binding, digests and preview");
        var approvalCount = approvals.Count;
        Status(Call("source.apply", request, applyId), "succeeded");
        Status(Call("source.apply", request), "refused", "preview_already_submitted");
        Expect(approvals.Count == approvalCount, "A submitted preview never approves or writes again");
        var next = Preview(methodId, "a := 2;\r\n");
        document.LiveText = "An unsaved change outside the Automation Interface model";
        Status(Call("source.apply", ApplyArgs(next)), "conflict", "unsaved_editor_changes");
        document.LiveText = "";
        document.ExposeText = false;
        Status(Call("source.apply", ApplyArgs(next)), "conflict", "unsaved_editor_changes");
        document.ExposeText = true;
        var nextId = Guid.NewGuid();
        Status(Call("source.apply", ApplyArgs(next), nextId), "succeeded");
        Status(Call("source.rollback", RollbackArgs(p, applyId)), "conflict", "baseline_changed");
        Status(Call("source.rollback", RollbackArgs(next, nextId)), "succeeded");
        Expect(method.Impl == "a := 1;\n" && approvals.Last().JournalId == nextId.ToString("D") && !document.Saved, "Rollback allows the automation-owned dirty post-image");
        var journal = Result(Call("source.journal", new { journalId = nextId.ToString("D") }));
        Expect((string)journal["outcome"] == "succeeded" && (string)journal["rollbackOutcome"] == "succeeded" &&
            (string)journal["persistence"] == "mayPersistToDisk", "Inspect apply and rollback journal");
        Status(Call("source.rollback", RollbackArgs(p, applyId)), "succeeded");
        Expect(method.Impl == "a := 0;\n", "Consecutive rollback accepts a verified journal post-image restored by our own rollback");

        Clean();
        p = Preview(mainId, "PROGRAM Main\r\nVAR\r\nEND_VAR", "declaration");
        onApproval = () => document.Saved = false;
        var refusedId = Guid.NewGuid();
        Status(Call("source.apply", ApplyArgs(p), refusedId), "conflict", "unsaved_editor_changes");
        Status(Call("source.journal", new { journalId = refusedId.ToString("D") }), "refused", "journal_not_found");
        Clean();
        Status(Call("source.apply", ApplyArgs(p)), "succeeded");
        Clean();
        p = Preview(mainId, "valid fresh preview", "declaration");
        method.Impl = "different sibling";
        approvalCount = approvals.Count;
        Status(Call("source.apply", ApplyArgs(p)), "conflict", "baseline_changed");
        Expect(approvals.Count == approvalCount, "Changed owning object is detected before approval");
        p = Preview(mainId, "new mapping", "declaration");
        onApproval = () => plc.MappingMarker = "changed";
        Status(Call("source.apply", ApplyArgs(p)), "conflict", "source_exchange_conflict");

        p = Preview(mainId, "unverified", "declaration");
        main.FailReadback = true;
        var unknownId = Guid.NewGuid();
        request = ApplyArgs(p);
        Status(Call("source.apply", request, unknownId), "unknown");
        Status(Call("source.apply", request, unknownId), "unknown");
        Expect((string)Result(Call("source.journal", new { journalId = unknownId.ToString("D") }))["outcome"] == "unknown", "Readback mismatch must stay unknown in journal");
        Status(Call("source.rollback", RollbackArgs(p, unknownId)), "refused", "apply_outcome_unresolved");
        main.FailReadback = false;
        Clean();

        method.Impl = new string('\x0001', 65536);
        p = Preview(methodId, new string('\x0002', 65536));
        Expect(((string)p["beforeText"]).Length == 65536 && ((string)p["proposedText"]).Length == 65536, "Before and after fit with worst-case JSON expansion");
        Status(Call("source.preview", new { objectId = methodId, section = "implementation", proposedText = new string('x', 65537) }), "refused", "invalid_source_text");
    }

    private void DirtyRollback()
    {
        documents.Values.Clear();
        var first = Preview(methodId, "a := 1;");
        var applyId = Guid.NewGuid();
        Status(Call("source.apply", ApplyArgs(first), applyId), "succeeded");
        Expect(dirtyPaths.Contains(main.PhysicalFile) && documents.Count == 0, "Host dirty without a matching DTE document");

        var second = Preview(methodId, "a := 2;");
        var approvalCount = approvals.Count;
        Status(Call("source.apply", ApplyArgs(second)), "conflict", "unsaved_editor_changes");
        var rollback = RollbackArgs(first, applyId);
        Status(Call("source.rollback", rollback), "conflict", "unsaved_editor_changes");
        documents.Values.Add(document);
        document.ExposeText = false;
        Status(Call("source.rollback", rollback), "conflict", "unsaved_editor_changes");
        Expect(approvals.Count == approvalCount && method.Impl == "a := 1;", "Unverifiable dirty state refuses before approval or write");
        var journalArgs = new { journalId = applyId.ToString("D") };
        Expect(!(bool)Result(Call("source.journal", journalArgs))["rollbackSubmitted"], "Dirty preflight leaves rollback available");

        Clean();
        onApproval = () => document.Saved = false;
        var refusedId = Guid.NewGuid();
        Status(Call("source.rollback", rollback, refusedId), "conflict", "unsaved_editor_changes");
        Expect(!(bool)Result(Call("source.journal", journalArgs))["rollbackSubmitted"], "Dirty final comparison releases the rollback claim");
        Clean();
        Status(Call("source.rollback", rollback, refusedId), "conflict", "unsaved_editor_changes");
        Status(Call("source.rollback", rollback), "succeeded");
        Expect(method.Impl == "a := 0;\n", "Rollback restores the pre-image after saving and retrying with a fresh operation ID");
    }

    private void MixedOwner()
    {
        var first = Preview(methodId, "a := 1;");
        var applyId = Guid.NewGuid();
        Status(Call("source.apply", ApplyArgs(first), applyId), "succeeded");
        Clean();
        var second = Preview(methodId, "a := 2;");
        var graphical = new ImplementationNode { Name = "MixedAction", ItemType = 608, Language = LanguageType.LD };
        onApproval = () => main.Add(graphical);
        const string error = "mixed_language_owner_unsupported";
        Status(Call("source.apply", ApplyArgs(second)), "unsupported", error);
        var approvalCount = approvals.Count;
        var rows = ((object[])Result(Call("source.targets", new { moniker = main.PhysicalFile }))["targets"]).Select(Map).ToArray();
        Expect(rows.Length == 6 && rows.All(row => !((string)row["treePath"]).EndsWith("^MixedAction", StringComparison.Ordinal)), "Discovery omits graphical members");
        Status(Call("source.read", new { objectId = mainId, section = "declaration" }), "unsupported", error);
        Status(Call("source.preview", new { objectId = methodId, section = "implementation", proposedText = "a := 3;" }), "unsupported", error);
        Status(Call("source.apply", ApplyArgs(second)), "unsupported", error);
        Status(Call("source.rollback", RollbackArgs(first, applyId)), "unsupported", error);
        Status(Call("source.create", CreateArgs("POUs^Main", "A_Mixed", "action")), "unsupported", error);
        Expect(approvals.Count == approvalCount && main.CreateCount == 0 && method.Impl == "a := 1;", "Mixed owner refuses without approval or mutation");

        main.Children.Remove(graphical);
        var getter = (FullSource)main.Children.Single(child => child.ItemType == 611).Children[0];
        getter.Language = LanguageType.LD;
        Status(Call("source.read", new { objectId = mainId, section = "implementation" }), "unsupported", error);
    }

    private void CreationDiskBoundary()
    {
        var projectDirectory = Path.GetDirectoryName(context.ProjectFile);
        Directory.CreateDirectory(folder.PhysicalFile);
        try
        {
            var existing = Path.Combine(folder.PhysicalFile, "EXISTING.TcPOU");
            File.WriteAllText(existing, "unreferenced fixture file");
            Status(Call("source.create", CreateArgs("POUs^SubFolder", "Existing", "fb")), "conflict", "target_file_already_exists");
            Expect(File.ReadAllText(existing) == "unreferenced fixture file" && approvals.Count == 0 && folder.CreateCount == 0,
                "An unreferenced case-insensitive disk collision refuses before approval");

            var mappedDirectory = Path.Combine(projectDirectory, "MappedDUTs");
            Directory.CreateDirectory(mappedDirectory);
            duts.PhysicalFile = mappedDirectory;
            Directory.CreateDirectory(Path.Combine(mappedDirectory, "Existing.TcDUT"));
            Status(Call("source.create", CreateArgs("DUTs", "Existing", "dut_struct")), "conflict", "target_file_already_exists");
            Expect(approvals.Count == 0 && duts.CreateCount == 0, "Directory collision uses the XML folder FullPath");

            Directory.CreateDirectory(gvls.PhysicalFile);
            gvls.OmitPhysicalPath = true;
            File.WriteAllText(Path.Combine(gvls.PhysicalFile, "Existing.TcGVL"), "unreferenced GVL");
            Status(Call("source.create", CreateArgs("GVLs", "Existing", "gvl")), "conflict", "target_file_already_exists");
            Expect(approvals.Count == 0 && gvls.CreateCount == 0, "Missing folder FullPath falls back to the PLC-relative directory");

            onApproval = () => File.WriteAllText(Path.Combine(folder.PhysicalFile, "Late.TcPOU"), "appeared during approval");
            Status(Call("source.create", CreateArgs("POUs^SubFolder", "Late", "fb")), "conflict", "target_file_already_exists");
            Expect(approvals.Count == 1 && folder.CreateCount == 0, "Recheck disk right before CreateChild");

            main.PhysicalFile = Path.Combine(projectDirectory + "-linked", "Main.TcPOU");
            Status(Call("source.create", CreateArgs("POUs^Main", "A_Linked", "action")), "refused", "creation_path_outside_project");
            folder.PhysicalFile = projectDirectory + "-linked";
            Status(Call("source.create", CreateArgs("POUs^SubFolder", "Outside", "fb")), "refused", "creation_path_outside_project");
            Expect(approvals.Count == 1 && main.CreateCount == 0 && folder.CreateCount == 0, "Linked owner and mapped folder outside the PLC project refuse before approval");
        }
        finally
        {
            if (!Path.GetFullPath(projectDirectory).StartsWith(Path.Combine(Path.GetTempPath(), "automation-source-fixture-"), StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException();
            Directory.Delete(projectDirectory, true);
        }
    }

    private Dictionary<string, object> CreateArgs(string parent, string name, string kind)
    {
        return new Dictionary<string, object> { { "parentPath", parent }, { "name", name }, { "kind", kind }, { "approvalExpiresUtc", Expiry() } };
    }

    private void Create()
    {
        foreach (var item in new[] {
            new { Kind = "fb", Parent = "POUs^SubFolder", Name = "FB_New", Type = 604, Owner = folder, Info = new[] { "ST" } },
            new { Kind = "prg", Parent = "POUs", Name = "PRG_New", Type = 602, Owner = pous, Info = new[] { "ST" } },
            new { Kind = "fun", Parent = "POUs", Name = "F_New", Type = 603, Owner = pous, Info = new[] { "ST", "INT" } },
            new { Kind = "method", Parent = "POUs^Main", Name = "M_New", Type = 609, Owner = (TreeNode)main, Info = new[] { "ST", "pVoId", "PUBLIC" } },
            new { Kind = "method", Parent = "POUs^Main", Name = "M_Void", Type = 609, Owner = (TreeNode)main, Info = new[] { "ST", "", "PUBLIC" } },
            new { Kind = "action", Parent = "POUs^Main", Name = "A_New", Type = 608, Owner = (TreeNode)main, Info = new[] { "ST" } },
            new { Kind = "property", Parent = "POUs^Main", Name = "P_New", Type = 611, Owner = (TreeNode)main, Info = new[] { "ST", "ST_Result", "PROTECTED" } },
            new { Kind = "dut_struct", Parent = "DUTs", Name = "ST_New", Type = 606, Owner = duts, Info = (string[])null },
            new { Kind = "gvl", Parent = "GVLs", Name = "GVL_New", Type = 615, Owner = gvls, Info = (string[])null }
        })
        {
            Clean();
            var args = CreateArgs(item.Parent, item.Name, item.Kind);
            if (item.Type == 603 || item.Type == 611 || item.Name == "M_New") args["returnType"] = item.Info[1];
            if (item.Type == 611)
            {
                args["access"] = "PROTECTED";
                args["createGet"] = true;
                args["createSet"] = true;
            }
            if (item.Type != 608) args["declarationText"] = "VAR\r\nEND_VAR";
            if (item.Type != 606 && item.Type != 615 && item.Type != 611) args["implementationText"] = "a := 3;\r\n";
            var id = Guid.NewGuid();
            var response = Call("source.create", args, id);
            Status(response, "succeeded");
            var result = Result(response);
            var child = item.Owner.Children.Last();
            var path = item.Parent + "^" + item.Name;
            Expect(child.ItemType == item.Type && child.Name == item.Name &&
                (item.Info == null ? item.Owner.LastCreateInfo == null : item.Owner.LastCreateInfo.SequenceEqual(item.Info)), "Exact COM CreateChild arguments for " + item.Kind);
            Expect((string)result["treePath"] == path && (string)result["objectId"] == child.PhysicalFile + "|" + path &&
                (string)Map(response["provenance"])["persistence"] == "fileWrittenProjectPendingSave", "Creation exposes identity and actual persistence");
            if (args.ContainsKey("declarationText")) Expect(((ITcPlcDeclaration)child).DeclarationText == "VAR\nEND_VAR", "Initial declaration readback");
            if (args.ContainsKey("implementationText")) Expect(((ITcPlcImplementation)child).ImplementationText == "a := 3;\n", "Initial implementation readback");
            if (item.Type == 611)
                Expect(child.Children.Select(x => x.ItemType).SequenceEqual(new[] { 613, 614 }) &&
                    child.Children.Select(x => x.Name).SequenceEqual(new[] { "Get", "Set" }) &&
                    child.LastCreateInfo.SequenceEqual(new[] { "ST", "PROTECTED" }), "Property accessor creation and access");
            var approval = approvals.Last();
            Expect(approval.Operation == "source.create" && approval.OperationId == id && approval.TargetObjectId == path &&
                approval.Section == item.Kind && approval.BeforeText == "" && approval.BaselineDigest == Hash("") &&
                approval.ProposedDigest == Hash(approval.ProposedText) && approval.PreviewId == null && approval.JournalId == null, "Creation prompt binds exact normalized payload");
            var count = item.Owner.CreateCount;
            Status(Call("source.create", args, id), "succeeded");
            Expect(item.Owner.CreateCount == count, "Creation replay is single-use");
        }

        Clean();
        var approvalCount = approvals.Count;
        Status(Call("source.create", CreateArgs("POUs", "main", "fb")), "conflict", "object_already_exists");
        Status(Call("source.create", CreateArgs("DUTs", "BadParent", "fb")), "refused", "invalid_creation_parent_kind");
        Status(Call("source.create", CreateArgs("POUs^Missing", "BadParent", "fb")), "refused", "creation_parent_not_found");
        Status(Call("source.create", CreateArgs("POUs^Graphical", "A_No", "action")), "refused", "invalid_creation_parent_kind");
        foreach (var parent in new[] { "POUs^^Test", "POUs^..", "POUs^x/y", "POUs^ x", "POUs^x\n" })
            Status(Call("source.create", CreateArgs(parent, "BadParent", "fb")), "refused", "invalid_source_create_arguments");
        foreach (var name in new[] { "1motor", "invalid.name", "name\n", new string('x', 65), "WHILE", "vAr_InPuT", "public", "True", "dInT", "aCtIoN", "sizeof" })
            Status(Call("source.create", CreateArgs("POUs", name, "fb")), "refused", "invalid_source_create_arguments");
        Status(Call("source.create", CreateArgs("POUs", "NoReturnType", "fun")), "refused", "invalid_source_create_arguments");
        Status(Call("source.create", CreateArgs("POUs^Main", "P_NoType", "property")), "refused", "invalid_source_create_arguments");
        foreach (var returnType in new[] { "END_IF", "while", "VAR", "TRUE", "false", "PUBLIC", null, "" })
        {
            var args = CreateArgs("POUs^Main", "M_Invalid", "method");
            args["returnType"] = returnType;
            Status(Call("source.create", args), "refused", "invalid_source_create_arguments");
        }
        var invalid = CreateArgs("POUs^Main", "A_Invalid", "action");
        invalid["declarationText"] = "VAR";
        Status(Call("source.create", invalid), "refused", "invalid_source_create_arguments");
        invalid = CreateArgs("POUs", "TooLong", "fb");
        invalid["declarationText"] = new string('x', 65537);
        Status(Call("source.create", invalid), "refused", "invalid_source_create_arguments");
        invalid = CreateArgs("POUs", "Expired", "fb");
        invalid["approvalExpiresUtc"] = DateTime.UtcNow.AddSeconds(-10).ToString("o");
        Status(Call("source.create", invalid), "refused", "invalid_approval_expiry");
        document.Saved = false;
        Status(Call("source.create", CreateArgs("POUs^Main", "A_Dirty", "action")), "conflict", "unsaved_editor_changes");
        Expect(approvals.Count == approvalCount, "Validate creation before requesting approval");
        Clean();

        var argsDenied = CreateArgs("POUs", "Denied", "fb");
        grant = false;
        Status(Call("source.create", argsDenied), "refused", "approval_required");
        Expect(pous.Children.All(child => child.Name != "Denied"), "Approval denial leaves tree unchanged");
        grant = true;
        onApproval = () => pous.Add(new TreeNode { ItemType = 604, Name = "Denied" });
        Status(Call("source.create", argsDenied), "conflict", "object_already_exists");
        var uncertain = CreateArgs("POUs", "Uncertain", "fb");
        var uncertainId = Guid.NewGuid();
        pous.FailAfterCreate = true;
        Status(Call("source.create", uncertain, uncertainId), "unknown", "source_create_outcome_unknown");
        var creations = pous.CreateCount;
        Status(Call("source.create", uncertain, uncertainId), "unknown", "source_create_outcome_unknown");
        uncertain["name"] = "Other";
        Status(Call("source.create", uncertain, uncertainId), "refused", "operation_id_reused");
        Expect(pous.CreateCount == creations, "Unknown creation must not resubmit");
    }

    public static int Main()
    {
        using (var fixture = new AutomationSourceChecks())
        {
            fixture.Discover();
            fixture.Edit();
        }
        using (var fixture = new AutomationSourceChecks()) fixture.DirtyRollback();
        using (var fixture = new AutomationSourceChecks()) fixture.MixedOwner();
        using (var fixture = new AutomationSourceChecks()) fixture.Create();
        using (var fixture = new AutomationSourceChecks()) fixture.CreationDiskBoundary();
        using (var disabled = new AutomationSourceChecks(enable: false))
        {
            Status(disabled.Call("source.targets", new { }), "unsupported", "source_features_disabled");
            Status(disabled.Call("source.create", disabled.CreateArgs("POUs", "Disabled", "fb")), "unsupported", "source_features_disabled");
            Expect(disabled.approvals.Count == 0, "Build/Debug hosts cannot approve source");
        }
        Console.WriteLine("Automation source fixture passed " + assertions + " assertions.");
        return 0;
    }

    public void Dispose() => provider.Dispose();
    private sealed class Immediate : SynchronizationContext
    {
        public override void Post(SendOrPostCallback callback, object state) => callback(state);
    }
}
