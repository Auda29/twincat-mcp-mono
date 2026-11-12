using System;
using System.Collections.Generic;
using System.IO;
using System.Security;
using EnvDTE;
using TCatSysManagerLib;
using TwinCatMcp.Engineering.Host;
namespace TwinCatMcp.Engineering.Host { internal sealed class NativeBuildException : Exception { internal readonly string Status, Code; internal NativeBuildException(string status, string code) : base(code) { Status = status; Code = code; } } }
sealed class EventsFixture : Events, _dispBuildEvents_Event
{
    public object BuildEvents { get { return this; } }
    public event Action<string,string> OnBuildBegin;
    public event Action<string,string,string> OnBuildProjConfigBegin;
    public event Action<string,string,string,string,bool> OnBuildProjConfigDone;
    public event Action<string,string> OnBuildDone;
    internal void Emit() { if (OnBuildBegin != null) OnBuildBegin("vsBuildScopeProject", "vsBuildActionBuild"); if (OnBuildProjConfigBegin != null) OnBuildProjConfigBegin("p","Debug","TwinCAT RT (x64)"); if (OnBuildProjConfigDone != null) OnBuildProjConfigDone("p","Debug","TwinCAT RT (x64)","",true); if (OnBuildDone != null) OnBuildDone("vsBuildScopeProject", "vsBuildActionBuild"); }
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
sealed class TcManager : ITcSysManager, ITcSysManager7 { public object ConfigurationManager {get;set;} internal object Root; public object LookupTreeItem(string name) { return name == "TIPC" ? Root : null; } }
sealed class TcConfig : ITcConfigManager { public string ActiveTargetPlatform {get;set;} }
sealed class Tree : ITcSmTreeItem
{
    internal string Xml; internal object ChildItem;
    public int ChildCount { get { return ChildItem == null ? 0 : 1; } }
    public object this[int index] { get { return index == 1 ? ChildItem : null; } }
    public string ProduceXml(bool recursive) { if (recursive) throw new Exception("unexpected recursive traversal"); return Xml; }
}
static class Checks
{
    static void Require(bool value, string name) { if (!value) throw new Exception(name); }
    static void Refused(Action a, string code) { try { a(); } catch (NativeBuildException e) { Require(e.Code == code, "expected " + code + " got " + e.Code); return; } throw new Exception("missing refusal " + code); }
    static void Main()
    {
        string dir = Path.Combine(Path.GetTempPath(), "build-adapter-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(dir);
        try {
            string sln = Path.Combine(dir,"Test.sln"), plc = Path.Combine(dir,"PLC.plcproj"), tsproj = Path.Combine(dir,"Owner.tsproj");
            File.WriteAllText(plc, @"<Project><Import Project=""$(MSBuildExtensionsPath)\Beckhoff\TwinCAT\v3.1\TcPlcProject.targets"" /></Project>");
            var events = new EventsFixture(); var platform = new TcConfig { ActiveTargetPlatform = "TwinCAT RT (x64)" };
            var root = new Tree { ChildItem = new Tree { Xml = "<TreeItem><PlcDef><ProjectPath>" + SecurityElement.Escape(plc) + "</ProjectPath></PlcDef></TreeItem>" } };
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
            Console.WriteLine("Build adapter reflection fixture checks passed");
        } finally {
            if (!Path.GetFullPath(dir).StartsWith(Path.Combine(Path.GetTempPath(), "build-adapter-"), StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException();
            Directory.Delete(dir, true);
        }
    }
}
