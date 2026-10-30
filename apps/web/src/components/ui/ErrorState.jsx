import { Button } from "@/components/ui/Button";

/** @param {{ title?: string, message?: string, onRetry?: () => void }} props */
export function ErrorState({
  title = "Something went wrong",
  message = "Please try again in a moment. If it continues, refresh the page.",
  onRetry,
}) {
  return (
    <div className="surface-card border-danger/30 px-5 py-8 md:px-6">
      <span className="ops-rule-accent mb-3" aria-hidden />
      <h3 className="font-display text-2xl tracking-[-0.02em] text-ink">{title}</h3>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{message}</p>
      {onRetry ? (
        <Button className="mt-4" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
