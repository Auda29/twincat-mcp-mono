using System;
using System.IO;
using System.Text;
using TwinCatMcp.Engineering.Host;
class Fixture
{
    static void Check(bool value, string name) { if (!value) throw new Exception(name); }
    static void Main() {
        var dir = Path.Combine(Path.GetTempPath(), "build-source-fixture-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(dir);
        try {
            string project = Path.Combine(dir, "test.plcproj"), source = Path.Combine(dir, "one.TcPOU");
            var id = Guid.NewGuid(); var memberId = Guid.NewGuid();
            File.WriteAllText(project, "<Project><ItemGroup><Compile Include=\"one.TcPOU\" /></ItemGroup></Project>");
            File.WriteAllText(source, "<TcPlcObject><POU Name=\"One\" Id=\"" + id + "\"><Declaration><![CDATA[VAR\r\nx : INT;\r\nEND_VAR]]></Declaration><Method Name=\"Run\" Id=\"" + memberId + "\"><Implementation><ST><![CDATA[x := 1;]]></ST></Implementation></Method></POU></TcPlcObject>", new UTF8Encoding(false));
            Func<string,bool?> clean = x => false;
            var b = BuildSourceBaseline.Capture(project, clean); Check(b != null, "capture");
            var e = b.Evaluate(source, id, "One", "declaration", BuildSourceCoordinates.OneBasedSectionText, 2, 2, clean);
            Check(e.CoordinateVerified && e.Text.Contains("\r\n") && e.Sha256.Length == 64, "exact source evidence");
            Check(!b.Evaluate(source, id, "One", null, BuildSourceCoordinates.OneBasedSectionText, 1, 1, clean).CoordinateVerified, "unknown section");
            Check(!b.Evaluate(source, id, "One", "declaration", BuildSourceCoordinates.Unknown, 1, 1, clean).CoordinateVerified, "unknown coordinates");
            var candidate = b.EvaluateNativeErrorItem(source + ";One.Run", 1, 1, clean);
            Check(candidate.Status == "candidate" && candidate.ObjectId == memberId && !candidate.NavigationAvailable && candidate.ProjectSha256.Length == 64, "candidate");
            Check(b.EvaluateNativeErrorItem(source + ";One.Missing", 1, 1, clean).Status == "member_unknown", "unknown member");
            bool called = false; Check(b.TryWithNativeNavigationLease(source + ";One.Run", 1, 1, clean, proof => { called = true; Check(proof.ObjectId == memberId.ToString("D") && proof.MemberPath == "One.Run" && proof.CoordinateKind == "nativeErrorItem", "lease proof"); bool locked = false; try { using (var f = new FileStream(source, FileMode.Open, FileAccess.Write, FileShare.ReadWrite)) {} } catch (IOException) { locked = true; } Check(locked, "lease locks source"); }), "lease"); Check(called, "callback");
            File.AppendAllText(source, " "); Check(b.EvaluateNativeErrorItem(source, 1, 1, clean).Status == "stale", "stale source");
            Check(BuildSourceBaseline.Capture(project, x => null) == null, "unknown dirty");
            File.WriteAllText(project, "<Project><ItemGroup><Compile Include=\"*.TcPOU\" /></ItemGroup></Project>");
            Check(BuildSourceBaseline.Capture(project, clean) == null, "wildcard");
            File.WriteAllText(project, "<Project><ItemGroup><Compile Include=\"..\\outside.TcPOU\" /></ItemGroup></Project>");
            Check(BuildSourceBaseline.Capture(project, clean) == null, "outside");
            foreach (var kind in new[] { "GVL", "DUT" }) {
                var other = Path.Combine(dir, "other.Tc" + kind); var otherId = Guid.NewGuid();
                File.WriteAllText(other, "<TcPlcObject><" + kind + " Name=\"Other\" Id=\"" + otherId + "\"><Declaration><![CDATA[VAR_GLOBAL\nEND_VAR]]></Declaration></" + kind + "></TcPlcObject>");
                File.WriteAllText(project, "<Project><ItemGroup><Compile Include=\"other.Tc" + kind + "\"><SubType>Code</SubType></Compile></ItemGroup></Project>");
                var otherBaseline = BuildSourceBaseline.Capture(project, clean);
                Check(otherBaseline != null && otherBaseline.Evaluate(other, otherId, "Other", "declaration", BuildSourceCoordinates.OneBasedSectionText, 1, 1, clean).CoordinateVerified, kind);
            }
            Console.WriteLine("Build source fixtures passed.");
        } finally { Directory.Delete(dir, true); }
    }
}



