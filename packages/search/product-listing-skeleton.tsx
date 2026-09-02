export function ProductListingSkeleton() {
  return (
    <div aria-label="Loading products" className="grid gap-8 lg:grid-cols-4">
      <div className="h-80 animate-pulse rounded-lg bg-muted" />
      <div className="h-96 animate-pulse rounded-lg bg-muted lg:col-span-3" />
    </div>
  );
}
