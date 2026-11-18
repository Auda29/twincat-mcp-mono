using System.Runtime.InteropServices;
namespace TCatSysManagerLib { public interface ITcSysManager { } }
namespace EnvDTE { public interface Solution { } }
namespace EnvDTE80 { public interface SolutionConfiguration2 { } }
namespace SyntheticTargets { public class OtherManager : TCatSysManagerLib.ITcSysManager { } }
namespace SyntheticEquivalence {
 [ComImport, Guid("71D6E7A1-129A-4B1A-A97C-97B8F48B74A1"), TypeIdentifier("7abccfa8-a4b6-4d79-bfdc-972fa6cc6d8a", "SyntheticEquivalence.IShared")]
 public interface IShared { void First(); }
 [ComImport, Guid("71D6E7A1-129A-4B1A-A97C-97B8F48B74A2")]
 public interface IGuidOnly { void First(); }
}
