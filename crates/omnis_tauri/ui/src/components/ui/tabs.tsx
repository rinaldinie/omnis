import * as React from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/** Root container for accessible Radix tab panels. */
const Tabs = RadixTabs.Root;

/** Horizontal tab strip styled with Omnis border and surface tokens. */
const TabsList = React.forwardRef<
  React.ElementRef<typeof RadixTabs.List>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.List>
>(({ className, ...props }, ref) => (
  <RadixTabs.List
    ref={ref}
    className={cn(
      "flex items-center gap-1 border-b border-border bg-popover px-6 shrink-0 overflow-x-auto",
      className
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

/** Interactive tab trigger with active accent indicator and keyboard navigation. */
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Trigger>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger>
>(({ className, ...props }, ref) => (
  <RadixTabs.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center gap-2 whitespace-nowrap py-3 px-3.5 text-xs font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-primary",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

/** Tab panel body corresponding to a TabsTrigger value. */
const TabsContent = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Content>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Content>
>(({ className, ...props }, ref) => (
  <RadixTabs.Content
    ref={ref}
    className={cn("outline-none focus-visible:ring-1 focus-visible:ring-ring", className)}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
