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

const CATEGORIES = [
  { value: "tone", label: "Tone of voice" },
  { value: "timing", label: "When to message" },
  { value: "conversation", label: "Open / close" },
  { value: "general", label: "General" },
];

const emptyForm = {
  title: "",
  category: "tone",
  body: "",
  tags: "",
};

export default function TrainingDocsPage() {
  const [docs, setDocs] = useState([]);
  const [storage, setStorage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [retrieveQuery, setRetrieveQuery] = useState("warm greeting close conversation");
  const [retrieved, setRetrieved] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/agents/training-docs");
      setDocs(data.data || []);
      setStorage(data.storage || "");
    } catch (err) {
      setError(err.message || "Failed to load training docs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveDoc(e) {
    e.preventDefault();
    setBusy("save");
    setNotice("");
    setError("");
    try {
      const result = await apiFetch("/v1/agents/training-docs", {
        method: "POST",
        body: {
          title: form.title,
          category: form.category,
          body: form.body,
          tags: form.tags,
          status: "published",
        },
      });
      setNotice(`Saved “${result.doc?.title || form.title}” (${result.storage || "stored"}).`);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setBusy("");
    }
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("upload");
    setNotice("");
    setError("");
    try {
      const text = await file.text();
      const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      const result = await apiFetch("/v1/agents/training-docs", {
        method: "POST",
        body: {
          title: baseName || file.name,
          category: form.category || "general",
          body: text,
          filename: file.name,
          tags: form.tags || "upload",
          status: "published",
          source: "upload",
        },
      });
      setNotice(`Uploaded ${file.name} → agents can retrieve it when unsure.`);
      e.target.value = "";
      await load();
      if (result?.doc) {
        /* keep form category for next upload */
      }
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setBusy("");
    }
  }

  async function removeDoc(id) {
    setBusy(id);
    setError("");
    try {
      await apiFetch(`/v1/agents/training-docs/${id}`, { method: "DELETE" });
      setNotice("Training doc removed.");
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function testRetrieve(e) {
    e.preventDefault();
    setBusy("retrieve");
    setError("");
    try {
      const data = await apiFetch("/v1/agents/training-docs/retrieve", {
        method: "POST",
        body: { query: retrieveQuery },
      });
      setRetrieved(data);
    } catch (err) {
      setError(err.message || "Retrieve failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title="Training docs"
      description="Upload tone, timing, and conversation open/close guidance. Agents retrieve these when unsure — they must not invent off-brand words."
      actions={
        <Link href="/agents">
          <Button variant="secondary" size="sm">
            Back to agents
          </Button>
        </Link>
      }
    >
      {loading ? <Skeleton className="h-32" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
          <div className="space-y-4">
            <section className="surface-card space-y-4 p-5">
              <h2 className="ops-section-title">Upload or write</h2>
              <p className="text-sm text-muted">
                Accepted: plain text / Markdown. Storage: {storage || "…"}. No API secrets in docs.
              </p>
              <label className="block text-sm">
                <span className="mb-1.5 block text-[13px] font-medium text-ink">Upload file</span>
                <input
                  type="file"
                  accept=".txt,.md,.markdown,text/plain,text/markdown"
                  onChange={onUpload}
                  disabled={Boolean(busy)}
                  className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--color-brand-champagne,#c4a882)]"
                />
              </label>
              <form className="space-y-3" onSubmit={saveDoc}>
                <Input
                  label="Title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[13px] font-medium text-ink">Category</span>
                  <select
                    className="ops-field px-3 py-2"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Tags"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  hint="Comma-separated — e.g. tone, greeting, handoff"
                />
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[13px] font-medium text-ink">Body</span>
                  <textarea
                    className="ops-field min-h-[140px] px-3 py-2"
                    value={form.body}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                    required
                    placeholder="Warm greetings… when to message… how to open and close…"
                  />
                </label>
                <Button type="submit" size="sm" disabled={busy === "save"}>
                  {busy === "save" ? "Saving…" : "Save training doc"}
                </Button>
              </form>
            </section>

            <section className="surface-card space-y-3 p-5">
              <h2 className="ops-section-title">Test retrieval</h2>
              <p className="text-sm text-muted">
                Test how agents retrieve training docs for a query.
              </p>
              <form className="space-y-3" onSubmit={testRetrieve}>
                <Input
                  label="Query"
                  value={retrieveQuery}
                  onChange={(e) => setRetrieveQuery(e.target.value)}
                />
                <Button type="submit" size="sm" variant="secondary" disabled={busy === "retrieve"}>
                  {busy === "retrieve" ? "Retrieving…" : "Retrieve for agents"}
                </Button>
              </form>
              {retrieved ? (
                <div className="space-y-2">
                  {(retrieved.data || []).map((row) => (
                    <article key={row.id} className="rounded-md border border-line px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{row.title}</span>
                        <Badge tone="brand">{row.category}</Badge>
                        <Badge tone="neutral">score {row.score}</Badge>
                      </div>
                      <p className="mt-1 text-muted">{row.excerpt}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          <div className="space-y-3">
            <h2 className="ops-section-title">Published for agents</h2>
            {docs.length === 0 ? (
              <EmptyState
                title="No training docs"
                description="Upload tone, timing, or open/close guidance so agents stay on-brand."
              />
            ) : (
              docs.map((doc) => (
                <article key={doc.id} className="surface-card space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{doc.title}</h3>
                    <Badge tone="brand">{doc.category}</Badge>
                    <Badge tone={doc.status === "published" ? "success" : "neutral"}>
                      {doc.status}
                    </Badge>
                    <Badge tone="neutral">{doc.source}</Badge>
                  </div>
                  <p className="text-sm text-muted line-clamp-4 whitespace-pre-wrap">{doc.body}</p>
                  {(doc.tags || []).length ? (
                    <p className="text-xs text-muted">Tags: {doc.tags.join(", ")}</p>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === doc.id}
                    onClick={() => removeDoc(doc.id)}
                  >
                    Remove
                  </Button>
                </article>
              ))
            )}
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
