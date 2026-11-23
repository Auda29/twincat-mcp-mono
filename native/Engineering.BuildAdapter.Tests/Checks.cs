using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security;
using System.Reflection;
using System.Reflection.Emit;
using System.Threading;
using System.Web.Script.Serialization;
using EnvDTE;
using TCatSysManagerLib;
using TwinCatMcp.Engineering.Host;
sealed class EventsFixture : Events, _dispBuildEvents_Event
{
    public object BuildEvents { get { return this; } }
    public event Action<string,string> OnBuildBegin;
    public event Action<string,string,string> OnBuildProjConfigBegin;
    private Action<string,string,string,string,bool> projectDone;
    internal bool FailThirdSubscription;
    public event Action<string,string,string,string,bool> OnBuildProjConfigDone { add { if (FailThirdSubscription) throw new InvalidOperationException("fixture subscription failure"); projectDone += value; } remove { projectDone -= value; } }
    public event Action<string,string> OnBuildDone;
    internal int HandlerCount { get { return (OnBuildBegin == null ? 0 : OnBuildBegin.GetInvocationList().Length) + (OnBuildProjConfigBegin == null ? 0 : OnBuildProjConfigBegin.GetInvocationList().Length) + (projectDone == null ? 0 : projectDone.GetInvocationList().Length) + (OnBuildDone == null ? 0 : OnBuildDone.GetInvocationList().Length); } }
    internal void Emit() { if (OnBuildBegin != null) OnBuildBegin("vsBuildScopeProject", "vsBuildActionBuild"); if (OnBuildProjConfigBegin != null) OnBuildProjConfigBegin("p","Debug","TwinCAT RT (x64)"); if (projectDone != null) projectDone("p","Debug","TwinCAT RT (x64)","",true); if (OnBuildDone != null) OnBuildDone("vsBuildScopeProject", "vsBuildActionBuild"); }
}
sealed class Collection : Projects, Documents, SolutionContexts
{
    internal readonly List<object> Values = new List<object>();
    public int Count { get { return Values.Count; } }
    public object Item(object index) { return Values[Convert.ToInt32(index) - 1]; }
}
sealed class DocumentFixture : Document { public bool Saved {get;set;} public string FullName {get;set;} }
sealed class ProjectFixture : Project
{
    public string FileName {get;set;} public string Kind {get;set;} public object Object {get;set;}
    public object ProjectItems {get { return null; }} public bool Saved {get;set;} public string UniqueName {get;set;}
}
sealed class ContextFixture : SolutionContext { public string ProjectName {get;set;} public bool ShouldBuild {get;set;} public string ConfigurationName {get;set;} public string PlatformName {get;set;} }
sealed class Configuration : EnvDTE80.SolutionConfiguration2 { public string Name {get;set;} public string PlatformName {get;set;} public object SolutionContexts {get;set;} }
sealed class Dependency : BuildDependency { public object Project {get;set;} public object RequiredProjects {get;set;} }
sealed class Dependencies : BuildDependencies { public object Value; public object Item(object index) { return Value; } }
sealed class Build : SolutionBuild
{
    public string BuildState {get { return "vsBuildStateDone"; }} public int LastBuildInfo {get { return 0; }}
    public object ActiveConfiguration {get;set;} public object BuildDependencies {get;set;}
    internal string Configuration, Project; internal bool Wait; internal int Calls;
    public void BuildProject(string configuration, string project, bool wait) { Configuration = configuration; Project = project; Wait = wait; Calls++; }
}
sealed class SolutionFixture : Solution { public string FullName {get;set;} public bool Saved {get;set;} public Projects Projects {get;set;} public SolutionBuild SolutionBuild {get;set;} }
sealed class DteFixture : DTE { public Events Events {get;set;} public Solution Solution {get;set;} public Documents Documents {get;set;} }
sealed class TcManager : ITcSysManager, ITcSysManager7, ITcSysManager2
{
    public object ConfigurationManager {get;set;}
    internal object Root;
    internal Func<string> ReadTarget = () => "1.2.3.4.5.6";
    public object LookupTreeItem(string name) { return name == "TIPC" ? Root : null; }
    public string GetTargetNetId() { return ReadTarget(); }
}
sealed class TcConfig : ITcConfigManager { public string ActiveTargetPlatform {get;set;} }
sealed class Tree : ITcSmTreeItem, ITcProjectRoot, ITcPlcOnline
{
    internal string Xml; internal object ChildItem;
    public int ChildCount { get { return ChildItem == null ? 0 : 1; } }
    public object this[int index] { get { return index == 1 ? ChildItem : null; } }
    public string ProduceXml(bool recursive) { if (recursive) throw new Exception("unexpected recursive traversal"); return Xml; }
    public ITcSmTreeItem NestedProject {get;set;}
    public bool IsLoggedIn {get;set;}
}
static class Checks
{
    sealed class Inline : SynchronizationContext { public override void Post(SendOrPostCallback callback, object state) { callback(state); } }
    static void CompetingInterface(string assemblyName, params string[] names) {
        var assembly = AppDomain.CurrentDomain.DefineDynamicAssembly(new AssemblyName(assemblyName), AssemblyBuilderAccess.Run);
        var module = assembly.DefineDynamicModule(assemblyName);
        foreach (var name in names) module.DefineType(name, TypeAttributes.Public | TypeAttributes.Interface | TypeAttributes.Abstract).CreateType();
    }
    static void Require(bool value, string name) { if (!value) throw new Exception(name); }
    static void Refused(Action a, string code) { try { a(); } catch (NativeBuildException e) { Require(e.Code == code, "expected " + code + " got " + e.Code); return; } throw new Exception("missing refusal " + code); }
    static void Main()
    {
        string dir = Path.Combine(Path.GetTempPath(), "build-adapter-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(dir);
        try {
            string sln = Path.Combine(dir,"Test.sln"), plc = Path.Combine(dir,"PLC.plcproj"), tsproj = Path.Combine(dir,"Owner.tsproj");
            File.WriteAllText(plc, @"<Project><Import Project=""$(MSBuildExtensionsPath)\Beckhoff\TwinCAT\v3.1\TcPlcProject.targets"" /></Project>");
            var events = new EventsFixture(); var platform = new TcConfig { ActiveTargetPlatform = "TwinCAT RT (x64)" };
            var nestedPlc = new Tree { IsLoggedIn = true };
            var root = new Tree { ChildItem = new Tree { NestedProject = nestedPlc,
                Xml = "<TreeItem><ItemType>56</ItemType><ItemSubTypeName>Plc Project</ItemSubTypeName><PlcProjectDef><ProjectPath>" + SecurityElement.Escape(plc) + "</ProjectPath><ProjectType>Plc Project</ProjectType></PlcProjectDef></TreeItem>" } };
            var manager = new TcManager { ConfigurationManager = platform, Root = root };
            var owner = new ProjectFixture { FileName = tsproj, Saved = true, Object = manager, UniqueName = "Owner" };
            var projects = new Collection(); projects.Values.Add(owner);
            var documents = new Collection(); var document = new DocumentFixture { Saved = true, FullName = Path.Combine(dir,"Main.TcPOU") }; documents.Values.Add(document);
            var context = new ContextFixture { ProjectName = plc, ShouldBuild = true, ConfigurationName = "Debug", PlatformName = "TwinCAT RT (x64)" };
            var contexts = new Collection(); contexts.Values.Add(context);
            var config = new Configuration { Name = "Debug", PlatformName = "TwinCAT RT (x64)", SolutionContexts = contexts };
            var dependencyOwner = new ProjectFixture { UniqueName = plc }; var dependency = new Dependency { Project = dependencyOwner, RequiredProjects = new object[0] };
            var build = new Build { ActiveConfiguration = config, BuildDependencies = new Dependencies { Value = dependency } };
            var solution = new SolutionFixture { FullName = sln, Saved = true, Projects = projects, SolutionBuild = build };
            var dte = new DteFixture { Events = events, Solution = solution, Documents = documents };
            events.FailThirdSubscription = true;
            Refused(() => { using (var failed = new BuildDteAdapter(dte)) { } }, "build_events_unavailable");
            Require(events.HandlerCount == 0 && build.Calls == 0, "partial subscription failure cleans up the first two handlers without submitting a build");
            events.FailThirdSubscription = false;
            using (var adapter = new BuildDteAdapter(dte)) {
                bool begin = false, done = false; adapter.BuildBegin += x => begin = x; adapter.BuildDone += x => done = x;
                events.Emit(); Require(begin && done, "reflection event subscriptions");
                var target = adapter.Prepare(sln, plc, _ => false);
                Require(target.ProjectFile == plc && target.OwningProjectFile == tsproj && target.UniqueName == plc, "exact association");
                adapter.Start(target);
                Require(build.Calls == 1 && build.Project == plc && build.Project != tsproj && !build.Wait && build.Configuration == "Debug|TwinCAT RT (x64)", "only exact PLC build submitted without waiting");
                config.PlatformName = "TwinCAT RT (x86)"; Refused(() => adapter.Prepare(sln, plc, _ => false), "solution_platform_mismatch"); config.PlatformName = "TwinCAT RT (x64)";
                platform.ActiveTargetPlatform = "TwinCAT RT (x86)"; Refused(() => adapter.Prepare(sln, plc, _ => false), "solution_platform_mismatch"); platform.ActiveTargetPlatform = "TwinCAT RT (x64)";
                context.PlatformName = "TwinCAT RT (x86)"; Refused(() => adapter.Prepare(sln, plc, _ => false), "build_configuration_mismatch"); context.PlatformName = "TwinCAT RT (x64)";
                dependency.RequiredProjects = new object[] { new object() }; Refused(() => adapter.Prepare(sln, plc, _ => false), "build_dependencies_not_supported");
                dependency.RequiredProjects = null; Refused(() => adapter.Prepare(sln, plc, _ => false), "build_dependencies_not_supported"); dependency.RequiredProjects = new object[0];
                document.Saved = false; Refused(() => adapter.Prepare(sln, plc, _ => false), "dirty_or_unknown_document"); document.Saved = true;
                Refused(() => adapter.Prepare(sln, plc, path => path == document.FullName ? (bool?)null : false), "dirty_or_unknown_document");
                Require(build.Calls == 1, "rejected cases do not submit build");
            }
            Require(events.HandlerCount == 0, "baseline adapter unsubscribed");
            var envAssembly = typeof(DTE).Assembly; var tcAssembly = typeof(ITcSysManager).Assembly;
            var calls = new Dictionary<string, int>();
            Func<string, Type> binding = name => {
                int count; calls.TryGetValue(name, out count); calls[name] = count + 1;
                return (name.StartsWith("TCatSysManagerLib.", StringComparison.Ordinal) ? tcAssembly : envAssembly).GetType(name, false);
            };
            CompetingInterface("EnvDTE", "EnvDTE.DTE");
            CompetingInterface("Interop.TCatSysManagerLib", "TCatSysManagerLib.ITcSysManager", "TCatSysManagerLib.ITcSmTreeItem");
            try { using (var legacy = new BuildDteAdapter(dte)) { } throw new Exception("legacy adapter must refuse duplicate interop"); }
            catch (PlcProjectAssociationException e) { Require(e.Code == "association_interop_ambiguous_envdte_dte", "legacy ambiguity refused"); }
            var trusted = new EngineeringInteropTypes(binding);
            var bindingCount = calls.Count;
            using (var adapter = new BuildDteAdapter(dte, trusted)) {
                Require(events.HandlerCount == 4, "authoritative adapter subscribes four build events");
                int begins = 0, dones = 0, projectBegins = 0, projectDones = 0;
                adapter.BuildBegin += x => { if (x) begins++; }; adapter.BuildDone += x => { if (x) dones++; };
                adapter.ProjectBegin += (p, c, x) => { if (p == "p" && c == "Debug" && x == "TwinCAT RT (x64)") projectBegins++; };
                adapter.ProjectDone += (p, c, x, success) => { if (p == "p" && c == "Debug" && x == "TwinCAT RT (x64)" && success) projectDones++; };
                events.Emit(); Require(begins == 1 && dones == 1 && projectBegins == 1 && projectDones == 1, "all authoritative event subscriptions fire once with exact arguments");
                var target = adapter.Prepare(sln, plc, _ => false);
                Require(target.ProjectFile == plc && target.OwningProjectFile == tsproj && adapter.IsCurrent(target, sln, plc), "authoritative preflight and current association");
                Require(target.Configuration == "Debug" && target.Platform == "TwinCAT RT (x64)", "authoritative EnvDTE80 and TwinCAT platforms");
                adapter.Start(target);
                Require(build.Calls == 2 && build.Project == plc && build.Configuration == "Debug|TwinCAT RT (x64)" && !build.Wait, "authoritative exact PLC build invocation");
                Require(calls.Count == bindingCount && calls.Values.All(count => count == 1), "adapter never requeries authoritative callback");
            }
            Require(events.HandlerCount == 0, "authoritative adapter unsubscribes all events");
            int approvals = 0; var session = Guid.NewGuid(); var started = DateTime.UtcNow;
            var host = new HostContext(session, 123, started, sln, plc, "epoch");
            calls.Clear();
            using (var provider = EngineeringProviderFactory.CreateWithInteropTypes(dte, _ => false, () => host, _ => { approvals++; return false; }, new Inline(), null, _ => false, null, binding)) {
                var captured = calls.Count;
                var json = new JavaScriptSerializer();
                Func<string, object, Dictionary<string, object>> dispatch = (operation, arguments) => {
                    var request = json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = Guid.NewGuid().ToString("D"), operation,
                        expected = new { idePid = 123, ideStartedUtc = started.ToString("o"), solutionFile = sln, projectFile = plc, contextEpoch = "epoch" }, arguments });
                    return (Dictionary<string, object>)json.DeserializeObject(provider.DispatchAsync(request, CancellationToken.None).GetAwaiter().GetResult());
                };
                var association = dispatch("project.association", new { });
                Require((string)association["status"] == "succeeded" && (string)((Dictionary<string, object>)association["result"])["twinCatProjectFile"] == tsproj, "public factory association with competing global types");
                var online = dispatch("project.online", new { });
                var observed = (Dictionary<string, object>)online["result"];
                Require((string)online["status"] == "succeeded" && (bool)observed["loggedIn"] &&
                    (string)observed["configuredAmsNetId"] == "1.2.3.4.5.6" && !(bool)observed["runtimeAddressVerified"],
                    "the selected nested PLC reports login separately from its configured Net ID");
                nestedPlc.IsLoggedIn = false;
                Require(!(bool)((Dictionary<string, object>)dispatch("project.online", new { })["result"])["loggedIn"], "logged-out observation");
                int targetReads = 0;
                manager.ReadTarget = () => ++targetReads == 1 ? "1.2.3.4.5.6" : "1.2.3.4.5.7";
                Require((string)dispatch("project.online", new { })["status"] == "unsupported", "changed target yields no observation");
                Require((string)dispatch("project.online", new { adsPort = 851 })["status"] == "refused", "no target arguments");
                var description = dispatch("session.describe", new { });
                var result = (Dictionary<string, object>)description["result"];
                var capabilities = (Dictionary<string, object>)result["capabilities"];
                Require((string)description["status"] == "succeeded" && (string)capabilities["plcBuild"] == "supported" && (string)result["configuration"] == "Debug" && (string)result["platform"] == "TwinCAT RT (x64)", "public factory describe performs trusted build preflight");
                var source = dispatch("source.read", new { objectId = "x", section = "implementation" });
                Require((string)source["status"] == "unsupported" && approvals == 0, "null editors keep source disabled without approval");
                Require(calls.Count == captured && calls.Values.All(count => count == 1), "provider never requeries callback");
            }
            Require(events.HandlerCount == 0, "provider disposal unsubscribes all events");
            Console.WriteLine("Build adapter reflection fixture checks passed");
        } finally {
            if (!Path.GetFullPath(dir).StartsWith(Path.Combine(Path.GetTempPath(), "build-adapter-"), StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException();
            Directory.Delete(dir, true);
        }
    }
}
