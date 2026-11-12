using System;
namespace _3S.CoDeSys.Core.Objects { public interface IEditor { Guid ObjectGuid { get; } int ProjectHandle { get; } } }
namespace _3S.CoDeSys.Core.Views { public interface IEditorView { _3S.CoDeSys.Core.Objects.IEditor Editor { get; } } }
