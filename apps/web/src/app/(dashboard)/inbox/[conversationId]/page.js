"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export default function ConversationDetailPage() {
  const params = useParams();
  const conversationId = params.conversationId;
  const [conversation, setConversation] = useState(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(`/v1/conversations/${conversationId}`);
      setConversation(data);
    } catch (err) {
      setError(err.message || "Failed to load conversation");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function takeover() {
    setBusy(true);
    try {
      const data = await apiFetch(`/v1/conversations/${conversationId}/takeover`, {
        method: "POST",
      });
      setConversation((prev) => ({ ...prev, ...data }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resumeAi() {
    setBusy(true);
    try {
      const data = await apiFetch(`/v1/conversations/${conversationId}/resume-ai`, {
        method: "POST",
      });
      setConversation((prev) => ({ ...prev, ...data }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/conversations/${conversationId}/messages`, {
        method: "POST",
        body: { body },
      });
      setBody("");
      await load();
    } catch (err) {
      setError(err.message);
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

  return (
    <DashboardShell
      title={conversation?.contact?.name || "Conversation"}
      description="Message timeline with customer context and human takeover controls."
      actions={
        conversation ? (
          <div className="flex gap-2">
            {conversation.automation_mode === "ai" ? (
              <Button onClick={takeover} disabled={busy}>
                Take over
              </Button>
            ) : (
              <Button variant="secondary" onClick={resumeAi} disabled={busy}>
                Resume AI
              </Button>
            )}
          </div>
        ) : null
      }
    >
      {loading ? <Skeleton className="h-96" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && conversation ? (
        <div className="grid gap-4 xl:grid-cols-[1.5fr_0.8fr]">
          <section className="surface-card flex min-h-[28rem] flex-col">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      conversation.channel === "whatsapp"
                        ? "success"
                        : conversation.channel === "instagram"
                          ? "brand"
                          : conversation.channel === "facebook"
                            ? "info"
                            : "neutral"
                    }
                  >
                    {conversation.channel}
                  </Badge>
                  <p className="font-medium">Thread</p>
                </div>
                <p className="mt-1 text-sm text-muted">
                  Last activity {formatDateTime(conversation.last_message_at)}
                </p>
              </div>
              <Badge tone={conversation.automation_mode === "human" ? "warning" : "brand"}>
                {conversation.automation_mode === "human" ? "Human mode" : "AI mode"}
              </Badge>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {(conversation.messages || []).map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
                    message.direction === "inbound"
                      ? "bg-stone text-ink"
                      : "ml-auto bg-sand text-ink"
                  }`}
                >
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted">
                    {message.sender_type} · {formatDateTime(message.created_at)}
                  </p>
                  <p>{message.body}</p>
                </div>
              ))}
            </div>

            <form onSubmit={sendReply} className="border-t border-line p-4">
              <label className="sr-only" htmlFor="reply">
                Reply
              </label>
              <textarea
                id="reply"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={onReplyKeyDown}
                rows={3}
                placeholder="Write a reply… (Enter to send, Shift+Enter for newline)"
                className="ops-field px-3 py-2"
              />
              <div className="mt-3 flex justify-end">
                <Button type="submit" disabled={busy || !body.trim()}>
                  Send reply
                </Button>
              </div>
            </form>
          </section>

          <aside className="surface-card h-fit space-y-4 p-5">
            <div>
              <h2 className="font-display text-2xl">Customer</h2>
              <p className="mt-2 font-medium">{conversation.contact?.name}</p>
              <p className="text-sm text-muted">{conversation.contact?.email || "No email"}</p>
              <p className="text-sm text-muted">
                Language: {conversation.contact?.preferred_language || conversation.detected_language || "—"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Status</p>
              <p className="mt-1 text-sm text-muted capitalize">{conversation.status}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Priority</p>
              <p className="mt-1 text-sm text-muted capitalize">{conversation.priority}</p>
            </div>
          </aside>
        </div>
      ) : null}
    </DashboardShell>
  );
}
