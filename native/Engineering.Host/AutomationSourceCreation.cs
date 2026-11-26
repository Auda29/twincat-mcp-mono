using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace TwinCatMcp.Engineering.Host
{
    internal sealed class AutomationSourceCreation
    {
        private static readonly Regex Identifier = new Regex(@"\A[A-Za-z_][A-Za-z0-9_]{0,63}\z", RegexOptions.CultureInvariant);
        private static readonly string[] Keys = {
            "parentPath", "name", "kind", "returnType", "access", "createGet", "createSet",
            "declarationText", "implementationText", "approvalExpiresUtc"
        };
        internal const int MaxTreeDepth = 32;
        private const int MaxTreePathLength = 512;
        internal static bool ValidTreePath(string value)
        {
            return value != null && value.Length <= MaxTreePathLength && value.Count(c => c == '^') < MaxTreeDepth && value.Split('^').All(part => part.Length > 0 &&
                part.Trim() == part && part != "." && part != ".." && part.IndexOfAny(new[] { '\\', '/', ':', '|' }) < 0 &&
                !part.Any(char.IsControl));
        }

        internal string ParentPath { get; private set; }
        internal string Name { get; private set; }
        internal string Kind { get; private set; }
        internal int ItemType { get; private set; }
        internal string ReturnType { get; private set; }
        internal string Access { get; private set; }
        internal bool CreateGet { get; private set; }
        internal bool CreateSet { get; private set; }
        internal string Declaration { get; private set; }
        internal string Implementation { get; private set; }
        internal string TargetPath { get { return ParentPath + "^" + Name; } }
        internal bool IsMember { get { return ItemType == 608 || ItemType == 609 || ItemType == 611; } }
        internal string Folder { get { return ItemType == 606 ? "DUTs" : ItemType == 615 ? "GVLs" : "POUs"; } }

        internal static AutomationSourceCreation Parse(Dictionary<string, object> args)
        {
            if (args.Keys.Except(Keys, StringComparer.Ordinal).Any()) return null;
            var parent = Text(args, "parentPath");
            var name = Text(args, "name");
            var kind = Text(args, "kind");
            if (!ValidTreePath(parent) || !Identifier.IsMatch(name ?? "") || Text(args, "approvalExpiresUtc") == null) return null;
            int itemType;
            switch (kind)
            {
                case "prg": itemType = 602; break;
                case "fun": itemType = 603; break;
                case "fb": itemType = 604; break;
                case "dut_struct": itemType = 606; break;
                case "action": itemType = 608; break;
                case "method": itemType = 609; break;
                case "property": itemType = 611; break;
                case "gvl": itemType = 615; break;
                default: return null;
            }
            var returnType = Text(args, "returnType");
            var access = Text(args, "access");
            var declaration = Text(args, "declarationText");
            var implementation = Text(args, "implementationText");
            if (kind == "fun" || kind == "method" || kind == "property")
            {
                if (!Identifier.IsMatch(returnType ?? "")) return null;
            }
            else if (args.ContainsKey("returnType")) return null;

            if (kind == "method" || kind == "property")
            {
                if (!args.ContainsKey("access")) access = "PUBLIC";
                if (access != "PUBLIC" && access != "PRIVATE" && access != "PROTECTED" && access != "INTERNAL") return null;
            }
            else if (args.ContainsKey("access")) return null;

            object get, set;
            bool hasGet = args.TryGetValue("createGet", out get);
            bool hasSet = args.TryGetValue("createSet", out set);
            if ((hasGet || hasSet) && kind != "property" || hasGet && !(get is bool) || hasSet && !(set is bool)) return null;
            if (args.ContainsKey("declarationText") && (kind == "action" || !SourcePolicy.ValidText(declaration))) return null;
            if (args.ContainsKey("implementationText") &&
                (kind == "dut_struct" || kind == "gvl" || kind == "property" || !SourcePolicy.ValidText(implementation))) return null;

            var target = parent + "^" + name;
            if (!ValidTreePath(target) || (get is true || set is true) && !ValidTreePath(target + "^Get")) return null;

            return new AutomationSourceCreation {
                ParentPath = parent, Name = name, Kind = kind, ItemType = itemType, ReturnType = returnType, Access = access,
                CreateGet = get is bool && (bool)get, CreateSet = set is bool && (bool)set,
                Declaration = SourcePolicy.NormalizeLf(declaration), Implementation = SourcePolicy.NormalizeLf(implementation)
            };
        }

        internal string CanonicalPayload()
        {
            return new JavaScriptSerializer { MaxJsonLength = 1024 * 1024 }.Serialize(new {
                parentPath = ParentPath, name = Name, kind = Kind, returnType = ReturnType, access = Access,
                createGet = CreateGet, createSet = CreateSet, declarationText = Declaration, implementationText = Implementation
            });
        }

        internal string[] CreationInfo()
        {
            if (ItemType == 606 || ItemType == 615) return null;
            if (ItemType == 603) return new[] { "ST", ReturnType };
            if (ItemType == 609 || ItemType == 611) return new[] { "ST", ReturnType, Access };
            return new[] { "ST" };
        }

        private static string Text(Dictionary<string, object> args, string key)
        {
            object value;
            return args.TryGetValue(key, out value) ? value as string : null;
        }
    }
}
