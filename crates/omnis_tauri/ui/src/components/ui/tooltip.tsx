import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const TooltipProviderContext = React.createContext(false);

const TooltipProvider: React.FC<
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>
> = ({ children, delayDuration = 300, ...props }) => (
  <TooltipProviderContext.Provider value={true}>
    <TooltipPrimitive.Provider delayDuration={delayDuration} {...props}>
      {children}
    </TooltipPrimitive.Provider>
  </TooltipProviderContext.Provider>
);

const Tooltip: React.FC<
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>
> = ({ children, ...props }) => {
  const hasProvider = React.useContext(TooltipProviderContext);
  const root = <TooltipPrimitive.Root {...props}>{children}</TooltipPrimitive.Root>;
  return hasProvider ? (
    root
  ) : (
    <TooltipPrimitive.Provider delayDuration={300}>{root}</TooltipPrimitive.Provider>
  );
};

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[350] overflow-hidden rounded-lg border border-border bg-popover px-2.5 py-1 text-[11px] font-medium text-popover-foreground shadow-lg select-none",
        "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

interface ActionTooltipProps {
  label?: string | null;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactElement;
}

/** Concise wrapper rendering a Radix Tooltip when `label` is non-empty. */
const ActionTooltip: React.FC<ActionTooltipProps> = ({
  label,
  side = "top",
  children,
}) => {
  if (!label) return children;
  return (
    <Tooltip>
      {/* Prevent Radix FocusScope auto-focus inside dialogs from opening a tooltip layer that swallows Escape */}
      <TooltipTrigger asChild onFocus={(e) => e.preventDefault()}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
};

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  ActionTooltip,
};
