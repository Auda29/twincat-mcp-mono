using System;
using System.Linq;
using System.Reflection;

namespace TwinCatMcp.Engineering.Host
{
    // Resolves only public types from assemblies already loaded by the IDE.
    // There is no Assembly.Load, duck typing, setter, transaction or disk fallback.
    internal sealed class CustomStReflection
    {
        private readonly object view, sectionEditor;
        private readonly PropertyInfo editorProperty, guidProperty, handleProperty, lengthProperty;
        private readonly MethodInfo declarationMethod, documentMethod, textMethod;
        private readonly Type editorType, documentType;
        private CustomStReflection(object view, object sectionEditor, Type editorType, Type documentType,
            PropertyInfo editorProperty, PropertyInfo guidProperty, PropertyInfo handleProperty, PropertyInfo lengthProperty,
            MethodInfo declarationMethod, MethodInfo documentMethod, MethodInfo textMethod)
        { this.view = view; this.sectionEditor = sectionEditor; this.editorType = editorType; this.documentType = documentType;
          this.editorProperty = editorProperty; this.guidProperty = guidProperty; this.handleProperty = handleProperty; this.lengthProperty = lengthProperty;
          this.declarationMethod = declarationMethod; this.documentMethod = documentMethod; this.textMethod = textMethod; }
        internal static CustomStReflection Create(object view)
        {
            if (view == null) return null;
            try {
                var assemblies = AppDomain.CurrentDomain.GetAssemblies();
                var core = Single(assemblies, "Core"); var plugin = Single(assemblies, "IECTextEditor.plugin"); var text = Single(assemblies, "TextDocument");
                if (core == null || plugin == null || text == null) return null;
                var vt = core.GetType("_3S.CoDeSys.Core.Views.IEditorView", false);
                var et = core.GetType("_3S.CoDeSys.Core.Objects.IEditor", false);
                var bt = plugin.GetType("_3S.CoDeSys.IECTextEditor.AbstractIECTextEditorBase", false);
                var ct = plugin.GetType("_3S.CoDeSys.IECTextEditor.IECTextEditor", false);
                var dt = text.GetType("_3S.CoDeSys.TextDocument.ITextDocument", false);
                if (vt == null || et == null || bt == null || ct == null || dt == null || !vt.IsPublic || !et.IsPublic || !bt.IsPublic || !ct.IsPublic || !dt.IsPublic || !vt.IsInterface || !et.IsInterface || !dt.IsInterface || !bt.IsAssignableFrom(ct) || !vt.IsInstanceOfType(view)) return null;
                var ep = vt.GetProperty("Editor"); var gp = et.GetProperty("ObjectGuid"); var hp = et.GetProperty("ProjectHandle"); var lp = dt.GetProperty("Length");
                var dm = bt.GetMethod("IsDeclarationEditor", BindingFlags.Instance | BindingFlags.Public, null, Type.EmptyTypes, null);
                var docm = bt.GetMethod("GetTextDocument", BindingFlags.Instance | BindingFlags.Public, null, new[] { typeof(bool) }, null);
                var tm = dt.GetMethod("GetText", BindingFlags.Instance | BindingFlags.Public, null, new[] { typeof(int), typeof(int) }, null);
                if (!Readable(ep, et) || !Readable(gp, typeof(Guid)) || !Readable(hp, typeof(int)) || !Readable(lp, typeof(int)) || dm == null || dm.ReturnType != typeof(bool) || docm == null || docm.ReturnType != dt || tm == null || tm.ReturnType != typeof(string)) return null;
                var editor = ep.GetValue(view, null); if (editor == null || !et.IsInstanceOfType(editor)) return null;
                object sectionEditor = ct.IsInstanceOfType(view) ? view : ct.IsInstanceOfType(editor) ? editor : null;
                if (sectionEditor == null) return null;
                return new CustomStReflection(view, sectionEditor, et, dt, ep, gp, hp, lp, dm, docm, tm);
            } catch { return null; }
        }
        private static Assembly Single(Assembly[] all, string name) { var matches = all.Where(a => string.Equals(a.GetName().Name, name, StringComparison.Ordinal)).ToArray(); return matches.Length == 1 ? matches[0] : null; }
        private static bool Readable(PropertyInfo p, Type type) { return p != null && p.PropertyType == type && p.GetIndexParameters().Length == 0 && p.GetGetMethod() != null && p.GetGetMethod().IsPublic; }
        internal object Editor() { object e = editorProperty.GetValue(view, null); return e != null && editorType.IsInstanceOfType(e) ? e : null; }
        internal Guid ObjectGuid() { return (Guid)guidProperty.GetValue(Editor(), null); }
        internal int ProjectHandle() { return (int)handleProperty.GetValue(Editor(), null); }
        internal bool IsDeclaration() { return (bool)declarationMethod.Invoke(sectionEditor, null); }
        internal object Document() { var d = documentMethod.Invoke(sectionEditor, new object[] { false }); return d != null && documentType.IsInstanceOfType(d) ? d : null; }
        internal string Text(object document) { int length = (int)lengthProperty.GetValue(document, null); if (length < 0 || length > 16384) return null; var result = (string)textMethod.Invoke(document, new object[] { 0, length }); return result != null && result.Length == length ? result : null; }
    }
}
