"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DryRunContextForm } from "@/components/workflow-builder/DryRunContextForm";
import { NodeConfigPanel } from "@/components/workflow-builder/NodeConfigPanel";
import { WorkflowCanvas } from "@/components/workflow-builder/WorkflowCanvas";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import {
  addNode,
  cloneDefinition,
  defaultContextFor,
  normalizeDefinition,
  removeNode,
  setEntry,
  updateNode,
} from "@/lib/workflow-definition";

const NODE_TONES = {
  trigger: "brand",
  condition: "info",
  action: "success",
  delay: "warning",
  ai_task: "info",
  human_handoff: "warning",
  end: "neutral",
};

function statusTone(status) {
  if (status === "active" || status === "completed") return "success";
  if (status === "failed" || status === "disabled" || status === "danger") return "danger";
  if (status === "running" || status === "draft") return "warning";
  if (status === "skipped" || status === "dry_run") return "info";
  return "neutral";
}

export default function AutomationBuilderPage() {
  const params = useParams();
  const workflowId = params?.id;

  const [workflow, setWorkflow] = useState(null);
  const [definition, setDefinition] = useState({ entry: "", nodes: {} });
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [context, setContext] = useState({});
  const [selectedKey, setSelectedKey] = useState(null);
  const [connectMode, setConnectMode] = useState(null);
  const [validation, setValidation] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const dirty = useMemo(() => {
    return JSON.stringify(definition) !== savedSnapshot;
  }, [definition, savedSnapshot]);

  const load = useCallback(async () => {
    if (!workflowId) return;
    setLoading(true);
    setError("");
    try {
      const [detail, runList] = await Promise.all([
        apiFetch(`/v1/automations/${workflowId}`),
        apiFetch(`/v1/automations/${workflowId}/runs`),
      ]);
      const def = normalizeDefinition(detail.workflow.definition || {});
      setWorkflow(detail.workflow);
      setDefinition(def);
      setSavedSnapshot(JSON.stringify(def));
      setContext(defaultContextFor(detail.workflow.trigger_type));
      setRuns(runList.data || []);
      setSelectedKey(def.entry || Object.keys(def.nodes)[0] || null);
    } catch (err) {
      setError(err.message || "Failed to load workflow");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && connectMode) {
        setConnectMode(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connectMode]);

  const selectedNode = selectedKey ? definition.nodes[selectedKey] : null;
  const nodeKeys = Object.keys(definition.nodes || {});

  function patchDefinition(next) {
    setDefinition(normalizeDefinition(next));
    setNotice("");
  }

  function handleAddNode(type) {
    const { definition: next, key } = addNode(definition, { type });
    patchDefinition(next);
    setSelectedKey(key);
  }

  function handleNodeChange(patch) {
    if (!selectedKey) return;
    patchDefinition(updateNode(definition, selectedKey, patch));
  }

  function handleRemove() {
    if (!selectedKey) return;
    const next = removeNode(definition, selectedKey);
    patchDefinition(next);
    setSelectedKey(next.entry || Object.keys(next.nodes)[0] || null);
  }

  function handleSetEntry() {
    if (!selectedKey) return;
    patchDefinition(setEntry(definition, selectedKey));
  }

  function handleStartConnect(kind) {
    if (!selectedKey) return;
    setConnectMode({ from: selectedKey, kind });
  }

  function handleConnectTarget(toKey) {
    if (!connectMode) return;
    if (toKey === connectMode.from) {
      setConnectMode(null);
      return;
    }
    const patch = { [connectMode.kind]: toKey };
    patchDefinition(updateNode(definition, connectMode.from, patch));
    setConnectMode(null);
    setSelectedKey(connectMode.from);
  }

  async function saveDefinition() {
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const result = await apiFetch(`/v1/automations/${workflowId}`, {
        method: "PUT",
        body: { definition: cloneDefinition(definition) },
      });
      const def = normalizeDefinition(result.workflow.definition || {});
      setWorkflow(result.workflow);
      setDefinition(def);
      setSavedSnapshot(JSON.stringify(def));
      setValidation(result.validation);
      setNotice(
        result.workflow.status === "draft"
          ? "Saved. Active workflows revert to draft after edits — re-activate when ready."
          : "Saved."
      );
    } catch (err) {
      setError(err.data?.message || err.message || "Save failed");
      if (err.data?.validation) setValidation(err.data.validation);
    } finally {
      setBusy("");
    }
  }

  async function runValidate() {
    setBusy("validate");
    setError("");
    setNotice("");
    try {
      const result = await apiFetch("/v1/automations/validate", {
        method: "POST",
        body: { definition: cloneDefinition(definition) },
      });
      setValidation(result.validation);
      setNotice(
        result.validation.valid
          ? "Workflow is valid."
          : "Workflow has validation errors."
      );
    } catch (err) {
      setError(err.message || "Validation failed");
    } finally {
      setBusy("");
    }
  }

  async function activate() {
    setBusy("activate");
    setError("");
    setNotice("");
    try {
      if (dirty) {
        await apiFetch(`/v1/automations/${workflowId}`, {
          method: "PUT",
          body: { definition: cloneDefinition(definition) },
        });
      }
      const result = await apiFetch(`/v1/automations/${workflowId}/activate`, {
        method: "POST",
      });
      const def = normalizeDefinition(result.workflow.definition || definition);
      setWorkflow(result.workflow);
      setDefinition(def);
      setSavedSnapshot(JSON.stringify(def));
      setValidation(result.validation);
      setNotice("Workflow activated.");
    } catch (err) {
      setError(err.data?.message || err.message || "Activate failed");
      if (err.data?.validation) setValidation(err.data.validation);
    } finally {
      setBusy("");
    }
  }

  async function deactivate() {
    setBusy("deactivate");
    setError("");
    setNotice("");
    try {
      const result = await apiFetch(`/v1/automations/${workflowId}/deactivate`, {
        method: "POST",
      });
      setWorkflow(result.workflow);
      setNotice("Workflow disabled.");
    } catch (err) {
      setError(err.message || "Disable failed");
    } finally {
      setBusy("");
    }
  }

  async function dryRun() {
    setBusy("dry-run");
    setError("");
    setNotice("");
    try {
      if (dirty) {
        const saved = await apiFetch(`/v1/automations/${workflowId}`, {
          method: "PUT",
          body: { definition: cloneDefinition(definition) },
        });
        const def = normalizeDefinition(saved.workflow.definition || definition);
        setWorkflow(saved.workflow);
        setDefinition(def);
        setSavedSnapshot(JSON.stringify(def));
      }
      const result = await apiFetch(`/v1/automations/${workflowId}/dry-run`, {
        method: "POST",
        body: {
          context,
          idempotency_key: `ui-dry-${Date.now()}`,
        },
      });
      setSelectedRun(result.run);
      setNotice(
        result.idempotent_replay
          ? "Dry-run returned an idempotent replay."
          : "Dry-run completed — no live side effects."
      );
      const runList = await apiFetch(`/v1/automations/${workflowId}/runs`);
      setRuns(runList.data || []);
    } catch (err) {
      setError(err.data?.message || err.message || "Dry-run failed");
    } finally {
      setBusy("");
    }
  }

  async function openRun(runId) {
    setBusy(`run-${runId}`);
    setError("");
    try {
      const result = await apiFetch(`/v1/automations/${workflowId}/runs/${runId}`);
      setSelectedRun(result.run);
    } catch (err) {
      setError(err.message || "Failed to load run");
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title={workflow?.name || "Workflow builder"}
      description="Edit steps visually, validate, dry-run, then activate. Definitions stay as internal JSON — never the editing surface."
      actions={
        workflow ? (
          <div className="flex flex-wrap items-center gap-2">
            {dirty ? (
              <span className="rounded-sm bg-sand px-2.5 py-1 text-xs font-medium text-brown-dark">
                Unsaved changes
              </span>
            ) : null}
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={runValidate}>
              {busy === "validate" ? "Validating…" : "Validate"}
            </Button>
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={saveDefinition}>
              {busy === "save" ? "Saving…" : "Save"}
            </Button>
            {workflow.status === "active" ? (
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={deactivate}>
                {busy === "deactivate" ? "Disabling…" : "Disable"}
              </Button>
            ) : (
              <Button size="sm" disabled={!!busy} onClick={activate}>
                {busy === "activate" ? "Activating…" : "Activate"}
              </Button>
            )}
            <Button size="sm" disabled={!!busy} onClick={dryRun}>
              {busy === "dry-run" ? "Running…" : "Dry-run"}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="mb-4">
        <Link
          href="/automations"
          className="text-sm text-brown-dark transition-colors duration-150 hover:text-ink"
        >
          ← All workflows
        </Link>
      </div>

      {loading ? <Skeleton className="h-72" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !workflow && !error ? (
        <EmptyState title="Workflow not found" description="It may have been deleted." />
      ) : null}

      {!loading && workflow ? (
        <div className="space-y-5">
          <section className="surface-card flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(workflow.status)}>{workflow.status}</Badge>
                <Badge tone="neutral">v{workflow.version}</Badge>
                <Badge tone="brand">
                  {workflow.trigger_type?.replaceAll("_", " ")}
                </Badge>
              </div>
              <p className="max-w-2xl text-sm text-muted">
                {workflow.description || "No description"}
              </p>
              <p className="text-xs text-muted">
                {workflow.run_count ?? 0} live runs
                {workflow.last_run_at
                  ? ` · last ${new Date(workflow.last_run_at).toLocaleString()}`
                  : ""}
              </p>
              {notice ? <p className="text-sm text-brown-dark">{notice}</p> : null}
            </div>
          </section>

          {validation ? (
            <section className="surface-card p-4">
              <h3 className="text-sm font-medium text-ink">Validation</h3>
              <p className="mt-1 text-sm text-muted">
                {validation.valid ? "Ready to activate." : "Fix errors before activation."}
              </p>
              {validation.errors?.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-danger">
                  {validation.errors.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {validation.warnings?.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-warning">
                  {validation.warnings.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          <section className="overflow-hidden rounded-md border border-line bg-white shadow-card">
            <div className="grid min-h-[520px] lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-h-[420px] border-b border-line lg:border-b-0 lg:border-r">
                <WorkflowCanvas
                  definition={definition}
                  selectedKey={selectedKey}
                  onSelect={(key) => {
                    setConnectMode(null);
                    setSelectedKey(key);
                  }}
                  connectMode={connectMode}
                  onConnectTarget={handleConnectTarget}
                />
              </div>
              <div className="min-h-[320px] bg-ivory/50">
                <NodeConfigPanel
                  nodeKey={selectedKey}
                  node={selectedNode}
                  isEntry={definition.entry === selectedKey}
                  nodeKeys={nodeKeys}
                  onChange={handleNodeChange}
                  onSetEntry={handleSetEntry}
                  onRemove={handleRemove}
                  onStartConnect={handleStartConnect}
                  onAddNode={handleAddNode}
                />
              </div>
            </div>
          </section>

          <section className="surface-card p-4">
            <h3 className="font-display text-xl text-ink">Dry-run context</h3>
            <div className="mt-3 max-w-lg">
              <DryRunContextForm
                context={context}
                onChange={setContext}
                triggerType={workflow.trigger_type}
              />
            </div>
          </section>

          <section className="surface-card p-4">
            <h3 className="font-display text-xl text-ink">Execution history</h3>
            <p className="mt-1 text-sm text-muted">
              Recent dry-run and live runs with per-step results.
            </p>
            {runs.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                No runs yet. Use Dry-run to create the first.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <ul className="space-y-2">
                  {runs.map((run) => (
                    <li key={run.id}>
                      <button
                        type="button"
                        onClick={() => openRun(run.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-stone"
                      >
                        <span className="flex flex-wrap items-center gap-2 truncate">
                          <Badge tone={statusTone(run.mode)}>{run.mode}</Badge>
                          <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted">
                          {run.created_at
                            ? new Date(run.created_at).toLocaleString()
                            : "—"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="rounded-md border border-line bg-stone/30 p-4">
                  {!selectedRun ? (
                    <p className="text-sm text-muted">Select a run to inspect steps.</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={statusTone(selectedRun.mode)}>
                          {selectedRun.mode}
                        </Badge>
                        <Badge tone={statusTone(selectedRun.status)}>
                          {selectedRun.status}
                        </Badge>
                      </div>
                      {selectedRun.error_message ? (
                        <p className="text-sm text-danger">{selectedRun.error_message}</p>
                      ) : null}
                      <ol className="space-y-2">
                        {(selectedRun.steps || []).map((step) => (
                          <li
                            key={step.id}
                            className="rounded-sm border border-line bg-white p-3 text-sm"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={NODE_TONES[step.node_type] || "neutral"}>
                                {step.node_type}
                              </Badge>
                              <Badge tone={statusTone(step.status)}>{step.status}</Badge>
                              <span className="font-medium">{step.step_key}</span>
                            </div>
                            {step.error_message ? (
                              <p className="mt-2 text-danger">{step.error_message}</p>
                            ) : null}
                            {step.output_summary &&
                            Object.keys(step.output_summary).length > 0 ? (
                              <dl className="mt-2 space-y-1 text-xs text-muted">
                                {Object.entries(step.output_summary).map(([k, v]) => (
                                  <div key={k} className="flex gap-2">
                                    <dt className="shrink-0 font-medium text-ink">{k}</dt>
                                    <dd className="truncate">
                                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
