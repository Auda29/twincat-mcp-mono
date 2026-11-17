using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Xml;
using System.Xml.Linq;

namespace TwinCatMcp.Engineering.Host
{
    internal sealed class PlcProjectAssociationException : Exception
    {
        internal string Status { get; private set; }
        internal string Code { get; private set; }
        internal PlcProjectAssociationException(string status, string code) : base(code) { Status = status; Code = code; }
    }

    internal sealed class PlcProjectAssociationResult
    {
        public string Status { get; set; }
        public string ErrorCode { get; set; }
        public string SolutionFile { get; set; }
        public string PlcProjectFile { get; set; }
        public string TwinCatProjectFile { get; set; }
        public int AssociationCount { get; set; }
        public int? OwningTwinCatPlcChildCount { get; set; }
        public string MappingDigest { get; set; }
        public string ObservedAtUtc { get; set; }
        public string ObservationConsistency { get { return Status == "succeeded" ? "selectedMappingRechecked" : null; } }
        public string BuildScopeStatus { get { return "unknown"; } }
        public string Source { get { return "unknown"; } }
        public string CaptureKind { get { return "automationSnapshot"; } }
        public string EditorState { get { return "unknown"; } }
        public string DirtyState { get { return "unknown"; } }
    }

    internal interface IPlcProjectAssociationAccess
    {
        object Dte { get; }
        bool Supports(object instance, string interfaceName);
        object Get(object instance, string interfaceName, string member, params object[] indexes);
        object Call(object instance, string interfaceName, string member, params object[] args);
    }

    // Read-only association evidence. This component never reads source text,
    // invokes a build, changes host binding, or attests unsaved editor state.
    internal sealed class PlcProjectAssociationService
    {
        private const int MaxXml = 1048576;
        private readonly IPlcProjectAssociationAccess access;
        internal PlcProjectAssociationService(object injectedDte) : this(new ReflectedPlcProjectAssociationAccess(injectedDte)) { }
        internal PlcProjectAssociationService(IPlcProjectAssociationAccess access)
        { if (access == null) throw new ArgumentNullException("access"); this.access = access; }

