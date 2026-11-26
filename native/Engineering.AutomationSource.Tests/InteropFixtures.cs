using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Xml.Linq;

namespace EnvDTE
{
    public interface DTE { Solution Solution { get; } Documents Documents { get; } }
    public interface Solution { string FullName { get; } Projects Projects { get; } }
    public interface Projects { int Count { get; } object Item(object index); }
    public interface Project { string FileName { get; } string Kind { get; } object Object { get; } object ProjectItems { get; } }
    public interface Documents { int Count { get; } object Item(object index); }
    public interface Document
    {
        string FullName { get; }
        bool Saved { get; }
        object Object(string name);
    }
    public interface TextDocument { TextPoint StartPoint { get; } TextPoint EndPoint { get; } }
    public interface TextPoint { int AbsoluteCharOffset { get; } EditPoint CreateEditPoint(); }
    public interface EditPoint { string GetText(object end); }

    internal sealed class Collection : Projects, Documents
    {
        internal readonly List<object> Values = new List<object>();
        public int Count => Values.Count;
        public object Item(object index) => Values[(int)index - 1];
    }

    internal sealed class ActiveSolution : Solution
    {
        public string FullName { get; set; }
        public Projects Projects { get; set; }
    }

    internal sealed class ActiveProject : Project
    {
        public string FileName { get; set; }
        public string Kind => "twincat";
        public object Object { get; set; }
        public object ProjectItems => null;
    }

    internal sealed class ActiveDte : DTE
    {
        public Solution Solution { get; set; }
        public Documents Documents { get; set; }
    }

    internal sealed class OpenDocument : Document, TextDocument, TextPoint, EditPoint
    {
        public string FullName { get; set; }
        public bool Saved { get; set; } = true;
        internal string LiveText = "";
        internal bool ExposeText = true;
        public object Object(string name) => name == "TextDocument" && ExposeText ? this : null;
        public TextPoint StartPoint => this;
        public TextPoint EndPoint => this;
        public int AbsoluteCharOffset => LiveText.Length + 1;
        public EditPoint CreateEditPoint() => this;
        public string GetText(object end) => LiveText;
    }
}

namespace TCatSysManagerLib
{
    public interface ITcSysManager { ITcSmTreeItem LookupTreeItem(string name); }
    public interface ITcSmTreeItem
    {
        string Name { get; }
        int ItemType { get; }
        int ChildCount { get; }
        [System.Runtime.CompilerServices.IndexerName("Child")]
        ITcSmTreeItem this[int index] { get; }
        string ProduceXml(bool recursive);
        ITcSmTreeItem CreateChild(string name, int type, string before, object info);
    }
    public interface ITcProjectRoot { ITcSmTreeItem NestedProject { get; } }
    public interface ITcPlcDeclaration { string DeclarationText { get; set; } }
    public interface ITcPlcImplementation { string ImplementationText { get; set; } LanguageType Language { get; } }
    public enum LanguageType { ST = 1, LD = 6 }

    internal sealed class Manager : ITcSysManager
    {
        internal TreeNode Tipc;
        public ITcSmTreeItem LookupTreeItem(string name) => name == "TIPC" ? Tipc : throw new InvalidOperationException();
    }

    internal sealed class Plc : TreeNode, ITcProjectRoot
    {
        internal string ProjectFile;
        internal string MappingMarker = "initial";
        public ITcSmTreeItem NestedProject { get; set; }
        public override string ProduceXml(bool recursive) => new XElement("TreeItem", new XElement("PlcProjectDef",
            new XElement("ProjectPath", ProjectFile), new XElement("AdsPort", "851")), new XElement("Marker", MappingMarker)).ToString();
    }

    internal class TreeNode : ITcSmTreeItem
    {
        internal TreeNode Parent;
        internal readonly List<TreeNode> Children = new List<TreeNode>();
        internal string PhysicalFile;
        internal Action<string> Written;
        internal bool FailReadback;
        internal bool FailAfterCreate;
        internal int CreateCount;
        internal string[] LastCreateInfo;
        public string Name { get; set; }
        public int ItemType { get; set; }
        public int ChildCount => Children.Count;
        [System.Runtime.CompilerServices.IndexerName("Child")]
        public ITcSmTreeItem this[int index] => Children[index - 1];

        public virtual string ProduceXml(bool recursive) => new XElement("TreeItem", new XElement("VSProperties",
            new XElement("VSProperty", new XAttribute("Name", "FullPath"), new XAttribute("Value", PhysicalFile ?? "")))).ToString();

        internal TreeNode Add(TreeNode child)
        {
            child.Parent = this;
            Children.Add(child);
            return child;
        }

        public ITcSmTreeItem CreateChild(string name, int type, string before, object info)
        {
            if (before != "" || Children.Any(child => child.Name.Equals(name, StringComparison.OrdinalIgnoreCase))) throw new InvalidOperationException();
            CreateCount++;
            LastCreateInfo = (string[])info;
            TreeNode child;
            if (type == 606 || type == 615 || type == 611) child = new DeclarationNode();
            else if (type == 608) child = new ImplementationNode();
            else child = new FullSource();
            child.Name = name;
            child.ItemType = type;
            child.Written = Written;
            child.PhysicalFile = type == 606 ? Path.Combine(PhysicalFile, name + ".TcDUT") : type == 615 ? Path.Combine(PhysicalFile, name + ".TcGVL") :
                type >= 602 && type <= 604 ? Path.Combine(PhysicalFile, name + ".TcPOU") : PhysicalFile;
            Add(child);
            if (FailAfterCreate) throw new InvalidOperationException("Submission already changed the tree.");
            return child;
        }

        internal string Write(string value)
        {
            Written?.Invoke(PhysicalFile);
            return FailReadback ? value + "changed" : value.Replace("\r\n", "\n");
        }
    }

    internal class DeclarationNode : TreeNode, ITcPlcDeclaration
    {
        internal string Decl = "VAR\r\nEND_VAR";
        public string DeclarationText { get => Decl; set => Decl = Write(value); }
    }

    internal sealed class FullSource : DeclarationNode, ITcPlcImplementation
    {
        internal string Impl = "a := 0;\r\n";
        public string ImplementationText { get => Impl; set => Impl = Write(value); }
        public LanguageType Language { get; set; } = LanguageType.ST;
    }

    internal sealed class ImplementationNode : TreeNode, ITcPlcImplementation
    {
        internal string Impl = "a := 0;\r\n";
        public string ImplementationText { get => Impl; set => Impl = Write(value); }
        public LanguageType Language { get; set; } = LanguageType.ST;
    }
}
