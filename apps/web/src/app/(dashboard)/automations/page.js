"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { addNode, TRIGGER_TYPES } from "@/lib/workflow-definition";

function statusTone(status) {
  if (status === "active") return "success";
  if (status === "disabled" || status === "inactive") return "danger";
  return "warning";
}

function statusLabel(status) {
  if (status === "active") return "Live";
  if (status === "disabled" || status === "inactive") return "Offline";
  return "Draft";
}

function blankStarterDefinition(triggerType) {
  const trigger = String(triggerType || "incoming_message");
  const { definition, key } = addNode(
    { entry: "", nodes: {}, layout: {} },
    { type: "trigger", label: "Start", x: 48, y: 48 },
  );
  if (definition.nodes[key]) {
    definition.nodes[key] = {
      ...definition.nodes[key],
      config: { trigger_type: trigger },
    };
  }
  return definition;
}

export default function AutomationsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [triggerTypes, setTriggerTypes] = useState(TRIGGER_TYPES);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    trigger_type: "incoming_message",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/v1/automations");
      setItems(response.data || []);
      if (Array.isArray(response.meta?.trigger_types) && response.meta.trigger_types.length) {
        setTriggerTypes(response.meta.trigger_types);
      }
    } catch (err) {
      setError(err.message || "Failed to load automations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setShowCreate(true);
    setNotice("");
    setError("");
    setForm({
      name: "",
      description: "",
      trigger_type: triggerTypes[0] || "incoming_message",
    });
  }

  async function createWorkflow(event) {
    event?.preventDefault?.();
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const trigger = form.trigger_type || "incoming_message";
      const result = await apiFetch("/v1/automations", {
        method: "POST",
        body: {
          name: form.name.trim() || "Untitled workflow",
          description: form.description.trim(),
          trigger_type: trigger,
          status: "draft",
          definition: blankStarterDefinition(trigger),
          version: 1,
          run_count: 0,
        },
      });
      const id = result.workflow?.id;
      if (!id) throw new Error("Workflow created without an id");
      setNotice("Workflow created — opening builder.");
      router.push(`/automations/${id}`);
    } catch (err) {
      setError(err.message || "Failed to create workflow");
      setCreating(false);
    }
  }

  async function runAssistant(event) {
    event?.preventDefault?.();
    const prompt = assistantPrompt.trim();
    if (!prompt) {
      setError("Describe the workflow you want the assistant to build.");
      return;
    }
    setBusy("assistant");
    setError("");
    setNotice("");
    try {
      const result = await apiFetch("/v1/automations/assistant", {
        method: "POST",
        body: { prompt },
      });
      const id = result.workflow?.id;
      if (!id) throw new Error("Assistant did not return a workflow.");
      setNotice(
        result.summary
          ? `Built · ${result.summary}. Review on the canvas, then Publish to live.`
          : "Workflow built. Review on the canvas, then Publish to live.",
      );
      setAssistantPrompt("");
      router.push(`/automations/${id}`);
    } catch (err) {
      setError(err.message || "Assistant failed to build the workflow");
      setBusy("");
    }
  }

  async function toggleStatus(workflow) {
    setBusyId(workflow.id);
    setError("");
    try {
      const path =
        workflow.status === "active"
          ? `/v1/automations/${workflow.id}/deactivate`
          : `/v1/automations/${workflow.id}/activate`;
      await apiFetch(path, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message || "Failed to update status");
    } finally {
      setBusyId(null);
    }
  }

  async function removeWorkflow(workflow) {
    if (!window.confirm(`Delete “${workflow.name}”? This cannot be undone.`)) {
      return;
    }
    setBusyId(workflow.id);
    setError("");
    try {
      await apiFetch(`/v1/automations/${workflow.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message || "Failed to delete workflow");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardShell
      title="Workflows"
      description="Describe a flow for the assistant to build end-to-end, or start a blank canvas. Review, then publish to live — JSON is never the editing surface."
      actions={
        <Button size="sm" onClick={openCreate} disabled={creating || Boolean(busy)}>
          New workflow
        </Button>
      }
    >
      <section className="mb-8 space-y-3 border-b border-line pb-8">
        <h2 className="font-display text-2xl text-ink">Workflow Builder Assistant</h2>
        <p className="text-sm text-muted">
          Type what you want in plain language. The assistant builds a full visual workflow with
          wired actions. You only review on the canvas and Publish to live.
        </p>
        <form onSubmit={runAssistant} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-ink">Describe the workflow</span>
            <textarea
              name="assistant_prompt"
              rows={4}
              value={assistantPrompt}
              onChange={(e) => setAssistantPrompt(e.target.value)}
              className="ops-field px-3 py-2 text-ink focus:border-brown focus:outline-none"
              placeholder="e.g. When a WhatsApp customer asks about sizing, answer with care tips, then offer a human if they ask for a person."
            />
          </label>
          <div className="ops-actions">
            <Button type="submit" disabled={busy === "assistant" || !assistantPrompt.trim()}>
              {busy === "assistant" ? "Building…" : "Build workflow"}
            </Button>
          </div>
        </form>
      </section>

      {notice ? (
        <p className="mb-4 text-sm text-muted" role="status">
          {notice}
        </p>
      ) : null}
      {showCreate ? (
        <form
          onSubmit={createWorkflow}
          className="surface-card mb-5 grid gap-3 p-4 md:grid-cols-2 md:p-5"
        >
          <label className="block text-sm md:col-span-1">
            <span className="mb-1 block text-muted">Name</span>
            <input
              className="ops-field w-full px-3 py-2"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. WhatsApp first reply"
              autoFocus
            />
          </label>
          <label className="block text-sm md:col-span-1">
            <span className="mb-1 block text-muted">Trigger</span>
            <select
              className="ops-field w-full px-3 py-2"
              value={form.trigger_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, trigger_type: e.target.value }))
              }
            >
              {(triggerTypes.length ? triggerTypes : TRIGGER_TYPES).map((t) => (
                <option key={t} value={t}>
                  {String(t).replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block text-muted">Description</span>
            <input
              className="ops-field w-full px-3 py-2"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="Optional short note"
            />
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create & open builder"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={creating}
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 && !showCreate ? (
        <EmptyState
          title="No workflows yet"
          description="Create a workflow, then edit it in the visual builder and publish to live."
          actionLabel="Create workflow"
          onAction={openCreate}
        />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((workflow) => (
            <article
              key={workflow.id}
              className="surface-card flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5"
            >
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="ops-section-title">{workflow.name}</h3>
                  <Badge tone={statusTone(workflow.status)}>
                    {statusLabel(workflow.status)}
                  </Badge>
                </div>
                <p className="text-sm text-muted">
                  {workflow.description || "No description"}
                </p>
                <p className="text-xs text-muted">
                  Trigger · {workflow.trigger_type?.replaceAll("_", " ") || "manual"} · v
                  {workflow.version ?? 1} · {workflow.run_count ?? 0} live runs ·{" "}
                  {workflow.node_summary?.length ?? workflow.node_count ?? 0} nodes
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busyId === workflow.id}
                  onClick={() => toggleStatus(workflow)}
                >
                  {busyId === workflow.id
                    ? "Updating…"
                    : workflow.status === "active"
                      ? "Take offline"
                      : "Publish to live"}
                </Button>
                <Link
                  href={`/automations/${workflow.id}`}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-line bg-white px-3 text-sm font-medium text-ink transition-colors duration-150 hover:bg-stone"
                >
                  Open builder
                </Link>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busyId === workflow.id}
                  onClick={() => removeWorkflow(workflow)}
                >
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
