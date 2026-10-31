"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { CustomerProfileSummary } from "@/components/crm/CustomerProfileSummary";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/formatters";
import { formatInWorkspace } from "@/lib/system-time";

export const CHANNEL_FILTERS = [
  { value: "", label: "All" },
  { value: "webchat", label: "Webchat" },
  { value: "email", label: "Email" },
  { value: "facebook", label: "Messenger" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
];

/** @param {string | undefined} channel */
export function channelTone(channel) {
  if (channel === "facebook") return "info";
  if (channel === "instagram") return "brand";
  if (channel === "whatsapp") return "success";
  if (channel === "telegram") return "info";
  if (channel === "linkedin") return "info";
  if (channel === "tiktok") return "brand";
  if (channel === "email") return "neutral";
  return "neutral";
}

/** @param {string | Date | null | undefined} value */
function formatChatClock(value) {
  return formatInWorkspace(value, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** @param {string | Date | null | undefined} value */
function formatChatDayLabel(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return formatInWorkspace(value, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** @param {string | Date | null | undefined} value */
function dayKey(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * @param {{
 *   name?: string | null,
 *   picture?: string | null,
 *   avatar_url?: string | null,
 *   size?: "sm" | "md" | "lg",
 * }} props
 */
function ContactAvatar({ name, picture, avatar_url, size = "md" }) {
  const src = picture || avatar_url;
  const initial =
    String(name || "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?";
  const sizes = {
    sm: "h-9 w-9 text-sm",
    md: "h-11 w-11 text-base",
    lg: "h-14 w-14 text-lg",
  };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn(
          "shrink-0 rounded-full object-cover ring-1 ring-line",
          sizes[size],
        )}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-stone font-display text-ink ring-1 ring-line",
        sizes[size],
      )}
      aria-hidden
    >
      {initial}
    </div>
  );
}

/**
 * @param {{
 *   selectedId?: string | null,
 * }} props
 */
export function InboxChatWorkspace({ selectedId = null }) {
  const [items, setItems] = useState([]);
  const [channel, setChannel] = useState("");
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [conversation, setConversation] = useState(null);
  const [threadError, setThreadError] = useState("");
  const [threadLoading, setThreadLoading] = useState(Boolean(selectedId));
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const threadEndRef = useRef(null);
  const composerRef = useRef(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const query = channel ? `?channel=${encodeURIComponent(channel)}` : "";
      const response = await apiFetch(`/v1/conversations${query}`);
      setItems(response.data || []);
    } catch (err) {
      setListError(err.message || "Failed to load inbox");
    } finally {
      setListLoading(false);
    }
  }, [channel]);

  const loadThread = useCallback(async () => {
    if (!selectedId) {
      setConversation(null);
      setThreadLoading(false);
      setThreadError("");
      return;
    }
    setThreadLoading(true);
    setThreadError("");
    try {
      const data = await apiFetch(`/v1/conversations/${selectedId}`);
      setConversation(data);
    } catch (err) {
      setConversation(null);
      setThreadError(err.message || "Failed to load conversation");
    } finally {
      setThreadLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  useEffect(() => {
    setBody("");
  }, [selectedId]);

  useEffect(() => {
    if (!conversation?.messages?.length) return;
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation?.messages, selectedId]);

  const messageGroups = useMemo(() => {
    const messages = conversation?.messages || [];
    /** @type {{ key: string, label: string, messages: typeof messages }[]} */
    const groups = [];
    for (const message of messages) {
      const key = dayKey(message.created_at) || "unknown";
      const last = groups[groups.length - 1];
      if (!last || last.key !== key) {
        groups.push({
          key,
          label: formatChatDayLabel(message.created_at) || "Earlier",
          messages: [message],
        });
      } else {
        last.messages.push(message);
      }
    }
    return groups;
  }, [conversation?.messages]);

  async function takeover() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const data = await apiFetch(`/v1/conversations/${selectedId}/takeover`, {
        method: "POST",
      });
      setConversation((prev) => ({ ...prev, ...data }));
      setItems((prev) =>
        prev.map((row) =>
          row.id === selectedId
            ? { ...row, automation_mode: data.automation_mode || "human" }
            : row,
        ),
      );
    } catch (err) {
      setThreadError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resumeAi() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const data = await apiFetch(`/v1/conversations/${selectedId}/resume-ai`, {
        method: "POST",
      });
      setConversation((prev) => ({ ...prev, ...data }));
      setItems((prev) =>
        prev.map((row) =>
          row.id === selectedId
            ? { ...row, automation_mode: data.automation_mode || "ai" }
            : row,
        ),
      );
    } catch (err) {
      setThreadError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    if (!selectedId || !body.trim() || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/conversations/${selectedId}/messages`, {
        method: "POST",
        body: { body },
      });
      setBody("");
      await Promise.all([loadThread(), loadList()]);
      composerRef.current?.focus();
    } catch (err) {
      setThreadError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function onReplyKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    sendReply(event);
  }

  const showThreadPane = Boolean(selectedId);

  return (
    <div className="inbox-chat">
      <section
        className={cn(
          "inbox-chat__pane inbox-chat__list",
          showThreadPane && "inbox-chat__list--collapsed-mobile",
        )}
        aria-label="Conversations"
      >
        <div className="inbox-chat__list-toolbar" role="toolbar" aria-label="Channel filters">
          {CHANNEL_FILTERS.map((filter) => (
            <button
              key={filter.value || "all"}
              type="button"
              aria-pressed={channel === filter.value}
              onClick={() => setChannel(filter.value)}
              className={`ops-filter-chip ${channel === filter.value ? "is-active" : ""}`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="inbox-chat__list-scroll">
          {listLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[64px]" />
              ))}
            </div>
          ) : null}
          {listError ? (
            <div className="p-3">
              <ErrorState message={listError} onRetry={loadList} />
            </div>
          ) : null}
          {!listLoading && !listError && items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No conversations yet"
                description="Inbound messages from connected channels appear here as soon as customers write in."
              />
            </div>
          ) : null}
          {!listLoading && !listError && items.length > 0
            ? items.map((row) => {
                const active = row.id === selectedId;
                const preview =
                  row.last_inbound_body ||
                  row.last_outbound_body ||
                  row.subject ||
                  "No messages yet";
                return (
                  <Link
                    key={row.id}
                    href={`/inbox/${row.id}`}
                    className={cn("inbox-chat__row", active && "is-active")}
                    aria-current={active ? "page" : undefined}
                  >
                    <ContactAvatar
                      name={row.contact?.name}
                      picture={row.contact?.picture}
                      avatar_url={row.contact?.avatar_url}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium text-ink">
                          {row.contact?.name || "Unknown contact"}
                        </p>
                        <time
                          className="shrink-0 text-[11px] tabular-nums text-muted"
                          dateTime={row.last_message_at || undefined}
                        >
                          {row.last_message_at
                            ? formatChatClock(row.last_message_at)
                            : ""}
                        </time>
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-muted">{preview}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <Badge tone={channelTone(row.channel)}>{row.channel}</Badge>
                        <Badge tone={row.automation_mode === "human" ? "warning" : "brand"}>
                          {row.automation_mode === "human" ? "Human" : "AI"}
                        </Badge>
                        {row.unanswered ? <Badge tone="warning">Unanswered</Badge> : null}
                      </div>
                    </div>
                  </Link>
                );
              })
            : null}
        </div>
      </section>

      <section
        className={cn(
          "inbox-chat__pane inbox-chat__thread",
          !showThreadPane && "inbox-chat__thread--empty-mobile",
        )}
        aria-label="Message thread"
      >
        {!selectedId ? (
          <div className="inbox-chat__placeholder">
            <p className="font-display text-2xl text-ink">Select a conversation</p>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Open a thread from the list to reply, take over from AI, or review the customer
              profile.
            </p>
          </div>
        ) : null}

        {selectedId && threadLoading ? (
          <div className="flex flex-1 flex-col gap-3 p-4">
            <Skeleton className="h-14" />
            <Skeleton className="h-full min-h-[16rem]" />
          </div>
        ) : null}

        {selectedId && threadError && !conversation ? (
          <div className="p-4">
            <ErrorState message={threadError} onRetry={loadThread} />
          </div>
        ) : null}

        {selectedId && conversation ? (
          <>
            <header className="inbox-chat__thread-header">
              <div className="flex min-w-0 items-center gap-3">
                <Link
                  href="/inbox"
                  className="inbox-chat__back"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={18} />
                </Link>
                <ContactAvatar
                  name={conversation.contact?.name}
                  picture={conversation.contact?.picture}
                  avatar_url={conversation.contact?.avatar_url}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {conversation.contact?.name || "Conversation"}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={channelTone(conversation.channel)}>
                      {conversation.channel}
                    </Badge>
                    <Badge
                      tone={conversation.automation_mode === "human" ? "warning" : "brand"}
                    >
                      {conversation.automation_mode === "human" ? "Human mode" : "AI mode"}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {conversation.automation_mode === "ai" ? (
                  <Button onClick={takeover} disabled={busy} size="sm">
                    Take over
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={resumeAi} disabled={busy} size="sm">
                    Resume AI
                  </Button>
                )}
              </div>
            </header>

            {threadError ? (
              <div className="border-b border-line px-4 py-2">
                <ErrorState message={threadError} onRetry={loadThread} />
              </div>
            ) : null}

            <div className="inbox-chat__messages" role="log" aria-live="polite">
              {messageGroups.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                  No messages in this thread yet.
                </p>
              ) : (
                messageGroups.map((group) => (
                  <div key={group.key} className="inbox-chat__day-group">
                    <div className="inbox-chat__day-sep">
                      <span>{group.label}</span>
                    </div>
                    {group.messages.map((message) => {
                      const mine = message.direction === "outbound";
                      const stamp = formatChatClock(message.created_at);
                      const senderLabel =
                        message.sender_type === "bot"
                          ? "AI"
                          : message.sender_type === "agent"
                            ? "You"
                            : "Customer";
                      return (
                        <div
                          key={message.id}
                          className={cn(
                            "inbox-chat__bubble-row",
                            mine ? "is-mine" : "is-theirs",
                          )}
                        >
                          <div
                            className={cn(
                              "inbox-chat__bubble",
                              mine ? "inbox-chat__bubble--mine" : "inbox-chat__bubble--theirs",
                            )}
                          >
                            <p className="inbox-chat__bubble-meta">
                              {senderLabel}
                              {stamp ? ` · ${stamp}` : ""}
                            </p>
                            <p className="inbox-chat__bubble-body whitespace-pre-wrap break-words">
                              {message.body}
                            </p>
                            {stamp ? (
                              <time
                                className="inbox-chat__bubble-time"
                                dateTime={message.created_at || undefined}
                                title={formatDateTime(message.created_at)}
                              >
                                {stamp}
                              </time>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              <div ref={threadEndRef} />
            </div>

            <form onSubmit={sendReply} className="inbox-chat__composer">
              <label className="sr-only" htmlFor="inbox-reply">
                Reply
              </label>
              <textarea
                id="inbox-reply"
                ref={composerRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={onReplyKeyDown}
                rows={1}
                placeholder="Write a reply… (Enter to send)"
                className="inbox-chat__composer-input ops-field"
                disabled={busy}
              />
              <Button
                type="submit"
                disabled={busy || !body.trim()}
                size="sm"
                className="inbox-chat__composer-send"
                aria-label="Send reply"
              >
                <Send size={16} />
                Send
              </Button>
            </form>
          </>
        ) : null}
      </section>

      <aside
        className={cn(
          "inbox-chat__pane inbox-chat__crm",
          !showThreadPane && "inbox-chat__crm--hidden",
        )}
        aria-label="Customer profile"
      >
        {conversation ? (
          <div className="space-y-5 p-5">
            <div>
              <p className="ops-section-kicker">Customer</p>
              <h2 className="mt-1 font-display text-2xl text-ink">Profile</h2>
              <div className="mt-3">
                <CustomerProfileSummary
                  contact={conversation.contact}
                  detectedLanguage={conversation.detected_language}
                />
              </div>
              {conversation.contact_id ? (
                <p className="mt-3">
                  <a
                    href={`/contacts?open=${encodeURIComponent(conversation.contact_id)}`}
                    className="text-sm font-medium text-brown hover:underline"
                  >
                    Open full CRM profile
                  </a>
                </p>
              ) : null}
            </div>
            <div className="ops-divider" role="presentation" />
            <div>
              <p className="text-sm font-medium text-ink">Status</p>
              <p className="mt-1 text-sm capitalize text-muted">{conversation.status}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Priority</p>
              <p className="mt-1 text-sm capitalize text-muted">{conversation.priority}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Last activity</p>
              <p className="mt-1 text-sm text-muted">
                {formatDateTime(conversation.last_message_at)}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-5 text-sm text-muted">
            Customer details appear when a conversation is open.
          </div>
        )}
      </aside>
    </div>
  );
}
