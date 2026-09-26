import { Skeleton } from "@repo/design-system/components/ui/skeleton";

import { CheckoutLayout } from "./checkout-layout";

function FieldSkeleton() {
  return (
    <div className="grid gap-2">
      <Skeleton className="h-5 w-24 motion-reduce:animate-none" />
      <Skeleton className="h-10 w-full motion-reduce:animate-none" />
    </div>
  );
}

export function CheckoutSkeleton() {
  return (
    <CheckoutLayout
      cart={
        <div className="rounded-lg border border-border p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <Skeleton className="h-7 w-24 motion-reduce:animate-none" />
            <Skeleton className="h-5 w-12 motion-reduce:animate-none" />
          </div>
          <div className="flex justify-between gap-4 border-border border-b pb-4">
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-5 w-full motion-reduce:animate-none" />
              <Skeleton className="h-4 w-20 motion-reduce:animate-none" />
            </div>
            <Skeleton className="h-5 w-16 motion-reduce:animate-none" />
          </div>
          <div className="mt-5 flex justify-between gap-4 border-border border-t pt-4">
            <Skeleton className="h-5 w-20 motion-reduce:animate-none" />
            <Skeleton className="h-5 w-20 motion-reduce:animate-none" />
          </div>
        </div>
      }
      loading
      title={<Skeleton className="h-9 w-40 motion-reduce:animate-none" />}
    >
      <div className="divide-y divide-border rounded-lg border border-border">
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full motion-reduce:animate-none" />
            <Skeleton className="h-7 w-40 motion-reduce:animate-none" />
          </div>
          <div className="mt-6 grid gap-4">
            <FieldSkeleton />
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldSkeleton />
              <FieldSkeleton />
            </div>
            <FieldSkeleton />
            <Skeleton className="h-10 w-40 motion-reduce:animate-none" />
          </div>
        </div>
        {["delivery", "shipping", "payment", "review"].map((step) => (
          <div className="flex items-center gap-3 p-5 sm:p-6" key={step}>
            <Skeleton className="size-8 shrink-0 rounded-full motion-reduce:animate-none" />
            <Skeleton className="h-7 w-40 motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </CheckoutLayout>
  );
}
