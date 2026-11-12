using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Xml;

namespace TwinCatMcp.Engineering.Host
{
    // Maps a deliberately narrow, namespace-free TcPOU representation. Offsets
    // are UTF-16 string indices into the original XML, not normalized XML text.
    internal sealed class XmlStSection
    {
        internal readonly int Start, Length;
        internal readonly string Text;
        internal XmlStSection(int start, int length, string text) { Start = start; Length = length; Text = text; }
    }
    internal sealed class XmlStTarget
    {
        internal string ObjectId, QualifiedName, Kind;
        internal string[] Sections;
    }

    internal static class XmlStSectionMap
    {
        private const int MaxXml = 2 * 1024 * 1024, MaxText = 65536;

        internal static XmlStSection TryMap(string xml, Guid objectId, string qualifiedName, string section)
        {
            if (xml == null || xml.Length > MaxXml || objectId == Guid.Empty || string.IsNullOrEmpty(qualifiedName) ||
                (section != "declaration" && section != "implementation")) return null;
            try {
                XmlElement top;
                var doc = ReadDocument(xml, out top);
                if (doc == null) return null;
                var pouName = top.GetAttribute("Name");
                XmlElement selected = null;
                if (ObjectMatches(top, objectId, qualifiedName, pouName)) selected = top;
                foreach (XmlNode child in top.ChildNodes) {
                    var member = child as XmlElement;
                    if (member != null && (member.Name == "Method" || member.Name == "Action") &&
                        ObjectMatches(member, objectId, qualifiedName, pouName + "." + member.GetAttribute("Name"))) {
                        if (selected != null) return null;
                        selected = member;
                    }
                }
                if (selected == null) return null;
                var container = FindSingle(selected, section == "declaration" ? "Declaration" : "Implementation");
                if (container == null) return null;
                if (section == "implementation") container = OnlyElement(container, "ST");
                if (container == null) return null;
                XmlCDataSection target = null;
                foreach (XmlNode node in container.ChildNodes) {
                    if (node is XmlCDataSection) { if (target != null) return null; target = (XmlCDataSection)node; }
                    else if (!(node is XmlWhitespace) && !(node is XmlSignificantWhitespace)) return null;
                }
                if (target == null) return null;
                var cdata = new List<XmlCDataSection>();
                CollectCData(doc, cdata);
                int index = cdata.IndexOf(target);
                var ranges = ScanCData(xml);
                if (ranges == null || index < 0 || ranges.Count != cdata.Count) return null;
                var span = ranges[index];
                string text = xml.Substring(span.Item1, span.Item2);
                if (!ValidText(text)) return null;
                return new XmlStSection(span.Item1, span.Item2, text);
            } catch (Exception e) when (e is XmlException || e is ArgumentException || e is InvalidOperationException || e is OverflowException) { return null; }
        }

        // Enumerate only objects and sections that TryMap itself can identify.
        // Fail the whole observation if any object is unsupported or over limit.
        internal static List<XmlStTarget> TryTargets(string xml, string moniker)
        {
            if (xml == null || xml.Length > 65536 || string.IsNullOrEmpty(moniker) || moniker.IndexOf('|') >= 0) return null;
            try {
                XmlElement top;
                if (ReadDocument(xml, out top) == null) return null;
                var elements = new List<XmlElement> { top };
                foreach (XmlNode n in top.ChildNodes) {
                    var e = n as XmlElement;
                    if (e != null && (e.Name == "Method" || e.Name == "Action")) elements.Add(e);
                    if (elements.Count > 64) return null;
                }
                var targets = new List<XmlStTarget>();
                string parent = top.GetAttribute("Name");
                foreach (var e in elements) {
                    var id = Guid.Parse(e.GetAttribute("Id"));
                    string name = ReferenceEquals(e, top) ? parent : parent + "." + e.GetAttribute("Name");
                    var sections = new List<string>();
                    foreach (var section in new[] { "declaration", "implementation" }) {
                        if (FindSingle(e, section == "declaration" ? "Declaration" : "Implementation") == null) continue;
                        var mapped = TryMap(xml, id, name, section);
                        if (mapped == null || mapped.Text.Length > 16384) return null;
                        sections.Add(section);
                    }
                    if (sections.Count == 0) return null;
                    var objectId = moniker + "|" + id.ToString("D") + "|" + name;
                    if (objectId.Length > 1024) return null;
                    targets.Add(new XmlStTarget { ObjectId = objectId,
                        QualifiedName = name, Kind = e.Name.ToLowerInvariant(), Sections = sections.ToArray() });
                }
                return targets;
            } catch (Exception e) when (e is XmlException || e is ArgumentException || e is InvalidOperationException || e is OverflowException) { return null; }
        }

