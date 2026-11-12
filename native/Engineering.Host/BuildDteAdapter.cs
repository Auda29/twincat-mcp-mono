using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;
using System.IO;

namespace TwinCatMcp.Engineering.Host
{
    internal sealed class BuildTarget
    {
        internal string UniqueName, Configuration, Platform;
        internal string ProjectFile, OwningProjectFile, MappingDigest;
        internal object Project;
        internal bool OutputCaptureAvailable;
    }

    internal interface IBuildIde : IDisposable
    {
        event Action<bool> BuildBegin;
        event Action<string, string, string> ProjectBegin;
        event Action<string, string, string, bool> ProjectDone;
        event Action<bool> BuildDone;
        bool IsBuilding { get; }
        BuildTarget Prepare(string solutionFile, string projectFile, Func<string, bool?> dirty);
        bool IsCurrent(BuildTarget target, string solutionFile, string projectFile);
        string ReadOutput();
        int LastBuildInfo { get; }
        void Start(BuildTarget target);
    }

    // Reflect only the EnvDTE interfaces already loaded by the injecting host. No
    // interop DLL is shipped or loaded, and no ROT or process lookup occurs here.
    internal sealed class BuildDteAdapter : IBuildIde
    {
        private readonly object dte;
        private readonly Assembly interop;
        private readonly List<Action> unsubscribe = new List<Action>();
        public event Action<bool> BuildBegin;
        public event Action<string, string, string> ProjectBegin;
        public event Action<string, string, string, bool> ProjectDone;
        public event Action<bool> BuildDone;

        internal BuildDteAdapter(object injectedDte)
        {
            dte = injectedDte;
            interop = AppDomain.CurrentDomain.GetAssemblies().FirstOrDefault(a =>
                (string.Equals(a.GetName().Name, "EnvDTE", StringComparison.OrdinalIgnoreCase) || a.GetName().Name == "Microsoft.VisualStudio.Interop") &&
                a.GetType("EnvDTE.DTE", false) != null);
            if (dte == null || interop == null) Unsupported();
            try
            {
                var events = Get(dte, "DTE", "Events");
                var builds = Get(events, "Events", "BuildEvents");
                Subscribe(builds, "OnBuildBegin", a => { var handler = BuildBegin; if (handler != null) handler(IsProjectBuild(a)); });
                Subscribe(builds, "OnBuildProjConfigBegin", a => { var handler = ProjectBegin; if (handler != null) handler((string)a[0], (string)a[1], (string)a[2]); });
                Subscribe(builds, "OnBuildProjConfigDone", a => { var handler = ProjectDone; if (handler != null) handler((string)a[0], (string)a[1], (string)a[2], (bool)a[4]); });
                Subscribe(builds, "OnBuildDone", a => { var handler = BuildDone; if (handler != null) handler(IsProjectBuild(a)); });
            }
            catch { Dispose(); Unsupported(); }
        }

        private static bool IsProjectBuild(object[] args)
        {
            return args.Length == 2 && args[0].ToString() == "vsBuildScopeProject" && args[1].ToString() == "vsBuildActionBuild";
        }

        private object Get(object instance, string type, string name)
        {
            var declaring = DeclaringType(interop.GetType("EnvDTE." + type, true), name);
            return declaring.InvokeMember(name, BindingFlags.GetProperty, null, instance, new object[0], CultureInfo.InvariantCulture);
        }

        private object Call(object instance, string type, string name, params object[] arguments)
        {
            var declaring = DeclaringType(interop.GetType("EnvDTE." + type, true), name);
            return declaring.InvokeMember(name, BindingFlags.InvokeMethod, null, instance, arguments, CultureInfo.InvariantCulture);
        }

        private static Type DeclaringType(Type type, string member)
        {
            // Reflection does not include inherited interface members. In EnvDTE
            // 8, DTE and Solution are empty interfaces inheriting _DTE/_Solution.
            if (type.GetMember(member, BindingFlags.Public | BindingFlags.Instance).Length != 0) return type;
            foreach (var parent in type.GetInterfaces())
                if (parent.GetMember(member, BindingFlags.Public | BindingFlags.Instance).Length != 0) return parent;
            throw new MissingMemberException();
        }

        private IEnumerable<object> Items(object collection, string type, int maximum)
        {
            int count = Convert.ToInt32(Get(collection, type, "Count"), CultureInfo.InvariantCulture);
            if (count < 0 || count > maximum) Refuse("build_collection_limit");
            for (int i = 1; i <= count; i++) yield return Call(collection, type, "Item", i);
        }

        private void Subscribe(object builds, string name, Action<object[]> callback)
        {
            var type = interop.GetType("EnvDTE._dispBuildEvents_Event", true);
            var info = type.GetEvent(name);
            if (info == null) Unsupported();
            var signature = info.EventHandlerType.GetMethod("Invoke");
            var parameters = signature.GetParameters().Select(p => Expression.Parameter(p.ParameterType, p.Name)).ToArray();
            var boxed = Expression.NewArrayInit(typeof(object), parameters.Select(p => Expression.Convert(p, typeof(object))));
            var body = Expression.Invoke(Expression.Constant(callback), boxed);
            var handler = Expression.Lambda(info.EventHandlerType, body, parameters).Compile();
            info.AddEventHandler(builds, handler);
            unsubscribe.Add(() => info.RemoveEventHandler(builds, handler));
        }

