export function ProductDetailSkeleton() {
  return (
    <div
      aria-label="Loading personalized product details"
      className="container py-12"
      role="status"
    >
      <div className="mb-8 flex items-center gap-2">
        <span className="h-4 w-12 animate-pulse rounded bg-muted" />
        <span className="h-4 w-16 animate-pulse rounded bg-muted" />
        <span className="h-4 w-24 animate-pulse rounded bg-muted" />
      </div>

      <div className="my-6 grid max-w-screen-lg grid-cols-1 gap-12 md:grid-cols-2">
        <div className="h-[340px] w-full animate-pulse rounded-2xl bg-muted" />
        <div className="flex flex-col gap-6">
          <div className="space-y-4">
            <div className="h-10 w-3/4 animate-pulse rounded-md bg-muted" />
            <div className="h-20 w-full animate-pulse rounded-md bg-muted" />
            <div className="h-9 w-1/3 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="h-16 w-full animate-pulse rounded-md bg-muted" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-12 animate-pulse rounded-md bg-muted" />
            <div className="h-12 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="h-10 w-36 animate-pulse rounded-md bg-muted" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-10 animate-pulse rounded-md bg-muted" />
            <div className="h-10 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      </div>
      <span className="sr-only">Loading personalized pricing</span>
    </div>
  );
}
