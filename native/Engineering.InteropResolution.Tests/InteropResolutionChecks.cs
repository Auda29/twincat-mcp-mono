using System;
using System.Reflection;
using System.Reflection.Emit;
using TwinCatMcp.Engineering.Host;

internal static class InteropResolutionChecks
{
    private static int checks;
    private static readonly object Target = new object();

    private static void Expect(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
        checks++;
    }

    private static ReflectedPlcProjectAssociationAccess Access()
    {
        return new ReflectedPlcProjectAssociationAccess(Target);
    }

    private static void ExpectFailure(string name, string code)
    {
        try { Access().Supports(Target, name); }
        catch (PlcProjectAssociationException error)
        {
            Expect(error.Status == "unsupported", "Expected unsupported for " + code);
            Expect(error.Code == code && error.Message == code, "Expected safe error " + code);
            return;
        }
        throw new Exception("Expected failure " + code);
    }

    private static Type EmitDte(string assemblyName, string solution)
    {
        var assembly = AppDomain.CurrentDomain.DefineDynamicAssembly(new AssemblyName(assemblyName), AssemblyBuilderAccess.Run);
        var module = assembly.DefineDynamicModule(assemblyName);
        var contract = module.DefineType("EnvDTE.DTE", TypeAttributes.Public | TypeAttributes.Interface | TypeAttributes.Abstract);
        var property = contract.DefineProperty("Solution", PropertyAttributes.None, typeof(string), Type.EmptyTypes);
        var contractGetter = contract.DefineMethod("get_Solution", MethodAttributes.Public | MethodAttributes.Abstract | MethodAttributes.Virtual | MethodAttributes.SpecialName | MethodAttributes.HideBySig, typeof(string), Type.EmptyTypes);
        property.SetGetMethod(contractGetter);
        var interfaceType = contract.CreateType();
        var type = module.DefineType("Fixture.DteImplementation", TypeAttributes.Public | TypeAttributes.Class);
        type.AddInterfaceImplementation(interfaceType);
        type.DefineDefaultConstructor(MethodAttributes.Public);
        var getter = type.DefineMethod("get_Solution", MethodAttributes.Public | MethodAttributes.Virtual | MethodAttributes.SpecialName | MethodAttributes.HideBySig, typeof(string), Type.EmptyTypes);
        var il = getter.GetILGenerator();
        il.Emit(OpCodes.Ldstr, solution);
        il.Emit(OpCodes.Ret);
        type.DefineMethodOverride(getter, interfaceType.GetMethod("get_Solution"));
        return type.CreateType();
    }

    private static Type[] EmitTypes(string assemblyName, string[][] names)
    {
        var assembly = AppDomain.CurrentDomain.DefineDynamicAssembly(new AssemblyName(assemblyName), AssemblyBuilderAccess.Run);
        var module = assembly.DefineDynamicModule(assemblyName);
        var result = new Type[names.Length - 1];
        for (int i = 1; i < names.Length; i++)
        {
            var contract = module.DefineType(names[i][0], TypeAttributes.Public | TypeAttributes.Interface | TypeAttributes.Abstract);
            var interfaceType = contract.CreateType();
            var type = module.DefineType("Fixture.Implementation" + i, TypeAttributes.Public | TypeAttributes.Class);
            type.AddInterfaceImplementation(interfaceType);
            type.DefineDefaultConstructor(MethodAttributes.Public);
            result[i - 1] = type.CreateType();
        }
        return result;
    }

    public static int Main()
    {
        // These fixture types exist only in this process. No COM, IDE, or PIA is loaded.
        var names = new[] {
            new[] { "EnvDTE.DTE", "envdte_dte" },
            new[] { "EnvDTE.Solution", "envdte_solution" },
            new[] { "EnvDTE.Projects", "envdte_projects" },
            new[] { "EnvDTE.Project", "envdte_project" },
            new[] { "EnvDTE.ProjectItems", "envdte_projectitems" },
            new[] { "EnvDTE.ProjectItem", "envdte_projectitem" },
            new[] { "TCatSysManagerLib.ITcSysManager", "tcatsysmanagerlib_itcsysmanager" },
            new[] { "TCatSysManagerLib.ITcSmTreeItem", "tcatsysmanagerlib_itcsmtreeitem" }
        };
        foreach (var entry in names)
            ExpectFailure(entry[0], "association_interop_missing_" + entry[1]);
        ExpectFailure("private-caller-data", "association_interop_missing_unknown_interface");

        var ignored = EmitDte("UnrelatedFixture", "ignored");
        ExpectFailure("EnvDTE.DTE", "association_interop_missing_envdte_dte");
        var allowed = EmitDte("EnvDTE", "fixture solution");
        var instance = Activator.CreateInstance(allowed);
        var access = Access();
        Expect(access.Supports(instance, "EnvDTE.DTE"), "Allowlisted loaded type is resolved");
        Expect(!access.Supports(Activator.CreateInstance(ignored), "EnvDTE.DTE"), "Unrelated assembly type is ignored");
        Expect((string)access.Get(instance, "EnvDTE.DTE", "Solution") == "fixture solution", "Get invokes the emitted Solution property");

        var duplicate = EmitDte("Microsoft.VisualStudio.Interop", "duplicate");
        Expect(duplicate != allowed, "Fixtures have distinct type identities");
        ExpectFailure("EnvDTE.DTE", "association_interop_ambiguous_envdte_dte");
        // Deliberately put some EnvDTE fixture interfaces in a TCat-named
        // assembly: the existing resolver uses one broad simple-name allowlist,
        // not namespace-family or authenticated PIA identity validation.
        var firstTypes = EmitTypes("TCatSysManagerLib", names);
        for (int i = 1; i < names.Length; i++)
            Expect(Access().Supports(Activator.CreateInstance(firstTypes[i - 1]), names[i][0]), "Unique loaded type resolves: " + names[i][0]);
        EmitTypes("Interop.TCatSysManagerLib", names);
        for (int i = 1; i < names.Length; i++)
            ExpectFailure(names[i][0], "association_interop_ambiguous_" + names[i][1]);
        Console.WriteLine("Interop resolution checks passed: " + checks);
        return 0;
    }
}
