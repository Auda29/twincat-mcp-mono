using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace TwinCatMcp.Engineering.Host
{
    internal sealed class NativeBuildException : Exception
    {
        internal string Status { get; private set; }
        internal string Code { get; private set; }
        internal NativeBuildException(string status, string code) : base(code) { Status = status; Code = code; }
    }

    internal sealed class BuildDiagnostic
    {
        public string File { get; set; }
        public string Severity { get; set; }
        public string Message { get; set; }
        public string Code { get; set; }
        public int Line { get; set; }
        public int Column { get; set; }
    }

    internal sealed class BuildSnapshot
    {
        public string BuildOperationId { get; set; }
        public string Status { get; set; }
        public string Output { get; set; }
        public bool OutputAvailable { get; set; }
        public bool OutputTruncated { get; set; }
        public bool DiagnosticsTruncated { get; set; }
        public bool CancellationRequested { get; set; }
        public string Configuration { get; set; }
        public string Platform { get; set; }
        public List<BuildDiagnostic> Diagnostics { get; set; }
    }

    // Only an append-only segment captured between matching project events is fresh.
    internal static class BuildEvidence
    {
        internal const int MaxOutput = 65536;
        internal const int MaxDiagnostics = 100;
        private static readonly Regex Pattern = new Regex(@"^\s*(?:\d+>)?(?<file>.+?)\((?<line>\d+)(?:,(?<column>\d+))?\)\s*:\s*(?<severity>error|warning|Fehler|Warnung)\s*(?:(?<code>[A-Z]\d+)\s*:\s*)?(?<message>.+)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));

        internal static string FreshOutput(string before, string after, out bool truncated)
        {
            truncated = false;
            if (before == null || after == null || !after.StartsWith(before, StringComparison.Ordinal)) return null;
            var delta = after.Substring(before.Length);
            truncated = delta.Length > MaxOutput;
            return truncated ? delta.Substring(0, MaxOutput) : delta;
        }

        internal static List<BuildDiagnostic> Parse(string output, out bool truncated)
        {
            var result = new List<BuildDiagnostic>();
            truncated = false;
            if (output == null) return result;
            foreach (var raw in output.Split('\n'))
            {
                if (raw.Length > 4096) { truncated = true; continue; }
                Match match;
                try { match = Pattern.Match(raw.TrimEnd('\r')); }
                catch (RegexMatchTimeoutException) { truncated = true; continue; }
                int line, column = 1;
                if (!match.Success || !int.TryParse(match.Groups["line"].Value, out line) || line < 1 || line > 1000000) continue;
                if (match.Groups["column"].Success && (!int.TryParse(match.Groups["column"].Value, out column) || column < 1 || column > 100000)) continue;
                if (result.Count == MaxDiagnostics) { truncated = true; break; }
                var severity = match.Groups["severity"].Value;
                result.Add(new BuildDiagnostic {
                    File = match.Groups["file"].Value, Line = line, Column = column,
                    Severity = severity.Equals("error", StringComparison.OrdinalIgnoreCase) || severity.Equals("Fehler", StringComparison.OrdinalIgnoreCase) ? "error" : "warning",
                    Code = match.Groups["code"].Value, Message = match.Groups["message"].Value
                });
            }
            return result;
        }
    }

    internal sealed class BuildCompletionEvidence
    {
        private int begins, ends, buildBegins;
        private bool invalid;
        internal bool Succeeded { get; private set; }
        internal bool CanPublish { get { return !invalid && buildBegins == 1 && begins == 1 && ends == 1; } }
        internal void BuildBegin(bool matches) { if (!matches || ++buildBegins != 1 || begins != 0 || ends != 0) invalid = true; }
        internal void Begin(bool matches) { if (!matches || buildBegins != 1 || ++begins != 1 || ends != 0) invalid = true; }
        internal void End(bool matches, bool success) { if (!matches || begins != 1 || ++ends != 1) invalid = true; Succeeded = success; }
    }
}
