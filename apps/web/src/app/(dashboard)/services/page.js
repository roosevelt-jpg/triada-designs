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
import { formatCurrency } from "@/lib/formatters";

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  currency: "AED",
  inquiry_url: "https://triada-designs.com/",
  status: "active",
  approved_claims: "",
};

function statusTone(status) {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  if (status === "archived") return "neutral";
  return "neutral";
}

export default function ServicesPage() {
  const [items, setItems] = useState([]);
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
      const response = await apiFetch("/v1/services");
      setItems(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load services");
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

  function openEdit(item) {
    setEditingId(item.id);
    setForm({
      name: item.name || "",
      description: item.description || "",
      price: item.price != null ? String(item.price) : "",
      currency: item.currency || "AED",
      inquiry_url: item.inquiry_url || "https://triada-designs.com/",
      status: item.status || "active",
      approved_claims: Array.isArray(item.approved_claims)
        ? item.approved_claims.join(", ")
        : "",
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
      name: form.name.trim(),
      description: form.description.trim(),
      price: form.price === "" ? null : Number(form.price),
      currency: form.currency || "AED",
      inquiry_url: form.inquiry_url.trim() || null,
      status: form.status || "active",
      approved_claims: form.approved_claims,
    };

    try {
      const path = editingId ? `/v1/services/${editingId}` : "/v1/services";
      await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        body: payload,
      });
      setNotice(editingId ? "Service updated." : "Service created.");
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

  async function removeService(item) {
    if (!item?.id) return;
    const label = item.name || "this service";
    if (typeof window !== "undefined" && !window.confirm(`Delete “${label}”?`)) {
      return;
    }
    setBusy(`delete-${item.id}`);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/v1/services/${item.id}`, { method: "DELETE" });
      setNotice("Service deleted.");
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

  return (
    <DashboardShell
      title="Services"
      description="Add, edit, and save consultation and booking offerings. Nothing is hardcoded — you own the catalog."
      actions={
        <Button size="sm" onClick={openCreate}>
          Add service
        </Button>
      }
    >
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {showForm ? (
        <form
          onSubmit={submitForm}
          className="mb-8 space-y-4 border-b border-line pb-8"
        >
          <h2 className="font-display text-2xl text-ink">
            {editingId ? "Edit service" : "New service"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Name"
              name="name"
              required
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Private jewellery consultation"
            />
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-ink">Status</span>
              <select
                name="status"
                value={form.status}
                onChange={(e) => updateField("status", e.target.value)}
                className="ops-field h-10 w-full px-3 text-ink focus:border-brown focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <Input
              label="Price"
              name="price"
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => updateField("price", e.target.value)}
              hint="Leave blank or 0 for quote-on-request."
            />
            <Input
              label="Currency"
              name="currency"
              value={form.currency}
              onChange={(e) => updateField("currency", e.target.value)}
            />
            <Input
              label="Inquiry URL"
              name="inquiry_url"
              value={form.inquiry_url}
              onChange={(e) => updateField("inquiry_url", e.target.value)}
            />
            <Input
              label="Approved claims (comma-separated)"
              name="approved_claims"
              value={form.approved_claims}
              onChange={(e) => updateField("approved_claims", e.target.value)}
              hint="Only verified claims — never invent materials or timing."
            />
          </div>
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-ink">Description</span>
            <textarea
              name="description"
              rows={4}
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              className="ops-field px-3 py-2 text-ink focus:border-brown focus:outline-none"
              placeholder="What the customer receives, where it happens, what needs human approval…"
            />
          </label>
          <div className="ops-actions">
            <Button type="submit" disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : editingId ? "Save changes" : "Create service"}
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

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No services yet"
          description="Add consultation, custom, engraving, or aftercare offerings. Your catalog starts empty."
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="surface-card flex flex-col p-5">
              <h3 className="font-display text-2xl text-ink">{item.name}</h3>
              <p className="mt-2 flex-1 text-sm text-muted">{item.description}</p>
              <div className="mt-4 ops-actions">
                <Badge tone="brand">
                  {formatCurrency(item.price, item.currency || "AED")}
                </Badge>
                <Badge tone={statusTone(item.status)}>{item.status}</Badge>
              </div>
              {Array.isArray(item.approved_claims) && item.approved_claims.length > 0 ? (
                <p className="mt-2 text-xs text-muted">
                  Claims · {item.approved_claims.join(" · ")}
                </p>
              ) : null}
              {item.inquiry_url ? (
                <p className="mt-1 truncate text-xs text-muted">{item.inquiry_url}</p>
              ) : null}
              <div className="mt-4 ops-actions">
                <Button size="sm" variant="secondary" onClick={() => openEdit(item)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy === `delete-${item.id}`}
                  onClick={() => removeService(item)}
                >
                  {busy === `delete-${item.id}` ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
