"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { CurrencySelect } from "@/components/ui/CurrencySelect";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency, formatStage } from "@/lib/formatters";
import { DEFAULT_CURRENCY } from "@/lib/locale/preferred-currency";

const EMPTY_FORM = {
  title: "",
  stage: "new_lead",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  source_channel: "instagram",
  score: "",
  estimated_value: "",
  currency: DEFAULT_CURRENCY,
};

const STAGES = [
  "new_lead",
  "qualified",
  "proposal",
  "won",
  "lost",
  "nurture",
];

export default function LeadsPage() {
  const [items, setItems] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [syncing, setSyncing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [response, opp] = await Promise.all([
        apiFetch("/v1/leads"),
        apiFetch("/v1/opportunities"),
      ]);
      setItems(response.data || []);
      setOpportunities(opp.data || []);
    } catch (err) {
      setError(err.message || "Failed to load leads");
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

  function openEdit(lead) {
    setEditingId(lead.id);
    setForm({
      title: lead.title || "",
      stage: lead.stage || "new_lead",
      contact_name: lead.contact?.name || lead.contact_name || "",
      contact_email: lead.contact?.email || lead.contact_email || "",
      contact_phone: lead.contact?.phone || lead.contact_phone || "",
      source_channel: lead.source_channel || lead.channel || "instagram",
      score: lead.score != null ? String(lead.score) : "",
      estimated_value:
        lead.estimated_value != null ? String(lead.estimated_value) : "",
      currency: lead.currency || DEFAULT_CURRENCY,
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
      stage: form.stage,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      source_channel: form.source_channel.trim() || null,
      score: form.score === "" ? null : Number(form.score),
      estimated_value:
        form.estimated_value === "" ? null : Number(form.estimated_value),
      currency: form.currency || DEFAULT_CURRENCY,
    };
    try {
      const path = editingId ? `/v1/leads/${editingId}` : "/v1/leads";
      await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        body: payload,
      });
      setNotice(editingId ? "Lead updated." : "Lead created.");
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

  async function removeOne(lead) {
    if (!window.confirm(`Delete lead “${lead.title || lead.contact?.name}”?`)) {
      return;
    }
    setBusy(`del-${lead.id}`);
    try {
      await apiFetch(`/v1/leads/${lead.id}`, { method: "DELETE" });
      setNotice("Lead deleted.");
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function syncZoho(leadId) {
    setSyncing(leadId);
    try {
      await apiFetch(`/v1/leads/${leadId}/sync-zoho`, { method: "POST" });
      setNotice("Zoho sync queued when credentials are Connected.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(null);
    }
  }

  return (
    <DashboardShell
      title="Leads"
      description="Add, edit, and stage the pipeline. Sync to Zoho when Connected."
      actions={
        <Button size="sm" onClick={openCreate}>
          Add lead
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
            {editingId ? "Edit lead" : "New lead"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Title"
              name="title"
              required
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Custom 18K necklace inquiry"
            />
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-ink">Stage</span>
              <select
                className="ops-field w-full px-3 py-2"
                value={form.stage}
                onChange={(e) => updateField("stage", e.target.value)}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {formatStage(s)}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Contact name"
              name="contact_name"
              value={form.contact_name}
              onChange={(e) => updateField("contact_name", e.target.value)}
            />
            <Input
              label="Contact email"
              name="contact_email"
              type="email"
              value={form.contact_email}
              onChange={(e) => updateField("contact_email", e.target.value)}
            />
            <Input
              label="Contact phone"
              name="contact_phone"
              value={form.contact_phone}
              onChange={(e) => updateField("contact_phone", e.target.value)}
            />
            <Input
              label="Channel"
              name="source_channel"
              value={form.source_channel}
              onChange={(e) => updateField("source_channel", e.target.value)}
            />
            <Input
              label="Score"
              name="score"
              type="number"
              value={form.score}
              onChange={(e) => updateField("score", e.target.value)}
            />
            <Input
              label="Estimated value"
              name="estimated_value"
              type="number"
              step="0.01"
              value={form.estimated_value}
              onChange={(e) => updateField("estimated_value", e.target.value)}
            />
            <CurrencySelect
              name="currency"
              value={form.currency}
              onChange={(e) => updateField("currency", e.target.value)}
            />
          </div>
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

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No leads yet"
          description="Add a lead or qualify a conversation into the pipeline."
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((lead) => (
            <article key={lead.id} className="surface-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl">
                    {lead.contact?.name || lead.title || "Unnamed lead"}
                  </h3>
                  <p className="text-sm text-muted">
                    {lead.contact?.email || lead.title || "—"}
                  </p>
                </div>
                <Badge tone="brand">{formatStage(lead.stage)}</Badge>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Score</dt>
                  <dd className="tabular-nums font-medium">{lead.score ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Estimated value</dt>
                  <dd className="tabular-nums">
                    {formatCurrency(lead.estimated_value, lead.currency || "AED")}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Channel</dt>
                  <dd className="capitalize">
                    {lead.source_channel || lead.channel || "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Zoho ID</dt>
                  <dd className="truncate text-muted">
                    {lead.external_crm_id || "Not synced"}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => openEdit(lead)}
                >
                  Edit
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  disabled={syncing === lead.id}
                  onClick={() => syncZoho(lead.id)}
                >
                  {syncing === lead.id ? "Syncing…" : "Sync to Zoho"}
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  disabled={busy === `del-${lead.id}`}
                  onClick={() => removeOne(lead)}
                >
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!loading && !error && opportunities.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">Opportunities</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {opportunities.map((opp) => (
              <article key={opp.id} className="surface-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{opp.name}</h3>
                    <p className="text-sm text-muted">{opp.contact?.name || "—"}</p>
                  </div>
                  <Badge tone="brand">{formatStage(opp.stage)}</Badge>
                </div>
                <p className="mt-3 text-sm">
                  {formatCurrency(opp.amount, opp.currency || "AED")} ·{" "}
                  {opp.source_channel || "—"}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </DashboardShell>
  );
}
