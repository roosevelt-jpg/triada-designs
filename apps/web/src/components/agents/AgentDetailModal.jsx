"use client";

import { useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getAgentCapabilitySections } from "@/lib/agents/agent-features";

function formatLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Detail view for an AI agent card — shows every capability described on the card.
 *
 * @param {{
 *   open: boolean,
 *   agent: object|null,
 *   busy?: boolean|string,
 *   onClose: () => void,
 *   onTogglePause?: (agent: object) => void,
 *   onConfigure?: (agent: object) => void,
 * }} props
 */
export function AgentDetailModal({
  open,
  agent,
  busy = false,
  onClose,
  onTogglePause,
  onConfigure,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !agent) return null;

  const sections = getAgentCapabilitySections(agent);
  const pauseBusy = busy === agent.id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-detail-title"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-md border border-line bg-ivory shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Agent detail</p>
            <h2 id="agent-detail-title" className="ops-section-title mt-1">
              {agent.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={agent.status === "active" ? "success" : "warning"}>
                {agent.status}
              </Badge>
              <Badge tone="neutral">{formatLabel(agent.role)}</Badge>
              {agent.key ? <Badge tone="brand">{agent.key}</Badge> : null}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close agent detail">
            Close
          </Button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {agent.description ? (
            <section>
              <h3 className="text-[13px] font-medium text-ink">Overview</h3>
              <p className="mt-1.5 text-sm text-muted">{agent.description}</p>
            </section>
          ) : null}

          <section>
            <h3 className="text-[13px] font-medium text-ink">Features & capabilities</h3>
            {sections.features.length ? (
              <ul className="mt-2 space-y-2">
                {sections.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm text-ink"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brown" aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm text-muted">
                No seeded feature list for this agent yet. Channels and peers below still apply.
              </p>
            )}
          </section>

          {sections.flags.length ? (
            <section>
              <h3 className="text-[13px] font-medium text-ink">Special abilities</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {sections.flags.map((flag) => (
                  <li key={flag}>
                    <Badge tone="brand">{flag}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h3 className="text-[13px] font-medium text-ink">Channels</h3>
            {sections.channels.length ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {sections.channels.map((channel) => (
                  <li key={channel}>
                    <Badge tone="neutral">{formatLabel(channel)}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm text-muted">No channels assigned.</p>
            )}
          </section>

          {sections.tools.length ? (
            <section>
              <h3 className="text-[13px] font-medium text-ink">Tools</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {sections.tools.map((tool) => (
                  <li key={tool}>
                    <Badge tone="neutral">{formatLabel(tool)}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h3 className="text-[13px] font-medium text-ink">Collaborates with</h3>
            {sections.peers.length ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {sections.peers.map((peer) => (
                  <li key={peer}>
                    <Badge tone="neutral">{formatLabel(peer)}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm text-muted">No peer agents listed.</p>
            )}
          </section>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {onTogglePause ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={pauseBusy}
                onClick={() => onTogglePause(agent)}
              >
                {agent.status === "paused" ? "Resume" : "Pause"}
              </Button>
            ) : null}
            {onConfigure ? (
              <Button
                size="sm"
                onClick={() => {
                  onConfigure(agent);
                  onClose();
                }}
              >
                Open config
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
