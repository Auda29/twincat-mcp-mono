using System;
using System.Reflection;
using TwinCatMcp.Engineering.Host;

namespace InteropMemberChecks
{
    interface IBase
    {
        string Name { get; }
        string Describe(string value);
    }
    interface ILeftBranch : IBase { }
    interface IRightBranch : IBase { }
    interface ISelected : ILeftBranch, IRightBranch
    {
        string this[int index] { get; }
        string Choice(string value);
        string Choice(int value);
        string Ambiguous(ITagA value);
        string Ambiguous(ITagB value);
        string ReadWrite { get; set; }
        string WriteOnly { set; }
        string Generic<T>(T value);
        string RefValue(ref int value);
        string Optional(string value = "default");
        string Explode();
    }
    interface ITagA { }
    interface ITagB { }
    sealed class Both : ITagA, ITagB { }
    sealed class Fixture : ISelected
    {
        public int Reads, Writes, Calls, Explosions;
        public readonly InvalidOperationException Error = new InvalidOperationException("fixture failure");
        string IBase.Name { get { Reads++; return "contract"; } }
        string IBase.Describe(string value) { Calls++; return "base:" + value; }
        string ISelected.this[int index] { get { Reads++; return "index:" + index; } }
        string ISelected.Choice(string value) { Calls++; return "string:" + value; }
        string ISelected.Choice(int value) { Calls++; return "int:" + value; }
        string ISelected.Ambiguous(ITagA value) { Calls++; return "a"; }
        string ISelected.Ambiguous(ITagB value) { Calls++; return "b"; }
        string ISelected.ReadWrite { get { Reads++; return "read"; } set { Writes++; } }
        string ISelected.WriteOnly { set { Writes++; } }
        string ISelected.Generic<T>(T value) { Calls++; return "generic"; }
        string ISelected.RefValue(ref int value) { Calls++; value++; return "ref"; }
        string ISelected.Optional(string value) { Calls++; return "optional:" + value; }
        string ISelected.Explode() { Explosions++; throw Error; }
        public string Name { get { throw new Exception("concrete decoy getter"); } }
        public string Describe(string value) { throw new Exception("concrete decoy method"); }
        public string ConcreteOnly { get { throw new Exception("concrete-only getter"); } }
        public string ConcreteCall() { throw new Exception("concrete-only method"); }
    }

    interface IPropertyLeft { string Shared { get; } }
    interface IPropertyRight { string Shared { get; } }
    interface IPropertyConflict : IPropertyLeft, IPropertyRight { }
    sealed class PropertyConflict : IPropertyConflict
    {
        public int Reads;
        string IPropertyLeft.Shared { get { Reads++; return "left"; } }
        string IPropertyRight.Shared { get { Reads++; return "right"; } }
    }

    static class Program
    {
        static int checks;
        static object Get(Fixture target, string name, params object[] args)
        { return InteropMemberAccess.Get(typeof(ISelected), target, name, args); }
        static object Call(Fixture target, string name, params object[] args)
        { return InteropMemberAccess.Call(typeof(ISelected), target, name, args); }
        static void Equal(object expected, object actual, string label)
        {
            checks++;
            if (!object.Equals(expected, actual)) throw new Exception(label + ": expected " + expected + ", got " + actual);
        }
        static T Throws<T>(Action action, string label) where T : Exception
        {
            checks++;
            try { action(); }
            catch (T ex) { return ex; }
            catch (Exception ex) { throw new Exception(label + ": unexpected " + ex.GetType().Name, ex); }
            throw new Exception(label + ": no exception");
        }
        static int Main()
        {
            try
            {
                var f = new Fixture();
                Equal("contract", Get(f, "Name"), "inherited property and diamond");
                Equal("base:x", Call(f, "Describe", "x"), "inherited method and diamond");
                Equal("index:3", Get(f, "Item", 3), "indexer");
                Equal("string:x", Call(f, "Choice", "x"), "string overload");
                Equal("int:4", Call(f, "Choice", 4), "integer overload");
                Equal("read", Get(f, "ReadWrite"), "readable property");
                Equal("optional:provided", Call(f, "Optional", "provided"), "explicit optional argument");
                Throws<MissingMemberException>(() => Get(f, "ConcreteOnly"), "concrete-only property");
                Throws<MissingMemberException>(() => Call(f, "ConcreteCall"), "concrete-only method");
                Throws<MissingMemberException>(() => Get(f, "name"), "case-sensitive name");
                Throws<MissingMemberException>(() => Get(f, "WriteOnly"), "setter-only property");
                Throws<AmbiguousMatchException>(() => Call(f, "Ambiguous", new Both()), "assignable ambiguity");
                Throws<AmbiguousMatchException>(() => Call(f, "Ambiguous", new object[] { null }), "null ambiguity");
                int beforeCalls = f.Calls, beforeReads = f.Reads;
                Throws<MissingMemberException>(() => Call(f, "Choice"), "wrong count");
                Throws<MissingMemberException>(() => Call(f, "Choice", 4L), "no numeric coercion");
                Throws<MissingMemberException>(() => Get(f, "Item", "3"), "index type");
                Throws<MissingMemberException>(() => Get(f, "Item", new object[] { null }), "null value type index");
                Throws<MissingMemberException>(() => Call(f, "Generic", "x"), "generic method");
                Throws<MissingMemberException>(() => Call(f, "RefValue", 1), "byref method");
                Throws<MissingMemberException>(() => Call(f, "Optional"), "no optional argument filling");
                Equal(beforeCalls, f.Calls, "rejected calls do not invoke");
                Equal(beforeReads, f.Reads, "rejected getters do not invoke");
                Equal(0, f.Writes, "getters never invoke setters");
                var failure = Throws<TargetInvocationException>(() => Call(f, "Explode"), "target exception");
                Equal(true, object.ReferenceEquals(f.Error, failure.InnerException), "original exception propagated");
                Equal(1, f.Explosions, "failing method invoked once");
                var properties = new PropertyConflict();
                Throws<AmbiguousMatchException>(() => InteropMemberAccess.Get(typeof(IPropertyConflict), properties, "Shared"), "inherited property ambiguity");
                Equal(0, properties.Reads, "ambiguous property is never invoked");
                Console.WriteLine("Passed " + checks + " interop member checks.");
                return 0;
            }
            catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
        }
    }
}