        private object Solution { get { return Get(dte, "DTE", "Solution"); } }
        private object SolutionBuild { get { return Get(Solution, "Solution", "SolutionBuild"); } }
        public bool IsBuilding { get { return Get(SolutionBuild, "SolutionBuild", "BuildState").ToString() == "vsBuildStateInProgress"; } }
        public int LastBuildInfo { get { return Convert.ToInt32(Get(SolutionBuild, "SolutionBuild", "LastBuildInfo"), CultureInfo.InvariantCulture); } }

        public BuildTarget Prepare(string solutionFile, string projectFile, Func<string, bool?> dirty)
        {
            if (IsBuilding) Refuse("build_already_running");
            var solution = Solution;
            if (!Same((string)Get(solution, "Solution", "FullName"), solutionFile) || !(bool)Get(solution, "Solution", "Saved")) Refuse("solution_not_clean");
            var association = new PlcProjectAssociationService(dte).Resolve(solutionFile, projectFile, () => {
                if (!Same((string)Get(Solution, "Solution", "FullName"), solutionFile)) Refuse("solution_changed");
            });
            if (association.Status != "succeeded") Refuse("unverified_plc_association");
            var matches = new List<object>();
            var budget = 512;
            foreach (var project in Items(Get(solution, "Solution", "Projects"), "Projects", 512)) Find(project, association.TwinCatProjectFile, matches, ref budget, 0);
            if (matches.Count != 1) Refuse("ambiguous_build_project");
            if (dirty == null || dirty(projectFile) != false || dirty(solutionFile) != false || dirty(association.TwinCatProjectFile) != false) Refuse("unknown_dirty_state");
            foreach (var document in Items(Get(dte, "DTE", "Documents"), "Documents", 256))
                if (!(bool)Get(document, "Document", "Saved") || dirty((string)Get(document, "Document", "FullName")) != false) Refuse("dirty_or_unknown_document");
            BuildProjectPolicy.Validate(projectFile);
            var found = matches[0];
            var active = Get(SolutionBuild, "SolutionBuild", "ActiveConfiguration");
            var target = new BuildTarget {
                Project = found, ProjectFile = projectFile, OwningProjectFile = association.TwinCatProjectFile, MappingDigest = association.MappingDigest,
                Configuration = (string)Get(active, "SolutionConfiguration", "Name"),
                Platform = CurrentTargetPlatform(found)
            };
            if ((target.Configuration != "Debug" && target.Configuration != "Release") ||
                (target.Platform != "TwinCAT RT (x86)" && target.Platform != "TwinCAT RT (x64)")) Refuse("unsupported_build_configuration");
            if (SolutionPlatform(active) != target.Platform) Refuse("solution_platform_mismatch");
            int contexts = 0;
            foreach (var context in Items(Get(active, "SolutionConfiguration", "SolutionContexts"), "SolutionContexts", 512))
            {
                var contextName = (string)Get(context, "SolutionContext", "ProjectName");
                if (!MatchesPlcPath(solutionFile, contextName, projectFile)) continue;
                contexts++;
                target.UniqueName = contextName;
                if (!(bool)Get(context, "SolutionContext", "ShouldBuild") || (string)Get(context, "SolutionContext", "ConfigurationName") != target.Configuration ||
                    (string)Get(context, "SolutionContext", "PlatformName") != target.Platform) Refuse("build_configuration_mismatch");
            }
            if (contexts != 1) Refuse("ambiguous_build_configuration");
            RequireNoDependencies(target.UniqueName);
            return target;
        }

        internal static bool MatchesPlcPath(string solutionFile, string contextName, string projectFile)
        {
            try { return !string.IsNullOrEmpty(contextName) && Same(Path.GetFullPath(Path.IsPathRooted(contextName) ? contextName : Path.Combine(Path.GetDirectoryName(solutionFile), contextName)), projectFile); }
            catch { return false; }
        }

        private void RequireNoDependencies(string uniqueName)
        {
            try
            {
                var dependency = Call(Get(SolutionBuild, "SolutionBuild", "BuildDependencies"), "BuildDependencies", "Item", uniqueName);
                var owner = Get(dependency, "BuildDependency", "Project");
                if (!Same((string)Get(owner, "Project", "UniqueName"), uniqueName)) Refuse("dependency_identity_mismatch");
                var required = Get(dependency, "BuildDependency", "RequiredProjects") as Array;
                if (required == null || required.Length != 0) Refuse("build_dependencies_not_supported");
            }
            catch (NativeBuildException) { throw; }
            catch { throw new NativeBuildException("unsupported", "build_dependency_evidence_unavailable"); }
        }

        private string CurrentTargetPlatform(object project)
        {
            var manager = Get(project, "Project", "Object");
            var config = TcGet(manager, "ITcSysManager7", "ConfigurationManager");
            return (string)TcGet(config, "ITcConfigManager", "ActiveTargetPlatform");
        }

