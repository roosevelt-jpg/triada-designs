"use client";

import Link from "next/link";
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

const emptyAgentForm = {
  name: "",
  role: "custom",
  description: "",
  system_prompt: "",
};

const emptyTaskForm = {
  title: "",
  description: "",
  priority: "normal",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [memory, setMemory] = useState([]);
  const [llm, setLlm] = useState(null);
  const [activity, setActivity] = useState({ data: [], metrics: {} });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [testMessage, setTestMessage] = useState(
    "Do you ship Footprints in the Sand internationally?",
  );
  const [testResult, setTestResult] = useState(null);
  const [agentForm, setAgentForm] = useState(emptyAgentForm);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [agentData, llmData, activityData, taskData, memData] = await Promise.all([
        apiFetch("/v1/agents"),
        apiFetch("/v1/agents/llm/status"),
        apiFetch("/v1/agents/activity"),
        apiFetch("/v1/agents/tasks"),
        apiFetch("/v1/agents/shared-memory"),
      ]);
      const rows = agentData.data || [];
      setAgents(rows);
      setLlm(llmData);
      setActivity(activityData);
      setTasks(taskData.data || []);
      setMemory(memData.data || []);
      setSelected((prev) => {
        if (prev) {
          const fresh = rows.find((a) => a.id === prev.id);
          if (fresh) {
            setPrompt(fresh.config?.system_prompt || "");
            return fresh;
          }
        }
        if (rows[0]) {
          setPrompt(rows[0].config?.system_prompt || "");
          return rows[0];
        }
        return null;
      });
    } catch (err) {
      setError(err.message || "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      setNotice(`Saved prompt for ${updated.name}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function createAgent(e) {
    e.preventDefault();
    setBusy("create-agent");
    setError("");
    try {
      const result = await apiFetch("/v1/agents", {
        method: "POST",
        body: {
          name: agentForm.name,
          role: agentForm.role,
          description: agentForm.description,
          system_prompt: agentForm.system_prompt,
          collaborates_with: selected ? [selected.key] : [],
        },
      });
      setNotice(`Created agent ${result.agent?.name}`);
      setAgentForm(emptyAgentForm);
      await load();
      if (result.agent) {
        setSelected(result.agent);
        setPrompt(result.agent.config?.system_prompt || "");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function assignTask(e) {
    e.preventDefault();
    if (!selected) return;
    setBusy("assign-task");
    setError("");
    try {
      const result = await apiFetch("/v1/agents/tasks", {
        method: "POST",
        body: {
          agent_id: selected.id,
          agent_key: selected.key,
          title: taskForm.title,
          description: taskForm.description,
          priority: taskForm.priority,
          context_keys: ["collab.active_thread", "workspace.brand"],
        },
      });
      setNotice(`Assigned “${result.task?.title}” to ${selected.name}`);
      setTaskForm(emptyTaskForm);
      const taskData = await apiFetch("/v1/agents/tasks");
      setTasks(taskData.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function runTest({ collaborate }) {
    if (!selected) return;
    setBusy(collaborate ? "collab" : "test");
    setTestResult(null);
    setError("");
    try {
      const result = await apiFetch(
        collaborate ? "/v1/agents/collaborate" : "/v1/agents/test-run",
        {
          method: "POST",
          body: {
            agent_key: selected.key,
            purpose: "draft_reply",
            message: testMessage,
            dry_run: true,
            collaborate,
          },
        },
      );
      setTestResult(result);
      const [activityData, memData] = await Promise.all([
        apiFetch("/v1/agents/activity"),
        apiFetch("/v1/agents/shared-memory"),
      ]);
      setActivity(activityData);
      setMemory(memData.data || []);
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

  const selectedTasks = tasks.filter(
    (t) => t.agent_id === selected?.id || t.agent_key === selected?.key,
  );

  return (
    <DashboardShell
      title="AI agents"
      description="Eight seeded teammates share memory and tasks: AI Support, Content creator / Creative, Follow up, Marketing, Quality Control, Compliance, Leads Qualification, and Escalation officer. Admin can create agents and assign work. Live agents use Claude credentials on the host (Vercel)."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/agents/training">
            <Button variant="secondary" size="sm">
              Training docs
            </Button>
          </Link>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {llm ? (
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={statusTone}>{statusLabel}</Badge>
            <Badge tone="brand">{agents.length} agents</Badge>
            <Badge tone="neutral">{tasks.filter((t) => t.status === "open").length} open tasks</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted">
            {llm.summary || aiStatusSummary(llm)} Shared memory/kv keeps collaboration context
            across the team.
          </p>
          {llm.status === "awaiting_credentials" ? (
            <div className="surface-card max-w-3xl space-y-2 p-4 text-sm">
              <p className="font-medium text-ink">Waiting credentials</p>
              <p className="text-muted">
                Claude credentials live on Vercel. Check status on{" "}
                <a className="text-brown-dark underline" href="/integrations">
                  Integrations
                </a>
                . Until connected, agents stay on local assistance and still share memory.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && agents.length === 0 ? (
        <EmptyState title="No agents configured" description="Seed or create agent configs to appear here." />
      ) : null}

      {!loading && agents.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
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
                  {(agent.config?.collaborates_with || []).length
                    ? ` · Peers: ${agent.config.collaborates_with.join(", ")}`
                    : ""}
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

            <form className="surface-card space-y-3 p-5" onSubmit={createAgent}>
              <h3 className="ops-section-title">Create agent</h3>
              <Input
                label="Name"
                required
                value={agentForm.name}
                onChange={(e) => setAgentForm((f) => ({ ...f, name: e.target.value }))}
              />
              <Input
                label="Role"
                value={agentForm.role}
                onChange={(e) => setAgentForm((f) => ({ ...f, role: e.target.value }))}
              />
              <Input
                label="Description"
                value={agentForm.description}
                onChange={(e) => setAgentForm((f) => ({ ...f, description: e.target.value }))}
              />
              <label className="block text-sm">
                <span className="mb-1.5 block text-[13px] font-medium text-ink">System prompt</span>
                <textarea
                  className="min-h-[80px] w-full rounded-sm border border-line bg-white px-3 py-2 text-sm focus:border-brown focus:outline-none"
                  value={agentForm.system_prompt}
                  onChange={(e) => setAgentForm((f) => ({ ...f, system_prompt: e.target.value }))}
                />
              </label>
              <Button type="submit" size="sm" disabled={busy === "create-agent"}>
                Create agent
              </Button>
            </form>
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
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy === "test"} onClick={() => runTest({ collaborate: false })}>
                    {busy === "test" ? "Running…" : "Test run (solo)"}
                  </Button>
                  <Button size="sm" disabled={busy === "collab"} onClick={() => runTest({ collaborate: true })}>
                    {busy === "collab" ? "Collaborating…" : "Collaborate (shared memory)"}
                  </Button>
                </div>
                {testResult ? (
                  <div className="space-y-2 rounded-md border border-line bg-stone/40 p-3 text-sm text-muted">
                    <p className="whitespace-pre-wrap text-ink">
                      {typeof testResult.output === "string"
                        ? testResult.output
                        : typeof testResult.text === "string"
                          ? testResult.text
                          : "Dry run completed."}
                    </p>
                    {Array.isArray(testResult.training_used) && testResult.training_used.length ? (
                      <p className="text-xs">
                        Training retrieved:{" "}
                        {testResult.training_used.map((t) => t.title).join(" · ")}
                      </p>
                    ) : null}
                    {testResult.collaboration ? (
                      <p className="text-xs">
                        Collaboration steps:{" "}
                        {(testResult.steps || [])
                          .map((s) => `${s.agent_name || s.agent_key}:${s.step}`)
                          .join(" → ")}
                      </p>
                    ) : null}
                    {testResult.mode ? <p className="text-xs">Mode: {testResult.mode}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {selected ? (
              <form className="surface-card space-y-3 p-5" onSubmit={assignTask}>
                <h3 className="ops-section-title">Assign task to {selected.name}</h3>
                <Input
                  label="Title"
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                />
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[13px] font-medium text-ink">Description</span>
                  <textarea
                    className="min-h-[72px] w-full rounded-sm border border-line bg-white px-3 py-2 text-sm focus:border-brown focus:outline-none"
                    value={taskForm.description}
                    onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[13px] font-medium text-ink">Priority</span>
                  <select
                    className="h-10 w-full rounded-sm border border-line bg-white px-3 text-sm"
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm((f) => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
                <Button type="submit" size="sm" disabled={busy === "assign-task"}>
                  Assign task
                </Button>
                {selectedTasks.length ? (
                  <ul className="mt-2 space-y-2">
                    {selectedTasks.slice(0, 6).map((task) => (
                      <li key={task.id} className="rounded-md border border-line px-3 py-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{task.title}</span>
                          <Badge tone="neutral">{task.priority}</Badge>
                          <Badge tone={task.status === "done" ? "success" : "warning"}>{task.status}</Badge>
                        </div>
                        {task.description ? <p className="mt-1 text-muted">{task.description}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted">No tasks assigned to this agent yet.</p>
                )}
              </form>
            ) : null}

            <div className="surface-card p-5">
              <h3 className="ops-section-title">Shared memory / kv</h3>
              <p className="mt-1 text-sm text-muted">
                Team context every agent can read and write during collaboration.
              </p>
              <div className="mt-3 max-h-56 space-y-2 overflow-auto">
                {memory.length === 0 ? (
                  <p className="text-xs text-muted">No shared keys yet.</p>
                ) : (
                  memory.slice(0, 12).map((row) => (
                    <div key={row.key} className="rounded-md border border-line px-3 py-2 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-ink">{row.key}</span>
                        <span className="text-muted">{row.written_by || "system"}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-muted">
                        {typeof row.value === "string"
                          ? row.value
                          : JSON.stringify(row.value)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="surface-card p-5">
              <h3 className="ops-section-title">Activity</h3>
              <p className="mt-1 text-sm text-muted">
                Runs: {activity.metrics?.total_runs ?? 0} · Open tasks:{" "}
                {activity.metrics?.open_tasks ?? tasks.filter((t) => t.status === "open").length}
              </p>
              <div className="mt-3 max-h-72 space-y-2 overflow-auto">
                {(activity.data || []).slice(0, 12).map((run) => (
                  <div key={run.id} className="rounded-md border border-line px-3 py-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <span>
                        {run.agent_key || run.agent} · {run.purpose || run.event}
                      </span>
                      <Badge tone={run.status === "completed" || run.status === "active" ? "success" : "warning"}>
                        {run.status || run.event}
                      </Badge>
                    </div>
                    <p className="mt-1 text-muted">
                      {run.provider} · {run.channel}
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
