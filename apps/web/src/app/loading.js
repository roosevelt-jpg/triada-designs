import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="page-shell space-y-4 py-16">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
