using System;
namespace EnvDTE {
 public interface DTE { Events Events {get;} Solution Solution {get;} Documents Documents {get;} }
 public interface Events { object BuildEvents {get;} }
 public interface _dispBuildEvents_Event { event Action<string,string> OnBuildBegin; event Action<string,string,string> OnBuildProjConfigBegin; event Action<string,string,string,string,bool> OnBuildProjConfigDone; event Action<string,string> OnBuildDone; }
 public interface Solution { string FullName {get;} bool Saved {get;} Projects Projects {get;} SolutionBuild SolutionBuild {get;} }
 public interface Projects { int Count {get;} object Item(object index); }
 public interface Project { string FileName {get;} string Kind {get;} object Object {get;} object ProjectItems {get;} bool Saved {get;} string UniqueName {get;} }
 public interface ProjectItems { int Count {get;} object Item(object index); }
 public interface ProjectItem { object SubProject {get;} }
 public interface Documents { int Count {get;} object Item(object index); }
 public interface Document { bool Saved {get;} string FullName {get;} }
 public interface SolutionBuild { string BuildState {get;} int LastBuildInfo {get;} object ActiveConfiguration {get;} object BuildDependencies {get;} void BuildProject(string configuration, string project, bool wait); }
 public interface SolutionConfiguration { string Name {get;} object SolutionContexts {get;} }
 public interface SolutionContexts { int Count {get;} object Item(object index); }
 public interface SolutionContext { string ProjectName {get;} bool ShouldBuild {get;} string ConfigurationName {get;} string PlatformName {get;} }
 public interface BuildDependencies { object Item(object index); }
 public interface BuildDependency { object Project {get;} object RequiredProjects {get;} }
}
namespace EnvDTE80 { public interface SolutionConfiguration2 : EnvDTE.SolutionConfiguration { string PlatformName {get;} } }