        internal PlcProjectAssociationResult Resolve(string solutionFile, string projectFile, Action revalidateContext)
        {
            if (revalidateContext == null || !CanonicalFile(solutionFile, ".sln") || !CanonicalFile(projectFile, ".plcproj")) Refuse("invalid_association_target");
            try
            {
                var solution = Get(access.Dte, "EnvDTE.DTE", "Solution", revalidateContext);
                if (!SameFile(Text(Get(solution, "EnvDTE.Solution", "FullName", revalidateContext)), solutionFile)) Conflict("solution_changed");
                int budget = 512;
                var projects = new List<object>();
                CollectProjects(Get(solution, "EnvDTE.Solution", "Projects", revalidateContext), projects, ref budget, revalidateContext);
                int matches = 0;
                string matchedTwinCatFile = null;
                int? matchedOwnerPlcCount = null;
                object matchedProject = null;
                int matchedChildIndex = 0;
                string matchedXml = null;
                string matchedPath = null;
                var projectPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                int plcBudget = 512;
                foreach (var project in projects)
                {
                    var twinCatFile = Text(Get(project, "EnvDTE.Project", "FileName", revalidateContext));
                    if (!string.Equals(Path.GetExtension(twinCatFile), ".tsproj", StringComparison.OrdinalIgnoreCase)) continue;
                    if (!CanonicalFile(twinCatFile, ".tsproj")) Unsupported("unverified_twincat_project_path");
                    if (!projectPaths.Add(twinCatFile)) Conflict("ambiguous_twincat_project_identity");
                    var manager = Get(project, "EnvDTE.Project", "Object", revalidateContext);
                    Validate(revalidateContext);
                    if (!access.Supports(manager, "TCatSysManagerLib.ITcSysManager")) Unsupported("sysmanager_interface_unavailable");
                    var plcRoot = Call(manager, "TCatSysManagerLib.ITcSysManager", "LookupTreeItem", revalidateContext, "TIPC");
                    int count = Number(Get(plcRoot, "TCatSysManagerLib.ITcSmTreeItem", "ChildCount", revalidateContext));
                    if (count < 0 || count > 128) Refuse("plc_association_item_limit");
                    for (int i = 1; i <= count; i++)
                    {
                        if (--plcBudget < 0) Refuse("plc_association_item_limit");
                        var child = Get(plcRoot, "TCatSysManagerLib.ITcSmTreeItem", "Child", revalidateContext, i);
                        var xml = Text(Call(child, "TCatSysManagerLib.ITcSmTreeItem", "ProduceXml", revalidateContext, false));
                        var path = ProjectPath(xml);
                        if (!SameFile(path, projectFile)) continue;
                        matches++;
                        matchedTwinCatFile = twinCatFile;
                        matchedOwnerPlcCount = count;
                        matchedProject = project;
                        matchedChildIndex = i;
                        matchedXml = xml;
                        matchedPath = path;
                    }
                }
                if (matches == 1)
                {
                    try
                    {
                    // Reacquire the project from the injected solution and re-read its
                    // current TIPC tree, not a previously obtained child reference.
                    var recheckSolution = Get(access.Dte, "EnvDTE.DTE", "Solution", revalidateContext);
                    if (!SameFile(Text(Get(recheckSolution, "EnvDTE.Solution", "FullName", revalidateContext)), solutionFile)) Conflict("solution_changed");
                    var currentProjects = new List<object>();
                    int recheckBudget = 512;
                    CollectProjects(Get(recheckSolution, "EnvDTE.Solution", "Projects", revalidateContext), currentProjects, ref recheckBudget, revalidateContext);
                    var candidates = new List<object>();
                    foreach (var currentProject in currentProjects)
                    {
                        var currentFile = Text(Get(currentProject, "EnvDTE.Project", "FileName", revalidateContext));
                        if (SameFile(currentFile, matchedTwinCatFile))
                        {
                            if (!string.Equals(currentFile, matchedTwinCatFile, StringComparison.Ordinal)) Conflict("plc_association_changed");
                            candidates.Add(currentProject);
                        }
                    }
                    if (candidates.Count != 1) Conflict("plc_association_changed");
                    matchedProject = candidates[0];
                    var currentManager = Get(matchedProject, "EnvDTE.Project", "Object", revalidateContext);
                    Validate(revalidateContext);
                    if (!access.Supports(currentManager, "TCatSysManagerLib.ITcSysManager")) Conflict("plc_association_changed");
                    var currentRoot = Call(currentManager, "TCatSysManagerLib.ITcSysManager", "LookupTreeItem", revalidateContext, "TIPC");
                    if (Number(Get(currentRoot, "TCatSysManagerLib.ITcSmTreeItem", "ChildCount", revalidateContext)) != matchedOwnerPlcCount) Conflict("plc_association_changed");
                    var currentChild = Get(currentRoot, "TCatSysManagerLib.ITcSmTreeItem", "Child", revalidateContext, matchedChildIndex);
                    var currentXml = Text(Call(currentChild, "TCatSysManagerLib.ITcSmTreeItem", "ProduceXml", revalidateContext, false));
                    if (!string.Equals(currentXml, matchedXml, StringComparison.Ordinal) || !string.Equals(ProjectPath(currentXml), matchedPath, StringComparison.Ordinal)) Conflict("plc_association_changed");
                    }
                    catch (PlcProjectAssociationException error)
                    {
                        if (error.Status == "unsupported") Conflict("plc_association_changed");
                        throw;
                    }
                    catch { Conflict("plc_association_changed"); }
                }
                // Recheck the actual injected solution as well as the host epoch.
                var currentSolution = Get(access.Dte, "EnvDTE.DTE", "Solution", revalidateContext);
                if (!SameFile(Text(Get(currentSolution, "EnvDTE.Solution", "FullName", revalidateContext)), solutionFile)) Conflict("solution_changed");
                Validate(revalidateContext);
                return new PlcProjectAssociationResult {
                    Status = matches == 1 ? "succeeded" : matches == 0 ? "refused" : "conflict",
                    ErrorCode = matches == 1 ? null : matches == 0 ? "bound_plc_project_not_found" : "ambiguous_plc_project_mapping",
                    SolutionFile = solutionFile, PlcProjectFile = projectFile, TwinCatProjectFile = matches == 1 ? matchedTwinCatFile : null,
                    AssociationCount = matches,
                    // Direct TIPC children only. Project dependencies and actual
                    // BuildProject scope have not been enumerated or verified.
                    OwningTwinCatPlcChildCount = matches == 1 ? matchedOwnerPlcCount : null,
                    MappingDigest = matches == 1 ? Digest(matchedXml) : null,
                    ObservedAtUtc = matches == 1 ? DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) : null
                };
            }
            catch (PlcProjectAssociationException) { throw; }
            catch { throw new PlcProjectAssociationException("unsupported", "plc_association_unavailable"); }
        }

