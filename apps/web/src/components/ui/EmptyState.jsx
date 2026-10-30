import { Button } from "@/components/ui/Button";

/**
 * @param {{
 *   title: string,
 *   description?: string,
 *   actionLabel?: string,
 *   onAction?: () => void,
 * }} props
 */
export function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <div className="surface-card flex flex-col items-start gap-2.5 px-5 py-9 md:px-6">
      <span className="ops-rule-accent" aria-hidden />
      <h3 className="font-display text-[1.5rem] leading-tight tracking-[-0.02em] text-ink">
        {title}
      </h3>
      {description ? (
        <p className="max-w-xl text-sm leading-relaxed text-muted">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button className="mt-1" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
