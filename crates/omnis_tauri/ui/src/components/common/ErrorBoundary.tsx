import React from "react";
import { AlertTriangle, RotateCcw, RefreshCw } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ErrorBoundaryVariant = "page" | "panel" | "compact" | "silent";

export interface ErrorBoundaryAction {
  label: string;
  onClick: () => void;
}

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  scope?: string;
  variant?: ErrorBoundaryVariant;
  title?: string;
  description?: string;
  resetKeys?: readonly unknown[];
  onReset?: () => void;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  secondaryAction?: ErrorBoundaryAction;
  fallback?: React.ReactNode | ((props: { error: Error; reset: () => void }) => React.ReactNode);
  className?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function areResetKeysEqual(a?: readonly unknown[], b?: readonly unknown[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

interface ErrorFallbackCardProps {
  error: Error;
  variant: Exclude<ErrorBoundaryVariant, "silent">;
  scope?: string;
  title?: string;
  description?: string;
  secondaryAction?: ErrorBoundaryAction;
  onReset: () => void;
  className?: string;
}

const ErrorFallbackCard: React.FC<ErrorFallbackCardProps> = ({
  error,
  variant,
  scope,
  title,
  description,
  secondaryAction,
  onReset,
  className,
}) => {
  const { t } = useTranslation();

  const resolvedTitle =
    title ||
    t("error_boundary.title", { defaultValue: "Something went wrong" });
  const resolvedDescription =
    description ||
    t("error_boundary.description", {
      defaultValue:
        "An unexpected error occurred in this section. You can retry without restarting the entire application.",
    });
  const retryLabel = t("error_boundary.retry", { defaultValue: "Try again" });
  const reloadLabel = t("error_boundary.reload", { defaultValue: "Reload app" });

  const resolvedSecondaryAction =
    secondaryAction ??
    (variant === "page"
      ? {
          label: reloadLabel,
          onClick: () => {
            if (typeof window !== "undefined") {
              window.location.reload();
            }
          },
        }
      : undefined);

  if (variant === "compact") {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-foreground",
          className
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-semibold truncate">{resolvedTitle}</p>
            {error.message && (
              <p className="text-[11px] text-muted-foreground truncate">
                {error.message}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {resolvedSecondaryAction && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={resolvedSecondaryAction.onClick}
            >
              {resolvedSecondaryAction.label}
            </Button>
          )}
          <Button type="button" size="sm" variant="default" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            {retryLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex items-center justify-center p-6",
        variant === "page"
          ? "h-screen w-screen bg-[var(--bg-base)] text-[var(--text-primary)]"
          : "flex-1 h-full w-full",
        className
      )}
    >
      <Card className="w-full max-w-md border-destructive/30 shadow-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">{resolvedTitle}</CardTitle>
              {scope && (
                <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                  {scope}
                </p>
              )}
            </div>
          </div>
          <CardDescription className="pt-2 leading-relaxed">
            {resolvedDescription}
          </CardDescription>
        </CardHeader>

        {error.message && (
          <CardContent className="pb-4">
            <pre className="max-h-32 overflow-auto rounded-lg border border-border/60 bg-background/60 p-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          </CardContent>
        )}

        <CardFooter className="flex flex-wrap justify-end gap-2 pt-2">
          {resolvedSecondaryAction && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resolvedSecondaryAction.onClick}
            >
              {variant === "page" && !secondaryAction && (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {resolvedSecondaryAction.label}
            </Button>
          )}
          <Button type="button" variant="default" size="sm" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            {retryLabel}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

/**
 * Isolates rendering errors within a UI boundary so a failure in a view, modal, or plugin slot
 * does not crash the entire Omnis window, and supports automatic reset when `resetKeys` change.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const scopeLabel = this.props.scope ? `:${this.props.scope}` : "";
    console.error(`[ErrorBoundary${scopeLabel}]`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error &&
      !areResetKeysEqual(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.setState({ error: null });
    }
  }

  reset = (): void => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const { fallback, variant = "panel" } = this.props;
    if (fallback !== undefined) {
      return typeof fallback === "function"
        ? fallback({ error, reset: this.reset })
        : fallback;
    }

    if (variant === "silent") {
      return null;
    }

    return (
      <ErrorFallbackCard
        error={error}
        variant={variant}
        scope={this.props.scope}
        title={this.props.title}
        description={this.props.description}
        secondaryAction={this.props.secondaryAction}
        onReset={this.reset}
        className={this.props.className}
      />
    );
  }
}

export default ErrorBoundary;
