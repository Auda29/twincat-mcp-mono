using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Win32.SafeHandles;

namespace TwinCatMcp.Engineering.Host
{
    internal sealed class AutomationStSourceEditor : ISourceEditor
    {
        private const string TreeContract = "TCatSysManagerLib.ITcSmTreeItem";
        private const string RootContract = "TCatSysManagerLib.ITcProjectRoot";
        private const string DeclarationContract = "TCatSysManagerLib.ITcPlcDeclaration";
        private const string ImplementationContract = "TCatSysManagerLib.ITcPlcImplementation";
        private const int PlcApplication = 600, PlcFolder = 601, StructuredText = 1;
        private const int MaxTargets = 512, MaxNodes = 8192, MaxDepth = AutomationSourceCreation.MaxTreeDepth, MaxXml = 1024 * 1024;
        private readonly Type tree, projectRoot, declaration, implementation, dteContract, documents, document;
        private readonly Type textDocument, textPoint, editPoint;
        private readonly object dte;
        private readonly PlcProjectAssociationService association;
        private readonly HostContext bound;
        private readonly Func<string, bool?> authoritativeDirty;
        private readonly Func<string, object> getXmlBuffer;
        private readonly Func<string> currentContext;
        private readonly string context;
        private readonly Dictionary<string, OwnedState> owned = new Dictionary<string, OwnedState>(StringComparer.OrdinalIgnoreCase);
        private bool writing;

        private AutomationStSourceEditor(object dte, EngineeringInteropTypes types, HostContext bound, Func<string, bool?> dirty,
            Func<string, object> getXmlBuffer, Func<string> currentContext, string context)
        {
            this.dte = dte;
            this.bound = bound;
            this.currentContext = currentContext;
            this.context = context;
            this.getXmlBuffer = getXmlBuffer;
            authoritativeDirty = dirty;
            association = new PlcProjectAssociationService(dte, types);
            tree = types.Resolve(TreeContract);
            projectRoot = types.Resolve(RootContract);
            declaration = types.Resolve(DeclarationContract);
            implementation = types.Resolve(ImplementationContract);
            dteContract = types.Resolve("EnvDTE.DTE");
            documents = types.Resolve("EnvDTE.Documents");
            document = types.Resolve("EnvDTE.Document");
            try
            {
                textDocument = types.Resolve("EnvDTE.TextDocument");
                textPoint = types.Resolve("EnvDTE.TextPoint");
                editPoint = types.Resolve("EnvDTE.EditPoint");
            }
            catch (PlcProjectAssociationException) { }
        }

        internal static AutomationStSourceEditor TryCreate(object dte, EngineeringInteropTypes types, HostContext bound,
            Func<string, bool?> dirty, Func<string, object> getXmlBuffer, Func<string> currentContext, string context)
        {
            if (!types.IsAuthoritative) return null;
            try { return new AutomationStSourceEditor(dte, types, bound, dirty, getXmlBuffer, currentContext, context); }
            catch (PlcProjectAssociationException) { return null; }
        }

        // SourcePolicy also supports XML buffers through this seam. Automation
        // compare-and-exchange is checked on the IDE thread with COM readback.
        public bool HasVerifiedAtomicLiveBufferSemantics { get { return true; } }

        internal SourceResult Targets(string moniker)
        {
            if (moniker != null && !CanonicalFile(moniker)) return new SourceResult("refused", "invalid_source_moniker");
            try
            {
                var binding = Resolve();
                var rows = new List<Dictionary<string, object>>();
                var serializer = new JavaScriptSerializer();
                int responseBytes = 0;
                bool truncated = false;
                foreach (var target in Enumerate(binding.Root, null, 0, new VisitBudget()))
                {
                    if (moniker != null && !SameFile(moniker, target.PhysicalFile)) continue;
                    var row = Describe(target);
                    responseBytes += Encoding.UTF8.GetByteCount(serializer.Serialize(row)) + 1;
                    if (rows.Count == MaxTargets || responseBytes > 960 * 1024) { truncated = true; break; }
                    rows.Add(row);
                }
                RequireContext();
                var result = new Dictionary<string, object> { { "moniker", moniker }, { "targets", rows },
                    { "count", rows.Count }, { "truncated", truncated } };
                SourcePolicy.AutomationMetadata(result);
                return new SourceResult("succeeded", result: result);
            }
            catch (PlcProjectAssociationException e) { return new SourceResult(e.Status, e.Code); }
            catch { return new SourceResult("unsupported", "source_targets_unavailable"); }
        }

        public SourceSnapshot Read(string contextIdentity, string objectId, string section, bool isRollback = false)
        {
            if (contextIdentity != context) return null;
            var binding = Resolve();
            var target = FindTarget(binding.Root, objectId);
            if (target == null || !target.Sections.Contains(section)) return null;
            var state = CaptureSource(target, section);
            var stateDigest = state.Digest;
            var dirt = ObserveDirty(target.Owner);
            RequireContext();
            return new SourceSnapshot {
                ContextIdentity = context, ObjectId = objectId, Section = section, Text = state.Text, BufferText = state.Text,
                StateDigest = stateDigest, BufferIdentity = target.Item, ProjectRevision = Revision(binding, target),
                BuildReplacement = value => value, DirtyState = dirt.Label,
                ApplyBlockedByDirtyState = HasXmlBuffer(target.PhysicalFile) || !CanWrite(target, dirt, stateDigest, isRollback), IsVerifiedAutomationSource = true,
                IsExistingStructuredTextObject = true, IsUnambiguousIdentity = true, IsOrdinaryPlcSource = true
            };
        }

