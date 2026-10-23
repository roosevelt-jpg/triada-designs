"use client";

import {
  ACTION_TYPES,
  CONDITION_OPERATORS,
  NODE_TYPES,
  TRIGGER_TYPES,
} from "@/lib/workflow-definition";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const fieldClass =
  "h-10 w-full rounded-sm border border-line bg-white px-3 text-sm text-ink transition-colors duration-150 focus:border-brown focus:outline-none";

/**
 * @param {{
 *   nodeKey: string|null,
 *   node: object|null,
 *   isEntry: boolean,
 *   nodeKeys: string[],
 *   onChange: (patch: object) => void,
 *   onSetEntry: () => void,
 *   onRemove: () => void,
 *   onStartConnect: (kind: "next"|"next_true"|"next_false") => void,
 *   onAddNode: (type: string) => void,
 * }} props
 */
export function NodeConfigPanel({
  nodeKey,
  node,
  isEntry,
  nodeKeys,
  onChange,
  onSetEntry,
  onRemove,
  onStartConnect,
  onAddNode,
}) {
  if (!nodeKey || !node) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-line px-4 py-3">
          <h3 className="font-display text-xl text-ink">Inspector</h3>
          <p className="mt-1 text-sm text-muted">
            Select a node on the canvas, or drag an action from the palette.
          </p>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted">
            Quick add
          </p>
          {NODE_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => onAddNode(type.value)}
              className="flex w-full items-center justify-between rounded-md border border-line bg-white px-3 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-stone"
            >
              <span className="font-medium text-ink">{type.label}</span>
              <span className="text-xs text-muted">Add</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const config = node.config || {};
  const otherKeys = nodeKeys.filter((k) => k !== nodeKey);
  const action = config.action_type || "notify_team";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          Selected step
        </p>
        <h3 className="mt-1 font-display text-xl text-ink">{node.label || nodeKey}</h3>
        <p className="mt-0.5 font-mono text-xs text-muted">{nodeKey}</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <Input
          label="Label"
          name="label"
          value={node.label || ""}
          onChange={(e) => onChange({ label: e.target.value })}
        />

        <label className="block space-y-1.5">
          <span className="block text-[13px] font-medium text-ink">Type</span>
          <select
            className={fieldClass}
            value={node.type || "action"}
            onChange={(e) => onChange({ type: e.target.value })}
          >
            {NODE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {node.type === "trigger" ? (
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-ink">Trigger</span>
            <select
              className={fieldClass}
              value={config.trigger_type || "incoming_message"}
              onChange={(e) =>
                onChange({ config: { ...config, trigger_type: e.target.value } })
              }
            >
              {TRIGGER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {node.type === "condition" ? (
          <>
            <Input
              label="Field"
              name="field"
              value={config.field || ""}
              onChange={(e) =>
                onChange({ config: { ...config, field: e.target.value } })
              }
            />
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-ink">Operator</span>
              <select
                className={fieldClass}
                value={config.operator || "equals"}
                onChange={(e) =>
                  onChange({ config: { ...config, operator: e.target.value } })
                }
              >
                {CONDITION_OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Value"
              name="value"
              value={
                Array.isArray(config.value)
                  ? config.value.join(", ")
                  : (config.value ?? "")
              }
              onChange={(e) => {
                const raw = e.target.value;
                const value =
                  config.operator === "in"
                    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
                    : raw;
                onChange({ config: { ...config, value } });
              }}
            />
          </>
        ) : null}

        {node.type === "action" ? (
          <>
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-ink">Action</span>
              <select
                className={fieldClass}
                value={action}
                onChange={(e) =>
                  onChange({ config: { ...config, action_type: e.target.value } })
                }
              >
                {ACTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            {action === "publish_channel_template" ? (
              <>
                <Input
                  label="Platform"
                  name="platform"
                  value={config.platform || "whatsapp"}
                  onChange={(e) =>
                    onChange({ config: { ...config, platform: e.target.value } })
                  }
                />
                <Input
                  label="Template slug"
                  name="template_slug"
                  value={config.template_slug || ""}
                  onChange={(e) =>
                    onChange({
                      config: { ...config, template_slug: e.target.value },
                    })
                  }
                />
              </>
            ) : null}
            {action === "sync_shopify" ? (
              <Input
                label="Resource"
                name="resource"
                value={config.resource || "order"}
                onChange={(e) =>
                  onChange({ config: { ...config, resource: e.target.value } })
                }
              />
            ) : null}
            <Input
              label="Message / template"
              name="message"
              value={config.message || config.template || config.title || ""}
              onChange={(e) => {
                const v = e.target.value;
                if (action === "draft_reply" || action === "ai_reply") {
                  onChange({ config: { ...config, template: v } });
                } else if (action === "create_task") {
                  onChange({ config: { ...config, title: v } });
                } else {
                  onChange({ config: { ...config, message: v } });
                }
              }}
            />
          </>
        ) : null}

        {node.type === "delay" ? (
          <Input
            label="Duration (seconds)"
            name="duration"
            type="number"
            min={1}
            value={config.seconds ?? config.duration_seconds ?? 60}
            onChange={(e) =>
              onChange({
                config: {
                  ...config,
                  seconds: Number(e.target.value) || 1,
                  duration_seconds: Number(e.target.value) || 1,
                },
              })
            }
          />
        ) : null}

        {node.type === "ai_task" ? (
          <Input
            label="Task / purpose"
            name="task"
            value={config.task || config.purpose || ""}
            onChange={(e) =>
              onChange({
                config: {
                  ...config,
                  task: e.target.value,
                  purpose: e.target.value,
                },
              })
            }
          />
        ) : null}

        {node.type === "human_handoff" ? (
          <Input
            label="Reason"
            name="reason"
            value={config.reason || ""}
            onChange={(e) =>
              onChange({ config: { ...config, reason: e.target.value } })
            }
          />
        ) : null}

        {node.type === "condition" ? (
          <div className="space-y-3 rounded-md border border-line bg-stone/40 p-3">
            <p className="text-[13px] font-medium text-ink">Branches</p>
            <BranchSelect
              label="When true"
              value={node.next_true || ""}
              options={otherKeys}
              onChange={(v) => onChange({ next_true: v || null })}
              onConnect={() => onStartConnect("next_true")}
            />
            <BranchSelect
              label="When false"
              value={node.next_false || ""}
              options={otherKeys}
              onChange={(v) => onChange({ next_false: v || null })}
              onConnect={() => onStartConnect("next_false")}
            />
          </div>
        ) : null}

        {node.type !== "condition" && node.type !== "end" ? (
          <div className="space-y-3 rounded-md border border-line bg-stone/40 p-3">
            <p className="text-[13px] font-medium text-ink">Next step</p>
            <BranchSelect
              label="Connects to"
              value={node.next || ""}
              options={otherKeys}
              onChange={(v) => onChange({ next: v || null })}
              onConnect={() => onStartConnect("next")}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-2">
          {!isEntry ? (
            <Button type="button" size="sm" variant="secondary" onClick={onSetEntry}>
              Set as entry
            </Button>
          ) : (
            <span className="inline-flex h-9 items-center rounded-sm bg-sand px-3 text-xs font-medium text-brown-dark">
              Entry trigger
            </span>
          )}
          <Button type="button" size="sm" variant="danger" onClick={onRemove}>
            Remove step
          </Button>
        </div>
      </div>
    </div>
  );
}

function BranchSelect({ label, value, options, onChange, onConnect }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[12px] font-medium text-muted">{label}</span>
      <div className="flex gap-2">
        <select
          className={fieldClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— none —</option>
          {options.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" variant="secondary" onClick={onConnect}>
          Pick
        </Button>
      </div>
    </div>
  );
}
