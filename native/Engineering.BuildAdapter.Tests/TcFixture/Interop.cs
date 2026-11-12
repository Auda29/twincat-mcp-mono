using System.Runtime.CompilerServices;
namespace TCatSysManagerLib {
 public interface ITcSysManager { object LookupTreeItem(string item); }
 public interface ITcSysManager7 { object ConfigurationManager {get;} }
 public interface ITcConfigManager { string ActiveTargetPlatform {get;} }
 public interface ITcSmTreeItem { int ChildCount {get;} [IndexerName("Child")] object this[int index] {get;} string ProduceXml(bool recursive); }
}
