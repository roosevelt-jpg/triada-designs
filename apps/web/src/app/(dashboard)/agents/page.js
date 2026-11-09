"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentDetailModal } from "@/components/agents/AgentDetailModal";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { featuresForAgent } from "@/lib/agents/agent-features";
import {
  AGENT_ROLE_OPTIONS,
  activityMetaLabel,
  activityRunLabel,
  agentChannelLabel,
  agentDisplayName,
  agentRoleLabel,
  agentStatusLabel,
  agentToolLabel,
  memoryKeyLabel,
  memoryValueLabel,
  runModeLabel,
  taskPriorityLabel,
} from "@/lib/agents/labels";
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailAgent, setDetailAgent] = useState(null);
  const [creativeTools, setCreativeTools] = useState(null);
  const [creativeTool, setCreativeTool] = useState("generate_short_video");
  const [creativeProduct, setCreativeProduct] = useState(
    "Triada Designs gold hoop earrings",
  );
  const [creativeResult, setCreativeResult] = useState(null);
  const configRef = useRef(null);

  const openAgentDetail = useCallback((agent) => {
    setDetailAgent(agent);
    setDetailOpen(true);
    setSelected(agent);
    setPrompt(agent?.config?.system_prompt || "");
  }, []);

  const selectForConfig = useCallback((agent) => {
    setSelected(agent);
    setPrompt(agent?.config?.system_prompt || "");
    requestAnimationFrame(() => {
      configRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

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
      setDetailAgent((prev) => {
        if (!prev) return prev;
        return rows.find((a) => a.id === prev.id) || prev;
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

  // Every Triada agent can run Anthropic → Higgsfield creative tools / quote cards.
  const canRunCreativeTools = Boolean(selected?.key);

  useEffect(() => {
    if (!canRunCreativeTools) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const catalog = await apiFetch("/v1/agents/creative-tools");
        if (!cancelled) setCreativeTools(catalog);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canRunCreativeTools, selected?.key]);

  async function runCreativeToolAction({ dryRun }) {
    if (!selected || !canRunCreativeTools) return;
    setBusy(dryRun ? "creative-dry" : "creative-run");
    setCreativeResult(null);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch("/v1/agents/creative-tools/run", {
        method: "POST",
        body: {
          agent_key: selected.key,
          tool: creativeTool,
          dry_run: Boolean(dryRun),
          payload: {
            product: creativeProduct,
            caption: testMessage,
            channel: "instagram",
            style: creativeTool === "generate_ugc_video" ? "ugc" : "editorial",
            duration: 5,
            resolution: "720p",
            aspect_ratio: "9:16",
            video_model: "bytedance/seedance-2.5/text-to-video",
            image_model: "higgsfield-ai/soul/v2/standard",
          },
        },
      });
      setCreativeResult(result);
      setNotice(
        dryRun
          ? `Dry run planned for ${agentToolLabel(creativeTool)}.`
          : result.message ||
              `${agentToolLabel(creativeTool)} finished — preview before approval.`,
      );
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

  const selectedTasks = tasks.filter(
    (t) => t.agent_id === selected?.id || t.agent_key === selected?.key,
  );

  const channelPreview = (agent) =>
    (agent.config?.channels || []).map(agentChannelLabel).filter(Boolean).join(", ") || "—";
  const peerPreview = (agent) =>
    (agent.config?.collaborates_with || [])
      .map((peer) => agentDisplayName(peer, agents))
      .filter(Boolean)
      .join(", ");

  const testModeLabel = runModeLabel(testResult?.mode);

  return (
    <DashboardShell
      title="AI agents"
      description="Create agents, assign work, and collaborate from one place."
      actions={
        <div className="ops-actions">
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
            {llm.summary || aiStatusSummary(llm)}
          </p>
          {llm.status === "awaiting_credentials" ? (
            <div className="surface-card max-w-3xl space-y-2 p-4 text-sm">
              <p className="font-medium text-ink">Waiting credentials</p>
              <p className="text-muted">
                Check status on{" "}
                <a className="text-brown-dark underline" href="/integrations">
                  Integrations
                </a>
                . Agents stay available with local assistance until connected.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && agents.length === 0 ? (
        <EmptyState title="No agents configured" description="Create an agent to get started." />
      ) : null}

      {!loading && agents.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            {agents.map((agent) => {
              const previewFeatures = featuresForAgent(agent).slice(0, 2);
              const peers = peerPreview(agent);
              return (
              <div
                key={agent.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${agent.name} details`}
                onClick={() => openAgentDetail(agent)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openAgentDetail(agent);
                  }
                }}
                className={`surface-card w-full cursor-pointer p-4 text-left transition-colors duration-150 md:p-5 ${
                  selected?.id === agent.id ? "border-brown ring-1 ring-brown/30" : "hover:bg-stone/30"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="ops-section-title">{agent.name}</h2>
                  <Badge tone={agent.status === "active" ? "success" : "warning"}>
                    {agentStatusLabel(agent.status)}
                  </Badge>
                  <Badge tone="neutral">{agentRoleLabel(agent.role)}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">{agent.description}</p>
                {previewFeatures.length ? (
                  <ul className="mt-2 space-y-1">
                    {previewFeatures.map((feature) => (
                      <li key={feature} className="text-xs text-muted">
                        · {feature}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  Channels: {channelPreview(agent)}
                  {peers ? ` · Peers: ${peers}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
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
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openAgentDetail(agent);
                    }}
                  >
                    View details
                  </Button>
                </div>
              </div>
              );
            })}

            <form className="surface-card space-y-3 p-5" onSubmit={createAgent}>
              <h3 className="ops-section-title">Create agent</h3>
              <Input
                label="Name"
                required
                value={agentForm.name}
                onChange={(e) => setAgentForm((f) => ({ ...f, name: e.target.value }))}
              />
              <label className="block text-sm">
                <span className="mb-1.5 block text-[13px] font-medium text-ink">Role</span>
                <select
                  className="ops-field h-10 px-3"
                  value={agentForm.role}
                  onChange={(e) => setAgentForm((f) => ({ ...f, role: e.target.value }))}
                >
                  {AGENT_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Description"
                value={agentForm.description}
                onChange={(e) => setAgentForm((f) => ({ ...f, description: e.target.value }))}
              />
              <label className="block text-sm">
                <span className="mb-1.5 block text-[13px] font-medium text-ink">Agent instructions</span>
                <textarea
                  className="ops-field min-h-[80px] px-3 py-2"
                  value={agentForm.system_prompt}
                  onChange={(e) => setAgentForm((f) => ({ ...f, system_prompt: e.target.value }))}
                />
              </label>
              <Button type="submit" size="sm" disabled={busy === "create-agent"}>
                Create agent
              </Button>
            </form>
          </div>

          <div className="space-y-4" ref={configRef}>
            {selected ? (
              <div className="surface-card space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="ops-section-title">{selected.name}</h3>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openAgentDetail(selected)}
                  >
                    View capabilities
                  </Button>
                </div>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[13px] font-medium text-ink">Agent instructions</span>
                  <textarea
                    className="ops-field min-h-[120px] px-3 py-2"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                </label>
                <Button size="sm" disabled={busy === "prompt"} onClick={savePrompt}>
                  Save instructions
                </Button>
                <Input
                  label="Test message"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  hint={
                    llm?.status === "live" || llm?.has_credentials
                      ? "Dry run uses the connected AI path."
                      : "Without an AI connection, dry runs stay on local assistance."
                  }
                />
                <div className="ops-actions">
                  <Button size="sm" variant="secondary" disabled={busy === "test"} onClick={() => runTest({ collaborate: false })}>
                    {busy === "test" ? "Running…" : "Test run (solo)"}
                  </Button>
                  <Button size="sm" disabled={busy === "collab"} onClick={() => runTest({ collaborate: true })}>
                    {busy === "collab" ? "Collaborating…" : "Collaborate with team"}
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
                          .map((s) => {
                            const who =
                              s.agent_name ||
                              agentDisplayName(s.agent_key || s.agent, agents);
                            const step = String(s.step || s.purpose || "step")
                              .replace(/[_-]+/g, " ")
                              .trim();
                            return `${who}: ${step}`;
                          })
                          .join(" → ")}
                      </p>
                    ) : null}
                    {testModeLabel ? <p className="text-xs">Mode: {testModeLabel}</p> : null}
                  </div>
                ) : null}

                {canRunCreativeTools ? (
                  <div className="space-y-3 border-t border-line pt-4">
                    <h4 className="text-[13px] font-medium text-ink">
                      Creative tools (Anthropic → Higgsfield)
                    </h4>
                    <p className="text-xs text-muted">
                      Any agent can run this path: Claude scripts / quote copy, then Soul V2 /
                      Seedance pixels. Output lands in Content Studio as in review — never
                      auto-publishes. Assigning a creative task also triggers this when the
                      description asks for image, video, UGC, or quote cards.
                    </p>
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-[13px] font-medium text-ink">Tool</span>
                      <select
                        className="ops-field h-10 px-3"
                        value={creativeTool}
                        onChange={(e) => setCreativeTool(e.target.value)}
                      >
                        {(creativeTools?.tools || [
                          { name: "generate_short_video" },
                          { name: "generate_ugc_video" },
                          { name: "generate_image" },
                          { name: "generate_quote_inspiration" },
                          { name: "generate_platform_variants" },
                          { name: "generate_animation" },
                          { name: "ensure_creative_pack" },
                          { name: "propose_creative_brief" },
                        ]).map((tool) => (
                          <option key={tool.name} value={tool.name}>
                            {agentToolLabel(tool.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      label="Product focus"
                      value={creativeProduct}
                      onChange={(e) => setCreativeProduct(e.target.value)}
                    />
                    <div className="ops-actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy === "creative-dry"}
                        onClick={() => runCreativeToolAction({ dryRun: true })}
                      >
                        {busy === "creative-dry" ? "Planning…" : "Dry-run tool"}
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy === "creative-run"}
                        onClick={() => runCreativeToolAction({ dryRun: false })}
                      >
                        {busy === "creative-run" ? "Generating…" : "Generate creative"}
                      </Button>
                    </div>
                    {creativeResult ? (
                      <div className="space-y-2 rounded-md border border-line bg-stone/40 p-3 text-sm text-muted">
                        <p className="text-ink">
                          {creativeResult.message || "Creative tool finished."}
                        </p>
                        {creativeResult.script?.hook ? (
                          <p className="text-xs">Hook: {creativeResult.script.hook}</p>
                        ) : null}
                        {creativeResult.mode_label ? (
                          <p className="text-xs">Mode: {creativeResult.mode_label}</p>
                        ) : null}
                        {creativeResult.content_id ? (
                          <p className="text-xs">
                            Content: {creativeResult.content_id} ·{" "}
                            <Link href="/content/review" className="underline">
                              Open review
                            </Link>
                          </p>
                        ) : null}
                        {creativeResult.error ? (
                          <p className="text-xs text-brown-dark">{creativeResult.error}</p>
                        ) : null}
                      </div>
                    ) : null}
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
                    className="ops-field min-h-[72px] px-3 py-2"
                    value={taskForm.description}
                    onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[13px] font-medium text-ink">Priority</span>
                  <select
                    className="ops-field h-10 px-3"
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
                          <Badge tone="neutral">{taskPriorityLabel(task.priority)}</Badge>
                          <Badge tone={task.status === "done" ? "success" : "warning"}>
                            {agentStatusLabel(task.status)}
                          </Badge>
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
              <h3 className="ops-section-title">Team context</h3>
              <p className="mt-1 text-sm text-muted">
                Notes the team shares while collaborating.
              </p>
              <div className="mt-3 max-h-56 space-y-2 overflow-auto">
                {memory.length === 0 ? (
                  <p className="text-xs text-muted">No shared notes yet.</p>
                ) : (
                  memory.slice(0, 12).map((row) => (
                    <div key={row.key} className="rounded-md border border-line px-3 py-2 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-ink">{memoryKeyLabel(row.key)}</span>
                        <span className="text-muted">
                          {agentDisplayName(row.written_by || "system", agents)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-3 text-muted">
                        {memoryValueLabel(row.value)}
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
                {(activity.data || []).slice(0, 12).map((run) => {
                  const meta = activityMetaLabel(run);
                  return (
                    <div key={run.id} className="rounded-md border border-line px-3 py-2 text-xs">
                      <div className="flex justify-between gap-2">
                        <span>{activityRunLabel(run, agents)}</span>
                        <Badge
                          tone={
                            run.status === "completed" || run.status === "active"
                              ? "success"
                              : "warning"
                          }
                        >
                          {agentStatusLabel(run.status || run.event)}
                        </Badge>
                      </div>
                      {meta ? <p className="mt-1 text-muted">{meta}</p> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <AgentDetailModal
        open={detailOpen}
        agent={detailAgent}
        busy={busy}
        onClose={() => setDetailOpen(false)}
        onTogglePause={togglePause}
        onConfigure={selectForConfig}
      />
    </DashboardShell>
  );
}
