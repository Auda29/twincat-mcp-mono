using System;
using System.Collections.Generic;
using System.Linq;
using TwinCatMcp.Engineering.Host;

internal static class AssociationChecks
{
    private static int checks;
    private const string Solution = @"C:\fixture\a.sln";
    private const string Plc = @"C:\fixture\PLC\a.plcproj";
    private static void Expect(bool value, string message) { if (!value) throw new Exception(message); checks++; }
    private static void Throws(Action action, string status, string message)
    {
        try { action(); }
        catch (PlcProjectAssociationException error) { Expect(error.Status == status, message + ": " + error.Code); return; }
        throw new Exception(message);
    }
    private static Node Project(string tsproj, params string[] paths)
    {
        return new Node { File = tsproj, Manager = new Node {
            Children = paths.Select(path => new Node { Xml = "<TreeItem><PlcDef><ProjectPath>" + path + "</ProjectPath></PlcDef></TreeItem>" }).ToList()
        } };
    }

    public static int Main()
    {
        var fixture = new Fixture(Project(@"C:\fixture\A.tsproj", @"C:\other\unrelated.plcproj"), Project(@"C:\fixture\B.tsproj", Plc));
        var result = fixture.Resolve();
        Expect(result.Status == "succeeded" && result.AssociationCount == 1 && result.TwinCatProjectFile == @"C:\fixture\B.tsproj", "exact file identity selects containing tsproj");
        Expect(result.PlcProjectFile == Plc && result.SolutionFile == Solution, "bound identities retained");
        Expect(result.OwningTwinCatPlcChildCount == 1 && result.BuildScopeStatus == "unknown", "direct child count does not attest build scope");
        Expect(result.Source == "unknown" && result.CaptureKind == "automationSnapshot" && result.EditorState == "unknown" && result.DirtyState == "unknown", "mapping cannot attest source buffers");
        Expect(fixture.ValidationCalls == fixture.AccessCalls + 1, "all automation reads revalidate context");
        Expect(fixture.Calls.All(call => call == "Item" || call == "LookupTreeItem" || call == "ProduceXml"), "only mapping methods invoked");

        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", Plc.ToUpperInvariant()));
        Expect(fixture.Resolve().AssociationCount == 1, "Windows path identity case insensitive");
        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", @"C:\other\a.plcproj"));
        result = fixture.Resolve();
        Expect(result.Status == "refused" && result.AssociationCount == 0 && result.TwinCatProjectFile == null, "same filename cannot select other project");
        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", Plc), Project(@"C:\fixture\B.tsproj", Plc));
        result = fixture.Resolve();
        Expect(result.Status == "conflict" && result.AssociationCount == 2 && result.TwinCatProjectFile == null, "multiple containers fail closed with exact count");
        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", Plc, Plc));
        Expect(fixture.Resolve().Status == "conflict", "duplicate PLC nodes fail closed");
        Expect(fixture.Resolve().OwningTwinCatPlcChildCount == null, "ambiguous owner exposes no selected child count");
        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", Plc, @"C:\fixture\Other\other.plcproj"));
        result = fixture.Resolve();
        Expect(result.AssociationCount == 1 && result.OwningTwinCatPlcChildCount == 2 && result.BuildScopeStatus == "unknown", "owning project child count distinct from match count");
        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", Plc), Project(@"C:\fixture\A.tsproj", Plc));
        Throws(() => fixture.Resolve(), "conflict", "duplicate tsproj identity refused");

        foreach (var path in new[] { @"PLC\a.plcproj", @"..\PLC\a.plcproj", @"$(ProjectDir)\a.plcproj", @"C:\fixture\PLC\..\PLC\a.plcproj" })
        {
            fixture = new Fixture(Project(@"C:\fixture\A.tsproj", path));
            Throws(() => fixture.Resolve(), "unsupported", "unknown ProjectPath base refused");
        }
        foreach (var xml in new[] {
            "<TreeItem />",
            "<TreeItem><ProjectPath>" + Plc + "</ProjectPath><ProjectPath>" + Plc + "</ProjectPath></TreeItem>",
            "<WrongRoot><ProjectPath>" + Plc + "</ProjectPath></WrongRoot>",
            "<TreeItem><Unrelated><ProjectPath>" + Plc + "</ProjectPath></Unrelated></TreeItem>",
            "<TreeItem><PlcDef><ProjectPath xmlns='urn:unverified'>" + Plc + "</ProjectPath></PlcDef></TreeItem>",
            "<TreeItem xmlns='urn:unverified'><PlcDef><ProjectPath>" + Plc + "</ProjectPath></PlcDef></TreeItem>",
            "<TreeItem><PlcDef><ProjectPath>" + Plc + "</ProjectPath></PlcDef><PlcDef /></TreeItem>",
            "<!DOCTYPE TreeItem [<!ENTITY injected 'anything'>]><TreeItem><ProjectPath>&injected;</ProjectPath></TreeItem>",
            "<TreeItem><ProjectPath>unterminated"
        })
        {
            var project = Project(@"C:\fixture\A.tsproj", Plc);
            project.Manager.Children[0].Xml = xml;
            fixture = new Fixture(project);
            Throws(() => fixture.Resolve(), "unsupported", "invalid mapping XML refused");
        }
        var oversized = Project(@"C:\fixture\A.tsproj", Plc);
        oversized.Manager.Children[0].Xml = new string('x', 1048577);
        fixture = new Fixture(oversized);
        Throws(() => fixture.Resolve(), "refused", "XML bound enforced");
        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", Enumerable.Repeat(Plc, 129).ToArray()));
        Throws(() => fixture.Resolve(), "refused", "PLC child bound enforced");
        fixture = new Fixture(Enumerable.Range(0, 513).Select(i => Project(@"C:\fixture\A" + i + ".tsproj", Plc)).ToArray());
        Throws(() => fixture.Resolve(), "refused", "solution project bound enforced");
        var folder = new Node { Kind = "{66A26720-8FB5-11D2-AA7E-00C04F688DDE}", Children = new List<Node> { Project(@"C:\fixture\Nested.tsproj", Plc) } };
        fixture = new Fixture(folder);
        Expect(fixture.Resolve().TwinCatProjectFile == @"C:\fixture\Nested.tsproj", "nested solution folder association");
        var recursive = new Node { Kind = "{66A26720-8FB5-11D2-AA7E-00C04F688DDE}" }; recursive.Children.Add(recursive);
        fixture = new Fixture(recursive);
        Throws(() => fixture.Resolve(), "refused", "cyclic folder traversal bounded");
        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", Plc)) { SolutionFile = @"C:\other\a.sln" };
        Throws(() => fixture.Resolve(), "conflict", "actual injected solution mismatch refused");
        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", Plc)) { Valid = false };
        Throws(() => fixture.Resolve(), "conflict", "host context revalidated");
        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", Plc)) { Supported = false };
        Throws(() => fixture.Resolve(), "unsupported", "unsupported manager interface fails closed");
        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", Plc)) { InvalidateAfter = 12 };
        Throws(() => fixture.Resolve(), "conflict", "mid-read context change refused");
        Throws(() => new PlcProjectAssociationService(new object()).Resolve(Solution, Plc, () => { }), "unsupported", "missing loaded interop fails closed");
        Console.WriteLine("Association checks passed: " + checks);
        return 0;
    }

