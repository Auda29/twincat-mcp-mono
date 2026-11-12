using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Xml;

namespace TwinCatMcp.Engineering.Host
{
    // Caller must establish the compiler's exact section and coordinate semantics;
    // an ordinary compiler line number is not such proof.
    internal enum BuildSourceCoordinates { Unknown, OneBasedSectionText }
    internal sealed class BuildSourceEvidence
    {
        internal string Status, File, Sha256, QualifiedName, Section, SectionProvenance, Text;
        internal Guid ObjectId;
        internal int Line, Column;
        internal bool CoordinateVerified { get { return Status == "verified"; } }
    }
    internal sealed partial class BuildSourceBaseline
    {
        private const int MaxProject = 1024 * 1024, MaxSource = 2 * 1024 * 1024, MaxTotal = 16 * 1024 * 1024, MaxFiles = 256;
        private sealed class Entry { internal string Path, Hash; internal byte[] Bytes; }
        private readonly string project, root, projectHash;
        private readonly Dictionary<string, Entry> members;
        private BuildSourceBaseline(string project, string root, string hash, Dictionary<string, Entry> members)
        { this.project = project; this.root = root; projectHash = hash; this.members = members; }

        internal static BuildSourceBaseline Capture(string projectPath, Func<string, bool?> authoritativeDirty)
        {
            try {
                if (authoritativeDirty == null || string.IsNullOrWhiteSpace(projectPath) || !Path.IsPathRooted(projectPath)) return null;
                string project = Path.GetFullPath(projectPath), root = Path.GetDirectoryName(project);
                if (!string.Equals(Path.GetExtension(project), ".plcproj", StringComparison.OrdinalIgnoreCase) || !SafePath(project) || !Clean(authoritativeDirty, project)) return null;
                byte[] projectBytes = ReadBounded(project, MaxProject);
                if (projectBytes == null || !Clean(authoritativeDirty, project)) return null;
                XmlDocument doc = Parse(projectBytes, MaxProject);
                var rootElement = doc.DocumentElement;
                const string msbuild = "http://schemas.microsoft.com/developer/msbuild/2003";
                if (rootElement == null || rootElement.LocalName != "Project" || rootElement.HasAttribute("Sdk") ||
                    (rootElement.NamespaceURI != "" && rootElement.NamespaceURI != msbuild) ||
                    rootElement.SelectNodes("//*[local-name()='Target' or local-name()='Choose' or local-name()='UsingTask' or local-name()='ItemDefinitionGroup']").Count != 0) return null;
                var entries = new Dictionary<string, Entry>(StringComparer.OrdinalIgnoreCase);
                long total = projectBytes.Length;
                foreach (XmlNode node in doc.SelectNodes("//*[local-name()='Compile']")) {
                    var e = node as XmlElement;
                    if (e == null || e.NamespaceURI != rootElement.NamespaceURI || e.ParentNode == null || e.ParentNode.LocalName != "ItemGroup" || e.ParentNode.NamespaceURI != rootElement.NamespaceURI || e.ParentNode.ParentNode != rootElement ||
                        e.HasAttribute("Condition") || ((XmlElement)e.ParentNode).HasAttribute("Condition") || e.Attributes.Count != 1 || !e.HasAttribute("Include") || !ValidCompileMetadata(e)) return null;
                    string include = e.GetAttribute("Include");
                    if (string.IsNullOrWhiteSpace(include) || include.IndexOfAny(new[] { '*', '?', '$', '@', '%', ';', '|', ':' }) >= 0 || Path.IsPathRooted(include)) return null;
                    string path = Path.GetFullPath(Path.Combine(root, include));
                    if (!Within(root, path) || !SafePath(path) || !SourceExtension(path) || entries.ContainsKey(path) || entries.Count >= MaxFiles || !Clean(authoritativeDirty, path)) return null;
                    byte[] bytes = ReadBounded(path, MaxSource);
                    if (bytes == null || !Clean(authoritativeDirty, path) || (total += bytes.Length) > MaxTotal) return null;
                    entries.Add(path, new Entry { Path = path, Bytes = bytes, Hash = Hash(bytes) });
                }
                // Verify all inputs once more after the last read.
                if (entries.Count == 0 || !Unchanged(project, Hash(projectBytes), authoritativeDirty) || entries.Values.Any(x => !Unchanged(x.Path, x.Hash, authoritativeDirty))) return null;
                return new BuildSourceBaseline(project, root, Hash(projectBytes), entries);
            } catch (Exception e) when (Expected(e)) { return null; }
        }

