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
    <div className="surface-card flex flex-col items-start gap-3 px-6 py-10">
      <h3 className="font-display text-2xl text-ink">{title}</h3>
      {description ? <p className="max-w-xl text-sm text-muted">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button onClick={onAction}>{actionLabel}</Button>
      ) : null}
    </div>
  );
}