        private void CollectProjects(object collection, List<object> projects, ref int budget, Action validate)
        {
            int count = Number(Get(collection, "EnvDTE.Projects", "Count", validate));
            if (count < 0 || count > 512) Refuse("solution_project_limit");
            for (int i = 1; i <= count; i++)
            {
                if (--budget < 0) Refuse("solution_project_limit");
                CollectProject(Call(collection, "EnvDTE.Projects", "Item", validate, i), projects, ref budget, 0, validate);
            }
        }

        private void CollectProject(object project, List<object> projects, ref int budget, int depth, Action validate)
        {
            if (depth > 8) Refuse("solution_tree_depth_limit");
            projects.Add(project);
            var file = Text(Get(project, "EnvDTE.Project", "FileName", validate));
            if (string.Equals(Path.GetExtension(file), ".tsproj", StringComparison.OrdinalIgnoreCase)) return;
            // Only recurse through genuine solution folders, not arbitrary project
            // item providers. Solution folder GUID is the EnvDTE project kind.
            var kind = Text(Get(project, "EnvDTE.Project", "Kind", validate));
            if (!string.Equals(kind, "{66A26720-8FB5-11D2-AA7E-00C04F688DDE}", StringComparison.OrdinalIgnoreCase)) return;
            var items = Get(project, "EnvDTE.Project", "ProjectItems", validate);
            if (items == null) return;
            int count = Number(Get(items, "EnvDTE.ProjectItems", "Count", validate));
            if (count < 0 || count > 512) Refuse("solution_project_limit");
            for (int i = 1; i <= count; i++)
            {
                if (--budget < 0) Refuse("solution_project_limit");
                var item = Call(items, "EnvDTE.ProjectItems", "Item", validate, i);
                var child = Get(item, "EnvDTE.ProjectItem", "SubProject", validate);
                if (child != null) CollectProject(child, projects, ref budget, depth + 1, validate);
            }
        }

