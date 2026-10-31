"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ContactProfileDrawer } from "@/components/crm/ContactProfileDrawer";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import {
  mapContactUploadRows,
  parseContactsUploadFile,
} from "@/lib/crm/parse-contacts-file";

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  lifecycle_status: "lead",
  marketing_opt_out: false,
};

function syncTone(status) {
  if (status === "synced" || status === "connected") return "success";
  if (status === "error") return "danger";
  if (status === "awaiting_credentials" || status === "pending_publish") return "warning";
  return "neutral";
}

function syncLabel(status) {
  if (status === "synced") return "Synced";
  if (status === "awaiting_credentials") return "Waiting credentials";
  if (status === "pending_publish") return "Pending";
  if (status === "error") return "Error";
  return status || "—";
}

function shopifySyncOf(contact) {
  const meta = contact?.metadata && typeof contact.metadata === "object" ? contact.metadata : {};
  return meta.shopify_customer_sync || {};
}

function contactPhoto(contact) {
  const meta =
    contact?.metadata && typeof contact.metadata === "object"
      ? contact.metadata
      : {};
  const raw =
    contact?.avatar_url ||
    contact?.picture ||
    meta.avatar_url ||
    meta.profile_pic ||
    meta.picture ||
    null;
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

function displayName(contact) {
  return String(contact?.name || "").trim() || null;
}

function displayEmail(contact) {
  return String(contact?.email || "").trim() || null;
}

function displayPhone(contact) {
  return (
    String(contact?.phone_e164 || contact?.phone || "").trim() || null
  );
}

export default function ContactsPage() {
  const [items, setItems] = useState([]);
  const [shopify, setShopify] = useState(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syncingWa, setSyncingWa] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");
  const [invalidRows, setInvalidRows] = useState([]);
  const [busy, setBusy] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileContact, setProfileContact] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [openContactId, setOpenContactId] = useState("");
  const openedFromQuery = useRef("");
  const fileRef = useRef(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setOpenContactId(params.get("open") || "");
    } catch {
      setOpenContactId("");
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = q ? `?q=${encodeURIComponent(q)}` : "";
      const response = await apiFetch(`/v1/contacts${query}`);
      setItems(response.data || []);
      setShopify(response.shopify || null);
    } catch (err) {
      setError(err.message || "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  const openProfile = useCallback(async (contact) => {
    if (!contact?.id) return;
    setProfileOpen(true);
    setProfileContact(contact);
    setProfileLoading(true);
    setProfileError("");
    try {
      const detail = await apiFetch(`/v1/contacts/${encodeURIComponent(contact.id)}`);
      setProfileContact(detail);
    } catch (err) {
      setProfileError(err.message || "Failed to load contact profile");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!openContactId || loading || openedFromQuery.current === openContactId) {
      return;
    }
    const match = items.find((c) => String(c.id) === String(openContactId));
    if (match) {
      openedFromQuery.current = openContactId;
      openProfile(match);
      return;
    }
    if (items.length > 0 || !loading) {
      openedFromQuery.current = openContactId;
      openProfile({ id: openContactId });
    }
  }, [openContactId, items, loading, openProfile]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setUploadNotice("");
  }

  function openEdit(contact) {
    setEditingId(contact.id);
    setForm({
      name: contact.name || "",
      email: contact.email || "",
      phone: contact.phone_e164 || contact.phone || "",
      lifecycle_status: contact.lifecycle_status || "lead",
      marketing_opt_out: Boolean(contact.marketing_opt_out),
    });
    setShowForm(true);
    setProfileOpen(false);
  }

  function closeProfile() {
    setProfileOpen(false);
    setProfileError("");
  }

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function submitForm(event) {
    event.preventDefault();
    setBusy("save");
    setError("");
    setUploadNotice("");
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      lifecycle_status: form.lifecycle_status,
      marketing_opt_out: Boolean(form.marketing_opt_out),
      source: editingId ? undefined : "manual",
    };
    try {
      const path = editingId ? `/v1/contacts/${editingId}` : "/v1/contacts";
      const result = await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        body: payload,
      });
      setUploadNotice(
        result.shopify_auto_synced
          ? "Contact saved · Shopify customer synced."
          : "Contact saved.",
      );
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
      if (profileOpen && result?.id) {
        await openProfile(result);
      }
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setBusy("");
    }
  }

  async function syncFromWhatsApp() {
    setSyncingWa(true);
    setUploadNotice("");
    setInvalidRows([]);
    setError("");
    try {
      const result = await apiFetch("/v1/contacts/sync-whatsapp", {
        method: "POST",
        body: {
          include_inbound: true,
          default_region: "AE",
        },
      });
      const summary = result.summary || {};
      setInvalidRows(result.invalid || []);
      setUploadNotice(
        `WhatsApp sync: ${summary.imported ?? 0} imported` +
          ` (${summary.created ?? 0} new, ${summary.updated ?? 0} updated)` +
          (summary.on_whatsapp != null ? ` · ${summary.on_whatsapp} on WhatsApp` : "") +
          (summary.invalid ? ` · ${summary.invalid} invalid` : ""),
      );
      if (!result.ok && result.error) {
        setError(result.error);
      }
      await load();
    } catch (err) {
      setError(err.message || "WhatsApp contact sync failed");
    } finally {
      setSyncingWa(false);
    }
  }

  async function onUploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadNotice("");
    setInvalidRows([]);
    setError("");

    try {
      const { rows, format } = await parseContactsUploadFile(file);
      if (!rows.length) {
        setError("No data rows found in the file.");
        return;
      }

      const preview = mapContactUploadRows(rows, {
        defaultRegion: "AE",
        source: format === "excel" ? "excel_upload" : "csv_upload",
      });

      const result = await apiFetch("/v1/contacts/import", {
        method: "POST",
        body: {
          format,
          default_region: "AE",
          rows,
        },
      });

      const summary = result.summary || {};
      setInvalidRows(result.invalid || preview.invalid || []);
      setUploadNotice(
        `Imported ${summary.imported ?? 0} of ${summary.submitted ?? rows.length}` +
          ` (${summary.created ?? 0} new, ${summary.updated ?? 0} updated)` +
          (summary.invalid ? ` · ${summary.invalid} invalid flagged` : ""),
      );
      await load();
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <DashboardShell
      title="Contacts"
      description="CRM contacts for messaging and store customers. Saves sync to Shopify when Connected. Click a row for the full profile."
      actions={
        <div className="flex w-full max-w-3xl flex-col gap-2 sm:flex-row sm:items-end">
          <div className="w-full max-w-xs">
            <Input
              label="Search"
              name="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, email, phone"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {shopify ? (
              <Badge tone={syncTone(shopify.status)}>
                Shopify · {shopify.label || syncLabel(shopify.status)}
              </Badge>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={onUploadFile}
            />
            <Button size="sm" onClick={openCreate}>
              Add contact
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={uploading || syncingWa}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Upload CSV / Excel"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={uploading || syncingWa}
              onClick={syncFromWhatsApp}
            >
              {syncingWa ? "Syncing…" : "Sync WhatsApp"}
            </Button>
            <Link href="/integrations/shopify">
              <Button size="sm" variant="secondary">
                Shopify sync
              </Button>
            </Link>
          </div>
        </div>
      }
    >
      {uploadNotice ? (
        <p className="mb-3 rounded-md border border-line bg-stone/30 px-3 py-2 text-sm text-ink">
          {uploadNotice}
        </p>
      ) : null}

      {showForm ? (
        <form onSubmit={submitForm} className="mb-6 space-y-4 border-b border-line pb-6">
          <h2 className="font-display text-2xl text-ink">
            {editingId ? "Edit contact" : "New contact"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Name"
              name="name"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Customer name"
            />
            <Input
              label="Email"
              name="email"
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
            />
            <Input
              label="Phone"
              name="phone"
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              hint="E.164 preferred (+971…)."
            />
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-ink">Lifecycle</span>
              <select
                name="lifecycle_status"
                value={form.lifecycle_status}
                onChange={(e) => updateField("lifecycle_status", e.target.value)}
                className="ops-field h-10 w-full px-3 text-ink focus:border-brown focus:outline-none"
              >
                <option value="lead">Lead</option>
                <option value="customer">Customer</option>
                <option value="vip">VIP</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="flex items-center gap-2 pt-7 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.marketing_opt_out}
                onChange={(e) => updateField("marketing_opt_out", e.target.checked)}
              />
              Marketing opt-out
            </label>
          </div>
          <div className="ops-actions">
            <Button type="submit" disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : editingId ? "Save & sync" : "Create & sync"}
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

      {invalidRows.length > 0 ? (
        <div className="mb-4 overflow-x-auto rounded-md border border-danger/30 bg-white">
          <div className="border-b border-line px-4 py-2 text-sm font-medium text-ink">
            Invalid rows (not imported) — fix phone format and re-upload
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-stone/40 text-[13px] text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Row</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Phone raw</th>
                <th className="px-4 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {invalidRows.slice(0, 40).map((row, idx) => (
                <tr key={`${row.row_number}-${idx}`} className="border-t border-line/70">
                  <td className="px-4 py-2">{row.row_number ?? "—"}</td>
                  <td className="px-4 py-2">{row.name || "—"}</td>
                  <td className="px-4 py-2 text-muted">{row.phone_raw || "—"}</td>
                  <td className="px-4 py-2">
                    <Badge tone="danger">{row.error || "invalid_phone"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No contacts"
          description="Add a contact, sync WhatsApp, or upload CSV/Excel. Shopify customers sync on create/edit when Connected."
        />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="surface-card overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line bg-stone/40 text-[13px] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Photo</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone (E.164)</th>
                <th className="px-4 py-3 font-medium">WhatsApp</th>
                <th className="px-4 py-3 font-medium">Shopify</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((contact) => {
                const sync = shopifySyncOf(contact);
                const shopifyId = contact.metadata?.shopify_customer_id;
                const photo = contactPhoto(contact);
                const name = displayName(contact);
                const email = displayEmail(contact);
                const phone = displayPhone(contact);
                return (
                  <tr
                    key={contact.id}
                    className="cursor-pointer border-b border-line/70 transition-colors hover:bg-stone/25"
                    onClick={() => openProfile(contact)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openProfile(contact);
                      }
                    }}
                    tabIndex={0}
                    aria-label={`Open profile for ${name || "contact"}`}
                  >
                    <td className="px-4 py-3">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover ring-1 ring-line"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-stone font-display text-sm text-ink ring-1 ring-line"
                          aria-hidden
                        >
                          {(name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{name || "—"}</td>
                    <td className="px-4 py-3 text-muted">{email || "—"}</td>
                    <td className="px-4 py-3 text-muted">{phone || "—"}</td>
                    <td className="px-4 py-3">
                      {contact.whatsapp_ready ? (
                        <Badge tone="success">ready</Badge>
                      ) : (
                        <Badge tone="warning">unavailable</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={syncTone(sync.status)}>{syncLabel(sync.status)}</Badge>
                      {shopifyId ? (
                        <p className="mt-1 text-xs text-muted">#{shopifyId}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 capitalize">{contact.lifecycle_status || "—"}</td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEdit(contact);
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <ContactProfileDrawer
        open={profileOpen}
        contact={profileContact}
        loading={profileLoading}
        error={profileError}
        onClose={closeProfile}
        onEdit={openEdit}
      />
    </DashboardShell>
  );
}