    private sealed class Node
    {
        internal string File = "", Kind = "", Xml;
        internal Node Manager;
        internal List<Node> Children = new List<Node>();
    }
    private sealed class Fixture : IPlcProjectAssociationAccess
    {
        private readonly List<Node> projects;
        internal string SolutionFile = Solution;
        internal bool Valid = true, Supported = true;
        internal int InvalidateAfter = int.MaxValue;
        internal int ValidationCalls, AccessCalls;
        internal readonly List<string> Calls = new List<string>();
        internal Fixture(params Node[] projects) { this.projects = projects.ToList(); }
        internal PlcProjectAssociationResult Resolve()
        { return new PlcProjectAssociationService(this).Resolve(Solution, Plc, () => { if (!Valid || ++ValidationCalls > InvalidateAfter) throw new Exception(); }); }
        public object Dte { get { return this; } }
        private void ReadAccess() { if (ValidationCalls <= AccessCalls) throw new Exception("Access without context validation"); AccessCalls++; }
        public bool Supports(object value, string type) { ReadAccess(); return Supported; }
        public object Get(object target, string type, string member, params object[] indexes)
        {
            ReadAccess();
            if (member == "Solution") return this;
            if (member == "FullName") return SolutionFile;
            if (member == "Projects") return projects;
            if (member == "Count") return ((List<Node>)target).Count;
            var node = (Node)target;
            switch (member)
            {
                case "FileName": return node.File;
                case "Kind": return node.Kind;
                case "ProjectItems": return node.Children;
                case "SubProject": return node;
                case "Object": return node.Manager;
                case "ChildCount": return node.Children.Count;
                case "Child": return node.Children[(int)indexes[0] - 1];
                default: throw new Exception("Unexpected property: " + member);
            }
        }
        public object Call(object target, string type, string member, params object[] args)
        {
            ReadAccess(); Calls.Add(member);
            if (member == "Item") return ((List<Node>)target)[(int)args[0] - 1];
            if (member == "LookupTreeItem") { if ((string)args[0] != "TIPC") throw new Exception(); return target; }
            if (member == "ProduceXml") { if (args.Length != 1 || !(args[0] is bool) || (bool)args[0]) throw new Exception(); return ((Node)target).Xml; }
            throw new Exception("Unexpected method: " + member);
        }
    }
}