        internal BuildSourceEvidence Evaluate(string reportedPhysicalPath, Guid objectId, string qualifiedName,
            string exactSectionDiscriminator, BuildSourceCoordinates coordinates, int line, int column, Func<string, bool?> authoritativeDirty)
        {
            var result = new BuildSourceEvidence { Status = "unavailable" };
            try {
                if (authoritativeDirty == null || string.IsNullOrEmpty(reportedPhysicalPath) || !Path.IsPathRooted(reportedPhysicalPath)) return result;
                string path = Path.GetFullPath(reportedPhysicalPath); Entry entry;
                if (!Within(root, path) || !members.TryGetValue(path, out entry) || !SafePath(path)) return result;
                result.File = entry.Path; result.Sha256 = entry.Hash;
                if (!Unchanged(project, projectHash, authoritativeDirty) || members.Values.Any(x => !Unchanged(x.Path, x.Hash, authoritativeDirty))) { result.Status = "stale"; return result; }
                if (objectId == Guid.Empty || string.IsNullOrEmpty(qualifiedName)) { result.Status = "object_unknown"; return result; }
                result.ObjectId = objectId; result.QualifiedName = qualifiedName;
                if (exactSectionDiscriminator != "declaration" && exactSectionDiscriminator != "implementation") { result.Status = "section_unknown"; return result; }
                result.Section = exactSectionDiscriminator; result.SectionProvenance = "caller_exact_discriminator";
                string section = Map(entry.Bytes, entry.Path, objectId, qualifiedName, exactSectionDiscriminator);
                if (section == null) { result.Status = "mapping_unavailable"; return result; }
                result.Text = section;
                if (coordinates != BuildSourceCoordinates.OneBasedSectionText || !ValidCoordinate(section, line, column)) { result.Status = "coordinate_unproven"; return result; }
                result.Line = line; result.Column = column; result.Status = "verified"; return result;
            } catch (Exception e) when (Expected(e)) { return result; }
        }