        private static XmlDocument ReadDocument(string xml, out XmlElement top)
        {
            top = null;
            var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null,
                MaxCharactersInDocument = MaxXml, IgnoreWhitespace = false, CheckCharacters = true };
            using (var reader = XmlReader.Create(new StringReader(xml), settings))
                while (reader.Read()) if (reader.Depth > 32) return null;
            var doc = new XmlDocument { PreserveWhitespace = true, XmlResolver = null };
            using (var reader = XmlReader.Create(new StringReader(xml), settings)) doc.Load(reader);
            var root = doc.DocumentElement;
            if (root == null || root.Name != "TcPlcObject" || !NoNamespaces(root) || !UniqueIds(root, new HashSet<Guid>())) return null;
            top = OnlyElement(root, "POU");
            return top != null && ValidObject(top) && ValidTree(top) ? doc : null;
        }

        internal static bool TryReplace(string xml, Guid objectId, string qualifiedName, string section,
            string expectedText, string replacement, out string changedXml)
        {
            changedXml = null;
            if (!ValidText(expectedText) || !ValidText(replacement) || replacement.IndexOf("]]>", StringComparison.Ordinal) >= 0) return false;
            var old = TryMap(xml, objectId, qualifiedName, section);
            if (old == null || !string.Equals(old.Text, expectedText, StringComparison.Ordinal) ||
                (long)xml.Length - old.Length + replacement.Length > MaxXml) return false;
            var changed = xml.Substring(0, old.Start) + replacement + xml.Substring(old.Start + old.Length);
            var mapped = TryMap(changed, objectId, qualifiedName, section);
            if (mapped == null || mapped.Start != old.Start || mapped.Length != replacement.Length ||
                !string.Equals(mapped.Text, replacement, StringComparison.Ordinal)) return false;
            changedXml = changed;
            return true;
        }

