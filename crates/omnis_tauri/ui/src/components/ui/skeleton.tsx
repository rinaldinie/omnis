import * as React from "react";
import { cn } from "@/lib/utils";

/** Theme-aware loading placeholder block. */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-white/[0.05]", className)}
      {...props}
    />
  );
}

export { Skeleton };
