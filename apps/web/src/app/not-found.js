import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="page-shell flex min-h-[70vh] flex-col items-start justify-center gap-4">
      <p className="font-display text-5xl text-ink">Triada Designs</p>
      <h1 className="font-sans text-xl font-medium">Page not found</h1>
      <p className="max-w-md text-muted">
        That page isn’t available. Return home or open the operations platform.
      </p>
      <div className="flex gap-3">
        <Link href="/">
          <Button>Go home</Button>
        </Link>
        <Link href="/login">
          <Button variant="secondary">Sign in</Button>
        </Link>
      </div>
    </div>
  );
}