        private static bool ValidText(string text)
        {
            if (text == null || text.Length > MaxText || text.IndexOf('\0') >= 0) return false;
            try { new UTF8Encoding(false, true).GetByteCount(text); return true; }
            catch (EncoderFallbackException) { return false; }
        }
        private static bool NoNamespaces(XmlElement e)
        {
            if (e.NamespaceURI.Length != 0 || e.Prefix.Length != 0) return false;
            foreach (XmlAttribute a in e.Attributes)
                if (a.NamespaceURI.Length != 0 || a.Prefix.Length != 0 || a.Name == "xmlns") return false;
            foreach (XmlNode n in e.ChildNodes) if (n is XmlElement && !NoNamespaces((XmlElement)n)) return false;
            return true;
        }
        private static bool UniqueIds(XmlElement e, HashSet<Guid> ids)
        {
            foreach (XmlAttribute a in e.Attributes) {
                if (string.Equals(a.Name, "Id", StringComparison.OrdinalIgnoreCase)) {
                    Guid id;
                    if (a.Name != "Id" || !Guid.TryParse(a.Value, out id) || id == Guid.Empty || !ids.Add(id)) return false;
                }
            }
            foreach (XmlNode n in e.ChildNodes) if (n is XmlElement && !UniqueIds((XmlElement)n, ids)) return false;
            return true;
        }
        private static bool Identifier(string name)
        {
            if (string.IsNullOrEmpty(name) || name.Length > 255 || !(IsLetter(name[0]) || name[0] == '_')) return false;
            foreach (char c in name) if (!(IsLetter(c) || (c >= '0' && c <= '9') || c == '_')) return false;
            return true;
        }
        private static bool IsLetter(char c) { return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'); }
        private static bool ValidObject(XmlElement e)
        {
            Guid id;
            return Identifier(e.GetAttribute("Name")) && Guid.TryParse(e.GetAttribute("Id"), out id) && id != Guid.Empty;
        }
        private static bool ObjectMatches(XmlElement e, Guid id, string requested, string actual)
        { Guid value; return Guid.TryParse(e.GetAttribute("Id"), out value) && value == id && string.Equals(requested, actual, StringComparison.Ordinal); }
        private static bool ValidTree(XmlElement pou)
        {
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (XmlNode node in pou.ChildNodes) {
                var e = node as XmlElement;
                if (e == null) { if (!(node is XmlWhitespace) && !(node is XmlSignificantWhitespace) && !(node is XmlComment)) return false; continue; }
                if (e.Name == "Method" || e.Name == "Action") {
                    if (!ValidObject(e) || !names.Add(e.GetAttribute("Name")) || !ValidMember(e)) return false;
                } else if (e.Name != "Declaration" && e.Name != "Implementation") return false;
            }
            return ValidSections(pou);
        }
        private static bool ValidMember(XmlElement member)
        {
            foreach (XmlNode node in member.ChildNodes) {
                var e = node as XmlElement;
                if (e == null) { if (!(node is XmlWhitespace) && !(node is XmlSignificantWhitespace) && !(node is XmlComment)) return false; continue; }
                if (e.Name != "Declaration" && e.Name != "Implementation") return false;
            }
            return ValidSections(member);
        }
        private static bool ValidSections(XmlElement owner)
        {
            int declarations = 0, implementations = 0;
            foreach (XmlNode n in owner.ChildNodes) {
                var e = n as XmlElement; if (e == null) continue;
                if (e.Name == "Declaration" && (++declarations > 1 || !SingleCData(e))) return false;
                if (e.Name == "Implementation") {
                    var st = OnlyElement(e, "ST");
                    if (++implementations > 1 || st == null || !SingleCData(st)) return false;
                }
            }
            return true;
        }
        private static bool SingleCData(XmlElement element)
        {
            int count = 0;
            foreach (XmlNode node in element.ChildNodes) {
                if (node is XmlCDataSection) count++;
                else if (!(node is XmlWhitespace) && !(node is XmlSignificantWhitespace)) return false;
            }
            return count == 1;
        }
        private static XmlElement OnlyElement(XmlElement parent, string name)
        {
            XmlElement result = null;
            foreach (XmlNode node in parent.ChildNodes) {
                var e = node as XmlElement;
                if (e != null) { if (result != null || e.Name != name) return null; result = e; }
                else if (!(node is XmlWhitespace) && !(node is XmlSignificantWhitespace) && !(node is XmlComment)) return null;
            }
            return result;
        }
        private static XmlElement FindSingle(XmlElement parent, string name)
        {
            XmlElement result = null;
            foreach (XmlNode node in parent.ChildNodes) {
                var e = node as XmlElement;
                if (e != null && e.Name == name) { if (result != null) return null; result = e; }
            }
            return result;
        }
        private static void CollectCData(XmlNode node, List<XmlCDataSection> all)
        {
            if (node is XmlCDataSection) all.Add((XmlCDataSection)node);
            foreach (XmlNode child in node.ChildNodes) CollectCData(child, all);
        }
        // XmlDocument normalizes line endings. Scan only validated XML markup to
        // recover the exact source ranges and match CDATA nodes by document order.
        private static List<Tuple<int, int>> ScanCData(string xml)
        {
            var result = new List<Tuple<int, int>>();
            int p = 0;
            while (p < xml.Length) {
                int open = xml.IndexOf('<', p); if (open < 0) break;
                if (Starts(xml, open, "<!--")) { int end = xml.IndexOf("-->", open + 4, StringComparison.Ordinal); if (end < 0) return null; p = end + 3; }
                else if (Starts(xml, open, "<![CDATA[")) { int start = open + 9; int end = xml.IndexOf("]]>", start, StringComparison.Ordinal); if (end < 0) return null; result.Add(Tuple.Create(start, end - start)); p = end + 3; }
                else if (Starts(xml, open, "<?")) { int end = xml.IndexOf("?>", open + 2, StringComparison.Ordinal); if (end < 0) return null; p = end + 2; }
                else {
                    char quote = '\0'; int i = open + 1;
                    for (; i < xml.Length; i++) { char c = xml[i]; if (quote != '\0') { if (c == quote) quote = '\0'; } else if (c == '\'' || c == '"') quote = c; else if (c == '>') break; }
                    if (i == xml.Length) return null; p = i + 1;
                }
            }
            return result;
        }
        private static bool Starts(string s, int p, string prefix)
        { return p + prefix.Length <= s.Length && string.CompareOrdinal(s, p, prefix, 0, prefix.Length) == 0; }
    }
}
