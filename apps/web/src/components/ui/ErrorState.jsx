import { Button } from "@/components/ui/Button";

/** @param {{ title?: string, message?: string, onRetry?: () => void }} props */
export function ErrorState({
  title = "Something went wrong",
  message = "Please try again. If the problem continues, check the API connection.",
  onRetry,
}) {
  return (
    <div className="surface-card border-danger/30 px-6 py-8">
      <h3 className="font-display text-2xl text-ink">{title}</h3>
      <p className="mt-2 max-w-xl text-sm text-muted">{message}</p>
      {onRetry ? (
        <Button className="mt-4" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
