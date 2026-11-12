using System;
using System.Collections.Generic;
using System.Threading;
using System.Web.Script.Serialization;
using TwinCatMcp.Engineering.Host;

internal static class ProviderChecks
{
    private sealed class Inline : SynchronizationContext
    { public override void Post(SendOrPostCallback callback, object state) { callback(state); } }
    private static void Require(bool value, string message) { if (!value) throw new Exception(message); }
    private static int Main()
    {
        var session = Guid.NewGuid(); var start = DateTime.UtcNow;
        var context = new HostContext(session, 123, start, @"C:\fixture\machine.sln", @"C:\fixture\machine.plcproj", "epoch");
        var json = new JavaScriptSerializer();
        using (var provider = EngineeringProviderFactory.Create(new object(), _ => false, () => context, _ => false, new Inline()))
        {
            Func<Guid, string, object, Dictionary<string, object>> call = (id, operation, args) => {
                var request = json.Serialize(new { protocolVersion = 1, sessionId = session.ToString("D"), operationId = id.ToString("D"), operation,
                    expected = new { idePid = 123, ideStartedUtc = start.ToString("o"), solutionFile = context.SolutionFile, projectFile = context.ProjectFile, contextEpoch = "epoch" }, arguments = args });
                return (Dictionary<string, object>)json.DeserializeObject(provider.DispatchAsync(request, CancellationToken.None).GetAwaiter().GetResult());
            };
            for (int i = 0; i < 300; i++) Require((string)call(Guid.NewGuid(), "session.ping", new { })["status"] == "succeeded", "read-only polls must not fill replay budget");
            var expired = call(Guid.NewGuid(), "build.start", new { approvalExpiresUtc = DateTime.UtcNow.AddMinutes(-1).ToString("o") });
            Require((string)expired["status"] == "refused" && (string)expired["error"] == "invalid_approval_expiry", "expired approvals rejected");
            var distant = call(Guid.NewGuid(), "build.start", new { approvalExpiresUtc = DateTime.UtcNow.AddMinutes(4).ToString("o") });
            Require((string)distant["status"] == "refused" && (string)distant["error"] == "invalid_approval_expiry", "long approvals rejected");
            var malformed = call(Guid.NewGuid(), "build.start", new { approvalExpiresUtc = "not-a-date" });
            Require((string)malformed["status"] == "refused", "malformed approval rejected");
        }
        Console.WriteLine("Provider checks passed: 303"); return 0;
    }
}