        private static string Map(byte[] bytes, string path, Guid id, string name, string section)
        {
            var xml = new UTF8Encoding(false, true).GetString(bytes);
            if (xml.Length > 0 && xml[0] == '\uFEFF') xml = xml.Substring(1);
            var doc = Parse(bytes, MaxSource); var root = doc.DocumentElement;
            if (root == null || root.Name != "TcPlcObject" || !ValidTree(root, new HashSet<Guid>(), 0)) return null;
            string kind = Path.GetExtension(path).Substring(3).ToUpperInvariant(); // .TcPOU -> POU
            var top = Elements(root).ToList();
            if (top.Count != 1 || top[0].Name.ToUpperInvariant() != kind) return null;
            var objects = new List<XmlElement> { top[0] };
            if (kind == "POU") objects.AddRange(Elements(top[0]).Where(x => x.Name == "Method" || x.Name == "Action"));
            if (objects.Count > 64) return null;
            var ids = new HashSet<Guid>(); var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase); XmlElement selected = null;
            foreach (var o in objects) {
                Guid oid; string n = o.GetAttribute("Name");
                string q = ReferenceEquals(o, top[0]) ? n : top[0].GetAttribute("Name") + "." + n;
                if (string.IsNullOrWhiteSpace(n) || !Guid.TryParse(o.GetAttribute("Id"), out oid) || oid == Guid.Empty || !ids.Add(oid) || !names.Add(q)) return null;
                if (oid == id && q == name) selected = o;
            }
            if (selected == null) return null;
            var containers = Elements(selected).Where(x => x.Name == (section == "declaration" ? "Declaration" : "Implementation")).ToList();
            if (containers.Count != 1) return null;
            XmlElement target = containers[0];
            if (section == "implementation") { var children = Elements(target).ToList(); if (children.Count != 1 || children[0].Name != "ST") return null; target = children[0]; }
            var cdatas = new List<XmlCDataSection>(); CollectCData(doc, cdatas);
            var own = target.ChildNodes.OfType<XmlCDataSection>().ToList();
            if (own.Count != 1 || target.ChildNodes.Cast<XmlNode>().Any(x => !(x is XmlCDataSection) && !(x is XmlWhitespace) && !(x is XmlSignificantWhitespace))) return null;
            int index = cdatas.IndexOf(own[0]), position = 0, found = 0; string value = null;
            // Raw CDATA scanning only after rejecting constructs that can contain deceptive delimiters.
            if (xml.IndexOf("<!--", StringComparison.Ordinal) >= 0 || xml.IndexOf("<?", StringComparison.Ordinal) >= 0 && xml.IndexOf("<?", StringComparison.Ordinal) != 0) return null;
            while (true) {
                int start = xml.IndexOf("<![CDATA[", position, StringComparison.Ordinal); if (start < 0) break;
                int end = xml.IndexOf("]]>", start + 9, StringComparison.Ordinal); if (end < 0) return null;
                if (found++ == index) value = xml.Substring(start + 9, end - start - 9);
                position = end + 3;
            }
            return found == cdatas.Count && value != null && value.Length <= 65536 ? value : null;
        }
        private static bool ValidTree(XmlElement element, HashSet<Guid> ids, int depth) {
            if (depth > 32 || element.NamespaceURI.Length != 0 || element.Prefix.Length != 0) return false;
            foreach (XmlAttribute a in element.Attributes) {
                if (a.NamespaceURI.Length != 0 || a.Prefix.Length != 0 || a.Name == "xmlns") return false;
                if (string.Equals(a.Name, "Id", StringComparison.OrdinalIgnoreCase)) { Guid value; if (a.Name != "Id" || !Guid.TryParse(a.Value, out value) || value == Guid.Empty || !ids.Add(value)) return false; }
            }
            foreach (XmlElement child in Elements(element)) if (!ValidTree(child, ids, depth + 1)) return false;
            return true;
        }
        private static void CollectCData(XmlNode n, List<XmlCDataSection> result) { if (n is XmlCDataSection) result.Add((XmlCDataSection)n); foreach (XmlNode c in n.ChildNodes) CollectCData(c, result); }
        private static IEnumerable<XmlElement> Elements(XmlNode n) { return n.ChildNodes.OfType<XmlElement>(); }
        private static bool ValidCoordinate(string s, int line, int column) {
            if (line < 1 || column < 1) return false;
            var lines = s.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
            return line <= lines.Length && column <= lines[line - 1].Length + 1;
        }
        private static bool ValidCompileMetadata(XmlElement compile) {
            foreach (XmlNode node in compile.ChildNodes) {
                if (node is XmlWhitespace || node is XmlSignificantWhitespace || node is XmlComment) continue;
                var element = node as XmlElement;
                if (element == null || element.Name != "SubType" || element.Attributes.Count != 0 || element.ChildNodes.Cast<XmlNode>().Any(x => !(x is XmlText)) || element.InnerText != "Code") return false;
            }
            return true;
        }
        private static bool SourceExtension(string path) { var e = Path.GetExtension(path); return e.Equals(".TcPOU", StringComparison.OrdinalIgnoreCase) || e.Equals(".TcGVL", StringComparison.OrdinalIgnoreCase) || e.Equals(".TcDUT", StringComparison.OrdinalIgnoreCase); }
        private static bool Within(string root, string path) { return path.StartsWith(root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase); }
        private static bool SafePath(string path) { for (string p = path; !string.IsNullOrEmpty(p); p = Path.GetDirectoryName(p)) { if ((File.GetAttributes(p) & FileAttributes.ReparsePoint) != 0) return false; var parent = Path.GetDirectoryName(p); if (parent == p) break; } return true; }
        private static bool Clean(Func<string, bool?> dirty, string path) { return dirty(path) == false; }
        private static bool Unchanged(string path, string hash, Func<string, bool?> dirty) { if (!SafePath(path) || !Clean(dirty, path)) return false; var b = ReadBounded(path, MaxSource); return b != null && Hash(b) == hash && Clean(dirty, path); }
        private static byte[] ReadBounded(string path, int max) { using (var f = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)) { if (f.Length > max) return null; var b = new byte[(int)f.Length]; int n = 0, r; while (n < b.Length && (r = f.Read(b, n, b.Length - n)) > 0) n += r; return n == b.Length && f.ReadByte() == -1 ? b : null; } }
        private static string Hash(byte[] b) { using (var h = SHA256.Create()) return BitConverter.ToString(h.ComputeHash(b)).Replace("-", "").ToLowerInvariant(); }
        private static XmlDocument Parse(byte[] bytes, int max) { var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = max }; var doc = new XmlDocument { PreserveWhitespace = true, XmlResolver = null }; using (var s = new MemoryStream(bytes)) using (var r = XmlReader.Create(s, settings)) doc.Load(r); return doc; }
        private static bool Expected(Exception e) { return !(e is OutOfMemoryException) && !(e is StackOverflowException); }
    }
}



