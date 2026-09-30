export function CombinedSearchSkeleton() {
  return (
    <div aria-label="Loading search results" className="space-y-8">
      <div className="h-12 animate-pulse rounded-md bg-muted" />
      <div className="h-12 animate-pulse rounded-md bg-muted" />
      <div className="space-y-5">
        <div className="h-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-56 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
