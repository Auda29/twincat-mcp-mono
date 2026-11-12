using System;
using _3S.CoDeSys.Core.Views;
using _3S.CoDeSys.Core.Objects;
using _3S.CoDeSys.TextDocument;
namespace _3S.CoDeSys.IECTextEditor {
 public abstract class AbstractIECTextEditorBase { public abstract ITextDocument GetTextDocument(bool create); public abstract bool IsDeclarationEditor(); }
 public class IECTextEditor : AbstractIECTextEditorBase, IEditorView, IEditor {
  public Guid ObjectGuid {get;set;} public int ProjectHandle {get;set;} public IEditor Editor {get {return this;}} public bool Declaration; public ITextDocument Doc;
  public override ITextDocument GetTextDocument(bool create) { if(create) throw new Exception(); return Doc; } public override bool IsDeclarationEditor() { return Declaration; }
 }
}
