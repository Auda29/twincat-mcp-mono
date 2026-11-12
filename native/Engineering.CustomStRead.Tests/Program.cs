using System;
using System.IO;
using System.Collections.Generic;
using System.Threading;
using System.Web.Script.Serialization;
using TwinCatMcp.Engineering.Host;
using _3S.CoDeSys.IECTextEditor;
using _3S.CoDeSys.TextDocument;
class Doc : ITextDocument { public string Value; public int Length { get {return Value.Length;} } public string GetText(int s,int n){return Value.Substring(s,n);} }
class Program {
 sealed class Inline : SynchronizationContext { public override void Post(SendOrPostCallback cb, object state) { cb(state); } }
 static void Check(bool b,string m){if(!b)throw new Exception(m);}
 static void Main(){var dir=Path.Combine(Path.GetTempPath(),"custom-fixture-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(dir);try{
 var project=Path.Combine(dir,"x.plcproj");var source=Path.Combine(dir,"x.TcPOU");File.WriteAllText(source,"saved content must not be read");
 File.WriteAllText(project,"<Project><ItemGroup><Compile Include=\"x.TcPOU\" /></ItemGroup><Import Project=\"$(MSBuildExtensionsPath)\\Beckhoff\\TwinCAT\\v3.1\\TcPlcProject.targets\" /></Project>");
 var id=Guid.NewGuid();var objectId=source+"|"+id.ToString("D")+"|MyPou.Run"; var doc=new Doc{Value="dirty live text"};var view=new IECTextEditor{ObjectGuid=id,ProjectHandle=22,Declaration=true,Doc=doc}; bool? state=true; string ctx="session";
 var reader=new CustomStReader(project,(o,s)=>view,p=>p==project?false:state,()=>ctx,"session");
 var r=reader.Read(objectId,"declaration");Check(r!=null && r.Text==doc.Value && r.DirtyState=="dirty" && r.Source=="liveAttachedDocument" && !r.AtomicWriteSupported,"live read");
 var preview=reader.Preview(objectId,"declaration","new text");Check(preview!=null && preview.Text=="dirty live text" && preview.ProposedText=="new text" && doc.Value=="dirty live text" && preview.Text.Substring(0,preview.ChangeOffset)+preview.InsertedText+preview.Text.Substring(preview.ChangeOffset+preview.DeletedText.Length)==preview.ProposedText,"preview");
 var savedMetadata="<TcPlcObject><POU Name=\"MyPou\" Id=\""+Guid.NewGuid()+"\"><Method Name=\"Run\" Id=\""+id+"\"><Declaration><![CDATA[old persisted declaration]]></Declaration></Method></POU></TcPlcObject>";
 File.WriteAllText(source,savedMetadata);var targets=reader.Targets(source);Check(targets!=null && targets.Status=="succeeded" && (int)targets.Result["count"]==1,"native-verified active method discovery");Check(File.ReadAllText(source)==savedMetadata && reader.Read(objectId,"declaration").Text=="dirty live text","metadata not live text fallback");
 var session=Guid.NewGuid();var started=DateTime.UtcNow;var solution=Path.Combine(dir,"x.sln");var bound=new HostContext(session,123,started,solution,project,"epoch");var json=new JavaScriptSerializer();int approvals=0;
 using(var provider=EngineeringProviderFactory.CreateWithEditorViews(new object(),p=>p==project?false:state,()=>bound,a=>{approvals++;return false;},new Inline(),p=>null,p=>false,(o,s)=>o==objectId && s=="declaration"?view:null)) {
  Func<string,object,Dictionary<string,object>> call=(op,args)=>(Dictionary<string,object>)json.DeserializeObject(provider.DispatchAsync(json.Serialize(new {protocolVersion=1,sessionId=session.ToString("D"),operationId=Guid.NewGuid().ToString("D"),operation=op,expected=new {idePid=123,ideStartedUtc=started.ToString("o"),solutionFile=solution,projectFile=project,contextEpoch="epoch"},arguments=args}),CancellationToken.None).GetAwaiter().GetResult());
  var discovered=call("source.targets",new {moniker=source});Check((string)discovered["status"]=="succeeded" && (int)((Dictionary<string,object>)discovered["result"])["count"]==1,"provider custom targets dispatch");
  var read=call("source.read",new {objectId,section="declaration"});var readResult=(Dictionary<string,object>)read["result"];var provenance=(Dictionary<string,object>)read["provenance"];Check((string)read["status"]=="succeeded" && (string)readResult["text"]==doc.Value && (string)readResult["sourceMode"]=="customStReadOnly" && !(bool)readResult["truncated"] && (string)provenance["dirtyState"]=="dirty","provider live read text and provenance");
  var response=call("source.preview",new {objectId,section="declaration",proposedText="proposed live text"});var result=(Dictionary<string,object>)response["result"];Check((string)response["status"]=="succeeded" && (string)result["beforeText"]==doc.Value && (string)result["proposedText"]=="proposed live text" && !(bool)result["applySupported"] && !result.ContainsKey("previewOperationId") && !result.ContainsKey("baselineDigest") && !(bool)result["truncated"] && approvals==0 && doc.Value=="dirty live text","provider read-only preview contract");
  var apply=call("source.apply",new {previewId=(string)response["operationId"],approvalExpiresUtc=DateTime.UtcNow.AddMinutes(1).ToString("o"),baselineDigest=(string)result["documentDigest"],proposedDigest=(string)result["proposedDocumentDigest"],projectRevision=(string)result["projectRevision"]});Check((string)apply["status"]=="unsupported" && approvals==0 && doc.Value=="dirty live text","custom preview operation cannot authorize mutation");
 }
 bool projectDirty=false;var membershipChanging=new CustomStReader(project,(o,s)=>{if(o==objectId && s=="implementation")projectDirty=true;return view;},p=>p==project?projectDirty:state,()=>ctx,"session");Check(membershipChanging.Targets(source)==null,"target aggregate rejects project dirtied after a supported section");
 Check(reader.Read(objectId,"implementation")==null,"section");view.ProjectHandle=23;Check(reader.Read(objectId,"declaration")==null,"handle pin");view.ProjectHandle=22;
 state=null;Check(reader.Read(objectId,"declaration")==null,"dirty unknown");state=true;ctx="other";Check(reader.Read(objectId,"declaration")==null,"context");ctx="session";
 var changing=new CustomStReader(project,(o,s)=>new IECTextEditor{ObjectGuid=id,ProjectHandle=22,Declaration=true,Doc=doc},p=>false,()=>ctx,"session"); Check(changing.Read(objectId,"declaration")==null,"view identity");
 File.WriteAllText(project,"<Project><ItemGroup><Compile Include=\"*.TcPOU\"/></ItemGroup></Project>");Check(reader.Read(objectId,"declaration")==null,"dynamic project");
 Console.WriteLine("Custom editor synthetic fixtures passed.");
 }finally{if(!Path.GetFullPath(dir).StartsWith(Path.Combine(Path.GetTempPath(),"custom-fixture-"),StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException();Directory.Delete(dir,true);}}
}

