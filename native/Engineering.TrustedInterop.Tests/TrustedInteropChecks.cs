using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Reflection.Emit;
using System.Text.RegularExpressions;
using TwinCatMcp.Engineering.Host;

// Offline fixtures only: no vendor assemblies, COM activation, or IDE required.
internal static class TrustedInteropChecks
{
    private const string Dte = "EnvDTE.DTE";
    private const string Manager = "TCatSysManagerLib.ITcSysManager";
    private const string Tree = "TCatSysManagerLib.ITcSmTreeItem";
    private static int checks;

    private static void Expect(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
        checks++;
    }

    private static void Failure(EngineeringInteropTypes bindings, string name, string expectedCode = null)
    {
        try { bindings.Resolve(name); }
        catch (PlcProjectAssociationException error)
        {
            Expect(error.Status == "unsupported", "Binding failures must be unsupported");
            Expect(Regex.IsMatch(error.Code, @"^association_interop_[a-z0-9_]+$") && error.Message == error.Code && !error.Code.Contains("secret"),
                "Binding errors must contain only a fixed safe code");
            if (expectedCode != null) Expect(error.Code == expectedCode, "Expected " + expectedCode + ", got " + error.Code);
            return;
        }
        throw new Exception("Expected a binding failure for " + name);
    }

    private static readonly Dictionary<string, Type> Valid = new Dictionary<string, Type>(StringComparer.Ordinal) {
        { Dte, typeof(EnvDTE.DTE) },
        { "EnvDTE.Solution", typeof(EnvDTE.Solution) },
        { "EnvDTE.Projects", typeof(EnvDTE.Projects) },
        { "EnvDTE.Project", typeof(EnvDTE.Project) },
        { "EnvDTE.ProjectItems", typeof(EnvDTE.ProjectItems) },
        { "EnvDTE.ProjectItem", typeof(EnvDTE.ProjectItem) },
        { "EnvDTE.Events", typeof(EnvDTE.Events) },
        { "EnvDTE.Documents", typeof(EnvDTE.Documents) },
        { "EnvDTE.Document", typeof(EnvDTE.Document) },
        { "EnvDTE.SolutionBuild", typeof(EnvDTE.SolutionBuild) },
        { "EnvDTE.SolutionContexts", typeof(EnvDTE.SolutionContexts) },
        { "EnvDTE.SolutionContext", typeof(EnvDTE.SolutionContext) },
        { "EnvDTE.BuildDependencies", typeof(EnvDTE.BuildDependencies) },
        { "EnvDTE.BuildDependency", typeof(EnvDTE.BuildDependency) },
        { Manager, typeof(TCatSysManagerLib.ITcSysManager) },
        { Tree, typeof(TCatSysManagerLib.ITcSmTreeItem) },
        { "EnvDTE._dispBuildEvents_Event", typeof(EnvDTE._dispBuildEvents_Event) },
        { "EnvDTE.SolutionConfiguration", typeof(EnvDTE.SolutionConfiguration) },
        { "EnvDTE80.SolutionConfiguration2", typeof(EnvDTE80.SolutionConfiguration2) },
        { "TCatSysManagerLib.ITcSysManager7", typeof(TCatSysManagerLib.ITcSysManager7) },
        { "TCatSysManagerLib.ITcConfigManager", typeof(TCatSysManagerLib.ITcConfigManager) }
    };

    private static Type Find(string name)
    {
        Type result;
        return Valid.TryGetValue(name, out result) ? result : null;
    }

    private static Type Emit(string assemblyName, string fullName, bool isInterface = true, bool generic = false)
    {
        var assembly = AppDomain.CurrentDomain.DefineDynamicAssembly(new AssemblyName(assemblyName), AssemblyBuilderAccess.Run);
        var module = assembly.DefineDynamicModule(assemblyName);
        var flags = TypeAttributes.Public | (isInterface ? TypeAttributes.Interface | TypeAttributes.Abstract : TypeAttributes.Class);
        var type = module.DefineType(fullName, flags);
        if (generic) type.DefineGenericParameters("T");
        return type.CreateType();
    }

    private static void Rejected(Type invalid, string name)
    {
        var bindings = new EngineeringInteropTypes(n => n == name ? invalid : Find(n));
        Failure(bindings, name);
        Failure(bindings, name);
    }

