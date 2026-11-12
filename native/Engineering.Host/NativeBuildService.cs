using System;
using System.Collections.Generic;
using System.Linq;

namespace TwinCatMcp.Engineering.Host
{
    // Call only on the host-supplied IDE synchronization context. Completion is
    // event-driven; neither Start nor polling waits for the IDE to finish.
    internal sealed class NativeBuildService : IDisposable
    {
        private sealed class Run
        {
            internal Guid Id;
            internal string SolutionFile, ProjectFile, Status, Before, Output;
            internal Action Revalidate;
            internal BuildTarget Target;
            internal BuildCompletionEvidence Evidence = new BuildCompletionEvidence();
            internal DateTime Deadline;
            internal bool Invalid, OutputTruncated, DiagnosticsTruncated, CancellationRequested;
            internal List<BuildDiagnostic> Diagnostics = new List<BuildDiagnostic>();
        }

        private readonly IBuildIde ide;
        private readonly Func<string, bool?> dirty;
        private readonly Func<DateTime> utcNow;
        private readonly Dictionary<Guid, Run> runs = new Dictionary<Guid, Run>();
        private Run active;
        private bool disposed;

        internal NativeBuildService(object injectedDte, Func<string, bool?> authoritativeDirty)
            : this(new BuildDteAdapter(injectedDte), authoritativeDirty, () => DateTime.UtcNow) { }

        internal NativeBuildService(IBuildIde ide, Func<string, bool?> authoritativeDirty, Func<DateTime> utcNow)
        {
            if (ide == null || utcNow == null) throw new ArgumentNullException();
            this.ide = ide; dirty = authoritativeDirty; this.utcNow = utcNow;
            ide.BuildBegin += OnBuildBegin;
            ide.ProjectBegin += OnProjectBegin;
            ide.ProjectDone += OnProjectDone;
            ide.BuildDone += OnBuildDone;
        }

        // The dispatcher consumes native approval immediately before this call.
        internal BuildTarget Assess(string solutionFile, string projectFile, Action revalidateContext)
        {
            ThrowDisposed();
            if (active != null) throw new NativeBuildException("refused", "build_already_running");
            revalidateContext();
            var target = ide.Prepare(solutionFile, projectFile, dirty);
            revalidateContext();
            if (!ide.IsCurrent(target, solutionFile, projectFile) || ide.IsBuilding) throw new NativeBuildException("conflict", "build_context_changed");
            try { target.OutputCaptureAvailable = ide.ReadOutput() != null; } catch { target.OutputCaptureAvailable = false; }
            revalidateContext();
            return target;
        }

