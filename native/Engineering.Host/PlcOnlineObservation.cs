using System;
using System.Globalization;
using System.Reflection;

namespace TwinCatMcp.Engineering.Host
{
    internal sealed class PlcOnlineObservation
    {
        internal bool LoggedIn { get; }
        internal string ConfiguredAmsNetId { get; }
        internal PlcOnlineObservation(bool loggedIn, string configuredAmsNetId)
        {
            LoggedIn = loggedIn;
            ConfiguredAmsNetId = configuredAmsNetId;
        }

        internal static PlcOnlineObservation Capture(EngineeringInteropTypes types, object manager, object plcRoot)
        {
            if (!types.IsAuthoritative) return null;
            var assembly = types.Resolve("TCatSysManagerLib.ITcSysManager").Assembly;
            var manager2 = Interface(assembly, "ITcSysManager2");
            var projectRoot = Interface(assembly, "ITcProjectRoot");
            var online = Interface(assembly, "ITcPlcOnline");
            if (manager2 == null || projectRoot == null || online == null || !manager2.IsInstanceOfType(manager)
                || !projectRoot.IsInstanceOfType(plcRoot)) return null;
            var getNested = projectRoot.GetProperty("NestedProject");
            var getLogin = online.GetProperty("IsLoggedIn");
            var getTarget = manager2.GetMethod("GetTargetNetId", Type.EmptyTypes);
            if (getNested?.PropertyType != types.Resolve("TCatSysManagerLib.ITcSmTreeItem")
                || getLogin?.PropertyType != typeof(bool) || getTarget?.ReturnType != typeof(string)) return null;
            var nested = getNested.GetValue(plcRoot);
            if (!online.IsInstanceOfType(nested)) return null;
            var firstTarget = getTarget.Invoke(manager, null) as string;
            var firstLogin = (bool)getLogin.GetValue(nested);
            var secondTarget = getTarget.Invoke(manager, null) as string;
            var secondLogin = (bool)getLogin.GetValue(nested);
            if (firstTarget != secondTarget || firstLogin != secondLogin) return null;
            // GetTargetNetId observes the selected configuration, not the ADS
            // port or the actual target of a previously established login.
            return new PlcOnlineObservation(secondLogin, ValidNetId(secondTarget) ? secondTarget : null);
        }

        private static Type Interface(Assembly assembly, string name)
        {
            var type = assembly.GetType("TCatSysManagerLib." + name, false);
            return type != null && type.IsInterface && type.IsPublic && type.IsImport
                && ReferenceEquals(type.Assembly, assembly) ? type : null;
        }

        private static bool ValidNetId(string value)
        {
            if (string.IsNullOrEmpty(value) || value.Length > 23 || value == "0.0.0.0.0.0") return false;
            var parts = value.Split('.');
            if (parts.Length != 6) return false;
            foreach (var part in parts)
            {
                byte octet;
                if (!byte.TryParse(part, NumberStyles.None, CultureInfo.InvariantCulture, out octet)
                    || part != octet.ToString(CultureInfo.InvariantCulture)) return false;
            }
            return true;
        }
    }
}
