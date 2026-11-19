using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
namespace TCatSysManagerLib {
 public interface ITcSysManager { object LookupTreeItem(string item); }
 public interface ITcSysManager7 { object ConfigurationManager {get;} }
 public interface ITcConfigManager { string ActiveTargetPlatform {get;} }
 public interface ITcSmTreeItem { int ChildCount {get;} [IndexerName("Child")] object this[int index] {get;} string ProduceXml(bool recursive); }
 [ComImport, Guid("58E0D7A5-D4E1-4811-9BB8-D0977BD31870")]
 public interface ITcSysManager2 { string GetTargetNetId(); }
 [ComImport, Guid("31F73056-15DA-434C-89EF-455E9D755D68")]
 public interface ITcProjectRoot { ITcSmTreeItem NestedProject {get;} }
 [ComImport, Guid("FCEE1B63-F5FD-4204-909A-A28CAB39FD3C")]
 public interface ITcPlcOnline { bool IsLoggedIn {get;} }
}
