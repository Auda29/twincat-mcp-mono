using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Xml;

namespace TwinCatMcp.Engineering.Host
{
    // The host supplies an already-open, ordinary RDT document buffer by exact
    // moniker. It must prove its RDT cookie/docdata/MEF mapping and call this on
    // the editor's owning thread. This class does not find or open documents.
    internal sealed class XmlStSourceEditor : ISourceEditor
    {
        private const int MaxProjectBytes = 2 * 1024 * 1024;
        private readonly string project, directory, context;
        private readonly Func<string, object> getBuffer;
        private readonly Func<string, bool?> dirty;
        private readonly Func<string> currentContext;

        internal XmlStSourceEditor(string projectPath, Func<string, object> getTextBuffer,
            Func<string, bool?> dirty, Func<string> currentContextIdentity, string frozenContextIdentity)
        {
            if (projectPath == null || getTextBuffer == null || dirty == null || currentContextIdentity == null || string.IsNullOrWhiteSpace(frozenContextIdentity)) throw new ArgumentException();
            project = Path.GetFullPath(projectPath);
            if (!string.Equals(Path.GetExtension(project), ".plcproj", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException();
            directory = Path.GetDirectoryName(project);
            context = frozenContextIdentity; getBuffer = getTextBuffer; this.dirty = dirty; currentContext = currentContextIdentity;
        }
        public bool HasVerifiedAtomicLiveBufferSemantics { get { return true; } }

        internal SourceResult Targets(string exactCanonicalMoniker)
        {
            try {
                string path;
                if (!ParseMoniker(exactCanonicalMoniker, out path) || !Context(context) || !SafePaths(path)) return TargetsUnavailable();
                using (var lease = OpenProject(path)) {
                    if (lease == null) return TargetsUnavailable();
                    var buffer = getBuffer(path);
                    var adapter = VsTextBufferAdapter.TryCreate(buffer);
                    if (adapter == null) return TargetsUnavailable();
                    Func<bool> verify = () => Verify(path, buffer, context, lease);
                    var xml = adapter.Read(verify);
                    if (xml == null) return TargetsUnavailable();
                    var targets = XmlStSectionMap.TryTargets(xml, path);
                    if (targets == null) return TargetsUnavailable();
                    var sourceDirty = dirty(path);
                    if (!sourceDirty.HasValue || !string.Equals(xml, adapter.Read(verify), StringComparison.Ordinal) || !verify()) return TargetsUnavailable();
                    var rows = new List<Dictionary<string, object>>();
                    foreach (var target in targets) rows.Add(new Dictionary<string, object> {
                        { "objectId", target.ObjectId }, { "qualifiedName", target.QualifiedName },
                        { "kind", target.Kind }, { "sections", target.Sections }
                    });
                    return new SourceResult("succeeded", result: new Dictionary<string, object> {
                        { "moniker", path }, { "targets", rows }, { "count", rows.Count }, { "truncated", false },
                        { "bufferDigest", Hash(Encoding.UTF8.GetBytes(xml)) }, { "projectRevision", lease.Hash },
                        { "source", "liveBuffer" }, { "dirtyState", sourceDirty.Value ? "dirty" : "clean" }
                    });
                }
            } catch { return TargetsUnavailable(); }
        }
        private static SourceResult TargetsUnavailable() { return new SourceResult("unsupported", "source_targets_unavailable"); }

        public SourceSnapshot Read(string contextIdentity, string objectId, string section)
        {
            try {
                Target target;
                if (!ParseTarget(objectId, out target) || !Context(contextIdentity) || !SafePaths(target.Path)) return null;
                using (var lease = OpenProject(target.Path)) {
                    if (lease == null) return null;
                    var buffer = getBuffer(target.Path);
                    var adapter = VsTextBufferAdapter.TryCreate(buffer);
                    if (adapter == null) return null;
                    Func<bool> verify = () => Verify(target.Path, buffer, contextIdentity, lease);
                    string xml = adapter.Read(verify);
                    if (xml == null) return null;
                    var map = XmlStSectionMap.TryMap(xml, target.Id, target.Name, section);
                    if (map == null || !verify()) return null;
                    var sourceDirty = dirty(target.Path);
                    if (!sourceDirty.HasValue) return null;
                    return new SourceSnapshot { ContextIdentity = contextIdentity, ObjectId = objectId, Section = section,
                        Text = map.Text, BufferText = xml, ProjectRevision = lease.Hash, BufferIdentity = buffer,
                        DirtyState = sourceDirty.Value ? "dirty" : "clean",
                        BuildReplacement = value => { string result; return XmlStSectionMap.TryReplace(xml, target.Id, target.Name, section, map.Text, value, out result) ? result : null; },
                        IsExistingStructuredTextObject = true, IsOrdinaryPlcSource = true,
                        IsUnambiguousIdentity = true, IsVerifiedLiveBuffer = true };
                }
            } catch { return null; }
        }

        public SourceExchangeOutcome CompareExchange(SourceEditRequest request)
        {
            if (request == null) return SourceExchangeOutcome.Unsupported;
            try {
                Target target;
                if (!ParseTarget(request.ObjectId, out target) || !Context(request.ContextIdentity) || !SafePaths(target.Path)) return SourceExchangeOutcome.Unsupported;
                using (var lease = OpenProject(target.Path)) {
                    if (lease == null) return SourceExchangeOutcome.Unsupported;
                    if (!string.Equals(lease.Hash, request.ProjectRevision, StringComparison.Ordinal)) return SourceExchangeOutcome.Conflict;
                    string proposed;
                    if (!XmlStSectionMap.TryReplace(request.ExpectedBufferText, target.Id, target.Name, request.Section,
                        request.ExpectedText, request.ReplacementText, out proposed) ||
                        !string.Equals(proposed, request.ReplacementBufferText, StringComparison.Ordinal)) return SourceExchangeOutcome.Unsupported;
                    var buffer = getBuffer(target.Path);
                    if (!ReferenceEquals(buffer, request.BufferIdentity)) return SourceExchangeOutcome.Conflict;
                    var adapter = VsTextBufferAdapter.TryCreate(buffer);
                    if (adapter == null) return SourceExchangeOutcome.Unsupported;
                    return adapter.CompareExchange(request.ExpectedBufferText, proposed,
                        () => Verify(target.Path, buffer, request.ContextIdentity, lease), request.AuthorizationCurrent);
                }
            } catch { return SourceExchangeOutcome.Unknown; }
        }

        private bool Context(string value) { return string.Equals(context, value, StringComparison.Ordinal) && string.Equals(context, currentContext(), StringComparison.Ordinal); }
        private bool Verify(string source, object buffer, string requestedContext, ProjectLease lease)
        {
            return Context(requestedContext) && SafePaths(source) && dirty(project) == false && dirty(source).HasValue &&
                ReferenceEquals(buffer, getBuffer(source)) && lease.Unchanged() && Context(requestedContext);
        }
        private sealed class Target { internal string Path, Name; internal Guid Id; }
        private bool ParseTarget(string objectId, out Target target)
        {
            target = null;
            if (objectId == null) return false;
            var parts = objectId.Split('|'); Guid id;
            string path;
            if (parts.Length != 3 || !Guid.TryParseExact(parts[1], "D", out id) || id == Guid.Empty ||
                parts[1] != id.ToString("D") || string.IsNullOrEmpty(parts[2]) || !ParseMoniker(parts[0], out path)) return false;
            target = new Target { Path = path, Id = id, Name = parts[2] }; return true;
        }
        private bool ParseMoniker(string moniker, out string path)
        {
            path = null;
            if (string.IsNullOrEmpty(moniker) || moniker.IndexOf('|') >= 0 || !Path.IsPathRooted(moniker)) return false;
            path = Path.GetFullPath(moniker);
            if (!string.Equals(path, moniker, StringComparison.Ordinal) || !string.Equals(Path.GetExtension(path), ".TcPOU", StringComparison.OrdinalIgnoreCase)) return false;
            string prefix = directory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return false;
            return true;
        }
        private bool SafePaths(string source)
        {
            return NoReparse(project) && NoReparse(source);
        }
        private static bool NoReparse(string path)
        {
            string cursor = path;
            while (!string.IsNullOrEmpty(cursor)) {
                if ((File.GetAttributes(cursor) & FileAttributes.ReparsePoint) != 0) return false;
                string next = Path.GetDirectoryName(cursor);
                if (string.IsNullOrEmpty(next) || string.Equals(next, cursor, StringComparison.OrdinalIgnoreCase)) break;
                cursor = next;
            }
            return true;
        }
        private ProjectLease OpenProject(string source)
        {
            if (dirty(project) != false) return null;
            FileStream stream = null;
            try {
                stream = new FileStream(project, FileMode.Open, FileAccess.Read, FileShare.Read);
                var bytes = ReadAll(stream);
                if (bytes == null || !HasSingleCompile(bytes, source) || dirty(project) != false) { stream.Dispose(); return null; }
                return new ProjectLease(stream, Hash(bytes));
            } catch { if (stream != null) stream.Dispose(); return null; }
        }
        private static byte[] ReadAll(FileStream stream)
        {
            if (stream.Length > MaxProjectBytes) return null;
            stream.Position = 0; var data = new byte[(int)stream.Length]; int count = 0;
            while (count < data.Length) { int n = stream.Read(data, count, data.Length - count); if (n == 0) return null; count += n; }
            return data;
        }
        private static string Hash(byte[] bytes)
        { using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
        private sealed class ProjectLease : IDisposable
        {
            readonly FileStream stream; internal readonly string Hash;
            internal ProjectLease(FileStream stream, string hash) { this.stream = stream; Hash = hash; }
            internal bool Unchanged() { var bytes = ReadAll(stream); return bytes != null && string.Equals(Hash, XmlStSourceEditor.Hash(bytes), StringComparison.Ordinal); }
            public void Dispose() { stream.Dispose(); }
        }
        private bool HasSingleCompile(byte[] bytes, string source)
        {
            var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = MaxProjectBytes };
            var doc = new XmlDocument { XmlResolver = null };
            using (var reader = XmlReader.Create(new MemoryStream(bytes), settings)) {
                while (reader.Read()) if (reader.Depth > 32) return false;
            }
            using (var reader = XmlReader.Create(new MemoryStream(bytes), settings)) doc.Load(reader);
            var root = doc.DocumentElement;
            const string msbuild = "http://schemas.microsoft.com/developer/msbuild/2003";
            if (root == null || root.LocalName != "Project" || root.HasAttribute("Sdk") || (root.NamespaceURI != "" && root.NamespaceURI != msbuild)) return false;
            if (root.SelectNodes("//*[local-name()='Target' or local-name()='Choose' or local-name()='UsingTask' or local-name()='ItemDefinitionGroup']").Count != 0) return false;
            foreach (XmlNode node in root.SelectNodes("//*")) {
                var name = node.LocalName;
                if (name.StartsWith("MSBuildExtensionsPath", StringComparison.OrdinalIgnoreCase) ||
                    name.StartsWith("DirectoryBuild", StringComparison.OrdinalIgnoreCase) || name.StartsWith("ImportDirectoryBuild", StringComparison.OrdinalIgnoreCase)) return false;
            }
            var imports = root.SelectNodes("//*[local-name()='Import']");
            if (imports.Count != 1) return false;
            var import = imports[0] as XmlElement;
            if (import == null || import.NamespaceURI != root.NamespaceURI || import.ParentNode != root || import.HasAttribute("Condition") ||
                import.GetAttribute("Project") != @"$(MSBuildExtensionsPath)\Beckhoff\TwinCAT\v3.1\TcPlcProject.targets") return false;
            int matches = 0;
            foreach (XmlNode node in root.SelectNodes("//*[local-name()='Compile']")) {
                var e = node as XmlElement;
                if (e == null || e.NamespaceURI != root.NamespaceURI || !e.HasAttribute("Include") || e.HasAttribute("Remove") || e.HasAttribute("Update")) return false;
                string include = e.GetAttribute("Include");
                if (string.IsNullOrWhiteSpace(include) || include.IndexOfAny(new[] { '*', '?', '$', '@', '%', ';' }) >= 0 || Path.IsPathRooted(include)) return false;
                if (string.Equals(Path.GetFullPath(Path.Combine(directory, include)), source, StringComparison.OrdinalIgnoreCase)) {
                    if (e.Attributes.Count != 1 || e.ParentNode == null || e.ParentNode.LocalName != "ItemGroup" ||
                        e.ParentNode.NamespaceURI != root.NamespaceURI || e.ParentNode.ParentNode != root || e.ParentNode.Attributes.Count != 0) return false;
                    for (XmlNode p = e; p is XmlElement; p = p.ParentNode) if (((XmlElement)p).HasAttribute("Condition")) return false;
                    matches++;
                }
            }
            return matches == 1;
        }
    }
}
