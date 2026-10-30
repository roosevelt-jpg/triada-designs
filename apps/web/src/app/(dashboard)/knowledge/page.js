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

const TRAINING_CATEGORIES = [
  { value: "tone", label: "Tone of voice" },
  { value: "timing", label: "When to message" },
  { value: "conversation", label: "Open / close" },
  { value: "general", label: "General" },
];

const EMPTY_FORM = {
  title: "",
  source_type: "faq",
  status: "published",
  category: "general",
  body: "",
  tags: "",
};

function isTraining(source) {
  return (
    Boolean(source?.read_only) ||
    source?.source_type === "training_doc" ||
    String(source?.id || "").startsWith("tdoc-")
  );
}

function statusTone(status) {
  if (status === "published" || status === "active") return "success";
  if (status === "draft") return "warning";
  return "neutral";
}

export default function KnowledgePage() {
  const [sources, setSources] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingTraining, setEditingTraining] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/knowledge");
      setSources(data.data || []);
    } catch (err) {
      setError(err.message || "Failed to load knowledge");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setEditingTraining(false);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setNotice("");
  }

  function openEdit(source) {
    const training = isTraining(source);
    setEditingId(source.id);
    setEditingTraining(training);
    setForm({
      title: source.title || "",
      source_type: training ? "training_doc" : source.source_type || "faq",
      status: source.status || "published",
      category: source.category || "general",
      body: source.body || "",
      tags: Array.isArray(source.tags) ? source.tags.join(", ") : "",
    });
    setShowForm(true);
    setNotice("");
  }

  function updateField(name, value) {
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "source_type" && value === "training_doc" && !prev.category) {
        next.category = "general";
      }
      return next;
    });
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setEditingTraining(false);
    setForm(EMPTY_FORM);
  }

  async function submitForm(event) {
    event.preventDefault();
    setBusy("save");
    setError("");
    setNotice("");
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title || !body) {
      setError("Title and body are required.");
      setBusy("");
      return;
    }

    const asTraining =
      editingTraining || form.source_type === "training_doc";

    try {
      const payload = asTraining
        ? {
            title,
            body,
            source_type: "training_doc",
            category: form.category || "general",
            status: form.status || "published",
            tags: form.tags,
          }
        : {
            title,
            source_type: form.source_type === "policy" ? "policy" : "faq",
            status: form.status,
            body,
            tags: form.tags,
          };
      const path = editingId ? `/v1/knowledge/${editingId}` : "/v1/knowledge";
      await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        body: payload,
      });
      setNotice(
        editingId
          ? asTraining
            ? "Training doc updated."
            : "Knowledge updated."
          : asTraining
            ? "Training doc added."
            : "Knowledge added.",
      );
      closeForm();
      await load();
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setBusy("");
    }
  }

  async function removeOne(source) {
    if (!window.confirm(`Delete “${source.title}”?`)) return;
    setBusy(`del-${source.id}`);
    setError("");
    try {
      await apiFetch(`/v1/knowledge/${source.id}`, { method: "DELETE" });
      setNotice("Deleted.");
      if (editingId === source.id) closeForm();
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  const typeLocked = Boolean(editingId);

  return (
    <DashboardShell
      title="Knowledge"
      description="Add, edit, and save FAQs, policies, and training guidance used for AI answers. Nothing is hardcoded — you own the catalog."
      actions={
        <Button size="sm" onClick={openCreate}>
          Add knowledge
        </Button>
      }
    >
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}
      {loading ? <Skeleton className="h-32" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {showForm ? (
        <form
          onSubmit={submitForm}
          className="mb-8 space-y-4 border-b border-line pb-8"
        >
          <h2 className="font-display text-2xl text-ink">
            {editingId ? "Edit knowledge" : "New knowledge"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Title"
              name="title"
              required
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Materials & making time"
            />
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-ink">Type</span>
              <select
                className="ops-field w-full px-3 py-2"
                value={form.source_type}
                disabled={typeLocked}
                onChange={(e) => updateField("source_type", e.target.value)}
              >
                <option value="faq">FAQ</option>
                <option value="policy">Policy</option>
                <option value="training_doc">Training doc</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-ink">Status</span>
              <select
                className="ops-field w-full px-3 py-2"
                value={form.status}
                onChange={(e) => updateField("status", e.target.value)}
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            {form.source_type === "training_doc" ? (
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium text-ink">
                  Training category
                </span>
                <select
                  className="ops-field w-full px-3 py-2"
                  value={form.category}
                  onChange={(e) => updateField("category", e.target.value)}
                >
                  {TRAINING_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <Input
                label="Tags (comma-separated)"
                name="tags"
                value={form.tags}
                onChange={(e) => updateField("tags", e.target.value)}
                hint="Use materials, making, care, shipping so answer-bot can match."
              />
            )}
            {form.source_type === "training_doc" ? (
              <Input
                label="Tags (comma-separated)"
                name="tags"
                value={form.tags}
                onChange={(e) => updateField("tags", e.target.value)}
                hint="e.g. tone, greeting, handoff"
              />
            ) : null}
          </div>
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-ink">Body</span>
            <textarea
              name="body"
              rows={6}
              required
              value={form.body}
              onChange={(e) => updateField("body", e.target.value)}
              className="ops-field px-3 py-2 text-ink focus:border-brown focus:outline-none"
              placeholder="Approved answer or training text…"
            />
          </label>
          <div className="ops-actions">
            <Button type="submit" disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : editingId ? "Save" : "Add"}
            </Button>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {!loading && !error && sources.length === 0 ? (
        <EmptyState
          title="No knowledge sources yet"
          description="Add FAQs, policies, or training docs. Everything you save is used for AI answers."
        />
      ) : null}

      {!loading && sources.length > 0 ? (
        <div className="divide-y divide-line surface-card overflow-hidden">
          {sources.map((source) => (
            <article key={source.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{source.title}</h2>
                  <Badge tone="brand">
                    {isTraining(source) ? "training_doc" : source.source_type}
                  </Badge>
                  <Badge tone={statusTone(source.status)}>{source.status}</Badge>
                  {isTraining(source) && source.category ? (
                    <Badge tone="neutral">{source.category}</Badge>
                  ) : null}
                </div>
                <div className="ops-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openEdit(source)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === `del-${source.id}`}
                    onClick={() => removeOne(source)}
                  >
                    {busy === `del-${source.id}` ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                {source.body}
              </p>
              {(source.tags || []).length > 0 ? (
                <p className="mt-2 text-xs text-muted">
                  Tags: {source.tags.join(", ")}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