        public SourceExchangeOutcome CompareExchange(SourceEditRequest request)
        {
            if (request == null || request.ContextIdentity != context || writing) return SourceExchangeOutcome.Unsupported;
            bool submitted = false;
            writing = true;
            try
            {
                var binding = Resolve();
                var target = FindTarget(binding.Root, request.ObjectId);
                if (target == null || !target.Sections.Contains(request.Section) ||
                    !ReferenceEquals(target.Item, request.BufferIdentity) || Revision(binding, target) != request.ProjectRevision)
                    return SourceExchangeOutcome.Conflict;
                bool xmlOpen = HasXmlBuffer(target.PhysicalFile);
                var dirt = ObserveDirty(target.Owner);
                var state = CaptureSource(target, request.Section);
                var stateDigest = state.Digest;
                if (xmlOpen || !CanWrite(target, dirt, stateDigest, request.IsRollback))
                    return SourceExchangeOutcome.UnsavedEditorChanges;
                if (state.Text != request.ExpectedText || stateDigest != request.ExpectedStateDigest) return SourceExchangeOutcome.Conflict;
                if (!request.AuthorizationCurrent() || !ContextMatches()) return SourceExchangeOutcome.Conflict;

                var replacement = SourcePolicy.NormalizeLf(request.ReplacementText);
                var expectedPost = state.WithReplacement(replacement);
                owned.Remove(target.PhysicalFile);
                submitted = true;
                SetText(target, request.Section, replacement);
                if (GetText(target, request.Section) != replacement) return SourceExchangeOutcome.Unknown;
                var current = FindTarget(binding.Root, request.ObjectId);
                if (current == null || !ReferenceEquals(current.Item, target.Item) ||
                    !ReferenceEquals(current.Owner.Item, target.Owner.Item)) return SourceExchangeOutcome.Unknown;
                var postDigest = CaptureSource(current, request.Section).Digest;
                if (postDigest != expectedPost || !ContextMatches()) return SourceExchangeOutcome.Unknown;

                request.VerifiedPostStateDigest = postDigest;
                var postDirty = ObserveDirty(target.Owner);
                if (!ContextMatches()) return SourceExchangeOutcome.Unknown;
                if (postDirty.Verified)
                    owned[target.PhysicalFile] = new OwnedState { Digest = postDigest, Owner = target.Owner.Item, Dirty = postDirty,
                        AllowsApply = !request.IsRollback };
                return SourceExchangeOutcome.Applied;
            }
            catch (MixedLanguageOwnerException) { return submitted ? SourceExchangeOutcome.Unknown : SourceExchangeOutcome.MixedLanguageOwner; }
            catch { return submitted ? SourceExchangeOutcome.Unknown : SourceExchangeOutcome.Conflict; }
            finally { writing = false; }
        }

        internal SourceResult Create(AutomationSourceCreation request, Func<bool> approve, Func<bool> authorizationCurrent)
        {
            if (writing) return new SourceResult("conflict", "source_mutation_in_progress");
            bool submitted = false;
            writing = true;
            try
            {
                var binding = Resolve();
                var parent = ValidateCreationParent(binding, request, out var destination);
                string parentImage = CreationParentImage(parent, request);
                if (!request.IsMember) RequireAvailableFile(destination);
                if (!approve()) return new SourceResult("refused", "approval_required");
                if (!authorizationCurrent()) return new SourceResult("refused", "approval_expired");

                var current = Resolve();
                var currentParent = ValidateCreationParent(current, request, out var currentDestination);
                if (binding.MappingDigest != current.MappingDigest || !ReferenceEquals(parent.Item, currentParent.Item) ||
                    !string.Equals(destination, currentDestination, StringComparison.Ordinal) || parentImage != CreationParentImage(currentParent, request) ||
                    !authorizationCurrent() || !ContextMatches())
                    return new SourceResult("conflict", "creation_parent_changed");

                if (!request.IsMember) RequireAvailableFile(currentDestination);
                if (!authorizationCurrent()) return new SourceResult("refused", "approval_expired");
                if (!ContextMatches()) return new SourceResult("conflict", "creation_parent_changed");
                submitted = true;
                var item = CreateChild(currentParent, request.Name, request.ItemType, request.CreationInfo());
                var target = MakeTarget(item, request.IsMember ? currentParent : null);
                if (target == null || !SameFile(target.PhysicalFile, currentDestination) || !ContextMatches()) return UnknownCreation();
                var projectDirectory = Path.GetDirectoryName(bound.ProjectFile);
                RequireProjectDescendant(projectDirectory, target.PhysicalFile);
                if (!string.Equals(target.PhysicalFile, currentDestination, StringComparison.Ordinal) &&
                    !string.Equals(FinalPath(target.PhysicalFile), FinalPath(currentDestination), StringComparison.Ordinal))
                    return UnknownCreation();
                if (request.CreateGet) CreateAccessor(target, "Get", 613, request.Access, authorizationCurrent);
                if (request.CreateSet) CreateAccessor(target, "Set", 614, request.Access, authorizationCurrent);
                WriteInitial(target, "declaration", request.Declaration, authorizationCurrent);
                WriteInitial(target, "implementation", request.Implementation, authorizationCurrent);
                if (!ContextMatches() || (request.Declaration != null && GetText(target, "declaration") != request.Declaration) ||
                    (request.Implementation != null && GetText(target, "implementation") != request.Implementation)) return UnknownCreation();
                if (target.TreePath != request.TargetPath || FindTarget(current.Root, target.ObjectId)?.Item != target.Item) return UnknownCreation();
                return new SourceResult("succeeded", result: Describe(target, "fileWrittenProjectPendingSave"));
            }
            catch (MixedLanguageOwnerException) { return submitted ? UnknownCreation() : new SourceResult("unsupported", MixedLanguageOwnerException.ErrorCode); }
            catch (PlcProjectAssociationException e) { return submitted ? UnknownCreation() : new SourceResult(e.Status, e.Code); }
            catch { return submitted ? UnknownCreation() : new SourceResult("refused", "source_creation_preflight_unavailable"); }
            finally { writing = false; }
        }

