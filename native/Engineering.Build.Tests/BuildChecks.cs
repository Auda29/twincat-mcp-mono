using System;
using System.IO;
using System.Linq;
using TwinCatMcp.Engineering.Host;

internal static class BuildChecks
{
    private static int checks;
    private static void Expect(bool value, string name) { if (!value) throw new Exception(name); checks++; }
    private static void Throws(Action action, string status, string name)
    {
        try { action(); } catch (NativeBuildException error) { Expect(error.Status == status, name); return; }
        throw new Exception(name);
    }
    public static int Main()
    {
        bool truncated;
        Expect(BuildEvidence.FreshOutput("old\n", "old\nnew", out truncated) == "new" && !truncated, "append-only output");
        Expect(BuildEvidence.FreshOutput("old", "replacement", out truncated) == null, "replaced output unknown");
        Expect(BuildEvidence.FreshOutput(null, "anything", out truncated) == null, "missing baseline unknown");
        Expect(BuildEvidence.FreshOutput("", new string('x', BuildEvidence.MaxOutput + 1), out truncated).Length == BuildEvidence.MaxOutput && truncated, "bounded output");
        var diagnostics = BuildEvidence.Parse("1>C:\\fixture\\Main.TcPOU;Main.Method(12,3): Fehler C0001: Bad token\nMain(4): warning C0022: Beware", out truncated);
        Expect(diagnostics.Count == 2 && diagnostics[0].File == "C:\\fixture\\Main.TcPOU;Main.Method" && diagnostics[0].Severity == "error" && diagnostics[1].Column == 1, "localized diagnostics");
        Expect(BuildEvidence.Parse("Main(0,2): error Invalid\nMain(999999999999,2): error Overflow\nMain(3,0): warning Invalid", out truncated).Count == 0, "invalid positions");
        Expect(BuildEvidence.Parse(string.Join("\n", Enumerable.Repeat("Main(1,1): error C1: Bad", 120)), out truncated).Count == 100 && truncated, "bounded diagnostics");

        var now = DateTime.UtcNow;
        Expect(BuildDteAdapter.MatchesPlcPath(@"C:\fixture\a.sln", @"PLC\a.plcproj", @"C:\fixture\PLC\a.plcproj"), "PLC context path maps to exact bound file");
        Expect(!BuildDteAdapter.MatchesPlcPath(@"C:\fixture\a.sln", @"Other\a.plcproj", @"C:\fixture\PLC\a.plcproj"), "same basename cannot select build target");
        var expiredIde = new FakeIde();
        using (var guarded = new NativeBuildService(expiredIde, _ => false, () => now))
        {
            Throws(() => guarded.Start(Guid.NewGuid(), "a.sln", "a.plcproj", () => { }, null, "Release", "TwinCAT RT (x86)"), "conflict", "requested configuration cannot be substituted");
            var expiry = now.AddSeconds(1);
            var result = guarded.Start(Guid.NewGuid(), "a.sln", "a.plcproj", () => { }, () => now = expiry, "Debug", "TwinCAT RT (x86)", () => { if (now >= expiry) throw new Exception(); });
            Expect(result.Status == "refused" && expiredIde.Starts == 0, "expired authorization never submits after second preflight");
        }
        var approvalIde = new FakeIde();
        using (var guarded = new NativeBuildService(approvalIde, _ => false, () => now))
        {
            Throws(() => guarded.Start(Guid.NewGuid(), "a.sln", "a.plcproj", () => { }, () => approvalIde.FailPrepare = true), "refused", "post-approval safety preflight");
            Expect(approvalIde.Starts == 0, "changed project never submits");
        }
        var ide = new FakeIde();
        using (var service = new NativeBuildService(ide, _ => false, () => now))
        {
            var id = Guid.NewGuid();
            Expect(service.Start(id, "a.sln", "a.plcproj", () => { }).Status == "accepted" && ide.Starts == 1, "asynchronous submission");
            Throws(() => service.Start(id, "a.sln", "a.plcproj", () => { }), "refused", "duplicate never submits");
            Throws(() => service.Start(Guid.NewGuid(), "a.sln", "a.plcproj", () => { }), "refused", "parallel build refused");
            ide.Begin(); ide.BeginProject();
            ide.Output += "Main(8,2): error C0001: Failed\n";
            ide.EndProject(false); ide.End();
            var result = service.ReadDiagnostics(id);
            Expect(result.Status == "failed" && result.Diagnostics.Count == 1 && result.BuildOperationId == id.ToString("D"), "owned failed build");
            Expect(result.Output == "Main(8,2): error C0001: Failed\n" && !result.Output.Contains("old"), "stale diagnostics excluded");
            result.Diagnostics.Clear();
            Expect(service.Get(id).Diagnostics.Count == 1, "immutable snapshot");

            id = Guid.NewGuid();
            service.Start(id, "a.sln", "a.plcproj", () => { }); ide.Begin(); ide.BeginProject();
            Expect(service.Cancel(id).Status == "unknown" && service.Get(id).CancellationRequested, "cancel does not claim stopped");
            Throws(() => service.Start(Guid.NewGuid(), "a.sln", "a.plcproj", () => { }), "refused", "cancel retains build gate");
            ide.Output += "done\n"; ide.EndProject(true); ide.End();
            Expect(service.Get(id).Status == "succeeded", "completion independently resolves cancel");

            id = Guid.NewGuid();
            service.Start(id, "a.sln", "a.plcproj", () => { }); ide.Begin(); ide.BeginProject();
            now = now.AddMinutes(3);
            Expect(service.Get(id).Status == "unknown", "timeout unknown");
            Throws(() => service.Start(Guid.NewGuid(), "a.sln", "a.plcproj", () => { }), "refused", "timeout retains build gate");
            ide.EndProject(true); ide.End();
            Expect(service.Get(id).Status == "unknown" && !service.Get(id).OutputAvailable, "timed out evidence never fresh");

            id = Guid.NewGuid();
            service.Start(id, "a.sln", "a.plcproj", () => { }); ide.Begin(); ide.BeginProject(); ide.BeginProject(); ide.EndProject(true); ide.End();
            Expect(service.Get(id).Status == "unknown", "duplicate event fails closed");

            id = Guid.NewGuid();
            service.Start(id, "a.sln", "a.plcproj", () => { }); ide.Begin(); ide.BeginProject("other"); ide.EndProject(true); ide.End();
            Expect(service.Get(id).Status == "unknown", "unrelated project fails closed");

            id = Guid.NewGuid(); var valid = true;
            service.Start(id, "a.sln", "a.plcproj", () => { if (!valid) throw new Exception(); }); ide.Begin(); ide.BeginProject(); valid = false;
            ide.EndProject(true); ide.End();
            Throws(() => service.Get(id), "conflict", "stale context refuses evidence");
        }
        ide = new FakeIde { FailStart = true };
        using (var service = new NativeBuildService(ide, _ => false, () => now))
        {
            var id = Guid.NewGuid();
            Expect(service.Start(id, "a.sln", "a.plcproj", () => { }).Status == "unknown", "submission exception unknown");
            Throws(() => service.Start(Guid.NewGuid(), "a.sln", "a.plcproj", () => { }), "refused", "unknown submission never retried");
        }
        CheckProjectPolicy();
        CheckNavigation();
        Throws(() => new NativeBuildService(new object(), _ => false), "unsupported", "unavailable DTE fails closed");
        Console.WriteLine("Build checks passed: " + checks);
        return 0;
    }

