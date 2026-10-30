"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";

/**
 * Wired dashboard notification bell: unread badge, dropdown list,
 * mark-read, and content-pending-review deep links to Content Studio.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, counts] = await Promise.all([
        apiFetch("/v1/notifications?limit=20"),
        apiFetch("/v1/notifications/unread-count"),
      ]);
      setItems(Array.isArray(list?.data) ? list.data : []);
      setUnread(Number(counts?.unread_count ?? list?.unread_count ?? 0) || 0);
    } catch (err) {
      setError(err?.message || "Unable to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 45000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) await refresh();
  }

  async function markOne(id) {
    try {
      const result = await apiFetch(`/v1/notifications/${id}/read`, {
        method: "POST",
      });
      setUnread(Number(result?.unread_count ?? 0) || 0);
      setItems((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n,
        ),
      );
    } catch {
      /* keep prior state */
    }
  }

  async function markAll() {
    try {
      const result = await apiFetch("/v1/notifications/read-all", {
        method: "POST",
      });
      setUnread(Number(result?.unread_count ?? 0) || 0);
      const at = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || at })));
    } catch {
      /* keep prior state */
    }
  }

  async function openItem(item) {
    if (!item?.read_at && item?.id) {
      await markOne(item.id);
    }
    setOpen(false);
  }

  const badgeLabel = unread > 99 ? "99+" : String(unread);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-sm border border-line bg-white transition-colors duration-150 hover:bg-stone"
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggleOpen}
      >
        <Bell size={16} />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-ink px-1 text-[10px] font-semibold leading-none text-gold">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-sm border border-line bg-white shadow-popover fade-rise"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-ink">Notifications</p>
              <p className="text-[11px] text-muted">
                {unread > 0 ? `${unread} unread` : "All caught up"}
              </p>
            </div>
            {unread > 0 ? (
              <button
                type="button"
                className="text-[11px] font-medium text-brown-dark transition-colors hover:text-ink"
                onClick={markAll}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-[min(70vh,22rem)] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">Loading…</p>
            ) : null}
            {error ? (
              <p className="px-3 py-4 text-center text-sm text-danger">{error}</p>
            ) : null}
            {!loading && !error && items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">
                No notifications yet.
              </p>
            ) : null}
            <ul className="divide-y divide-line/70">
              {items.map((item) => {
                const unreadItem = !item.read_at;
                const href = item.href || "/content/review";
                return (
                  <li key={item.id}>
                    <Link
                      href={href}
                      onClick={() => openItem(item)}
                      className={cn(
                        "block px-3 py-2.5 transition-colors duration-150 hover:bg-ivory",
                        unreadItem ? "bg-sand/35" : "bg-white",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium leading-snug text-ink">
                          {item.title}
                        </p>
                        {item.type === "content_pending_review" ? (
                          <span className="shrink-0 rounded-sm bg-[color-mix(in_srgb,var(--color-warning)_14%,white)] px-1.5 py-0.5 text-[10px] font-medium text-warning">
                            Review
                          </span>
                        ) : null}
                      </div>
                      {item.body ? (
                        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted">
                          {item.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-muted/90">
                        {formatDateTime(item.created_at)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="border-t border-line bg-ivory/70 px-3 py-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-[12px] font-medium text-brown-dark transition-colors hover:text-ink"
            >
              View all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
