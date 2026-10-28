"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import {
  aiStatusSummary,
  connectionLabel,
} from "@/lib/integrations/brand-labels";

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [llm, setLlm] = useState(null);
  const [activity, setActivity] = useState({ data: [], metrics: {} });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [testMessage, setTestMessage] = useState("Do you ship the barrier cream internationally?");
  const [testResult, setTestResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [agentData, llmData, activityData] = await Promise.all([
        apiFetch("/v1/agents"),
        apiFetch("/v1/agents/llm/status"),
        apiFetch("/v1/agents/activity"),
      ]);
      setAgents(agentData.data || []);
      setLlm(llmData);
      setActivity(activityData);
      if (!selected && agentData.data?.[0]) {
        setSelected(agentData.data[0]);
        setPrompt(agentData.data[0].config?.system_prompt || "");
      }
    } catch (err) {
      setError(err.message || "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function togglePause(agent) {
    setBusy(agent.id);
    try {
      const updated = await apiFetch(`/v1/agents/${agent.id}`, {
        method: "PATCH",
        body: { paused: agent.status !== "paused" },
      });
      setAgents((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      if (selected?.id === updated.id) setSelected(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function savePrompt() {
    if (!selected) return;
    setBusy("prompt");
    try {
      const updated = await apiFetch(`/v1/agents/${selected.id}`, {
        method: "PATCH",
        body: {
          config: {
            ...(selected.config || {}),
            system_prompt: prompt,
          },
        },
      });
      setSelected(updated);
      setAgents((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function runTest() {
    if (!selected) return;
    setBusy("test");
    setTestResult(null);
    try {
      const result = await apiFetch("/v1/agents/test-run", {
        method: "POST",
        body: {
          agent_key: selected.key,
          purpose: "draft_reply",
          message: testMessage,
          dry_run: true,
        },
      });
      setTestResult(result);
      const activityData = await apiFetch("/v1/agents/activity");
      setActivity(activityData);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const statusTone =
    llm?.status === "live" || llm?.has_credentials
      ? "success"
      : llm?.status === "awaiting_credentials"
        ? "warning"
        : "neutral";
  const statusLabel =
    llm?.status_label ||
    connectionLabel(llm?.status || (llm?.live ? "live" : "local"), {
      live: llm?.status === "live",
      hasCredentials: llm?.has_credentials,
    });

  return (
    <DashboardShell
      title="AI agents"
      description="Support, sales, marketing, content, lead qualification, and sales ops. Connect Claude on Integrations to enable live agents."
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {llm ? (
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={statusTone}>{statusLabel}</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted">
            {llm.summary || aiStatusSummary(llm)}
          </p>
          {llm.status === "awaiting_credentials" ? (
            <div className="surface-card max-w-3xl space-y-2 p-4 text-sm">
              <p className="font-medium text-ink">Connect Claude to enable live agents</p>
              <p className="text-muted">
                Paste your API key on{" "}
                <a className="text-brown-dark underline" href="/integrations">
                  Integrations
                </a>
                . Until then, agents stay on local assistance.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && agents.length === 0 ? (
        <EmptyState title="No agents configured" description="Seed or create agent configs to appear here." />
      ) : null}

      {!loading && agents.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => {
                  setSelected(agent);
                  setPrompt(agent.config?.system_prompt || "");
                }}
                className={`surface-card w-full p-4 text-left transition-colors duration-150 md:p-5 ${
                  selected?.id === agent.id ? "border-brown ring-1 ring-brown/30" : "hover:bg-stone/30"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="ops-section-title">{agent.name}</h2>
                  <Badge tone={agent.status === "active" ? "success" : "warning"}>{agent.status}</Badge>
                  <Badge tone="neutral">{agent.role}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">{agent.description}</p>
                <p className="mt-2 text-xs text-muted">
                  Channels: {(agent.config?.channels || []).join(", ") || "—"}
                </p>
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy === agent.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePause(agent);
                    }}
                  >
                    {agent.status === "paused" ? "Resume" : "Pause"}
                  </Button>
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {selected ? (
              <div className="surface-card space-y-4 p-5">
                <h3 className="ops-section-title">{selected.name} config</h3>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[13px] font-medium text-ink">System prompt</span>
                  <textarea
                    className="min-h-[120px] w-full rounded-sm border border-line bg-white px-3 py-2 text-sm transition-colors duration-150 focus:border-brown focus:outline-none"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                </label>
                <Button size="sm" disabled={busy === "prompt"} onClick={savePrompt}>
                  Save prompt
                </Button>
                <Input
                  label="Test message"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  hint={
                    llm?.status === "live" || llm?.has_credentials
                      ? "Dry run uses the connected AI path."
                      : "Without an AI key, dry runs stay on local assistance."
                  }
                />
                <Button size="sm" variant="secondary" disabled={busy === "test"} onClick={runTest}>
                  {busy === "test" ? "Running…" : "Test run (dry)"}
                </Button>
                {testResult ? (
                  <div className="space-y-1.5 rounded-md border border-line bg-stone/40 p-3 text-sm text-muted">
                    <p>
                      {typeof testResult.output === "string"
                        ? testResult.output
                        : "Dry run completed."}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="surface-card p-5">
              <h3 className="ops-section-title">Activity</h3>
              <p className="mt-1 text-sm text-muted">
                Runs: {activity.metrics?.total_runs ?? 0} · Failed: {activity.metrics?.failed_runs ?? 0} ·
                Tokens: {(activity.metrics?.prompt_tokens ?? 0) + (activity.metrics?.completion_tokens ?? 0)}
              </p>
              <div className="mt-3 max-h-72 space-y-2 overflow-auto">
                {(activity.data || []).slice(0, 12).map((run) => (
                  <div key={run.id} className="rounded-md border border-line px-3 py-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <span>
                        {run.agent_key} · {run.purpose}
                      </span>
                      <Badge tone={run.status === "completed" ? "success" : "danger"}>{run.status}</Badge>
                    </div>
                    <p className="mt-1 text-muted">
                      {run.provider} · {run.latency_ms}ms
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
