using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
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
            Children = paths.Select(path => new Node { Xml = "<TreeItem><PlcProjectDef><ProjectPath>" + path + "</ProjectPath></PlcProjectDef></TreeItem>" }).ToList()
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
        var expectedXml = Project(@"C:\fixture\B.tsproj", Plc).Manager.Children[0].Xml;
        string expectedDigest;
        using (var sha = SHA256.Create()) expectedDigest = string.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes(expectedXml)).Select(b => b.ToString("x2")));
        DateTime observed;
        Expect(result.MappingDigest == expectedDigest && DateTime.TryParse(result.ObservedAtUtc, null, System.Globalization.DateTimeStyles.RoundtripKind, out observed) && observed.Kind == DateTimeKind.Utc, "digest covers exact UTF8 mapping and observation time is UTC");
        Expect(fixture.ValidationCalls == fixture.AccessCalls + 1, "all automation reads revalidate context");
        Expect(fixture.Calls.All(call => call == "Item" || call == "LookupTreeItem" || call == "ProduceXml"), "only mapping methods invoked");

        var legacy = Project(@"C:\fixture\A.tsproj", Plc);
        legacy.Manager.Children[0].Xml = "<TreeItem><PlcDef><ProjectPath>" + Plc + "</ProjectPath></PlcDef></TreeItem>";
        Expect(new Fixture(legacy).Resolve().Status == "succeeded", "earlier PlcDef shape remains supported");
        var reported = Project(@"C:\fixture\A.tsproj", Plc);
        reported.Manager.Children[0].Xml = "<?xml version='1.0'?><TreeItem><ItemName>PLC_Probe</ItemName><PathName>TIPC^PLC_Probe</PathName>" +
            "<ItemType>56</ItemType><ItemId>1</ItemId><ItemSubTypeName>Plc Project</ItemSubTypeName><ChildCount>1</ChildCount>" +
            "<Disabled>false</Disabled><TreeImageData16x14>fixture</TreeImageData16x14><PlcProjectDef><ProjectPath>" + Plc +
            "</ProjectPath><ProjectType>Plc Project</ProjectType><ProjectGUID>{11111111-1111-1111-1111-111111111111}</ProjectGUID></PlcProjectDef></TreeItem>";
        Expect(new Fixture(reported).Resolve().Status == "succeeded", "reported TwinCAT XML shape with sibling metadata is accepted");
        Expect(new Fixture(reported).Resolve().ConfiguredAdsPort == null, "missing port remains unknown");
        foreach (var port in new[] { 851, 856, 899 }) {
            var configured = Project(@"C:\fixture\A.tsproj", Plc);
            configured.Manager.Children[0].Xml = configured.Manager.Children[0].Xml.Replace("</PlcProjectDef>", "<AdsPort>" + port + "</AdsPort></PlcProjectDef>");
            Expect(new Fixture(configured).Resolve().ConfiguredAdsPort == port, "canonical configured PLC port observed");
        }
        foreach (var fragment in new[] {
            "<AdsPort>850</AdsPort>", "<AdsPort>900</AdsPort>", "<AdsPort>0851</AdsPort>", "<AdsPort>+851</AdsPort>",
            "<AdsPort> 851</AdsPort>", "<AdsPort>851.0</AdsPort>", "<AdsPort>999999999999</AdsPort>", "<AdsPort />",
            "<AdsPort>851</AdsPort><AdsPort>851</AdsPort>", "<AdsPort xmlns='urn:unknown'>851</AdsPort>",
            "<AdsPort extra='x'>851</AdsPort>", "<AdsPort><Value>851</Value></AdsPort>", "<Other><AdsPort>851</AdsPort></Other>"
        }) {
            var configured = Project(@"C:\fixture\A.tsproj", Plc);
            configured.Manager.Children[0].Xml = configured.Manager.Children[0].Xml.Replace("</PlcProjectDef>", fragment + "</PlcProjectDef>");
            var portResult = new Fixture(configured).Resolve();
            Expect(portResult.Status == "succeeded" && portResult.ConfiguredAdsPort == null, "invalid/ambiguous port does not invent endpoint or discard valid mapping");
        }
        legacy.Manager.Children[0].Xml = legacy.Manager.Children[0].Xml.Replace("</PlcDef>", "<AdsPort>851</AdsPort></PlcDef>");
        Expect(new Fixture(legacy).Resolve().ConfiguredAdsPort == null, "legacy definition cannot attest configured port");

        foreach (var definition in new[] { "PlcDef", "PlcProjectDef" })
        foreach (var invalid in new[] {
            "<TreeItem><" + definition + "><ProjectPath extra='x'>" + Plc + "</ProjectPath></" + definition + "></TreeItem>",
            "<TreeItem><" + definition + "><ProjectPath><Text>" + Plc + "</Text></ProjectPath></" + definition + "></TreeItem>",
            "<TreeItem><" + definition + "><ProjectPath>" + Plc + "</ProjectPath></" + definition + "><" + definition + " /></TreeItem>",
            "<TreeItem><" + definition + "><ProjectPath>" + Plc + "</ProjectPath><ProjectPath>" + Plc + "</ProjectPath></" + definition + "></TreeItem>",
            "<TreeItem><" + definition + " xmlns='urn:unverified'><ProjectPath>" + Plc + "</ProjectPath></" + definition + "></TreeItem>",
            "<TreeItem><Wrapper><" + definition + "><ProjectPath>" + Plc + "</ProjectPath></" + definition + "></Wrapper></TreeItem>",
            "<TreeItem><" + definition + "><ProjectPath>" + Plc + "</ProjectPath></" + definition + "><Unrelated><ProjectPath xmlns='urn:unverified'>" + Plc + "</ProjectPath></Unrelated></TreeItem>"
        }) {
            var invalidProject = Project(@"C:\fixture\A.tsproj", Plc);
            invalidProject.Manager.Children[0].Xml = invalid;
            Throws(() => new Fixture(invalidProject).Resolve(), "unsupported", definition + " malformed/ambiguous shape refused");
        }
        foreach (var definitions in new[] {
            "<PlcProjectDef><ProjectPath>" + Plc + "</ProjectPath></PlcProjectDef><PlcDef />",
            "<PlcDef><ProjectPath>" + Plc + "</ProjectPath></PlcDef><PlcProjectDef />",
            "<PlcProjectDef><ProjectPath>" + Plc + "</ProjectPath></PlcProjectDef><PlcDef xmlns='urn:unverified' />",
            "<PlcProjectDef><ProjectPath>" + Plc + "</ProjectPath></PlcProjectDef><PlcDef><ProjectPath>" + Plc + "</ProjectPath></PlcDef>"
        }) {
            var mixed = Project(@"C:\fixture\A.tsproj", Plc);
            mixed.Manager.Children[0].Xml = "<TreeItem>" + definitions + "</TreeItem>";
            Throws(() => new Fixture(mixed).Resolve(), "unsupported", "mixed definitions never selected");
        }

        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", Plc.ToUpperInvariant()));
        Expect(fixture.Resolve().AssociationCount == 1, "Windows path identity case insensitive");
        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", @"C:\other\a.plcproj"));
        result = fixture.Resolve();
        Expect(result.Status == "refused" && result.AssociationCount == 0 && result.TwinCatProjectFile == null, "same filename cannot select other project");
        Expect(result.ObservationConsistency == null, "no-match result does not claim selected mapping recheck");
        Expect(result.MappingDigest == null && result.ObservedAtUtc == null, "unselected mapping has no evidence");
        fixture = new Fixture(Project(@"C:\fixture\A.tsproj", Plc), Project(@"C:\fixture\B.tsproj", Plc));
        result = fixture.Resolve();
        Expect(result.Status == "conflict" && result.AssociationCount == 2 && result.TwinCatProjectFile == null, "multiple containers fail closed with exact count");
        Expect(result.ObservationConsistency == null, "ambiguous result does not claim selected mapping recheck");
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
        var changing = Project(@"C:\fixture\A.tsproj", Plc);
        fixture = new Fixture(changing) { BeforeSecondXml = () => changing.Manager.Children[0].Xml = "<TreeItem><PlcProjectDef><ProjectPath>" + Plc + "</ProjectPath></PlcProjectDef> </TreeItem>" };
        Throws(() => fixture.Resolve(), "conflict", "XML-only mapping change refused");
        changing = Project(@"C:\fixture\A.tsproj", Plc);
        fixture = new Fixture(changing) { BeforeSecondXml = () => changing.Manager.Children[0].Xml = "<TreeItem><PlcDef><ProjectPath>" + Plc + "</ProjectPath></PlcDef></TreeItem>" };
        Throws(() => fixture.Resolve(), "conflict", "definition shape change with identical path refused");
        changing = Project(@"C:\fixture\A.tsproj", Plc);
        fixture = new Fixture(changing) { BeforeSecondXml = () => changing.Manager.Children[0].Xml = "<TreeItem><PlcDef><ProjectPath>C:\\other\\a.plcproj</ProjectPath></PlcDef></TreeItem>" };
        Throws(() => fixture.Resolve(), "conflict", "ProjectPath change refused");
        changing = Project(@"C:\fixture\A.tsproj", Plc);
        fixture = new Fixture(changing) { BeforeThirdFileName = () => changing.File = @"C:\fixture\Changed.tsproj" };
        Throws(() => fixture.Resolve(), "conflict", "selected tsproj path change refused");
        changing = Project(@"C:\fixture\A.tsproj", Plc);
        fixture = new Fixture(changing) { BeforeSecondChildCount = () => changing.Manager.Children.Add(new Node()) };
        Throws(() => fixture.Resolve(), "conflict", "selected tree membership change refused");
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
        internal int XmlReads, FileNameReads, ChildCountReads;
        internal Action BeforeSecondXml, BeforeThirdFileName, BeforeSecondChildCount;
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
                case "FileName": if (++FileNameReads == 3 && BeforeThirdFileName != null) BeforeThirdFileName(); return node.File;
                case "Kind": return node.Kind;
                case "ProjectItems": return node.Children;
                case "SubProject": return node;
                case "Object": return node.Manager;
                case "ChildCount": if (++ChildCountReads == 2 && BeforeSecondChildCount != null) BeforeSecondChildCount(); return node.Children.Count;
                case "Child": return node.Children[(int)indexes[0] - 1];
                default: throw new Exception("Unexpected property: " + member);
            }
        }
        public object Call(object target, string type, string member, params object[] args)
        {
            ReadAccess(); Calls.Add(member);
            if (member == "Item") return ((List<Node>)target)[(int)args[0] - 1];
            if (member == "LookupTreeItem") { if ((string)args[0] != "TIPC") throw new Exception(); return target; }
            if (member == "ProduceXml") { if (args.Length != 1 || !(args[0] is bool) || (bool)args[0]) throw new Exception(); if (++XmlReads == 2 && BeforeSecondXml != null) BeforeSecondXml(); return ((Node)target).Xml; }
            throw new Exception("Unexpected method: " + member);
        }
    }
}
