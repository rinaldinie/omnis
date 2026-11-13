import * as React from "react";
import * as RadixScrollArea from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";

/** Scrollable viewport with theme-aware Radix scrollbars. */
const ScrollArea = React.forwardRef<
  React.ElementRef<typeof RadixScrollArea.Root>,
  React.ComponentPropsWithoutRef<typeof RadixScrollArea.Root> & {
    viewportClassName?: string;
  }
>(({ className, viewportClassName, children, ...props }, ref) => (
  <RadixScrollArea.Root
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    <RadixScrollArea.Viewport
      className={cn("h-full w-full rounded-[inherit]", viewportClassName)}
    >
      {children}
    </RadixScrollArea.Viewport>
    <ScrollBar />
    <RadixScrollArea.Corner />
  </RadixScrollArea.Root>
));
ScrollArea.displayName = "ScrollArea";

/** Custom styled scrollbar track and thumb bound to Omnis border/accent tokens. */
const ScrollBar = React.forwardRef<
  React.ElementRef<typeof RadixScrollArea.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof RadixScrollArea.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <RadixScrollArea.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <RadixScrollArea.ScrollAreaThumb className="relative flex-1 rounded-full bg-border hover:bg-primary transition-colors" />
  </RadixScrollArea.ScrollAreaScrollbar>
));
ScrollBar.displayName = "ScrollBar";

export { ScrollArea, ScrollBar };
