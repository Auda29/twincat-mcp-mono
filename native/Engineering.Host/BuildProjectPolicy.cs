using System;
using System.IO;
using System.Linq;
using System.Xml;
using System.Xml.Linq;

namespace TwinCatMcp.Engineering.Host
{
    internal static class BuildProjectPolicy
    {
        internal static void Validate(string file)
        {
            if (!string.Equals(Path.GetExtension(file), ".plcproj", StringComparison.OrdinalIgnoreCase)) Refuse();
            var info = new FileInfo(file);
            if (!info.Exists || info.Length > 1048576 || (info.Attributes & FileAttributes.ReparsePoint) != 0 || File.Exists(file + ".user")) Refuse();
            XDocument xml;
            using (var reader = XmlReader.Create(file, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 1048576 }))
                xml = XDocument.Load(reader);
            if (xml.Root == null || xml.Root.Name.LocalName != "Project" || xml.Root.Attribute("Sdk") != null || xml.Root.Attribute("InitialTargets") != null ||
                (xml.Root.Attribute("DefaultTargets") != null && (string)xml.Root.Attribute("DefaultTargets") != "Build")) Refuse();
            if (xml.Descendants().Count(n => n.Name.LocalName == "Import") != 1) Refuse();
            foreach (var node in xml.Descendants())
            {
                var name = node.Name.LocalName.ToLowerInvariant();
                if (name == "sdk" || name.Contains("dependson") || name.EndsWith("targets", StringComparison.Ordinal) ||
                    name.StartsWith("msbuildextensionspath", StringComparison.Ordinal) || name == "directorybuildpropspath" || name == "directorybuildtargetspath" ||
                    name == "projectreference" || name == "importgroup" || name == "target" || name == "usingtask" || name == "prebuildevent" || name == "postbuildevent") Refuse();
                if (name == "import" && ((string)node.Attribute("Project") != @"$(MSBuildExtensionsPath)\Beckhoff\TwinCAT\v3.1\TcPlcProject.targets" || node.Attribute("Condition") != null)) Refuse();
            }
            for (var dir = info.Directory; dir != null; dir = dir.Parent)
            {
                if ((dir.Attributes & FileAttributes.ReparsePoint) != 0) Refuse();
                foreach (var name in new[] { "Directory.Build.props", "Directory.Build.targets", "Directory.Build.rsp" })
                    if (File.Exists(Path.Combine(dir.FullName, name))) Refuse();
            }
        }

        private static void Refuse() { throw new NativeBuildException("refused", "unsafe_build_project"); }
    }
}