    public static int Main()
    {
        // Force static fixture assembly loads before either policy is constructed.
        Expect(typeof(EnvDTE.DTE).Assembly != typeof(TCatSysManagerLib.ITcSysManager).Assembly, "Fixture families differ");
        var syntheticA = Assembly.Load("TrustedInteropSyntheticA");
        var syntheticB = Assembly.Load("TrustedInteropSyntheticB");
        var equivalentA = syntheticA.GetType("SyntheticEquivalence.IShared", true);
        var equivalentB = syntheticB.GetType("SyntheticEquivalence.IShared", true);
        Expect(!ReferenceEquals(equivalentA, equivalentB) && equivalentA.IsEquivalentTo(equivalentB), "TypeIdentifier contracts are CLR equivalent despite different identities");
        Expect(equivalentA.GetMethods().Length == 1 && equivalentB.GetMethods().Length == 2, "Equivalent contracts can have different member subsets");
        Expect(!syntheticA.GetType("SyntheticEquivalence.IGuidOnly", true).IsEquivalentTo(syntheticB.GetType("SyntheticEquivalence.IGuidOnly", true)), "Matching GUID alone does not establish equivalence");
        Emit("EnvDTE", "TCatSysManagerLib.ITcSysManager7");
        Emit("Microsoft.VisualStudio.Interop", "TCatSysManagerLib.ITcConfigManager");
        var legacyPlatform = new EngineeringInteropTypes();
        Expect(legacyPlatform.Resolve("TCatSysManagerLib.ITcSysManager7") == typeof(TCatSysManagerLib.ITcSysManager7), "Legacy manager7 ignores EnvDTE-named assembly");
        Expect(legacyPlatform.Resolve("TCatSysManagerLib.ITcConfigManager") == typeof(TCatSysManagerLib.ITcConfigManager), "Legacy config manager ignores Microsoft interop assembly");
        var competingManager = Emit("Interop.TCatSysManagerLib", Manager);
        var legacy = new EngineeringInteropTypes();
        Failure(legacy, Manager);

        var calls = new Dictionary<string, int>(StringComparer.Ordinal);
        var currentManager = typeof(TCatSysManagerLib.ITcSysManager);
        var chosen = new EngineeringInteropTypes(n => {
            int count; calls.TryGetValue(n, out count); calls[n] = count + 1;
            return n == Manager ? currentManager : Find(n);
        });
        Expect(calls.ContainsKey(Manager) && calls[Manager] == 1, "Explicit binding must be requested eagerly once");
        currentManager = competingManager;
        Expect(chosen.Resolve(Manager) == typeof(TCatSysManagerLib.ITcSysManager), "Explicit type wins over competing loaded name");
        Expect(!chosen.Resolve(Manager).IsAssignableFrom(competingManager), "Competing target is not assignable to selected contract");
        var wrongTarget = Activator.CreateInstance(syntheticA.GetType("SyntheticTargets.OtherManager", true));
        Expect(!new ReflectedPlcProjectAssociationAccess(new object(), chosen).Supports(wrongTarget, Manager), "Wrong target does not implement selected contract");
        var countAfterConstruction = calls[Manager];
        Expect(countAfterConstruction == 1, "Explicit binding must be requested eagerly once");
        chosen.Resolve(Manager);
        Expect(calls[Manager] == countAfterConstruction, "Resolver callback must not be queried again");
        Emit("TCatSysManagerLib", Tree);
        Expect(chosen.Resolve(Tree) == typeof(TCatSysManagerLib.ITcSmTreeItem), "Late competing assembly does not alter frozen bindings");

        var missingCalls = 0;
        var noManager = new EngineeringInteropTypes(n => { if (n == Manager) { missingCalls++; return null; } return Find(n); });
        Failure(noManager, Manager);
        Failure(noManager, Manager);
        Expect(missingCalls == 1, "Missing explicit binding must not be retried");
        var throwingCalls = 0;
        var throwsManager = new EngineeringInteropTypes(n => { if (n == Manager) { throwingCalls++; throw new InvalidOperationException("secret loader path"); } return Find(n); });
        Failure(throwsManager, Manager);
        Failure(throwsManager, Manager);
        Expect(throwingCalls == 1, "Throwing explicit binding must not be retried");
        Rejected(typeof(EnvDTE.DTE), Manager); // FullName mismatch.
        Rejected(new TypeDelegator(typeof(TCatSysManagerLib.ITcSysManager)), Manager);
        Rejected(Emit("InvalidClassFixture", Manager, false), Manager);
        Rejected(Emit("InvalidGenericFixture", Manager, true, true), Manager);
        var reflectionOnly = Assembly.ReflectionOnlyLoadFrom(typeof(TCatSysManagerLib.ITcSysManager).Assembly.Location).GetType(Manager);
        Rejected(reflectionOnly, Manager);
        // Exact names alone cannot join contracts from different assemblies in a family.
        Rejected(competingManager, Manager);
        var foreignManager = syntheticA.GetType(Manager, true);
        var tcMismatch = new EngineeringInteropTypes(n => n == Manager ? foreignManager : Find(n));
        Failure(tcMismatch, Manager, "association_interop_family_mismatch_tcatsysmanagerlib_itcsysmanager");
        var foreignSolution = syntheticA.GetType("EnvDTE.Solution", true);
        var envMismatch = new EngineeringInteropTypes(n => n == "EnvDTE.Solution" ? foreignSolution : Find(n));
        Failure(envMismatch, "EnvDTE.Solution", "association_interop_family_mismatch_envdte_solution");
        var foreignConfiguration = syntheticA.GetType("EnvDTE80.SolutionConfiguration2", true);
        var badInheritance = new EngineeringInteropTypes(n => n == "EnvDTE80.SolutionConfiguration2" ? foreignConfiguration : Find(n));
        Failure(badInheritance, "EnvDTE80.SolutionConfiguration2", "association_interop_inheritance_mismatch_envdte80_solutionconfiguration2");

        var optionalMissing = new EngineeringInteropTypes(n => n == "TCatSysManagerLib.ITcSysManager7" || n == "TCatSysManagerLib.ITcConfigManager" ? null : Find(n));
        Expect(optionalMissing.Resolve(Manager) == typeof(TCatSysManagerLib.ITcSysManager), "Optional output contracts do not disable association");
        Expect(optionalMissing.Resolve(Tree) == typeof(TCatSysManagerLib.ITcSmTreeItem), "Required tree contract remains usable");
        var outputNames = new HashSet<string>(new[] { "EnvDTE.Windows", "EnvDTE.Window", "EnvDTE.OutputWindow", "EnvDTE.OutputWindowPanes", "EnvDTE.OutputWindowPane", "EnvDTE.TextDocument", "EnvDTE.TextPoint", "EnvDTE.EditPoint", "EnvDTE80.SolutionConfiguration2" });
        var missingOutputCalls = new HashSet<string>();
        var noOutput = new EngineeringInteropTypes(n => { if (outputNames.Contains(n)) { missingOutputCalls.Add(n); return null; } return Find(n); });
        Expect(missingOutputCalls.SetEquals(outputNames), "All missing optional output and EnvDTE80 bindings were queried eagerly");
        Expect(noOutput.Resolve(Manager) == typeof(TCatSysManagerLib.ITcSysManager) && noOutput.Resolve(Tree) == typeof(TCatSysManagerLib.ITcSmTreeItem) && noOutput.Resolve(Dte) == typeof(EnvDTE.DTE), "Missing output and EnvDTE80 types do not disable association");
        var callbackLoads = 0;
        var lateLoaded = new EngineeringInteropTypes(n => {
            if (n != Manager) return Find(n);
            callbackLoads++;
            return Assembly.Load(File.ReadAllBytes(typeof(TCatSysManagerLib.ITcSysManager).Assembly.Location)).GetType(Manager, true);
        });
        Failure(lateLoaded, Manager, "association_interop_invalid_tcatsysmanagerlib_itcsysmanager");
        Failure(lateLoaded, Manager);
        Expect(callbackLoads == 1, "Callback-loaded assembly rejected from pre-callback snapshot without retry");
        Console.WriteLine("Trusted interop checks passed: " + checks);
        return 0;
    }
}
