"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

export default function ContactsPage() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syncingWa, setSyncingWa] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");
  const [invalidRows, setInvalidRows] = useState([]);
  const [storeMode, setStoreMode] = useState("");
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = q ? `?q=${encodeURIComponent(q)}` : "";
      const response = await apiFetch(`/v1/contacts${query}`);
      setItems(response.data || []);
      setStoreMode(response.mode || "");
    } catch (err) {
      setError(err.message || "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

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
        `WhatsApp sync (${result.mode || "local_sim"}): ${summary.imported ?? 0} imported` +
          ` (${summary.created ?? 0} new, ${summary.updated ?? 0} updated)` +
          (summary.on_whatsapp != null ? ` · ${summary.on_whatsapp} on WhatsApp` : "") +
          (summary.invalid ? ` · ${summary.invalid} invalid` : "") +
          (result.store_mode ? ` · store ${result.store_mode}` : ""),
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
          (summary.invalid ? ` · ${summary.invalid} invalid flagged` : "") +
          (result.mode ? ` · store ${result.mode}` : ""),
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
      description="CRM contacts with E.164 phones for WhatsApp automation campaigns. Sync from Meta Cloud API or upload CSV/Excel. Local UAE numbers (05x) normalize to +971."
      actions={
        <div className="flex w-full max-w-2xl flex-col gap-2 sm:flex-row sm:items-end">
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
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={onUploadFile}
            />
            <Button
              type="button"
              size="sm"
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
              {syncingWa ? "Syncing…" : "Sync WhatsApp contacts"}
            </Button>
          </div>
        </div>
      }
    >
      {storeMode ? (
        <p className="mb-3 text-xs text-muted">
          Store: {storeMode === "supabase" ? "Supabase" : "local dual-run"} · phones saved as E.164
        </p>
      ) : null}

      {uploadNotice ? (
        <p className="mb-3 rounded-md border border-line bg-stone/30 px-3 py-2 text-sm text-ink">
          {uploadNotice}
        </p>
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
          description="Sync WhatsApp contacts from Meta, upload CSV/Excel, or create a contact from inbox."
        />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="surface-card overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line bg-stone/40 text-[13px] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone (E.164)</th>
                <th className="px-4 py-3 font-medium">WhatsApp</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {items.map((contact) => (
                <tr key={contact.id} className="border-b border-line/70">
                  <td className="px-4 py-3 font-medium">{contact.name || "—"}</td>
                  <td className="px-4 py-3 text-muted">{contact.email || "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {contact.phone_e164 || contact.phone || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {contact.whatsapp_ready ? (
                      <Badge tone="success">ready</Badge>
                    ) : (
                      <Badge tone="warning">unavailable</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize">{contact.lifecycle_status || "—"}</td>
                  <td className="px-4 py-3 capitalize text-muted">{contact.source || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </DashboardShell>
  );
}
