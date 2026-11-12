using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Xml;

namespace TwinCatMcp.Engineering.Host
{
    internal sealed class BuildSourceNativeCandidate
    {
        internal string Status, NavigationKind, OriginalCompilerMoniker, File, FileSha256, ProjectSha256, QualifiedName;
        internal Guid? ObjectId;
        internal int Line, Column;
        internal string MemberPath;
        // This is evidence for a subsequent exact, current IDE ErrorItem match, not permission to navigate.
        internal bool NavigationAvailable { get { return false; } }
    }

    internal sealed class BuildSourceNavigationProof
    {
        internal string ProjectFile, ProjectDigest, SourceFile, SourceDigest, ObjectId, QualifiedName, MemberPath;
        internal string Section { get { return null; } }
        internal string CoordinateKind { get { return "nativeErrorItem"; } }
    }

    internal sealed partial class BuildSourceBaseline
    {
        internal BuildSourceNativeCandidate EvaluateNativeErrorItem(string reportedMoniker, int line, int column, Func<string, bool?> authoritativeDirty, bool inputsAlreadyRechecked = false)
        {
            var result = new BuildSourceNativeCandidate { Status = "unavailable", OriginalCompilerMoniker = reportedMoniker };
            try {
                if (authoritativeDirty == null || string.IsNullOrEmpty(reportedMoniker) || reportedMoniker.Length > 4096 || line < 1 || column < 1) return result;
                // Only an unambiguous explicit member suffix is supported. Never strip arbitrary parentheses or spaces.
                string physical = reportedMoniker, member = null;
                int separator = reportedMoniker.IndexOf(';');
                if (separator >= 0) {
                    if (reportedMoniker.IndexOf(';', separator + 1) >= 0) return result;
                    physical = reportedMoniker.Substring(0, separator); member = reportedMoniker.Substring(separator + 1);
                    if (member.Length == 0 || member.Length > 512) return result;
                }
                if (!Path.IsPathRooted(physical)) return result;
                string path = Path.GetFullPath(physical); Entry entry;
                if (!Within(root, path) || !members.TryGetValue(path, out entry) || !SafePath(path)) return result;
                result.File = entry.Path; result.FileSha256 = entry.Hash; result.ProjectSha256 = projectHash;
                if (!inputsAlreadyRechecked && !IsCurrent(authoritativeDirty)) { result.Status = "stale"; return result; }
                if (member != null) {
                    Guid id;
                    if (!TryMember(entry.Bytes, entry.Path, member, out id)) { result.Status = "member_unknown"; return result; }
                    result.ObjectId = id; result.QualifiedName = member;
                }
                result.MemberPath = member ?? ""; result.Line = line; result.Column = column;
                result.NavigationKind = "nativeErrorItemExactMatchRequired"; result.Status = "candidate";
                return result;
            } catch (Exception e) when (Expected(e)) { return result; }
        }
        internal bool IsCurrent(Func<string, bool?> authoritativeDirty)
        {
            try { return authoritativeDirty != null && Unchanged(project, projectHash, authoritativeDirty) && members.Values.All(x => Unchanged(x.Path, x.Hash, authoritativeDirty)); }
            catch (Exception e) when (Expected(e)) { return false; }
        }
        // The callback must independently match exactly one current native ErrorItem before invoking it.
        // Holding read-only sharing locks prevents ordinary file changes during that callback.
        internal bool TryWithNativeNavigationLease(string moniker, int line, int column,
            Func<string, bool?> authoritativeDirty, Action<BuildSourceNavigationProof> navigate)
        {
            if (navigate == null) return false;
            try {
                var candidate = EvaluateNativeErrorItem(moniker, line, column, authoritativeDirty);
                if (candidate.Status != "candidate") return false;
                using (var projectStream = new FileStream(project, FileMode.Open, FileAccess.Read, FileShare.Read))
                using (var sourceStream = new FileStream(candidate.File, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                    if (!SafePath(project) || !SafePath(candidate.File) || !Clean(authoritativeDirty, project) || !Clean(authoritativeDirty, candidate.File) ||
                        HashStream(projectStream, MaxProject) != projectHash || HashStream(sourceStream, MaxSource) != candidate.FileSha256 ||
                        members.Values.Any(x => !Unchanged(x.Path, x.Hash, authoritativeDirty)) ||
                        !Clean(authoritativeDirty, project) || !Clean(authoritativeDirty, candidate.File)) return false;
                    navigate(new BuildSourceNavigationProof { ProjectFile = project, ProjectDigest = projectHash,
                        SourceFile = candidate.File, SourceDigest = candidate.FileSha256,
                        ObjectId = candidate.ObjectId.HasValue ? candidate.ObjectId.Value.ToString("D") : null,
                        QualifiedName = candidate.QualifiedName, MemberPath = candidate.MemberPath });
                    return true;
                }
            } catch (Exception e) when (Expected(e)) { return false; }
        }
        private static string HashStream(FileStream stream, int limit)
        {
            if (stream.Length > limit) return null;
            stream.Position = 0;
            using (var hash = System.Security.Cryptography.SHA256.Create())
                return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
        }
        private static bool TryMember(byte[] bytes, string path, string requested, out Guid id)
        {
            id = Guid.Empty;
            var doc = Parse(bytes, MaxSource); var root = doc.DocumentElement;
            if (root == null || root.Name != "TcPlcObject" || !ValidTree(root, new HashSet<Guid>(), 0)) return false;
            var tops = Elements(root).ToList();
            if (tops.Count != 1 || !string.Equals(tops[0].Name, Path.GetExtension(path).Substring(3), StringComparison.OrdinalIgnoreCase)) return false;
            var objects = new List<XmlElement> { tops[0] };
            if (tops[0].Name == "POU") objects.AddRange(Elements(tops[0]).Where(x => x.Name == "Method" || x.Name == "Action"));
            if (objects.Count > 64) return false;
            var ids = new HashSet<Guid>(); var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase); bool found = false;
            foreach (var item in objects) {
                Guid current; string name = item.GetAttribute("Name");
                string qualified = ReferenceEquals(item, tops[0]) ? name : tops[0].GetAttribute("Name") + "." + name;
                if (string.IsNullOrWhiteSpace(name) || !Guid.TryParse(item.GetAttribute("Id"), out current) || current == Guid.Empty || !ids.Add(current) || !names.Add(qualified)) return false;
                if (qualified == requested) { id = current; found = true; }
            }
            return found;
        }
    }
}


