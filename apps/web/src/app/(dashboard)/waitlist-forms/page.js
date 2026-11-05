"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { ListSearch } from "@/components/ui/ListSearch";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

const EMPTY_FORM = {
  title: "",
  slug: "",
  description: "",
  product_label: "",
  product_link: "",
  success_message: "",
  status: "active",
};

function statusTone(status) {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "neutral";
}

export default function WaitlistFormsPage() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [copiedId, setCopiedId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = q ? `?q=${encodeURIComponent(q)}` : "";
      const response = await apiFetch(`/v1/waitlist-forms${query}`);
      setItems(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load waitlist forms");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setNotice("");
  }

  function openEdit(item) {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      slug: item.slug || "",
      description: item.description || "",
      product_label: item.product_label || "",
      product_link: item.product_link || "",
      success_message: item.success_message || "",
      status: item.status || "active",
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
      slug: form.slug.trim(),
      description: form.description.trim(),
      product_label: form.product_label.trim(),
      product_link: form.product_link.trim() || null,
      success_message: form.success_message.trim(),
      status: form.status || "active",
    };

    try {
      const path = editingId
        ? `/v1/waitlist-forms/${editingId}`
        : "/v1/waitlist-forms";
      const saved = await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        body: payload,
      });
      setNotice(
        editingId
          ? "Form updated."
          : `Form created — short link ready${saved.short_path ? `: ${saved.short_path}` : "."}`,
      );
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

  async function removeForm(item) {
    if (!item?.id) return;
    const label = item.title || "this form";
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete “${label}”?`)
    ) {
      return;
    }
    setBusy(`delete-${item.id}`);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/v1/waitlist-forms/${item.id}`, { method: "DELETE" });
      setNotice("Form deleted.");
      if (editingId === item.id) {
        setShowForm(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  /**
   * Always copy the canonical dashboard short URL — never ops.* aliases.
   * @param {{ slug?: string, short_path?: string, short_url?: string }} item
   */
  function canonicalShortUrl(item) {
    const slug = String(item?.slug || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const path =
      (item?.short_path && String(item.short_path).startsWith("/f/")
        ? String(item.short_path)
        : null) || (slug ? `/f/${slug}` : "");
    if (!path) return "";
    return `https://dashboard.triada-designs.com${path}`;
  }

  async function copyLink(item) {
    const text = canonicalShortUrl(item);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      setNotice("Short link copied.");
      setTimeout(() => setCopiedId(""), 2000);
    } catch {
      setNotice(text);
    }
  }

  return (
    <DashboardShell
      title="Waitlist forms"
      description="Create branded interest forms, copy the short link for website or social, and sync submissions to CRM and WhatsApp audiences."
      actions={
        <Button size="sm" onClick={openCreate}>
          New form
        </Button>
      }
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ListSearch
          value={q}
          onChange={setQ}
          placeholder="Search forms…"
          className="sm:max-w-xs"
        />
        {notice ? (
          <p className="text-sm text-muted" role="status">
            {notice}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {!loading && error && !items.length ? (
        <ErrorState title="Could not load forms" message={error} onRetry={load} />
      ) : null}

      {!loading && !error && !items.length && !showForm ? (
        <EmptyState
          title="No waitlist forms yet"
          description="Create a form for a product or drop, then copy the short link for your site and social posts."
          actionLabel="New form"
          onAction={openCreate}
        />
      ) : null}

      {showForm ? (
        <form
          onSubmit={submitForm}
          className="surface-card mb-6 space-y-4 px-5 py-5 md:px-6"
        >
          <div className="ops-card-header">
            <h2 className="font-display text-xl tracking-[-0.02em] text-ink">
              {editingId ? "Edit form" : "New form"}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
          </div>

          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Title"
              name="title"
              required
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="New collection interest"
            />
            <Input
              label="Short link slug"
              name="slug"
              value={form.slug}
              onChange={(e) => updateField("slug", e.target.value)}
              placeholder="new-collection"
              hint="Becomes /f/your-slug"
            />
            <Input
              label="Product label"
              name="product_label"
              value={form.product_label}
              onChange={(e) => updateField("product_label", e.target.value)}
              placeholder="Salt & Spirit ring"
            />
            <Input
              label="Product link"
              name="product_link"
              type="url"
              value={form.product_link}
              onChange={(e) => updateField("product_link", e.target.value)}
              placeholder="https://triada-designs.com/…"
            />
          </div>

          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-ink">
              Short description
            </span>
            <textarea
              className="ops-field min-h-[88px] w-full px-3 py-2.5"
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="A warm line inviting interest in this piece."
            />
          </label>

          <Input
            label="Success message"
            name="success_message"
            value={form.success_message}
            onChange={(e) => updateField("success_message", e.target.value)}
            placeholder="Thank you — we have your interest and will be in touch soon."
          />

          <label className="block space-y-1.5 sm:max-w-xs">
            <span className="block text-[13px] font-medium text-ink">Status</span>
            <select
              className="ops-field h-11 w-full px-3"
              value={form.status}
              onChange={(e) => updateField("status", e.target.value)}
            >
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : editingId ? "Save changes" : "Create form"}
            </Button>
          </div>
        </form>
      ) : null}

      {!loading && items.length ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="surface-card px-5 py-4 md:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-xl tracking-[-0.02em] text-ink">
                      {item.title}
                    </h3>
                    <Badge tone={statusTone(item.status)}>
                      {item.status === "active"
                        ? "Active"
                        : item.status === "draft"
                          ? "Draft"
                          : "Archived"}
                    </Badge>
                  </div>
                  {item.description ? (
                    <p className="max-w-2xl text-sm text-muted">{item.description}</p>
                  ) : null}
                  <p className="font-mono text-[13px] text-ink/80 break-all">
                    {canonicalShortUrl(item) ||
                      item.short_path ||
                      `/f/${item.slug}`}
                  </p>
                  {item.slug ? (
                    <p className="text-[12px] text-muted">
                      Alias /waitlist/{item.slug}
                    </p>
                  ) : null}
                  <p className="text-sm text-muted">
                    {item.submission_count || 0} submission
                    {(item.submission_count || 0) === 1 ? "" : "s"}
                    {item.product_label ? ` · ${item.product_label}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => copyLink(item)}
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check size={14} aria-hidden /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={14} aria-hidden /> Copy link
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(item)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy === `delete-${item.id}`}
                    onClick={() => removeForm(item)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </DashboardShell>
  );
}
