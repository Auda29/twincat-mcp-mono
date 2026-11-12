using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Xml;

namespace TwinCatMcp.Engineering.Host
{
    internal sealed class CustomStReadResult
    {
        internal string ObjectId, Section, Text, ProposedText, Digest, ProposedDigest, ProjectRevision, DirtyState;
        internal int ChangeOffset; internal string DeletedText, InsertedText;
        internal string Source { get { return "liveAttachedDocument"; } }
        internal bool AtomicWriteSupported { get { return false; } }
    }
    // The supplied callback is a trusted host boundary. For every invocation it must
    // prove current canonical moniker, project membership, RDT cookie/docdata, current
    // qualified name and exact POU/method child slot; it must not open a document.
    // All calls must run on the editor-owning thread.
    internal sealed class CustomStReader
    {
        private const int MaxProject = 2 * 1024 * 1024, MaxText = 16384;
        private readonly string project, directory, context;
        private int? pinnedProjectHandle;
        private readonly object gate = new object();
        private readonly Func<string, string, object> getView;
        private readonly Func<string, bool?> dirty;
        private readonly Func<string> currentContext;
        internal CustomStReader(string projectPath, Func<string, string, object> getSectionEditor,
            Func<string, bool?> authoritativeDirty, Func<string> currentContextIdentity, string frozenContextIdentity)
        {
            if (string.IsNullOrWhiteSpace(projectPath) || !Path.IsPathRooted(projectPath) || getSectionEditor == null || authoritativeDirty == null || currentContextIdentity == null || string.IsNullOrWhiteSpace(frozenContextIdentity)) throw new ArgumentException();
            project = Path.GetFullPath(projectPath); directory = Path.GetDirectoryName(project);
            if (!string.Equals(Path.GetExtension(project), ".plcproj", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException();
            getView = getSectionEditor; dirty = authoritativeDirty; currentContext = currentContextIdentity; context = frozenContextIdentity;
        }
        internal CustomStReadResult Read(string objectId, string section) { lock (gate) return Observe(objectId, section, null, false); }
        internal CustomStReadResult Preview(string objectId, string section, string proposedText) { lock (gate) return Observe(objectId, section, proposedText, true); }
        private CustomStReadResult Observe(string objectId, string section, string proposed, bool preview)
        {
            try {
                string path; Guid id;
                if (!Target(objectId, section, out path, out id) || preview && !Valid(proposed) || !Context() || !Safe(project) || !Safe(path) || dirty(project) != false) return null;
                using (var stream = new FileStream(project, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                    var bytes = ReadProject(stream); if (bytes == null || !Member(bytes, path) || dirty(project) != false) return null;
                    string projectHash = Hash(bytes); bool? firstDirty = dirty(path); if (!firstDirty.HasValue) return null;
                    object view = getView(objectId, section); var adapter = CustomStReflection.Create(view);
                    if (adapter == null) return null;
                    int handle = adapter.ProjectHandle();
                    if (handle <= 0 || (pinnedProjectHandle.HasValue && pinnedProjectHandle.Value != handle) || adapter.ObjectGuid() != id || adapter.IsDeclaration() != (section == "declaration")) return null;
                    object editor = adapter.Editor(), document = adapter.Document();
                    if (editor == null || document == null) return null;
                    string text = adapter.Text(document);
                    if (!Valid(text) || !Context() || !Safe(project) || !Safe(path) || dirty(project) != false || dirty(path) != firstDirty || Hash(ReadProject(stream)) != projectHash ||
                        !ReferenceEquals(view, getView(objectId, section)) || !ReferenceEquals(editor, adapter.Editor()) || !ReferenceEquals(document, adapter.Document()) ||
                        adapter.ObjectGuid() != id || adapter.ProjectHandle() != handle || adapter.IsDeclaration() != (section == "declaration") ||
                        !string.Equals(text, adapter.Text(document), StringComparison.Ordinal) || !Context() || dirty(project) != false || dirty(path) != firstDirty) return null;
                    pinnedProjectHandle = handle;
                    int prefix = 0, suffix = 0;
                    if (preview) {
                        while (prefix < text.Length && prefix < proposed.Length && text[prefix] == proposed[prefix]) prefix++;
                        while (suffix < text.Length - prefix && suffix < proposed.Length - prefix && text[text.Length - 1 - suffix] == proposed[proposed.Length - 1 - suffix]) suffix++;
                    }
                    return new CustomStReadResult { ObjectId = objectId, Section = section, Text = text, ProposedText = preview ? proposed : null,
                        ChangeOffset = prefix, DeletedText = preview ? text.Substring(prefix, text.Length - prefix - suffix) : null, InsertedText = preview ? proposed.Substring(prefix, proposed.Length - prefix - suffix) : null,
                        Digest = Hash(Encoding.UTF8.GetBytes(text)), ProposedDigest = preview ? Hash(Encoding.UTF8.GetBytes(proposed)) : null,
                        ProjectRevision = projectHash, DirtyState = firstDirty.Value ? "dirty" : "clean" };
                }
            } catch { return null; }
        }
        private bool Context() { return string.Equals(context, currentContext(), StringComparison.Ordinal); }
        private bool Target(string objectId, string section, out string path, out Guid id)
        {
            path = null; id = Guid.Empty;
            if (objectId == null || objectId.Length > 1024 || (section != "declaration" && section != "implementation")) return false;
            var parts = objectId.Split('|'); if (parts.Length != 3 || !Path.IsPathRooted(parts[0]) || !Guid.TryParseExact(parts[1], "D", out id) || id == Guid.Empty || parts[1] != id.ToString("D") || !Qualified(parts[2])) return false;
            path = Path.GetFullPath(parts[0]);
            return path == parts[0] && Path.GetExtension(path).Equals(".TcPOU", StringComparison.OrdinalIgnoreCase) && path.StartsWith(directory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
        }
        private static bool Qualified(string name) {
            if (string.IsNullOrEmpty(name) || name.Length > 511) return false;
            var segments = name.Split('.'); if (segments.Length < 1 || segments.Length > 2) return false;
            foreach (string s in segments) { if (s.Length == 0 || s.Length > 255 || !(Letter(s[0]) || s[0] == '_')) return false; foreach (char c in s) if (!(Letter(c) || (c >= '0' && c <= '9') || c == '_')) return false; }
            return true;
        }
        private static bool Letter(char c) { return c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z'; }
        internal SourceResult Targets(string moniker)
        {
            lock (gate) try {
                if (string.IsNullOrEmpty(moniker) || moniker.Length > 1024 || !Path.IsPathRooted(moniker) || Path.GetFullPath(moniker) != moniker ||
                    !Path.GetExtension(moniker).Equals(".TcPOU", StringComparison.OrdinalIgnoreCase) || !Context()) return null;
                if (!moniker.StartsWith(directory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || dirty(project) != false || !Safe(project) || !Safe(moniker)) return null;
                using (var membership = new FileStream(project, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                    var projectBytes = ReadProject(membership); if (projectBytes == null || !Member(projectBytes, moniker) || dirty(project) != false) return null;
                }
                byte[] bytes;
                using (var file = new FileStream(moniker, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                    if (file.Length > MaxProject) return null;
                    bytes = new byte[(int)file.Length]; int n = 0; while (n < bytes.Length) { int r = file.Read(bytes, n, bytes.Length - n); if (r == 0) return null; n += r; }
                }
                var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = MaxProject };
                var doc = new XmlDocument { XmlResolver = null };
                using (var reader = XmlReader.Create(new MemoryStream(bytes), settings)) { while (reader.Read()) if (reader.Depth > 32) return null; }
                using (var reader = XmlReader.Create(new MemoryStream(bytes), settings)) doc.Load(reader);
                var root = doc.DocumentElement;
                if (root == null || root.Name != "TcPlcObject" || root.NamespaceURI != "") return null;
                var tops = root.ChildNodes.OfType<XmlElement>().ToArray();
                if (tops.Length != 1 || tops[0].Name != "POU" || !Qualified(tops[0].GetAttribute("Name"))) return null;
                var objects = new[] { tops[0] }.Concat(tops[0].ChildNodes.OfType<XmlElement>().Where(x => x.Name == "Method" || x.Name == "Action")).ToArray();
                if (objects.Length > 64) return null;
                var seen = new HashSet<Guid>(); var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase); var rows = new List<object>();
                string observedDirty = null, projectRevision = null;
                foreach (var item in objects) {
                    Guid id; var name = ReferenceEquals(item, tops[0]) ? item.GetAttribute("Name") : tops[0].GetAttribute("Name") + "." + item.GetAttribute("Name");
                    if (item.NamespaceURI != "" || !Guid.TryParse(item.GetAttribute("Id"), out id) || id == Guid.Empty || !seen.Add(id) || !Qualified(name) || !names.Add(name)) return null;
                    var objectId = moniker + "|" + id.ToString("D") + "|" + name; if (objectId.Length > 1024) return null;
                    var sections = new List<string>();
                    foreach (var section in new[] { "declaration", "implementation" }) {
                        var current = Read(objectId, section); if (current == null) continue;
                        if (observedDirty != null && (observedDirty != current.DirtyState || projectRevision != current.ProjectRevision)) return null;
                        observedDirty = current.DirtyState; projectRevision = current.ProjectRevision; sections.Add(section);
                    }
                    if (sections.Count != 0) rows.Add(new { objectId, qualifiedName = name, kind = item.Name.ToLowerInvariant(), sections = sections.ToArray(), atomicWriteSupported = false });
                }
                var finalDirty = dirty(moniker);
                if (rows.Count == 0 || !Context() || dirty(project) != false || !finalDirty.HasValue || (finalDirty.Value ? "dirty" : "clean") != observedDirty) return null;
                using (var finalProject = new FileStream(project, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                    var finalBytes = ReadProject(finalProject);
                    if (finalBytes == null || Hash(finalBytes) != projectRevision || !Member(finalBytes, moniker) || dirty(project) != false || !Context()) return null;
                }
                return new SourceResult("succeeded", result: new Dictionary<string, object> { { "moniker", moniker }, { "targets", rows.ToArray() }, { "count", rows.Count },
                    { "truncated", false }, { "sourceMode", "customStReadOnly" }, { "identitySource", "persistedObjectMetadataAndNativeView" }, { "applySupported", false }, { "source", "liveBuffer" }, { "dirtyState", observedDirty }, { "projectRevision", projectRevision } });
            } catch { return null; }
        }
        private static bool Valid(string text) { if (text == null || text.Length > MaxText || text.IndexOf('\0') >= 0) return false; try { new UTF8Encoding(false, true).GetByteCount(text); return true; } catch { return false; } }
        private static bool Safe(string p) { while (!string.IsNullOrEmpty(p)) { if ((File.GetAttributes(p) & FileAttributes.ReparsePoint) != 0) return false; var next = Path.GetDirectoryName(p); if (string.IsNullOrEmpty(next) || next == p) break; p = next; } return true; }
        private static byte[] ReadProject(FileStream s) { if (s.Length > MaxProject) return null; s.Position = 0; var b = new byte[(int)s.Length]; int n = 0; while (n < b.Length) { int r = s.Read(b, n, b.Length - n); if (r == 0) return null; n += r; } return b; }
        private static string Hash(byte[] b) { if (b == null) return null; using (var h = SHA256.Create()) return BitConverter.ToString(h.ComputeHash(b)).Replace("-", "").ToLowerInvariant(); }
        private bool Member(byte[] bytes, string source) {
            var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = MaxProject };
            var doc = new XmlDocument { XmlResolver = null }; using (var reader = XmlReader.Create(new MemoryStream(bytes), settings)) { while (reader.Read()) if (reader.Depth > 32) return false; }
            using (var reader = XmlReader.Create(new MemoryStream(bytes), settings)) doc.Load(reader);
            var root = doc.DocumentElement; const string ns = "http://schemas.microsoft.com/developer/msbuild/2003";
            if (root == null || root.LocalName != "Project" || root.HasAttribute("Sdk") || (root.NamespaceURI != "" && root.NamespaceURI != ns) || root.SelectNodes("//*[local-name()='Target' or local-name()='Choose' or local-name()='UsingTask' or local-name()='ItemDefinitionGroup']").Count != 0) return false;
            foreach (XmlNode n in root.SelectNodes("//*")) if (n.LocalName.StartsWith("MSBuildExtensionsPath", StringComparison.OrdinalIgnoreCase) || n.LocalName.StartsWith("DirectoryBuild", StringComparison.OrdinalIgnoreCase) || n.LocalName.StartsWith("ImportDirectoryBuild", StringComparison.OrdinalIgnoreCase)) return false;
            var imports = root.SelectNodes("//*[local-name()='Import']"); if (imports.Count != 1) return false;
            var import = imports[0] as XmlElement;
            if (import == null || import.NamespaceURI != root.NamespaceURI || import.ParentNode != root || import.Attributes.Count != 1 || import.GetAttribute("Project") != @"$(MSBuildExtensionsPath)\Beckhoff\TwinCAT\v3.1\TcPlcProject.targets") return false;
            int count = 0;
            foreach (XmlNode n in root.SelectNodes("//*[local-name()='Compile']")) {
                var e = n as XmlElement;
                if (e == null || e.NamespaceURI != root.NamespaceURI || !e.HasAttribute("Include") || e.HasAttribute("Remove") || e.HasAttribute("Update")) return false;
                string include = e.GetAttribute("Include");
                if (string.IsNullOrWhiteSpace(include) || include.IndexOfAny(new[] { '*', '?', '$', '@', '%', ';', ':' }) >= 0 || Path.IsPathRooted(include)) return false;
                if (string.Equals(Path.GetFullPath(Path.Combine(directory, include)), source, StringComparison.OrdinalIgnoreCase)) {
                    if (e.Attributes.Count != 1 || e.ParentNode == null || e.ParentNode.LocalName != "ItemGroup" || e.ParentNode.NamespaceURI != root.NamespaceURI || e.ParentNode.ParentNode != root || e.ParentNode.Attributes.Count != 0) return false;
                    for (XmlNode p = e; p is XmlElement; p = p.ParentNode) if (((XmlElement)p).HasAttribute("Condition")) return false;
                    count++;
                }
            }
            return count == 1;
        }
    }
}


