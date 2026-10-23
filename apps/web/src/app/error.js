"use client";

import { Button } from "@/components/ui/Button";

export default function Error({ error, reset }) {
  return (
    <div className="page-shell flex min-h-[60vh] flex-col items-start justify-center gap-4">
      <h1 className="font-display text-4xl">We hit a snag</h1>
      <p className="max-w-lg text-muted">
        {error?.message || "An unexpected error occurred. You can try again."}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
