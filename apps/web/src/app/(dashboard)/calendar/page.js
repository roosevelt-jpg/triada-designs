"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { DatePicker } from "@/components/ui/DatePicker";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { toIntlDateTimeValue } from "@/lib/date-format";
import { formatDateTime } from "@/lib/formatters";
import { getSystemTimeState, nowDate, syncSystemTime } from "@/lib/system-time";

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function proposedFor(item) {
  return (
    item?.proposed_scheduled_for ||
    item?.publish_metadata?.proposed_scheduled_for ||
    null
  );
}

function pickerValueFor(item, drafts, fallbackSuggestion) {
  if (drafts[item.id]) return drafts[item.id];
  if (item.scheduled_for) return toIntlDateTimeValue(new Date(item.scheduled_for));
  const proposal = proposedFor(item);
  if (proposal) return toIntlDateTimeValue(new Date(proposal));
  return fallbackSuggestion;
}

export default function CalendarPage() {
  const [scheduled, setScheduled] = useState([]);
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [publications, setPublications] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");
  const [nowLabel, setNowLabel] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [scheduleDrafts, setScheduleDrafts] = useState({});
  const [focusId, setFocusId] = useState(null);
  const [quoteInspiration, setQuoteInspiration] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Don't block the whole page on clock sync — calendar data is the critical path.
      syncSystemTime()
        .then((clock) => {
          setTimezone(clock.timezone || "UTC");
          setNowLabel(formatDateTime(nowDate()));
        })
        .catch(() => {
          const clock = getSystemTimeState();
          setTimezone(clock.timezone || "UTC");
          setNowLabel(formatDateTime(nowDate()));
        });

      // Prefer calendar first so approval + grid paint even if content/pubs lag.
      const cal = await apiFetch("/v1/calendar");
      setScheduled(cal.data || []);
      setPending(cal.pending_approval || []);
      setQuoteInspiration(cal.quote_inspiration || null);
      setLoading(false);

      const [pubs, allContent] = await Promise.all([
        apiFetch("/v1/publications").catch(() => ({ data: [] })),
        apiFetch("/v1/content").catch(() => ({ data: [] })),
      ]);
      const list = allContent.data || [];
      if (!cal.data?.length && list.length) {
        setScheduled(list.filter((c) => c.scheduled_for));
      }
      if (!cal.pending_approval?.length && list.length) {
        setPending(list.filter((c) => c.status === "draft" || c.status === "in_review"));
      }
      setApproved(list.filter((c) => c.status === "approved"));
      setPublications(pubs.data || []);
    } catch (err) {
      setError(err.message || "Failed to load calendar");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => {
    const start = startOfMonth(monthCursor);
    const firstWeekday = start.getDay();
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() - firstWeekday);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [monthCursor]);

  const itemsByDay = useMemo(() => {
    const map = new Map();
    for (const item of scheduled) {
      if (!item.scheduled_for) continue;
      const d = new Date(item.scheduled_for);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return map;
  }, [scheduled]);

  async function approve(item) {
    setBusyId(`approve-${item.id}`);
    setNotice("");
    try {
      const result = await apiFetch(`/v1/content/${item.id}/approve`, { method: "POST" });
      setNotice(
        `Approved “${item.title}” (v${result.content?.approval_version ?? "?"}). You set the go-live date below.`
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function schedule(item, { overrideProposal = false, explicitDraft = null } = {}) {
    setBusyId(`schedule-${item.id}`);
    setNotice("");
    try {
      await syncSystemTime().catch(() => {});
      const suggestion = toIntlDateTimeValue(
        new Date(nowDate().getTime() + 3 * 24 * 60 * 60 * 1000)
      );
      const draft =
        explicitDraft ||
        scheduleDrafts[item.id] ||
        pickerValueFor(item, scheduleDrafts, suggestion);
      if (!draft) {
        setError("Choose a go-live date before scheduling.");
        return;
      }
      const when = new Date(draft).toISOString();
      await apiFetch(`/v1/content/${item.id}/schedule`, {
        method: "POST",
        body: { scheduled_for: when },
      });
      setNotice(
        overrideProposal
          ? `Your date overrides the AI proposal — “${item.title}” goes live ${formatDateTime(when)}.`
          : `Scheduled by you — “${item.title}” goes live ${formatDateTime(when)}. Cancel anytime before then.`
      );
      setFocusId(item.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function cancelSchedule(item) {
    if (
      !window.confirm(
        `Cancel the scheduled go-live for “${item.title}”? It returns to approved and will not publish until you set a new date.`
      )
    ) {
      return;
    }
    setBusyId(`cancel-${item.id}`);
    setNotice("");
    try {
      await apiFetch(`/v1/content/${item.id}/cancel-schedule`, { method: "POST" });
      setNotice(`Cancelled schedule for “${item.title}”. Still approved — pick a new date when ready.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function publish(item, adapter) {
    setBusyId(`${item.id}-${adapter}`);
    try {
      const result = await apiFetch(`/v1/content/${item.id}/publish`, {
        method: "POST",
        body: { adapter, approval_version: item.approval_version },
      });
      if (!result.ok) {
        setError(result.error || "Publish blocked by approval gate");
      } else {
        setNotice(`Published via ${adapter} (${result.result?.mode || "local"}).`);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const monthLabel = monthCursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const today = nowDate();
  const defaultScheduleValue = toIntlDateTimeValue(
    new Date(nowDate().getTime() + 3 * 24 * 60 * 60 * 1000)
  );

  return (
    <DashboardShell
      title="Content calendar"
      description={`You control go-live · ${nowLabel || "…"} · ${timezone}`}
    >
      {loading ? <Skeleton className="h-28" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading ? (
        <section className="mb-6 border border-brown/25 bg-brown/5 px-5 py-4">
          <p className="font-medium text-ink">Admin owns the schedule</p>
          <p className="mt-1 text-sm text-muted">
            Approve drafts, set or change the go-live datetime, or cancel anytime. AI may suggest a
            slot — only your confirmed date publishes. Cron never invents dates.
          </p>
        </section>
      ) : null}

      {!loading && quoteInspiration ? (
        <section className="mb-6 surface-card flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="font-medium text-ink">Quote & Inspiration weekdays</p>
            <p className="mt-1 text-sm text-muted">
              {(quoteInspiration.weekday_labels || []).join(", ") || "No days selected"}
              {quoteInspiration.next_send_at
                ? ` · next ${formatDateTime(quoteInspiration.next_send_at)}`
                : ""}
              {quoteInspiration.enabled ? "" : " · paused"}
            </p>
          </div>
          <a
            href="/content/inspiration"
            className="text-sm font-medium text-brown-dark underline-offset-2 hover:underline"
          >
            Manage inspiration
          </a>
        </section>
      ) : null}

      {!loading ? (
        <section className="mb-8">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="ops-section-title">Awaiting approval</h2>
            <div className="flex items-center gap-2">
              <Badge tone="warning">{pending.length}</Badge>
              <a href="/content/review" className="text-sm text-brown-dark underline-offset-2 hover:underline">
                Open review queue
              </a>
            </div>
          </div>
          {pending.length === 0 ? (
            <EmptyState
              title="No drafts awaiting approval"
              description="Generate content in Content Studio to preview and review it."
            />
          ) : (
            <div className="surface-card divide-y divide-line overflow-hidden">
              {pending.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{item.body}</p>
                    <div className="mt-2 ops-actions">
                      <Badge tone="warning">{item.status}</Badge>
                      <Badge tone="neutral">{item.channel || "channel"}</Badge>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={busyId === `approve-${item.id}`}
                    onClick={() => approve(item)}
                  >
                    Approve (human)
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!loading ? (
        <section className="mb-8">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="ops-section-title">Your go-live dates</h2>
              <p className="mt-1 text-sm text-muted">
                Pick the datetime — AI proposals appear as suggestions you can override.
              </p>
            </div>
            <Badge tone="brand">{approved.length}</Badge>
          </div>
          {approved.length === 0 ? (
            <p className="text-sm text-muted">No approved items waiting for a date.</p>
          ) : (
            <div className="surface-card divide-y divide-line overflow-hidden">
              {approved.map((item) => {
                const proposal = proposedFor(item);
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-end sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <div className="mt-1 ops-actions">
                        <Badge tone="brand">approved · v{item.approval_version ?? 0}</Badge>
                        {proposal ? (
                          <Badge tone="warning">AI proposed {formatDateTime(proposal)}</Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <DatePicker
                        mode="datetime"
                        label="Your go-live time"
                        className="min-w-[12rem]"
                        value={pickerValueFor(item, scheduleDrafts, defaultScheduleValue)}
                        onChange={(next) =>
                          setScheduleDrafts((prev) => ({ ...prev, [item.id]: next }))
                        }
                      />
                      {proposal ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId === `schedule-${item.id}`}
                          onClick={() => {
                            const draft = toIntlDateTimeValue(new Date(proposal));
                            setScheduleDrafts((prev) => ({ ...prev, [item.id]: draft }));
                            schedule(item, { explicitDraft: draft });
                          }}
                        >
                          Use AI date
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        disabled={busyId === `schedule-${item.id}`}
                        onClick={() => schedule(item, { overrideProposal: Boolean(proposal) })}
                      >
                        {proposal ? "Override & schedule" : "Schedule"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {!loading ? (
        <section className="mb-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="ops-section-title">{monthLabel}</h2>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setMonthCursor((m) => addMonths(m, -1))}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setMonthCursor(startOfMonth(nowDate()))}>
                Today
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setMonthCursor((m) => addMonths(m, 1))}>
                Next
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-sm border border-line">
            <div className="grid min-w-[36rem] grid-cols-7 gap-px bg-line">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                <div
                  key={label}
                  className="bg-stone/40 px-1 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted sm:px-2 sm:text-xs"
                >
                  {label}
                </div>
              ))}
              {days.map((day) => {
                const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                const dayItems = itemsByDay.get(key) || [];
                const inMonth = day.getMonth() === monthCursor.getMonth();
                return (
                  <div
                    key={key}
                    className={`min-h-[72px] min-w-0 bg-ivory p-1.5 sm:min-h-[96px] sm:p-2 ${
                      inMonth ? "" : "opacity-45"
                    } ${sameDay(day, today) ? "ring-1 ring-inset ring-brown/40" : ""}`}
                  >
                    <p className="text-xs font-medium text-ink">{day.getDate()}</p>
                    <div className="mt-1 space-y-1">
                      {dayItems.slice(0, 3).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="block w-full truncate rounded-sm bg-brown/10 px-1.5 py-0.5 text-left text-[11px] text-brown-dark hover:bg-brown/20"
                          title={`${item.title} — click to reschedule or cancel`}
                          onClick={() => {
                            setFocusId(item.id);
                            document
                              .getElementById(`cal-item-${item.id}`)
                              ?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                        >
                          {item.title}
                        </button>
                      ))}
                      {dayItems.length > 3 ? (
                        <p className="text-[11px] text-muted">+{dayItems.length - 3} more</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">Click a month item to jump to reschedule / cancel.</p>
        </section>
      ) : null}

      {!loading && scheduled.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          description="Approve content, then set your go-live date. You can cancel or change it anytime."
        />
      ) : null}

      {!loading && scheduled.length > 0 ? (
        <div className="surface-card divide-y divide-line overflow-hidden">
          <div className="px-5 py-3">
            <h2 className="ops-section-title">Scheduled by you</h2>
            <p className="mt-1 text-sm text-muted">
              Reschedule or cancel before go-live. Cron only fires these confirmed times.
            </p>
          </div>
          {scheduled.map((item) => (
            <div
              key={item.id}
              id={`cal-item-${item.id}`}
              className={`flex flex-col gap-3 px-5 py-4 xl:flex-row xl:items-center xl:justify-between ${
                focusId === item.id ? "bg-brown/5" : ""
              }`}
            >
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted">
                  Go-live {formatDateTime(item.scheduled_for)}
                  {item.publish_metadata?.schedule_source === "human" ||
                  item.publish_metadata?.scheduled_by
                    ? " · set by admin"
                    : ""}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{item.channel || "channel"}</Badge>
                  <Badge tone={item.status === "published" ? "success" : "neutral"}>{item.status}</Badge>
                  {item.status === "scheduled" ? <Badge tone="brand">admin schedule</Badge> : null}
                </div>
                {(item.status === "scheduled" || item.status === "approved") && (
                  <>
                    <DatePicker
                      mode="datetime"
                      label="Reschedule"
                      className="min-w-[12rem]"
                      value={pickerValueFor(item, scheduleDrafts, defaultScheduleValue)}
                      onChange={(next) =>
                        setScheduleDrafts((prev) => ({ ...prev, [item.id]: next }))
                      }
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === `schedule-${item.id}`}
                      onClick={() => schedule(item)}
                    >
                      Save new date
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busyId === `cancel-${item.id}`}
                      onClick={() => cancelSchedule(item)}
                    >
                      Cancel schedule
                    </Button>
                    <Button
                      size="sm"
                      disabled={busyId === `${item.id}-wordpress`}
                      onClick={() => publish(item, "wordpress")}
                    >
                      Publish WP
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === `${item.id}-meta_page`}
                      onClick={() => publish(item, "meta_page")}
                    >
                      Publish Meta
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!loading ? (
        <div className="mt-8 surface-card p-5">
          <h2 className="font-display text-2xl">Publication logs</h2>
          <div className="mt-3 divide-y divide-line">
            {publications.length === 0 ? (
              <p className="text-sm text-muted">No publication attempts yet.</p>
            ) : (
              publications.map((pub) => (
                <div key={pub.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                  <span>
                    {pub.adapter || pub.channel} · {pub.external_id || pub.content_item_id || "—"} ·{" "}
                    {pub.published_at ? formatDateTime(pub.published_at) : "—"}
                  </span>
                  <Badge tone={pub.status === "published" ? "success" : "warning"}>{pub.status}</Badge>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
