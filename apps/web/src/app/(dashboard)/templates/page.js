"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import {
  TEMPLATE_CATEGORIES,
  normalizeTemplateCategory,
  templateCategoryLabel,
} from "@/lib/templates/categories";

const PLATFORMS = [
  "facebook",
  "instagram",
  "whatsapp",
  "tiktok",
  "linkedin",
  "email",
  "webchat",
  "telegram",
  "shopify",
];

function tone(status) {
  if (status === "published" || status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "pending_approval") return "warning";
  return "neutral";
}

const emptyForm = {
  platform: "whatsapp",
  name: "",
  category: "product_inquiry",
  body: "",
};

function CategorySelect({ value, onChange, id }) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="block text-[13px] font-medium text-ink">Category</span>
      <select
        id={id}
        className="ops-field h-10 px-3"
        value={normalizeTemplateCategory(value, "general")}
        onChange={(e) => onChange(e.target.value)}
        required
      >
        {TEMPLATE_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ChannelTemplatesPage() {
  const [items, setItems] = useState([]);
  const [platformFilter, setPlatformFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const selected = useMemo(
    () => items.find((t) => t.id === selectedId) || null,
    [items, selectedId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = platformFilter ? `?platform=${encodeURIComponent(platformFilter)}` : "";
      const data = await apiFetch(`/v1/channel-templates${qs}`);
      setItems(data.data || []);
    } catch (err) {
      setError(err.message || "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [platformFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selected) {
      setForm({
        platform: selected.platform,
        name: selected.name,
        category: normalizeTemplateCategory(selected.category, "general"),
        body: selected.body || "",
      });
    }
  }, [selected]);

  async function createTemplate(e) {
    e.preventDefault();
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const result = await apiFetch("/v1/channel-templates", {
        method: "POST",
        body: form,
      });
      const mode = result.mode ? ` (${result.mode})` : "";
      const status = result.template?.status ? ` · ${result.template.status}` : "";
      setNotice(
        form.platform === "whatsapp"
          ? `WhatsApp template submitted${mode}${status}`
          : `Created ${result.template?.name || form.name}${status}`,
      );
      setForm(emptyForm);
      setSelectedId(result.template?.id || null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function saveSelected() {
    if (!selected) return;
    setBusy("save");
    try {
      const result = await apiFetch(`/v1/channel-templates/${selected.id}`, {
        method: "PUT",
        body: {
          name: form.name,
          category: form.category,
          body: form.body,
        },
      });
      setNotice(`Saved ${result.template.name} (${result.template.status})`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function act(path, label) {
    if (!selected) return;
    setBusy(path);
    setError("");
    try {
      const result = await apiFetch(`/v1/channel-templates/${selected.id}/${path}`, {
        method: "POST",
        body: path === "reject" ? { reason: "Needs revision" } : {},
      });
      const mode = result.mode ? ` via ${result.mode}` : "";
      setNotice(`${label}${mode}. Status: ${result.template.status}`);
      await load();
      setSelectedId(result.template.id);
    } catch (err) {
      setError(err.data?.message || err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title="Channel templates"
      description="Create, approve, and publish message and post templates per platform."
      actions={
        <div className="ops-actions">
          <Link href="/integrations/meta">
            <Button size="sm" variant="secondary">
              WhatsApp Cloud
            </Button>
          </Link>
          <Link href="/integrations/channels">
            <Button size="sm" variant="secondary">
              Channels
            </Button>
          </Link>
        </div>
      }
    >
      {loading ? <Skeleton className="h-48" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-muted">
                Platform{" "}
                <select
                  className="ops-field ml-2 h-9 w-auto px-2"
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <Button size="sm" variant="secondary" onClick={load}>
                Refresh
              </Button>
            </div>

            {items.length === 0 ? (
              <EmptyState
                title="No templates yet"
                description="Create a template on the right to get started."
              />
            ) : (
              <ul className="surface-card divide-y divide-line overflow-hidden">
                {items.map((tpl) => (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(tpl.id)}
                      className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors duration-150 hover:bg-stone/40 ${
                        selectedId === tpl.id ? "bg-sand/40" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{tpl.name}</span>
                        <Badge tone="brand">{tpl.platform}</Badge>
                        {tpl.category ? (
                          <Badge tone="neutral">
                            {templateCategoryLabel(
                              normalizeTemplateCategory(tpl.category, "general"),
                            )}
                          </Badge>
                        ) : null}
                        <Badge tone={tone(tpl.status)}>{tpl.status}</Badge>
                        {tpl.publish_mode ? (
                          <Badge tone="neutral">{tpl.publish_mode}</Badge>
                        ) : null}
                      </div>
                      <p className="line-clamp-2 text-sm text-muted">{tpl.body}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="space-y-5">
            {selected ? (
              <div className="surface-card space-y-3 p-4">
                <h2 className="font-display text-xl text-ink">Edit template</h2>
                <p className="text-xs text-muted">
                  {selected.platform} · {selected.slug}
                </p>
                <Input
                  label="Name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                <CategorySelect
                  id="edit-template-category"
                  value={form.category}
                  onChange={(category) => setForm((f) => ({ ...f, category }))}
                />
                <label className="block space-y-1.5">
                  <span className="block text-[13px] font-medium text-ink">Body</span>
                  <textarea
                    className="ops-field min-h-[120px] px-3 py-2"
                    value={form.body}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  />
                </label>
                <div className="ops-actions">
                  <Button size="sm" disabled={!!busy} onClick={saveSelected}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy || selected.status === "pending_approval"}
                    onClick={() => act("submit-review", "Submitted for approval")}
                  >
                    Submit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() => act("approve", "Approved")}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      !!busy ||
                      !["approved", "published"].includes(selected.status)
                    }
                    onClick={() => act("publish", "Published")}
                  >
                    Publish
                  </Button>
                </div>
              </div>
            ) : null}

            <form className="surface-card space-y-3 p-4" onSubmit={createTemplate}>
              <h2 className="font-display text-xl text-ink">New template</h2>
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium text-ink">Platform</span>
                <select
                  className="ops-field h-10 px-3"
                  value={form.platform}
                  onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <CategorySelect
                id="new-template-category"
                value={form.category}
                onChange={(category) => setForm((f) => ({ ...f, category }))}
              />
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium text-ink">Body</span>
                <textarea
                  required
                  className="ops-field min-h-[100px] px-3 py-2"
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                />
              </label>
              <Button type="submit" size="sm" disabled={busy === "create"}>
                {form.platform === "whatsapp"
                  ? "Create & submit to Meta"
                  : "Create draft"}
              </Button>
            </form>
          </aside>
        </div>
      ) : null}
    </DashboardShell>
  );
}