        private static string SolutionPlatform(object configuration)
        {
            var types = AppDomain.CurrentDomain.GetAssemblies().Where(a => a.GetName().Name == "EnvDTE80" || a.GetName().Name == "Microsoft.VisualStudio.Interop")
                .Select(a => a.GetType("EnvDTE80.SolutionConfiguration2", false)).Where(t => t != null).Distinct().ToArray();
            if (types.Length != 1 || configuration == null || !types[0].IsInstanceOfType(configuration)) throw new NativeBuildException("unsupported", "solution_platform_evidence_unavailable");
            return (string)DeclaringType(types[0], "PlatformName").InvokeMember("PlatformName", BindingFlags.GetProperty, null, configuration, new object[0], CultureInfo.InvariantCulture);
        }

        private static object TcGet(object instance, string typeName, string member)
        {
            var types = AppDomain.CurrentDomain.GetAssemblies().Where(a => a.GetName().Name == "TCatSysManagerLib" || a.GetName().Name == "Interop.TCatSysManagerLib")
                .Select(a => a.GetType("TCatSysManagerLib." + typeName, false)).Where(t => t != null).Distinct().ToArray();
            if (types.Length != 1 || instance == null || !types[0].IsInstanceOfType(instance)) throw new NativeBuildException("unsupported", "build_platform_evidence_unavailable");
            return DeclaringType(types[0], member).InvokeMember(member, BindingFlags.GetProperty, null, instance, new object[0], CultureInfo.InvariantCulture);
        }

        private void Find(object project, string file, List<object> matches, ref int budget, int depth)
        {
            if (--budget < 0 || depth > 8) Refuse("build_project_limit");
            if (!(bool)Get(project, "Project", "Saved")) Refuse("project_not_saved");
            var fullName = (string)Get(project, "Project", "FileName");
            if (Same(fullName, file)) matches.Add(project);
            if ((fullName ?? "").EndsWith(".tsproj", StringComparison.OrdinalIgnoreCase)) return;
            if (!Same((string)Get(project, "Project", "Kind"), "{66A26720-8FB5-11D2-AA7E-00C04F688DDE}")) return;
            var items = Get(project, "Project", "ProjectItems");
            if (items == null) return;
            foreach (var item in Items(items, "ProjectItems", 512))
            {
                if (--budget < 0) Refuse("build_project_limit");
                var child = Get(item, "ProjectItem", "SubProject");
                if (child != null) Find(child, file, matches, ref budget, depth + 1);
            }
        }

        public bool IsCurrent(BuildTarget target, string solutionFile, string projectFile)
        {
            var association = new PlcProjectAssociationService(dte).Resolve(solutionFile, projectFile, () => {
                if (!Same((string)Get(Solution, "Solution", "FullName"), solutionFile)) Refuse("solution_changed");
            });
            return association.Status == "succeeded" && Same(association.TwinCatProjectFile, target.OwningProjectFile) && association.MappingDigest == target.MappingDigest &&
                Same((string)Get(Solution, "Solution", "FullName"), solutionFile) && Same((string)Get(target.Project, "Project", "FileName"), target.OwningProjectFile) &&
                (string)Get(Get(SolutionBuild, "SolutionBuild", "ActiveConfiguration"), "SolutionConfiguration", "Name") == target.Configuration &&
                SolutionPlatform(Get(SolutionBuild, "SolutionBuild", "ActiveConfiguration")) == target.Platform &&
                CurrentTargetPlatform(target.Project) == target.Platform;
        }

        public string ReadOutput()
        {
            var windows = Get(dte, "DTE", "Windows");
            var window = Call(windows, "Windows", "Item", "{34E76E81-EE4A-11D0-AE2E-00A0C90FFFC3}");
            var output = Get(window, "Window", "Object");
            var panes = Get(output, "OutputWindow", "OutputWindowPanes");
            var pane = Call(panes, "OutputWindowPanes", "Item", "{1BD8A850-02D1-11D1-BEE7-00A0C913D1F8}");
            var document = Get(pane, "OutputWindowPane", "TextDocument");
            var end = Get(document, "TextDocument", "EndPoint");
            if (Convert.ToInt32(Get(end, "TextPoint", "AbsoluteCharOffset"), CultureInfo.InvariantCulture) > 524288) return null;
            var edit = Call(Get(document, "TextDocument", "StartPoint"), "TextPoint", "CreateEditPoint");
            return (string)Call(edit, "EditPoint", "GetText", end);
        }

        public void Start(BuildTarget target) { Call(SolutionBuild, "SolutionBuild", "BuildProject", target.Configuration + "|" + target.Platform, target.ProjectFile, false); }
        private static bool Same(string a, string b) { return string.Equals(a, b, StringComparison.OrdinalIgnoreCase); }
        private static void Refuse(string code) { throw new NativeBuildException("refused", code); }
        private static void Unsupported() { throw new NativeBuildException("unsupported", "build_events_unavailable"); }
        public void Dispose() { for (int i = unsubscribe.Count - 1; i >= 0; i--) { try { unsubscribe[i](); } catch { } } unsubscribe.Clear(); }
    }
}