        private static SourceResult UnknownCreation()
        {
            var result = new Dictionary<string, object>();
            SourcePolicy.AutomationMetadata(result);
            return new SourceResult("unknown", "source_create_outcome_unknown", result);
        }

        private Target ValidateCreationParent(Binding binding, AutomationSourceCreation request, out string destination)
        {
            var segments = request.ParentPath.Split('^');
            if (segments[0] != request.Folder || (request.IsMember && segments.Length < 2))
                throw new PlcProjectAssociationException("refused", "invalid_creation_parent_kind");
            var parent = ResolvePath(binding.Root, segments);
            if (parent == null) throw new PlcProjectAssociationException("refused", "creation_parent_not_found");

            var projectDirectory = Path.GetDirectoryName(bound.ProjectFile);
            if (request.IsMember)
            {
                if (parent.Type != 602 && parent.Type != 604)
                    throw new PlcProjectAssociationException("refused", "invalid_creation_parent_kind");
                parent = MakeTarget(parent, null);
                if (parent == null) throw new PlcProjectAssociationException("refused", "invalid_creation_parent_kind");
                destination = parent.PhysicalFile;
                RequireProjectDescendant(projectDirectory, destination);
            }
            else
            {
                if (parent.Type != PlcFolder) throw new PlcProjectAssociationException("refused", "invalid_creation_parent_kind");
                var directory = CreationDirectory(parent, projectDirectory, segments);
                RequireProjectDescendant(projectDirectory, directory);
                var attributes = ExistingAttributes(directory);
                if (attributes.HasValue) RequireOrdinaryDirectory(attributes);
                var extension = request.ItemType == 606 ? ".TcDUT" : request.ItemType == 615 ? ".TcGVL" : ".TcPOU";
                destination = Path.Combine(directory, request.Name + extension);
                RequireProjectDescendant(projectDirectory, destination);
            }

            if (Children(parent).Any(child => SameFile(child.Name, request.Name)))
                throw new PlcProjectAssociationException("conflict", "object_already_exists");
            return parent;
        }

        private string CreationDirectory(Target parent, string projectDirectory, string[] segments)
        {
            var reported = ReadPhysicalFile(parent);
            if (reported != null) return reported;

            var candidate = Path.Combine(projectDirectory, Path.Combine(segments));
            if (ProjectAttestsFolder(projectDirectory, candidate, segments))
            {
                var siblings = Children(parent).Where(child => child.Type != PlcFolder && !IsMember(child.Type));
                if (siblings.Select(ReadPhysicalFile).Where(file => file != null)
                    .All(file => SameDirectory(candidate, Path.GetDirectoryName(file))))
                    return candidate;
            }
            throw new PlcProjectAssociationException("refused", "creation_parent_path_unverified");
        }

        private string ReadPhysicalFile(Target item)
        {
            RequireContext();
            try { return PhysicalFile(item); }
            catch { return null; }
        }

        private bool ProjectAttestsFolder(string projectDirectory, string candidate, string[] segments)
        {
            try
            {
                RequireProjectDescendant(projectDirectory, bound.ProjectFile);
                byte[] bytes;
                using (var file = File.OpenRead(bound.ProjectFile))
                using (var binary = new BinaryReader(file))
                    bytes = binary.ReadBytes(MaxXml + 1);
                if (bytes.Length > MaxXml) return false;
                using (var reader = XmlReader.Create(new MemoryStream(bytes, writable: false),
                    new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = MaxXml }))
                {
                    var project = XDocument.Load(reader).Root;
                    if (project == null || !project.Name.LocalName.Equals("Project", StringComparison.OrdinalIgnoreCase)) return false;
                    var ns = project.Name.Namespace;
                    if (ns != XNamespace.None && ns != "http://schemas.microsoft.com/developer/msbuild/2003") return false;
                    foreach (var item in project.DescendantsAndSelf())
                    {
                        if (item.Attributes().Where(attribute => attribute.Name.Namespace == XNamespace.None)
                            .GroupBy(attribute => attribute.Name.LocalName, StringComparer.OrdinalIgnoreCase)
                            .Any(attributes => attributes.Skip(1).Any())) return false;

                        var kind = item.Name.LocalName;
                        if (kind.Equals("Link", StringComparison.OrdinalIgnoreCase) && ReferencesFolder(item.Value, projectDirectory, candidate)) return false;
                        if (!kind.Equals("Folder", StringComparison.OrdinalIgnoreCase) &&
                            !kind.Equals("Compile", StringComparison.OrdinalIgnoreCase)) continue;
                        if (Attr(item, "Remove") != null || Attr(item, "Update") != null || Attr(item, "Exclude") != null ||
                            ReferencesFolder(Attr(item, "Link"), projectDirectory, candidate)) return false;

                        var group = item.Parent;
                        if ((group.Parent != project || !IsItemGroup(group, ns) ||
                            Attr(group, "Condition") != null || Attr(item, "Condition") != null) &&
                            ReferencesFolder(Attr(item, "Include"), projectDirectory, candidate)) return false;
                    }
                    var folder = string.Join("\\", segments);
                    var matches = project.Elements().Where(group => IsItemGroup(group, ns) && Attr(group, "Condition") == null)
                        .Elements().Select(item => AttestedFolder(item, folder)).Where(include => include != null)
                        .Distinct(StringComparer.Ordinal).ToArray();
                    return matches.Length > 0 && matches.All(include => SameDirectory(candidate, Path.Combine(projectDirectory, include)));
                }
            }
            catch { return false; }
        }

