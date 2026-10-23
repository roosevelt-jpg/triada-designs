"use client";

import { Input } from "@/components/ui/Input";

const fieldClass =
  "h-10 w-full rounded-sm border border-line bg-white px-3 text-sm text-ink transition-colors duration-150 focus:border-brown focus:outline-none";

/**
 * Form-based dry-run context — never a raw JSON textarea.
 * @param {{
 *   context: Record<string, unknown>,
 *   onChange: (next: Record<string, unknown>) => void,
 *   triggerType?: string,
 * }} props
 */
export function DryRunContextForm({ context, onChange, triggerType }) {
  const ctx = context || {};

  function setField(key, value) {
    onChange({ ...ctx, [key]: value });
  }

  const showIntent =
    triggerType === "incoming_message" ||
    triggerType === "incoming_meta_message" ||
    "intent" in ctx;
  const showChannel =
    triggerType?.includes("message") ||
    triggerType === "whatsapp_template_needed" ||
    "channel" in ctx;
  const showMode = "automation_mode" in ctx || showIntent;
  const showScore = triggerType === "lead_qualified" || "lead_score" in ctx;
  const showTitle = triggerType === "content_approved" || "content_title" in ctx;
  const showWa =
    triggerType === "whatsapp_template_needed" || "requires_whatsapp_template" in ctx;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Sample fields passed into conditions and actions. Dry-run never performs live side
        effects.
      </p>

      {showIntent ? (
        <Input
          label="Intent"
          name="intent"
          value={ctx.intent ?? ""}
          onChange={(e) => setField("intent", e.target.value)}
        />
      ) : null}

      {showChannel ? (
        <label className="block space-y-1.5">
          <span className="block text-[13px] font-medium text-ink">Channel</span>
          <select
            className={fieldClass}
            value={ctx.channel ?? "webchat"}
            onChange={(e) => setField("channel", e.target.value)}
          >
            {["webchat", "facebook", "instagram", "whatsapp", "email", "telegram"].map(
              (ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              )
            )}
          </select>
        </label>
      ) : null}

      {showMode ? (
        <label className="block space-y-1.5">
          <span className="block text-[13px] font-medium text-ink">Automation mode</span>
          <select
            className={fieldClass}
            value={ctx.automation_mode ?? "ai"}
            onChange={(e) => setField("automation_mode", e.target.value)}
          >
            <option value="ai">AI</option>
            <option value="human">Human</option>
          </select>
        </label>
      ) : null}

      {showScore ? (
        <Input
          label="Lead score"
          name="lead_score"
          type="number"
          value={ctx.lead_score ?? 0}
          onChange={(e) => setField("lead_score", Number(e.target.value) || 0)}
        />
      ) : null}

      {showTitle ? (
        <Input
          label="Content title"
          name="content_title"
          value={ctx.content_title ?? ""}
          onChange={(e) => setField("content_title", e.target.value)}
        />
      ) : null}

      {showWa ? (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 rounded-sm border-line text-brown focus:ring-brown"
            checked={!!ctx.requires_whatsapp_template}
            onChange={(e) => setField("requires_whatsapp_template", e.target.checked)}
          />
          Requires WhatsApp template
        </label>
      ) : null}

      {!showIntent && !showChannel && !showScore && !showTitle ? (
        <Input
          label="Custom field key"
          name="custom_note"
          hint="Add common context fields above by choosing a trigger that uses them."
          value={String(ctx.note ?? "")}
          onChange={(e) => setField("note", e.target.value)}
        />
      ) : null}
    </div>
  );
}