        private object Get(object target, string type, string member, Action validate, params object[] indexes)
        { Validate(validate); return access.Get(target, type, member, indexes); }
        private object Call(object target, string type, string member, Action validate, params object[] args)
        { Validate(validate); return access.Call(target, type, member, args); }
        private static void Validate(Action validate) { try { validate(); } catch { Conflict("association_context_changed"); } }
        private static string Text(object value) { return value as string; }
        private static string Digest(string value)
        {
            using (var sha256 = SHA256.Create())
                return string.Concat(sha256.ComputeHash(Encoding.UTF8.GetBytes(value)).Select(b => b.ToString("x2", CultureInfo.InvariantCulture)));
        }
        private static int Number(object value) { return Convert.ToInt32(value, CultureInfo.InvariantCulture); }
        private static bool SameFile(string left, string right) { return string.Equals(left, right, StringComparison.OrdinalIgnoreCase); }
        private static bool CanonicalFile(string path, string extension)
        {
            try { return !string.IsNullOrEmpty(path) && path.Length <= 32767 && Path.IsPathRooted(path) && (path.StartsWith(@"\\", StringComparison.Ordinal) || (path.Length > 2 && path[1] == ':' && path[2] == '\\')) &&
                path.IndexOfAny(new[] { '\r', '\n', '\0', ';' }) < 0 && Path.GetFullPath(path) == path && string.Equals(Path.GetExtension(path), extension, StringComparison.OrdinalIgnoreCase); }
            catch { return false; }
        }
        private static string ProjectPath(string xml)
        {
            if (xml == null || xml.Length > MaxXml) Refuse("project_mapping_xml_limit");
            XDocument document;
            using (var reader = XmlReader.Create(new StringReader(xml), new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = MaxXml }))
                document = XDocument.Load(reader);
            var paths = document.Descendants().Where(e => e.Name.LocalName == "ProjectPath").ToArray();
            if (document.Root == null || document.Root.Name != "TreeItem" || paths.Length != 1 ||
                paths[0].Name != "ProjectPath" || paths[0].HasElements || paths[0].HasAttributes ||
                paths[0].Parent == null || paths[0].Parent.Name != "PlcDef" ||
                paths[0].Parent.Parent != document.Root || document.Root.Elements("PlcDef").Count() != 1 ||
                !CanonicalFile(paths[0].Value, ".plcproj")) Unsupported("unverified_plc_project_mapping");
            return paths[0].Value;
        }
        private static void Refuse(string code) { throw new PlcProjectAssociationException("refused", code); }
        private static void Conflict(string code) { throw new PlcProjectAssociationException("conflict", code); }
        private static void Unsupported(string code) { throw new PlcProjectAssociationException("unsupported", code); }
    }

    internal sealed class ReflectedPlcProjectAssociationAccess : IPlcProjectAssociationAccess
    {
        // Fixed diagnostic identifiers only: never echo arbitrary type names,
        // assembly paths or loader exception messages into provider responses.
        private static readonly Dictionary<string, string> interfaceDiagnostics = new Dictionary<string, string>(StringComparer.Ordinal) {
            { "EnvDTE.DTE", "envdte_dte" },
            { "EnvDTE.Solution", "envdte_solution" },
            { "EnvDTE.Projects", "envdte_projects" },
            { "EnvDTE.Project", "envdte_project" },
            { "EnvDTE.ProjectItems", "envdte_projectitems" },
            { "EnvDTE.ProjectItem", "envdte_projectitem" },
            { "TCatSysManagerLib.ITcSysManager", "tcatsysmanagerlib_itcsysmanager" },
            { "TCatSysManagerLib.ITcSmTreeItem", "tcatsysmanagerlib_itcsmtreeitem" }
        };
        public object Dte { get; private set; }
        private readonly Dictionary<string, Type> types = new Dictionary<string, Type>(StringComparer.Ordinal);
        internal ReflectedPlcProjectAssociationAccess(object dte) { if (dte == null) throw new ArgumentNullException("dte"); Dte = dte; }
        private Type Resolve(string name)
        {
            Type type;
            if (types.TryGetValue(name, out type)) return type;
            Type[] matches;
            try {
                matches = AppDomain.CurrentDomain.GetAssemblies().Where(a => {
                    var assembly = a.GetName().Name;
                    return string.Equals(assembly, "EnvDTE", StringComparison.OrdinalIgnoreCase) || assembly == "Microsoft.VisualStudio.Interop" || assembly == "TCatSysManagerLib" || assembly == "Interop.TCatSysManagerLib";
                }).Select(a => a.GetType(name, false)).Where(t => t != null).Distinct().ToArray();
            }
            catch { throw InteropFailure("inspection_failed", name); }
            if (matches.Length == 0) throw InteropFailure("missing", name);
            if (matches.Length != 1) throw InteropFailure("ambiguous", name);
            types.Add(name, matches[0]); return matches[0];
        }
        private static PlcProjectAssociationException InteropFailure(string reason, string name)
        {
            string identifier;
            if (name == null || !interfaceDiagnostics.TryGetValue(name, out identifier)) identifier = "unknown_interface";
            return new PlcProjectAssociationException("unsupported", "association_interop_" + reason + "_" + identifier);
        }
        public bool Supports(object target, string name) { return target != null && Resolve(name).IsInstanceOfType(target); }
        private static Type Declaring(Type type, string member)
        { return new[] { type }.Concat(type.GetInterfaces()).First(t => t.GetMember(member, BindingFlags.Public | BindingFlags.Instance).Length != 0); }
        public object Get(object target, string name, string member, params object[] indexes)
        {
            var allowed = new[] { "Solution", "FullName", "Projects", "FileName", "Kind", "ProjectItems", "Count", "SubProject", "Object", "Child", "ChildCount" };
            if (!allowed.Contains(member, StringComparer.Ordinal)) throw new PlcProjectAssociationException("unsupported", "association_member_unavailable");
            var type = Resolve(name);
            if (target == null || !type.IsInstanceOfType(target)) throw new PlcProjectAssociationException("unsupported", "association_interface_unavailable");
            return Declaring(type, member).InvokeMember(member, BindingFlags.GetProperty, null, target, indexes, CultureInfo.InvariantCulture);
        }
        public object Call(object target, string name, string member, params object[] args)
        {
            if (!((name == "EnvDTE.Projects" || name == "EnvDTE.ProjectItems") && member == "Item") &&
                !(name == "TCatSysManagerLib.ITcSysManager" && member == "LookupTreeItem" && args.Length == 1 && args[0] is string && (string)args[0] == "TIPC") &&
                !(name == "TCatSysManagerLib.ITcSmTreeItem" && member == "ProduceXml" && args.Length == 1 && args[0] is bool && !(bool)args[0]))
                throw new PlcProjectAssociationException("unsupported", "association_method_unavailable");
            var type = Resolve(name);
            if (target == null || !type.IsInstanceOfType(target)) throw new PlcProjectAssociationException("unsupported", "association_interface_unavailable");
            return Declaring(type, member).InvokeMember(member, BindingFlags.InvokeMethod, null, target, args, CultureInfo.InvariantCulture);
        }
    }
}
