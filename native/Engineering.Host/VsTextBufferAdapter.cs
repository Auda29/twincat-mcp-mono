using System;
using System.Linq;
using System.Reflection;
using System.Text;

namespace TwinCatMcp.Engineering.Host
{
    // A host must supply the exact section buffer from its already-bound document,
    // and revalidate RDT cookie, moniker, docdata, context and section mapping.
    // This class does not discover documents or establish PLC object identity.
    internal sealed class VsTextBufferAdapter
    {
        private const int Limit = 65536;
        private readonly IVsTextBufferBackend backend;
        internal VsTextBufferAdapter(IVsTextBufferBackend backend) { this.backend = backend ?? throw new ArgumentNullException("backend"); }

        internal static VsTextBufferAdapter TryCreate(object buffer)
        {
            var backend = VsTextBufferReflection.TryCreate(buffer);
            return backend == null ? null : new VsTextBufferAdapter(backend);
        }

        internal string Read(Func<bool> identity)
        {
            try {
                if (identity == null || !identity() || !backend.CheckAccess()) return null;
                var text = backend.ReadCurrent(Limit);
                return Valid(text) && identity() ? text : null;
            } catch { return null; }
        }

        internal SourceExchangeOutcome CompareExchange(string expected, string replacement, Func<bool> identity, Func<bool> authorizationCurrent = null)
        {
            if (!Valid(expected) || !Valid(replacement) || identity == null) return SourceExchangeOutcome.Unsupported;
            IVsTextBufferEdit edit = null;
            bool submitted = false;
            var result = SourceExchangeOutcome.Unsupported;
            try {
                if (!identity() || !backend.CheckAccess()) return SourceExchangeOutcome.Unsupported;
                edit = backend.CreateEdit();
                if (edit == null) return SourceExchangeOutcome.Unsupported;
                string before = edit.ReadSnapshot(Limit);
                if (!Valid(before)) result = SourceExchangeOutcome.Unsupported;
                else if (!string.Equals(before, expected, StringComparison.Ordinal)) result = SourceExchangeOutcome.Conflict;
                else if (!identity() || !edit.Replace(before.Length, replacement) || edit.HasFailedChanges) result = SourceExchangeOutcome.Unsupported;
                else if (!identity() || (authorizationCurrent != null && !authorizationCurrent())) result = SourceExchangeOutcome.Unsupported;
                else {
                    submitted = true;
                    var after = edit.Apply();
                    result = after != null && string.Equals(after, replacement, StringComparison.Ordinal) &&
                        string.Equals(backend.ReadCurrent(Limit), replacement, StringComparison.Ordinal) && identity()
                        ? SourceExchangeOutcome.Applied : SourceExchangeOutcome.Unknown;
                }
            } catch { result = submitted ? SourceExchangeOutcome.Unknown : SourceExchangeOutcome.Unsupported; }
            finally {
                if (edit != null) {
                    try { edit.Dispose(); }
                    catch { result = submitted ? SourceExchangeOutcome.Unknown : SourceExchangeOutcome.Unsupported; }
                }
            }
            return result;
        }

        private static bool Valid(string text)
        {
            if (text == null || text.Length > Limit || text.IndexOf('\0') >= 0) return false;
            try { new UTF8Encoding(false, true).GetByteCount(text); return true; }
            catch (EncoderFallbackException) { return false; }
        }
    }

    // Test seam; production uses only the real VS interfaces below.
    internal interface IVsTextBufferBackend
    {
        bool CheckAccess();
        string ReadCurrent(int maxLength);
        IVsTextBufferEdit CreateEdit();
    }
    internal interface IVsTextBufferEdit : IDisposable
    {
        string ReadSnapshot(int maxLength);
        bool Replace(int length, string replacement);
        bool HasFailedChanges { get; }
        string Apply();
    }

    // No assemblies are loaded by this adapter. Invoke methods through the actual
    // VS interfaces, never by duck-typing editor objects or distributing SDK DLLs.
    internal sealed class VsTextBufferReflection : IVsTextBufferBackend
    {
        private readonly object buffer;
        private readonly Type bufferType, editType, bufferEditType, snapshotType;
        private VsTextBufferReflection(object value, Type b, Type e, Type be, Type s)
        { buffer = value; bufferType = b; editType = e; bufferEditType = be; snapshotType = s; }

        internal static VsTextBufferReflection TryCreate(object value)
        {
            if (value == null) return null;
            try {
                foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies().Where(a => a.GetName().Name == "Microsoft.VisualStudio.Text.Data")) {
                    var b = assembly.GetType("Microsoft.VisualStudio.Text.ITextBuffer", false);
                    var e = assembly.GetType("Microsoft.VisualStudio.Text.ITextEdit", false);
                    var be = assembly.GetType("Microsoft.VisualStudio.Text.ITextBufferEdit", false);
                    var s = assembly.GetType("Microsoft.VisualStudio.Text.ITextSnapshot", false);
                    var projection = assembly.GetType("Microsoft.VisualStudio.Text.Projection.IProjectionBufferBase", false);
                    if (b != null && e != null && be != null && s != null && projection != null &&
                        b.IsInterface && b.IsInstanceOfType(value) && !projection.IsInstanceOfType(value))
                        return new VsTextBufferReflection(value, b, e, be, s);
                }
            } catch { }
            return null;
        }
        public bool CheckAccess() { return (bool)bufferType.GetMethod("CheckEditAccess", Type.EmptyTypes).Invoke(buffer, null); }
        public string ReadCurrent(int maxLength) { return SnapshotText(bufferType.GetProperty("CurrentSnapshot").GetValue(buffer, null), snapshotType, maxLength); }
        public IVsTextBufferEdit CreateEdit()
        {
            var edit = bufferType.GetMethod("CreateEdit", Type.EmptyTypes).Invoke(buffer, null);
            if (edit != null && editType.IsInstanceOfType(edit) && edit is IDisposable)
                return new ReflectionEdit(edit, editType, bufferEditType, snapshotType);
            var disposable = edit as IDisposable;
            if (disposable != null) disposable.Dispose();
            return null;
        }
        private static string SnapshotText(object snapshot, Type type, int limit)
        {
            if (snapshot == null || !type.IsInstanceOfType(snapshot)) return null;
            int length = (int)type.GetProperty("Length").GetValue(snapshot, null);
            if (length < 0 || length > limit) return null;
            var value = (string)type.GetMethod("GetText", Type.EmptyTypes).Invoke(snapshot, null);
            return value != null && value.Length == length ? value : null;
        }
        private sealed class ReflectionEdit : IVsTextBufferEdit
        {
            private readonly object edit;
            private readonly Type editType, bufferEditType, snapshotType;
            internal ReflectionEdit(object value, Type e, Type be, Type s) { edit = value; editType = e; bufferEditType = be; snapshotType = s; }
            public string ReadSnapshot(int maxLength) { return SnapshotText(bufferEditType.GetProperty("Snapshot").GetValue(edit, null), snapshotType, maxLength); }
            public bool Replace(int length, string replacement)
            { return (bool)editType.GetMethod("Replace", new[] { typeof(int), typeof(int), typeof(string) }).Invoke(edit, new object[] { 0, length, replacement }); }
            public bool HasFailedChanges { get { return (bool)editType.GetProperty("HasFailedChanges").GetValue(edit, null); } }
            public string Apply() { return SnapshotText(bufferEditType.GetMethod("Apply", Type.EmptyTypes).Invoke(edit, null), snapshotType, 65536); }
            public void Dispose() { ((IDisposable)edit).Dispose(); }
        }
    }
}