        internal BuildSnapshot Start(Guid operationId, string solutionFile, string projectFile, Action revalidateContext, Action consumeApproval = null,
            string expectedConfiguration = null, string expectedPlatform = null, Action validateAuthorization = null)
        {
            ThrowDisposed();
            if (operationId == Guid.Empty || revalidateContext == null) throw new NativeBuildException("refused", "invalid_build_request");
            if (runs.ContainsKey(operationId)) throw new NativeBuildException("refused", "build_operation_reused");
            if (runs.Count >= 64) throw new NativeBuildException("refused", "build_history_limit");
            if (active != null) throw new NativeBuildException("refused", "build_already_running");
            revalidateContext();
            var target = ide.Prepare(solutionFile, projectFile, dirty);
            if ((expectedConfiguration != null && target.Configuration != expectedConfiguration) ||
                (expectedPlatform != null && target.Platform != expectedPlatform)) throw new NativeBuildException("conflict", "build_configuration_changed");
            revalidateContext();
            if (!ide.IsCurrent(target, solutionFile, projectFile) || ide.IsBuilding) throw new NativeBuildException("conflict", "build_context_changed");
            if (consumeApproval != null) consumeApproval();
            revalidateContext();
            // The native approval UI may pump messages. Recheck all dirty,
            // configuration and project-policy gates after it returns.
            var checkedTarget = ide.Prepare(solutionFile, projectFile, dirty);
            if (!string.Equals(target.UniqueName, checkedTarget.UniqueName, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(target.ProjectFile, checkedTarget.ProjectFile, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(target.OwningProjectFile, checkedTarget.OwningProjectFile, StringComparison.OrdinalIgnoreCase) ||
                target.MappingDigest != checkedTarget.MappingDigest ||
                target.Configuration != checkedTarget.Configuration || target.Platform != checkedTarget.Platform ||
                !ide.IsCurrent(target, solutionFile, projectFile) || ide.IsBuilding) throw new NativeBuildException("conflict", "build_context_changed");
            revalidateContext();
            var run = new Run {
                Id = operationId, SolutionFile = solutionFile, ProjectFile = projectFile, Target = target,
                Revalidate = revalidateContext, Status = "accepted", Deadline = utcNow().AddMinutes(2)
            };
            runs.Add(operationId, run);
            active = run;
            try { revalidateContext(); if (validateAuthorization != null) validateAuthorization(); }
            catch { run.Status = "refused"; active = null; return Snapshot(run); }
            try
            {
                ide.Start(target);
            }
            catch
            {
                // A COM exception cannot prove that submission had no effect.
                run.Status = "unknown";
                run.Invalid = true;
            }
            return Snapshot(run);
        }

        internal BuildSnapshot Get(Guid operationId)
        {
            var run = Find(operationId);
            Validate(run);
            if (ReferenceEquals(active, run) && utcNow() >= run.Deadline) { run.Status = "unknown"; run.Invalid = true; ClearEvidence(run); }
            return Snapshot(run);
        }

        internal BuildSnapshot Cancel(Guid operationId)
        {
            var run = Find(operationId);
            Validate(run);
            if (ReferenceEquals(active, run))
            {
                run.CancellationRequested = true;
                run.Status = "unknown";
                // DTE Build.Cancel targets the whole IDE. We cannot prove it would
                // cancel only this run, so retain the gate and await completion.
            }
            return Snapshot(run);
        }

        internal BuildSnapshot ReadOutput(Guid operationId) { return Get(operationId); }
        internal BuildSnapshot ReadDiagnostics(Guid operationId) { return Get(operationId); }

        private Run Find(Guid id)
        {
            ThrowDisposed();
            Run run;
            if (!runs.TryGetValue(id, out run)) throw new NativeBuildException("refused", "unknown_build_operation");
            return run;
        }

        private void Validate(Run run)
        {
            try
            {
                run.Revalidate();
                if (!ide.IsCurrent(run.Target, run.SolutionFile, run.ProjectFile)) throw new InvalidOperationException();
            }
            catch
            {
                run.Invalid = true; run.Status = "unknown"; ClearEvidence(run);
                throw new NativeBuildException("conflict", "build_context_changed");
            }
        }

        private bool ValidateEvent(Run run)
        {
            try { Validate(run); return true; }
            catch { return false; }
        }

        private bool Matches(Run run, string name, string configuration, string platform)
        {
            return (string.Equals(name, run.Target.UniqueName, StringComparison.OrdinalIgnoreCase) ||
                (!string.IsNullOrEmpty(run.Target.ProjectFile) && string.Equals(name, run.Target.ProjectFile, StringComparison.OrdinalIgnoreCase))) &&
                configuration == run.Target.Configuration && platform == run.Target.Platform;
        }

        private void OnBuildBegin(bool projectBuild)
        {
            var run = active;
            if (run == null) return;
            run.Evidence.BuildBegin(projectBuild && ValidateEvent(run));
            if (!run.Invalid) run.Status = "running";
        }

        private void OnProjectBegin(string name, string configuration, string platform)
        {
            var run = active;
            if (run == null) return;
            bool matches = Matches(run, name, configuration, platform) && ValidateEvent(run);
            run.Evidence.Begin(matches);
            if (!matches) { run.Invalid = true; return; }
            try { run.Revalidate(); run.Before = ide.ReadOutput(); }
            catch { run.Before = null; }
        }

        private void OnProjectDone(string name, string configuration, string platform, bool succeeded)
        {
            var run = active;
            if (run == null) return;
            run.Evidence.End(Matches(run, name, configuration, platform) && ValidateEvent(run), succeeded);
        }

        private void OnBuildDone(bool projectBuild)
        {
            var run = active;
            if (run == null) return;
            try
            {
                if (run.Invalid || !projectBuild || !run.Evidence.CanPublish || !ValidateEvent(run)) { run.Status = "unknown"; ClearEvidence(run); return; }
                run.Revalidate();
                run.Output = BuildEvidence.FreshOutput(run.Before, ide.ReadOutput(), out run.OutputTruncated);
                run.Diagnostics = BuildEvidence.Parse(run.Output, out run.DiagnosticsTruncated);
                run.DiagnosticsTruncated |= run.OutputTruncated;
                run.Revalidate();
                run.Status = run.Evidence.Succeeded && ide.LastBuildInfo == 0 ? "succeeded" : "failed";
            }
            catch { run.Status = "unknown"; ClearEvidence(run); }
            finally { active = null; }
        }

        private static void ClearEvidence(Run run)
        {
            run.Before = null; run.Output = null; run.Diagnostics.Clear(); run.OutputTruncated = false; run.DiagnosticsTruncated = false;
        }

        private static BuildSnapshot Snapshot(Run run)
        {
            return new BuildSnapshot {
                BuildOperationId = run.Id.ToString("D"), Status = run.Status, Configuration = run.Target.Configuration, Platform = run.Target.Platform,
                Output = run.Output, OutputAvailable = run.Output != null, OutputTruncated = run.OutputTruncated, DiagnosticsTruncated = run.DiagnosticsTruncated,
                CancellationRequested = run.CancellationRequested,
                Diagnostics = run.Diagnostics.Select(d => new BuildDiagnostic { File = d.File, Line = d.Line, Column = d.Column, Severity = d.Severity, Code = d.Code, Message = d.Message }).ToList()
            };
        }

        private void ThrowDisposed() { if (disposed) throw new ObjectDisposedException("NativeBuildService"); }
        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            ide.BuildBegin -= OnBuildBegin; ide.ProjectBegin -= OnProjectBegin; ide.ProjectDone -= OnProjectDone; ide.BuildDone -= OnBuildDone;
            ide.Dispose();
            if (active != null) { active.Status = "unknown"; ClearEvidence(active); }
            active = null; runs.Clear();
        }
    }
}