    private static void CheckNavigation()
    {
        var dir = Path.Combine(Path.GetTempPath(), "engineering-build-nav-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var project = Path.Combine(dir, "a.plcproj"); var source = Path.Combine(dir, "Main.TcPOU");
            File.WriteAllText(project, "<Project><ItemGroup><Compile Include=\"Main.TcPOU\" /></ItemGroup></Project>");
            File.WriteAllText(source, "<TcPlcObject><POU Name=\"Main\" Id=\"11111111-1111-1111-1111-111111111111\"><Implementation><ST><![CDATA[x := 1;]]></ST></Implementation></POU></TcPlcObject>");
            var ide = new FakeIde();
            using (var service = new NativeBuildService(ide, _ => false, () => DateTime.UtcNow))
            {
                var id = Guid.NewGuid(); service.Start(id, Path.Combine(dir, "a.sln"), project, () => { }); ide.Begin(); ide.BeginProject();
                ide.Output += source + "(1,1): error C0001: Wrong token\n"; ide.EndProject(false); ide.End();
                var diagnostic = service.Get(id).Diagnostics.Single();
                Expect(diagnostic.DiagnosticId.Length == 64 && diagnostic.NavigationCandidate.Status == "candidate", "current build diagnostic owns source baseline");
                int calls = 0;
                var status = service.Navigate(id, diagnostic.DiagnosticId, (d, proof) => {
                    calls++; Expect(proof.SourceFile == source && proof.SourceDigest.Length == 64 && proof.ProjectFile == project && proof.Section == null, "native navigation proof does not guess section");
                    bool locked = false; try { using (var f = new FileStream(source, FileMode.Open, FileAccess.Write, FileShare.ReadWrite)) { } } catch (IOException) { locked = true; }
                    Expect(locked, "source lease held through native navigation callback"); return true;
                });
                Expect(status == "succeeded" && calls == 1, "native callback invoked once for exact diagnostic");
                Expect(service.Navigate(id, new string('0', 64), (d, proof) => { calls++; return true; }) == "refused" && calls == 1, "unknown diagnostic cannot navigate");
                File.AppendAllText(source, " ");
                Expect(service.Get(id).Diagnostics.Single().NavigationCandidate == null, "stale source disables navigation eligibility");
                Expect(service.Navigate(id, diagnostic.DiagnosticId, (d, proof) => { calls++; return true; }) == "conflict" && calls == 1, "stale source cannot reach native navigation");
            }
        }
        finally
        {
            if (!Path.GetFullPath(dir).StartsWith(Path.Combine(Path.GetTempPath(), "engineering-build-nav-"), StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException();
            Directory.Delete(dir, true);
        }
    }

    private static void CheckProjectPolicy()
    {
        var dir = Path.Combine(Path.GetTempPath(), "engineering-build-check-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var file = Path.Combine(dir, "a.plcproj");
        var import = "<Import Project=\"$(MSBuildExtensionsPath)\\Beckhoff\\TwinCAT\\v3.1\\TcPlcProject.targets\" />";
        try
        {
            File.WriteAllText(file, "<Project>" + import + "</Project>");
            BuildProjectPolicy.Validate(file); checks++;
            File.WriteAllText(file, "<Project><Target Name=\"bad\" />" + import + "</Project>");
            Throws(() => BuildProjectPolicy.Validate(file), "refused", "custom target refused");
            File.WriteAllText(file, "<Project><PropertyGroup><prebuildEvent>bad</prebuildEvent></PropertyGroup>" + import + "</Project>");
            Throws(() => BuildProjectPolicy.Validate(file), "refused", "case insensitive build hook refused");
            File.WriteAllText(file, "<Project><PropertyGroup><Any>$([System.IO.File]::ReadAllText('x'))</Any></PropertyGroup>" + import + "</Project>");
            Throws(() => BuildProjectPolicy.Validate(file), "refused", "MSBuild property function refused");
            File.WriteAllText(file, "<Project>" + import + "</Project>");
            File.WriteAllText(Path.Combine(dir, "Directory.Build.props"), "<Project />");
            Throws(() => BuildProjectPolicy.Validate(file), "refused", "ancestor hook refused");
        }
        finally
        {
            var resolved = Path.GetFullPath(dir);
            var parent = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!resolved.StartsWith(parent + "engineering-build-check-", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException();
            Directory.Delete(resolved, true);
        }
    }

    private sealed class FakeIde : IBuildIde
    {
        public event Action<bool> BuildBegin;
        public event Action<string, string, string> ProjectBegin;
        public event Action<string, string, string, bool> ProjectDone;
        public event Action<bool> BuildDone;
        public bool IsBuilding { get; private set; }
        public int LastBuildInfo { get { return 0; } }
        internal string Output = "old Main(1,1): error C1: stale\n";
        internal int Starts;
        internal bool FailStart;
        internal bool FailPrepare;
        public BuildTarget Prepare(string solution, string project, Func<string, bool?> dirty) { if (FailPrepare) throw new NativeBuildException("refused", "unsafe"); return new BuildTarget { UniqueName = "project", Configuration = "Debug", Platform = "TwinCAT RT (x86)" }; }
        public bool IsCurrent(BuildTarget target, string solution, string project) { return true; }
        public string ReadOutput() { return Output; }
        public void Start(BuildTarget target) { Starts++; IsBuilding = true; if (FailStart) throw new Exception(); }
        public void Dispose() { }
        internal void Begin() { BuildBegin(true); }
        internal void BeginProject(string name = "project") { ProjectBegin(name, "Debug", "TwinCAT RT (x86)"); }
        internal void EndProject(bool success) { ProjectDone("project", "Debug", "TwinCAT RT (x86)", success); }
        internal void End() { IsBuilding = false; BuildDone(true); }
    }
}
