"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

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

function defaultContextFor(triggerType) {
  if (triggerType === "incoming_message") {
    return {
      intent: "product_inquiry",
      channel: "webchat",
      automation_mode: "ai",
    };
  }
  if (triggerType === "incoming_meta_message") {
    return {
      intent: "product_inquiry",
      channel: "instagram",
      automation_mode: "ai",
    };
  }
  if (triggerType === "whatsapp_template_needed") {
    return {
      channel: "whatsapp",
      requires_whatsapp_template: true,
      automation_mode: "ai",
    };
  }
  if (triggerType === "content_approved") {
    return { content_title: "Warm neutrals for spring rituals" };
  }
  if (triggerType === "lead_qualified") {
    return { lead_score: 82 };
  }
  return {};
}

export default function AutomationBuilderPage() {
  const params = useParams();
  const workflowId = params?.id;

  const [workflow, setWorkflow] = useState(null);
  const [definitionText, setDefinitionText] = useState("");
  const [contextText, setContextText] = useState("{}");
  const [validation, setValidation] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!workflowId) return;
    setLoading(true);
    setError("");
    try {
      const [detail, runList] = await Promise.all([
        apiFetch(`/v1/automations/${workflowId}`),
        apiFetch(`/v1/automations/${workflowId}/runs`),
      ]);
      setWorkflow(detail.workflow);
      setDefinitionText(JSON.stringify(detail.workflow.definition || {}, null, 2));
      setContextText(
        JSON.stringify(defaultContextFor(detail.workflow.trigger_type), null, 2)
      );
      setRuns(runList.data || []);
    } catch (err) {
      setError(err.message || "Failed to load workflow");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    load();
  }, [load]);

  const nodes = useMemo(() => {
    try {
      const def = JSON.parse(definitionText || "{}");
      const map = def.nodes || {};
      const entry = def.entry;
      return Object.entries(map).map(([key, node]) => ({
        key,
        type: node.type || "unknown",
        label: node.label || key,
        isEntry: key === entry,
        next: node.next || null,
        next_true: node.next_true || null,
        next_false: node.next_false || null,
        config: node.config || {},
      }));
    } catch {
      return [];
    }
  }, [definitionText]);

  async function saveDefinition() {
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const definition = JSON.parse(definitionText);
      const result = await apiFetch(`/v1/automations/${workflowId}`, {
        method: "PUT",
        body: { definition },
      });
      setWorkflow(result.workflow);
      setDefinitionText(JSON.stringify(result.workflow.definition || {}, null, 2));
      setValidation(result.validation);
      setNotice(
        result.workflow.status === "draft"
          ? "Saved. Active workflows revert to draft after definition edits — re-activate when ready."
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
      const definition = JSON.parse(definitionText);
      const result = await apiFetch("/v1/automations/validate", {
        method: "POST",
        body: { definition },
      });
      setValidation(result.validation);
      setNotice(
        result.validation.valid
          ? "Definition is valid."
          : "Definition has validation errors."
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
      const result = await apiFetch(`/v1/automations/${workflowId}/activate`, {
        method: "POST",
      });
      setWorkflow(result.workflow);
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
      const context = JSON.parse(contextText || "{}");
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
      title={workflow?.name || "Automation"}
      description="Edit the validated definition, dry-run safely, then activate for live execution."
    >
      <div className="mb-4">
        <Link href="/automations" className="text-sm text-brown hover:underline">
          ← All automations
        </Link>
      </div>

      {loading ? <Skeleton className="h-72" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !workflow && !error ? (
        <EmptyState title="Workflow not found" description="It may have been deleted." />
      ) : null}

      {!loading && workflow ? (
        <div className="space-y-6 fade-rise">
          <section className="surface-card flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(workflow.status)}>{workflow.status}</Badge>
                <Badge tone="neutral">v{workflow.version}</Badge>
                <Badge tone="brand">{workflow.trigger_type?.replaceAll("_", " ")}</Badge>
              </div>
              <p className="text-sm text-muted max-w-2xl">
                {workflow.description || "No description"}
              </p>
              <p className="text-xs uppercase tracking-wide text-muted">
                {workflow.run_count ?? 0} live runs
                {workflow.last_run_at ? ` · last ${new Date(workflow.last_run_at).toLocaleString()}` : ""}
              </p>
              {notice ? <p className="text-sm text-brown-dark">{notice}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={!!busy} onClick={runValidate}>
                {busy === "validate" ? "Validating…" : "Validate"}
              </Button>
              <Button size="sm" variant="secondary" disabled={!!busy} onClick={saveDefinition}>
                {busy === "save" ? "Saving…" : "Save definition"}
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
          </section>

          {validation ? (
            <section className="surface-card p-5">
              <h3 className="font-display text-xl">Validation</h3>
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

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="surface-card p-5">
              <h3 className="font-display text-xl">Node canvas</h3>
              <p className="mt-1 text-sm text-muted">
                Ordered graph from the definition. Entry node is marked.
              </p>
              {nodes.length === 0 ? (
                <p className="mt-4 text-sm text-danger">Definition JSON is not parseable.</p>
              ) : (
                <ol className="mt-4 space-y-3">
                  {nodes.map((node, index) => (
                    <li
                      key={node.key}
                      className={`rounded-md border border-line bg-white p-3 transition-colors ${
                        node.isEntry ? "border-brown ring-1 ring-brown/30" : ""
                      }`}
                      style={{ animationDelay: `${index * 40}ms` }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={NODE_TONES[node.type] || "neutral"}>{node.type}</Badge>
                        {node.isEntry ? <Badge tone="brand">entry</Badge> : null}
                        <span className="font-medium text-ink">{node.label}</span>
                        <span className="text-xs text-muted">{node.key}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        {node.next
                          ? `next → ${node.next}`
                          : node.next_true
                            ? `true → ${node.next_true} · false → ${node.next_false}`
                            : "terminal"}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="surface-card p-5 space-y-4">
              <div>
                <h3 className="font-display text-xl">Definition JSON</h3>
                <p className="mt-1 text-sm text-muted">
                  Edit nodes, then validate and save. Saving an active workflow returns it to draft.
                </p>
                <textarea
                  className="mt-3 h-64 w-full rounded-sm border border-line bg-stone/40 p-3 font-mono text-xs text-ink focus:border-brown focus:outline-none"
                  value={definitionText}
                  onChange={(e) => setDefinitionText(e.target.value)}
                  spellCheck={false}
                />
              </div>
              <div>
                <h3 className="font-display text-lg">Dry-run context</h3>
                <p className="mt-1 text-sm text-muted">
                  Sample payload passed into conditions and actions. No live writes on dry-run.
                </p>
                <textarea
                  className="mt-3 h-36 w-full rounded-sm border border-line bg-stone/40 p-3 font-mono text-xs text-ink focus:border-brown focus:outline-none"
                  value={contextText}
                  onChange={(e) => setContextText(e.target.value)}
                  spellCheck={false}
                />
              </div>
            </section>
          </div>

          <section className="surface-card p-5">
            <h3 className="font-display text-xl">Execution history</h3>
            <p className="mt-1 text-sm text-muted">
              Recent dry-run and live runs with per-step results.
            </p>
            {runs.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No runs yet. Use Dry-run to create the first.</p>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <ul className="space-y-2">
                  {runs.map((run) => (
                    <li key={run.id}>
                      <button
                        type="button"
                        onClick={() => openRun(run.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2 text-left text-sm hover:bg-stone"
                      >
                        <span className="truncate">
                          <Badge tone={statusTone(run.mode)} className="mr-2">
                            {run.mode}
                          </Badge>
                          <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                        </span>
                        <span className="shrink-0 text-xs text-muted">
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
                        <Badge tone={statusTone(selectedRun.mode)}>{selectedRun.mode}</Badge>
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
                            <pre className="mt-2 max-h-40 overflow-auto rounded bg-stone/50 p-2 text-[11px] text-muted">
                              {JSON.stringify(step.output_summary || {}, null, 2)}
                            </pre>
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
