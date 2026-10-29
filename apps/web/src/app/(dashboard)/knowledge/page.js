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

const EMPTY_FORM = {
  title: "",
  source_type: "faq",
  status: "published",
  body: "",
  tags: "",
};

export default function KnowledgePage() {
  const [sources, setSources] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
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
    setForm(EMPTY_FORM);
    setShowForm(true);
    setNotice("");
  }

  function openEdit(source) {
    if (source.read_only || source.source_type === "training_doc") return;
    setEditingId(source.id);
    setForm({
      title: source.title || "",
      source_type: source.source_type || "faq",
      status: source.status || "published",
      body: source.body || "",
      tags: Array.isArray(source.tags) ? source.tags.join(", ") : "",
    });
    setShowForm(true);
    setNotice("");
  }

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function submitForm(event) {
    event.preventDefault();
    setBusy("save");
    setError("");
    setNotice("");
    const payload = {
      title: form.title.trim(),
      source_type: form.source_type,
      status: form.status,
      body: form.body.trim(),
      tags: form.tags,
    };
    try {
      const path = editingId ? `/v1/knowledge/${editingId}` : "/v1/knowledge";
      await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        body: payload,
      });
      setNotice(editingId ? "Knowledge updated." : "Knowledge added.");
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setBusy("");
    }
  }

  async function removeOne(source) {
    if (source.read_only || source.source_type === "training_doc") return;
    if (!window.confirm(`Delete “${source.title}”?`)) return;
    setBusy(`del-${source.id}`);
    setError("");
    try {
      await apiFetch(`/v1/knowledge/${source.id}`, { method: "DELETE" });
      setNotice("Deleted.");
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  const editable = sources.filter(
    (s) => !s.read_only && s.source_type !== "training_doc",
  );
  const training = sources.filter(
    (s) => s.read_only || s.source_type === "training_doc",
  );

  return (
    <DashboardShell
      title="Knowledge"
      description="Add, edit, and save FAQs and policies used for AI answers. Nothing is hardcoded — you own the catalog."
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
                onChange={(e) => updateField("source_type", e.target.value)}
              >
                <option value="faq">FAQ</option>
                <option value="policy">Policy</option>
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
            <Input
              label="Tags (comma-separated)"
              name="tags"
              value={form.tags}
              onChange={(e) => updateField("tags", e.target.value)}
              hint="Use materials, making, care, shipping so answer-bot can match."
            />
          </div>
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-ink">Body</span>
            <textarea
              name="body"
              rows={5}
              required
              value={form.body}
              onChange={(e) => updateField("body", e.target.value)}
              className="ops-field px-3 py-2 text-ink focus:border-brown focus:outline-none"
              placeholder="Approved answer text…"
            />
          </label>
          <div className="ops-actions">
            <Button type="submit" disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : editingId ? "Save" : "Add"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {!loading && !error && editable.length === 0 ? (
        <EmptyState
          title="No knowledge sources yet"
          description="Add FAQs or approved policy text. Training docs appear below from Agents → Training."
        />
      ) : null}

      {!loading && editable.length > 0 ? (
        <div className="divide-y divide-line surface-card overflow-hidden">
          {editable.map((source) => (
            <article key={source.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{source.title}</h2>
                  <Badge tone="brand">{source.source_type}</Badge>
                  <Badge tone="neutral">{source.status}</Badge>
                </div>
                <div className="ops-actions">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(source)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === `del-${source.id}`}
                    onClick={() => removeOne(source)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted">{source.body}</p>
              {(source.tags || []).length > 0 ? (
                <p className="mt-2 text-xs text-muted">Tags: {source.tags.join(", ")}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {!loading && training.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">Training docs</h2>
          <p className="mt-1 text-sm text-muted">
            Managed on Agents → Training. Shown here for answer context.
          </p>
          <div className="mt-4 divide-y divide-line surface-card overflow-hidden">
            {training.map((source) => (
              <article key={source.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{source.title}</h3>
                  <Badge tone="brand">training_doc</Badge>
                  <Badge tone="neutral">{source.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted line-clamp-3">{source.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </DashboardShell>
  );
}