        private static bool IsItemGroup(XElement element, XNamespace ns)
        {
            return element.Name.Namespace == ns && element.Name.LocalName.Equals("ItemGroup", StringComparison.OrdinalIgnoreCase);
        }

        private static string Attr(XElement element, string name)
        {
            return (string)element.Attributes().FirstOrDefault(attribute => attribute.Name.Namespace == XNamespace.None &&
                attribute.Name.LocalName.Equals(name, StringComparison.OrdinalIgnoreCase));
        }

        private static bool ReferencesFolder(string paths, string projectDirectory, string candidate)
        {
            if (string.IsNullOrWhiteSpace(paths)) return false;
            // Project expressions and wildcards cannot establish which paths they affect without MSBuild evaluation.
            if (paths.IndexOfAny(new[] { '$', '@', '%', '*', '?' }) >= 0) return true;
            foreach (var path in paths.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var fullPath = Path.GetFullPath(Path.Combine(projectDirectory, path.Trim().Replace('/', '\\'))).TrimEnd('\\');
                if (SameFile(fullPath, candidate) || fullPath.StartsWith(candidate + "\\", StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        private static string AttestedFolder(XElement item, string folder)
        {
            var kind = item.Name.LocalName;
            var isFolder = kind.Equals("Folder", StringComparison.OrdinalIgnoreCase);
            if (item.Name.Namespace != item.Parent.Name.Namespace || (!isFolder && !kind.Equals("Compile", StringComparison.OrdinalIgnoreCase)) ||
                Attr(item, "Condition") != null || Attr(item, "Link") != null ||
                item.Elements().Any(element => element.Name.LocalName.Equals("Link", StringComparison.OrdinalIgnoreCase))) return null;
            var include = Attr(item, "Include")?.Replace('/', '\\');
            if (string.IsNullOrEmpty(include) || Path.IsPathRooted(include) || include.IndexOfAny(Path.GetInvalidPathChars()) >= 0 ||
                include.IndexOfAny(new[] { ':', '*', '?', ';', '$', '@', '%' }) >= 0) return null;
            if (isFolder && include.EndsWith("\\", StringComparison.Ordinal))
                include = include.Substring(0, include.Length - 1);
            if (include.Split('\\').Any(segment => segment.Length == 0 || segment == "." || segment == ".." ||
                segment.EndsWith(".", StringComparison.Ordinal) || segment.Trim() != segment)) return null;
            if (isFolder) return SameFile(include, folder) ? include : null;
            return include.StartsWith(folder + "\\", StringComparison.OrdinalIgnoreCase) ? include.Substring(0, folder.Length) : null;
        }

        private static bool SameDirectory(string left, string right)
        {
            if (string.Equals(left, right, StringComparison.Ordinal)) return true;
            if (!SameFile(left, right) || !Directory.Exists(left) || !Directory.Exists(right)) return false;
            try { return string.Equals(FinalPath(left), FinalPath(right), StringComparison.Ordinal); }
            catch (PlcProjectAssociationException) { return false; }
        }

        private static void RequireProjectDescendant(string projectDirectory, string path)
        {
            var root = Path.GetFullPath(projectDirectory);
            var separator = Path.DirectorySeparatorChar;
            var prefix = root.TrimEnd(separator) + separator;
            if (!CanonicalFile(path) || path.Length <= prefix.Length || !path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                throw OutsideProject();

            var rootAttributes = ExistingAttributes(root);
            if (!rootAttributes.HasValue)
            {
                if (!path.StartsWith(prefix, StringComparison.Ordinal)) throw OutsideProject();
                return;
            }
            RequireOrdinaryDirectory(rootAttributes);
            var finalRoot = FinalPath(root);

            // Use the candidate's spelling from the volume root onward. Its project
            // prefix can resolve to a different entry on a case-sensitive parent.
            var current = path.Substring(0, root.Length);
            RequireOrdinaryDirectory(ExistingAttributes(current));
            if (!string.Equals(FinalPath(current), finalRoot, StringComparison.Ordinal)) throw OutsideProject();

            var deepest = current;
            var segments = path.Substring(prefix.Length).Split(separator);
            for (int i = 0; i < segments.Length; i++)
            {
                current = Path.Combine(current, segments[i]);
                var attributes = ExistingAttributes(current);
                if (!attributes.HasValue) break;
                if ((attributes.Value & FileAttributes.ReparsePoint) != 0) throw OutsideProject();
                if ((attributes.Value & FileAttributes.Directory) == 0 && i != segments.Length - 1) throw OutsideProject();
                deepest = current;
            }
            var finalAncestor = FinalPath(deepest);
            if (!string.Equals(finalAncestor, finalRoot, StringComparison.Ordinal) &&
                !finalAncestor.StartsWith(finalRoot + separator, StringComparison.Ordinal)) throw OutsideProject();
        }

        private static FileAttributes? ExistingAttributes(string path)
        {
            try { return File.GetAttributes(path); }
            catch (FileNotFoundException) { return null; }
            catch (DirectoryNotFoundException) { return null; }
        }

        private static void RequireOrdinaryDirectory(FileAttributes? attributes)
        {
            if (!attributes.HasValue || (attributes.Value & (FileAttributes.ReparsePoint | FileAttributes.Directory)) != FileAttributes.Directory)
                throw OutsideProject();
        }

        private static PlcProjectAssociationException OutsideProject()
        {
            return new PlcProjectAssociationException("refused", "creation_path_outside_project");
        }

        private static string FinalPath(string path)
        {
            const uint shareReadWriteDelete = 7, openExisting = 3, backupSemantics = 0x02000000;
            using (var handle = CreateFileW(path, 0, shareReadWriteDelete, IntPtr.Zero, openExisting, backupSemantics, IntPtr.Zero))
            {
                if (handle.IsInvalid) throw OutsideProject();
                var finalPath = new StringBuilder(32768);
                var length = GetFinalPathNameByHandleW(handle, finalPath, (uint)finalPath.Capacity, 0);
                if (length == 0 || length >= finalPath.Capacity) throw OutsideProject();
                return finalPath.ToString().TrimEnd(Path.DirectorySeparatorChar);
            }
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        private static extern SafeFileHandle CreateFileW(string path, uint access, uint sharing, IntPtr security,
            uint disposition, uint flags, IntPtr template);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        private static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder path, uint capacity, uint flags);

        private static void RequireAvailableFile(string path)
        {
            if (File.Exists(path) || Directory.Exists(path))
                throw new PlcProjectAssociationException("conflict", "target_file_already_exists");

            // TwinCAT names are case-insensitive even in a case-sensitive Windows directory.
            var name = Path.GetFileName(path);
            try
            {
                if (Directory.EnumerateFileSystemEntries(Path.GetDirectoryName(path)).Any(entry => SameFile(Path.GetFileName(entry), name)))
                    throw new PlcProjectAssociationException("conflict", "target_file_already_exists");
            }
            catch (DirectoryNotFoundException) { }
        }

        private string CreationParentImage(Target parent, AutomationSourceCreation request)
        {
            if (!request.IsMember) return null;
            var digest = CaptureSource(parent, "declaration").Digest;
            if (!ObserveDirty(parent).Clean || HasXmlBuffer(parent.PhysicalFile))
                throw new PlcProjectAssociationException("conflict", "unsaved_editor_changes");
            return digest;
        }

        private Target CreateChild(Target parent, string name, int itemType, string[] info)
        {
            RequireContext();
            var created = InteropMemberAccess.Call(tree, parent.Item, "CreateChild", name, itemType, "", info);
            var child = Node(created, parent.TreePath + "^", parent.Depth + 1);
            if (child.Name != name || child.Type != itemType) throw new InvalidOperationException();
            return child;
        }

        private void CreateAccessor(Target property, string name, int itemType, string access, Func<bool> authorizationCurrent)
        {
            if (!authorizationCurrent()) throw new InvalidOperationException();
            var accessor = MakeTarget(CreateChild(property, name, itemType, new[] { "ST", access }), property.Owner);
            if (accessor == null || accessor.Sections.Length != 2) throw new InvalidOperationException();
        }

        private void WriteInitial(Target target, string section, string text, Func<bool> authorizationCurrent)
        {
            if (text == null) return;
            if (!authorizationCurrent() || !target.Sections.Contains(section)) throw new InvalidOperationException();
            RequireContext();
            SetText(target, section, text);
            if (GetText(target, section) != text) throw new InvalidOperationException();
        }

        private Binding Resolve()
        {
            object nested = null;
            var result = association.Resolve(bound.SolutionFile, bound.ProjectFile, RequireContext, (_, plc, __, ___) => {
                if (ItemType(plc) != 56 || !projectRoot.IsInstanceOfType(plc)) return;
                nested = InteropMemberAccess.Get(projectRoot, plc, "NestedProject");
            });
            if (result.Status != "succeeded") throw new PlcProjectAssociationException(result.Status, result.ErrorCode);
            if (nested == null || ItemType(nested) != PlcApplication)
                throw new PlcProjectAssociationException("unsupported", "nested_plc_project_unavailable");
            return new Binding { Root = new Target { Item = nested, Type = PlcApplication, TreePath = "" }, MappingDigest = result.MappingDigest };
        }

        private Target FindTarget(Target root, string id)
        {
            if (id == null || id.Length > 1024) return null;
            var parts = id.Split('|');
            if (parts.Length != 2 || !CanonicalFile(parts[0]) || !AutomationSourceCreation.ValidTreePath(parts[1])) return null;
            return ResolvePath(root, parts[1].Split('^'), source: true) is Target target && target.ObjectId == id ? target : null;
        }

        private Target ResolvePath(Target root, string[] segments, bool source = false)
        {
            if (segments.Length > MaxDepth) return null;
            var current = root;
            Target owner = null;
            for (int index = 0; index < segments.Length; index++)
            {
                var segment = segments[index];
                var matches = Children(current).Where(child => string.Equals(child.Name, segment, StringComparison.OrdinalIgnoreCase)).ToArray();
                if (matches.Length != 1 || matches[0].Name != segment) return null;
                current = matches[0];
                if (current.Type == PlcFolder && owner == null) continue;
                if (!source) {
                    if (index != segments.Length - 1) return null;
                    continue;
                }
                current = MakeTarget(current, owner);
                if (current == null) return null;
                owner = current.Owner;
            }
            return current;
        }

        private IEnumerable<Target> Enumerate(Target node, Target owner, int depth, VisitBudget budget, bool completeOwner = false)
        {
            if (depth >= MaxDepth && !completeOwner) yield break;
            var children = Children(node, completeOwner).ToLookup(child => child.Name, StringComparer.OrdinalIgnoreCase);
            if (depth >= MaxDepth && children.Count > 0)
                throw new PlcProjectAssociationException("refused", "source_tree_limit");
            foreach (var siblings in children)
            {
                if (siblings.Count() != 1)
                {
                    if (completeOwner) throw new MixedLanguageOwnerException();
                    continue;
                }
                var child = siblings.Single();
                if (--budget.Remaining < 0) throw new PlcProjectAssociationException("refused", "source_tree_limit");
                if (child.Type == PlcFolder && owner == null)
                {
                    foreach (var nested in Enumerate(child, null, depth + 1, budget)) yield return nested;
                    continue;
                }
                var target = MakeTarget(child, owner);
                if (target == null)
                {
                    if (completeOwner) throw new MixedLanguageOwnerException();
                    continue;
                }
                yield return target;
                foreach (var nested in Enumerate(target, target.Owner, depth + 1, budget, completeOwner)) yield return nested;
            }
        }

        private IEnumerable<Target> Children(Target parent, bool completeOwner = false)
        {
            RequireContext();
            var count = (int)InteropMemberAccess.Get(tree, parent.Item, "ChildCount");
            if (count < 0 || count > MaxNodes) throw new PlcProjectAssociationException("refused", "source_tree_limit");
            var children = new List<Target>();
            var prefix = parent.TreePath.Length == 0 ? "" : parent.TreePath + "^";
            for (int i = 1; i <= count; i++)
            {
                RequireContext();
                var child = InteropMemberAccess.Get(tree, parent.Item, "Child", i);
                var name = (string)InteropMemberAccess.Get(tree, child, "Name");
                if (name == null || name.IndexOf('^') >= 0 || !AutomationSourceCreation.ValidTreePath(prefix + name))
                {
                    if (completeOwner) throw new MixedLanguageOwnerException();
                    continue;
                }
                children.Add(new Target { Item = child, Name = name, TreePath = prefix + name, Type = ItemType(child), Depth = parent.Depth + 1 });
            }
            return children;
        }

        private Target Node(object item, string prefix, int depth)
        {
            var name = (string)InteropMemberAccess.Get(tree, item, "Name");
            if (name == null || name.IndexOf('^') >= 0 || !AutomationSourceCreation.ValidTreePath(prefix + name)) throw new InvalidOperationException();
            return new Target { Item = item, Name = name, TreePath = prefix + name, Type = ItemType(item), Depth = depth };
        }

        private int ItemType(object item) { return (int)InteropMemberAccess.Get(tree, item, "ItemType"); }

        private Target MakeTarget(Target node, Target owner)
        {
            var kind = Kind(node.Type);
            if (IsMember(node.Type) != (owner != null)) return null;
            bool hasImplementation = implementation.IsInstanceOfType(node.Item);
            bool hasDeclaration = declaration.IsInstanceOfType(node.Item);
            if (hasImplementation && (kind == null || !IsStructuredText(node)) ||
                (node.Type >= 602 && node.Type <= 604 && !hasImplementation) ||
                (!hasDeclaration && !hasImplementation)) return null;

            var physical = owner == null ? PhysicalFile(node) : owner.PhysicalFile;
            if (physical == null || physical.Length + node.TreePath.Length + 1 > 1024) return null;
            if (owner == null)
            {
                var extension = Path.GetExtension(physical);
                // Declaration-only user-defined types and interfaces may use
                // additional item types in other TwinCAT interop versions.
                if (kind == null) kind = SameFile(extension, ".TcDUT") ? "dut" : SameFile(extension, ".TcIO") ? "pou" : null;
                if (kind == null || !SourceExtensionMatches(node.Type, kind, extension)) return null;
            }
            var sections = new List<string>();
            if (hasDeclaration) sections.Add("declaration");
            if (hasImplementation) sections.Add("implementation");
            node.Owner = owner ?? node;
            node.PhysicalFile = physical;
            node.Kind = kind;
            node.Sections = sections.ToArray();
            return node;
        }

        private static bool SourceExtensionMatches(int itemType, string kind, string extension)
        {
            if (kind == "dut") return SameFile(extension, ".TcDUT");
            if (kind == "gvl") return SameFile(extension, ".TcGVL");
            if (itemType >= 602 && itemType <= 604) return SameFile(extension, ".TcPOU");
            return SameFile(extension, ".TcIO");
        }

        private bool IsStructuredText(Target target)
        {
            if (!implementation.IsInstanceOfType(target.Item)) return false;
            var language = InteropMemberAccess.Get(implementation, target.Item, "Language");
            return language != null && Convert.ToInt32(language) == StructuredText;
        }

        private static bool IsMember(int type) { return type >= 608 && type <= 614 || type == 654 || type == 655; }

        private static string Kind(int itemType)
        {
            switch (itemType)
            {
                case 602: case 603: case 604: case 618: return "pou";
                case 605: case 606: case 607: case 623: return "dut";
                case 608: return "action";
                case 609: case 610: return "method";
                case 611: case 612: return "property";
                case 613: case 654: return "property_get";
                case 614: case 655: return "property_set";
                case 615: return "gvl";
                default: return null;
            }
        }

        private string PhysicalFile(Target target)
        {
            var xml = InteropMemberAccess.Call(tree, target.Item, "ProduceXml", false) as string;
            if (string.IsNullOrEmpty(xml)) return null;
            if (xml.Length > MaxXml) return null;
            XDocument parsed;
            using (var reader = XmlReader.Create(new StringReader(xml), new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = MaxXml }))
                parsed = XDocument.Load(reader);
            if (parsed.Root == null || parsed.Root.Name.LocalName != "TreeItem") return null;
            var properties = parsed.Descendants().Where(e => e.Name.LocalName == "VSProperty");
            var paths = target.Type == PlcFolder
                ? properties.SelectMany(FolderPathProperties)
                    .Concat(parsed.Root.DescendantsAndSelf().Where(e => e.Name.LocalName == "FullPath").Select(e => e.Value))
                    .Concat(parsed.Root.DescendantsAndSelf().Attributes().Where(a => a.Name.LocalName == "FullPath").Select(a => a.Value))
                : properties.Select(FullPathProperty);
            var distinctPaths = paths.Where(value => value != null).Distinct(StringComparer.Ordinal).ToArray();
            return distinctPaths.Length == 1 && CanonicalFile(distinctPaths[0]) ? distinctPaths[0] : null;
        }

        private static IEnumerable<string> FolderPathProperties(XElement element)
        {
            bool named = element.Attributes().Any(a => (a.Name.LocalName == "Name" || a.Name.LocalName == "name") && a.Value == "FullPath") ||
                element.Elements().Any(e => e.Name.LocalName == "Name" && e.Value == "FullPath");
            if (!named) return Enumerable.Empty<string>();
            var values = element.Attributes().Where(a => a.Name.LocalName == "Value" || a.Name.LocalName == "value").Select(a => a.Value)
                .Concat(element.Elements().Where(e => e.Name.LocalName == "Value").Select(e => e.Value))
                .Concat(element.Nodes().OfType<XText>().Select(text => text.Value).Where(text => !string.IsNullOrWhiteSpace(text)));
            return values.DefaultIfEmpty("");
        }

        private static string FullPathProperty(XElement element)
        {
            var propertyName = (string)element.Attribute("Name") ?? (string)element.Attribute("name") ??
                (string)element.Element("Name");
            if (propertyName == "FullPath")
                return (string)element.Attribute("Value") ?? (string)element.Attribute("value") ??
                    (string)element.Element("Value") ?? element.Value;
            return (string)element.Attribute("FullPath") ?? (string)element.Element("FullPath");
        }

        private bool CanWrite(Target target, DirtyEvidence dirty, string image, bool rollback)
        {
            if (!dirty.Verified) return false;
            if (dirty.Clean) return true;
            OwnedState state;
            // An already-dirty native document can change without toggling Saved.
            // Its independent text evidence must still match the post-write observation.
            return owned.TryGetValue(target.PhysicalFile, out state) && ReferenceEquals(state.Owner, target.Owner.Item) &&
                state.Digest == image && (rollback || state.AllowsApply) && state.Dirty.Matches(dirty);
        }

        private bool HasXmlBuffer(string path) { return getXmlBuffer != null && VsTextBufferAdapter.TryCreate(getXmlBuffer(path)) != null; }

        private DirtyEvidence ObserveDirty(Target owner)
        {
            var path = owner.PhysicalFile;
            try
            {
                RequireContext();
                var dirty = authoritativeDirty(path);
                var collection = InteropMemberAccess.Get(dteContract, dte, "Documents");
                var count = (int)InteropMemberAccess.Get(documents, collection, "Count");
                if (count < 0 || count > 512) return new DirtyEvidence();
                var unsaved = new List<UnsavedDocument>();
                HashSet<string> memberMonikers = null;
                for (int i = 1; i <= count; i++)
                {
                    RequireContext();
                    var entry = InteropMemberAccess.Call(documents, collection, "Item", i);
                    var fullName = InteropMemberAccess.Get(document, entry, "FullName") as string;
                    bool exact = SameFile(fullName, path);
                    bool member = fullName != null && fullName.Length > path.Length &&
                        fullName.StartsWith(path + ";", StringComparison.OrdinalIgnoreCase) && !File.Exists(fullName);
                    if ((!exact && !member) || (bool)InteropMemberAccess.Get(document, entry, "Saved")) continue;
                    var suffix = exact ? "" : fullName.Substring(path.Length + 1);
                    if (suffix.Length > 0 && memberMonikers == null) memberMonikers = MemberMonikers(owner);
                    bool identifiesText = exact || (suffix.Length > 0 && memberMonikers.Contains(suffix));
                    unsaved.Add(new UnsavedDocument { Identity = entry, Moniker = fullName,
                        TextDigest = identifiesText ? ObserveDocumentText(entry) : null });
                }
                return new DirtyEvidence { HostDirty = dirty, Unsaved = unsaved.ToArray() };
            }
            catch { return new DirtyEvidence(); }
        }

        private HashSet<string> MemberMonikers(Target owner)
        {
            var monikers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var member in Enumerate(owner, owner, owner.Depth, new VisitBudget(), completeOwner: true))
            {
                monikers.Add(member.Name);
                monikers.Add(member.TreePath);
                var relative = member.TreePath.Substring(owner.TreePath.Length + 1);
                monikers.Add(relative);
                monikers.Add(relative.Replace('^', '.'));
            }
            return monikers;
        }

        private string ObserveDocumentText(object entry)
        {
            if (editPoint == null) return null;
            try
            {
                var documentText = InteropMemberAccess.Call(document, entry, "Object", "TextDocument");
                if (documentText == null || !textDocument.IsInstanceOfType(documentText)) return null;
                var end = InteropMemberAccess.Get(textDocument, documentText, "EndPoint");
                if ((int)InteropMemberAccess.Get(textPoint, end, "AbsoluteCharOffset") > SourcePolicy.MaxBufferLength) return null;
                var start = InteropMemberAccess.Get(textDocument, documentText, "StartPoint");
                var edit = InteropMemberAccess.Call(textPoint, start, "CreateEditPoint");
                var text = InteropMemberAccess.Call(editPoint, edit, "GetText", end) as string;
                return text != null && text.Length <= SourcePolicy.MaxBufferLength ? SourcePolicy.Digest(SourcePolicy.NormalizeLf(text)) : null;
            }
            catch { return null; }
        }

        private FileImage CaptureSource(Target target, string section)
        {
            var owner = target.Owner;
            var image = new FileImage();
            var budget = new VisitBudget();
            int total = 0;
            foreach (var item in new[] { owner }.Concat(Enumerate(owner, owner, owner.Depth, budget, completeOwner: true)).OrderBy(x => x.TreePath, StringComparer.Ordinal))
            {
                foreach (var part in item.Sections)
                {
                    var text = GetText(item, part);
                    if (text == null || (total += text.Length) > SourcePolicy.MaxBufferLength) throw new InvalidOperationException();
                    if (item.TreePath == target.TreePath && part == section)
                    {
                        if (image.Selected >= 0) throw new InvalidOperationException();
                        image.Selected = image.Parts.Count + 2;
                    }
                    image.Parts.Add(item.TreePath);
                    image.Parts.Add(part);
                    image.Parts.Add(text);
                }
            }
            if (image.Selected < 0) throw new InvalidOperationException();
            return image;
        }

        private string GetText(Target target, string section)
        {
            RequireContext();
            return SourcePolicy.NormalizeLf(InteropMemberAccess.Get(section == "declaration" ? declaration : implementation,
                target.Item, section == "declaration" ? "DeclarationText" : "ImplementationText") as string);
        }

        private void SetText(Target target, string section, string text)
        {
            InteropMemberAccess.SetString(section == "declaration" ? declaration : implementation,
                target.Item, section == "declaration" ? "DeclarationText" : "ImplementationText", text);
        }

        private static Dictionary<string, object> Describe(Target target, string persistence = "mayPersistToDisk")
        {
            var qualified = target.TreePath.Split('^');
            var name = string.Join(".", qualified.Skip(target.Owner.Depth - 1));
            var row = new Dictionary<string, object> { { "objectId", target.ObjectId }, { "qualifiedName", name }, { "kind", target.Kind },
                { "sections", target.Sections }, { "language", "ST" }, { "treePath", target.TreePath }, { "physicalFile", target.PhysicalFile } };
            SourcePolicy.AutomationMetadata(row, persistence);
            return row;
        }

        private static string Revision(Binding binding, Target target) { return SourcePolicy.Fingerprint(binding.MappingDigest, target.ObjectId); }
        private bool ContextMatches() { return context != null && currentContext() == context; }
        private void RequireContext()
        {
            if (!ContextMatches()) throw new PlcProjectAssociationException("conflict", "context_changed");
        }

        private static bool SameFile(string left, string right) { return string.Equals(left, right, StringComparison.OrdinalIgnoreCase); }
        private static bool CanonicalFile(string path)
        {
            try { return !string.IsNullOrEmpty(path) && path.Length <= 1024 &&
                (path.StartsWith(@"\\", StringComparison.Ordinal) || (path.Length > 2 && path[1] == ':' && path[2] == '\\')) &&
                path.IndexOf('|') < 0 && !path.Any(char.IsControl) && Path.GetFullPath(path) == path; }
            catch { return false; }
        }

        private sealed class VisitBudget { internal int Remaining = MaxNodes; }
        private sealed class Binding { internal Target Root; internal string MappingDigest; }
        private sealed class Target
        {
            internal object Item;
            internal Target Owner;
            internal int Type, Depth;
            internal string Name, TreePath, PhysicalFile, Kind;
            internal string[] Sections;
            internal string ObjectId { get { return PhysicalFile == null ? null : PhysicalFile + "|" + TreePath; } }
        }
        private sealed class FileImage
        {
            internal readonly List<string> Parts = new List<string>();
            internal int Selected = -1;
            internal string Text { get { return Parts[Selected]; } }
            internal string Digest { get { return SourcePolicy.Fingerprint(Parts.ToArray()); } }
            internal string WithReplacement(string replacement)
            {
                var copy = Parts.ToArray();
                copy[Selected] = replacement;
                return SourcePolicy.Fingerprint(copy);
            }
        }
        private sealed class OwnedState { internal bool AllowsApply; internal string Digest; internal object Owner; internal DirtyEvidence Dirty; }
        private sealed class UnsavedDocument { internal object Identity; internal string Moniker, TextDigest; }
        private sealed class DirtyEvidence
        {
            internal bool? HostDirty;
            internal UnsavedDocument[] Unsaved;
            internal bool Verified { get { return Unsaved != null && (HostDirty.HasValue || Unsaved.Length != 0); } }
            internal bool Clean { get { return HostDirty == false && Unsaved != null && Unsaved.Length == 0; } }
            internal string Label { get { return Clean ? "clean" : Verified ? "dirty" : "unknown"; } }
            internal bool Matches(DirtyEvidence current)
            {
                return Verified && current.Verified && HostDirty == current.HostDirty && Unsaved.Length > 0 && Unsaved.Length == current.Unsaved.Length &&
                    Unsaved.All(entry => current.Unsaved.Any(item => ReferenceEquals(entry.Identity, item.Identity) &&
                        entry.Moniker == item.Moniker && entry.TextDigest != null && entry.TextDigest == item.TextDigest));
            }
        }
    }
}
