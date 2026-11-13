import React, { useEffect, useState } from "react";
import {
  Clock,
  Compass,
  Trophy,
  ThumbsUp,
  Star,
  Award,
  Zap,
  Sparkles,
  CheckCircle,
} from "lucide-react";
import { slotsApi } from "../../api/slots";
import { TAURI_EVENTS } from "../../api/events";
import { Progress } from "@/components/ui/progress";
import { ErrorBoundary } from "./ErrorBoundary";

export interface WidgetLink {
  title: string;
  url: string;
}

export type SlotWidget =
  | { type: "stat"; label: string; value: string; icon?: string }
  | { type: "badge-list"; badges: string[] }
  | { type: "progress"; label: string; value: number; max: number }
  | { type: "link-list"; links: WidgetLink[] }
  | { type: "text"; content: string };

interface SlotProps {
  name: string;
  gameId?: string;
  className?: string;
}

function renderWidgetIcon(iconName?: string) {
  if (!iconName) return null;
  const iconProps = { className: "w-3.5 h-3.5 shrink-0 text-[var(--omnis-accent,var(--accent-primary,#6366f1))]" };
  switch (iconName.toLowerCase()) {
    case "clock":
      return <Clock {...iconProps} />;
    case "compass":
      return <Compass {...iconProps} />;
    case "trophy":
      return <Trophy {...iconProps} />;
    case "thumbs-up":
      return <ThumbsUp {...iconProps} />;
    case "star":
      return <Star {...iconProps} />;
    case "award":
      return <Award {...iconProps} />;
    case "zap":
      return <Zap {...iconProps} />;
    case "sparkles":
      return <Sparkles {...iconProps} />;
    case "check":
      return <CheckCircle {...iconProps} />;
    default:
      return null;
  }
}

// Global singleton listener for Slot event subscriptions across the app
type SlotSubscriber = () => void;
const slotSubscribers = new Set<SlotSubscriber>();
let initPromise: Promise<void> | null = null;
let unlisteners: Array<() => void> = [];

async function ensureSlotGlobalListeners() {
  if (initPromise || typeof window === "undefined" || !window.__TAURI_INTERNALS__) {
    return;
  }
  initPromise = (async () => {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      const u1 = await listen(TAURI_EVENTS.GAME_UPDATED, () => {
        slotSubscribers.forEach((cb) => cb());
      });
      const u2 = await listen(TAURI_EVENTS.LIBRARY_UPDATED, () => {
        slotSubscribers.forEach((cb) => cb());
      });

      // Handle race condition where all subscribers unmounted while listeners were attaching
      if (slotSubscribers.size === 0) {
        u1();
        u2();
        initPromise = null;
      } else {
        unlisteners.push(u1, u2);
      }
    } catch (err) {
      console.debug("Slot global listener init failed:", err);
      initPromise = null;
    }
  })();
}

function subscribeSlotRefresh(cb: SlotSubscriber) {
  slotSubscribers.add(cb);
  ensureSlotGlobalListeners();
  return () => {
    slotSubscribers.delete(cb);
    if (slotSubscribers.size === 0) {
      unlisteners.forEach((u) => u());
      unlisteners = [];
      initPromise = null;
    }
  };
}

const SlotInner: React.FC<SlotProps> = ({ name, gameId, className = "" }) => {
  const [widgets, setWidgets] = useState<SlotWidget[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchWidgets = async () => {
      try {
        const res = await slotsApi.getSlotWidgets(name, gameId);
        if (isMounted && res && Array.isArray(res)) {
          setWidgets(res);
        }
      } catch (err) {
        console.debug(`Slot "${name}" widgets fetch error:`, err);
      }
    };

    fetchWidgets();

    const unsubscribe = subscribeSlotRefresh(() => {
      if (isMounted) fetchWidgets();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [name, gameId]);

  if (widgets.length === 0) return null;

  return (
    <div
      data-omnis-slot={name}
      className={`omnis-slot-container flex flex-wrap gap-2.5 items-center ${className}`}
    >
      {widgets.map((widget, idx) => {
        switch (widget.type) {
          case "stat":
            return (
              <div
                key={idx}
                data-omnis-widget="stat"
                className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-white/[0.02] border-white/[0.06] shadow-xs"
              >
                {renderWidgetIcon(widget.icon)}
                <div className="flex flex-col">
                  <span className="text-[10px] font-medium leading-tight" style={{ color: "var(--text-muted)" }}>
                    {widget.label}
                  </span>
                  <strong className="text-xs font-semibold leading-tight text-white mt-0.5">
                    {widget.value}
                  </strong>
                </div>
              </div>
            );
          case "badge-list":
            return (
              <div key={idx} data-omnis-widget="badge-list" className="flex flex-wrap gap-1 py-0.5">
                {widget.badges.map((b, bIdx) => (
                  <span
                    key={bIdx}
                    data-omnis="badge"
                    className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/10 text-white/90 border border-white/10"
                  >
                    {b}
                  </span>
                ))}
              </div>
            );
          case "progress": {
            const pct = Math.min(100, Math.max(0, Math.round((widget.value / widget.max) * 100)));
            return (
              <div key={idx} data-omnis-widget="progress" className="w-full space-y-1 py-1">
                <div className="flex justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
                  <span>{widget.label}</span>
                  <span className="font-mono">{widget.value}/{widget.max} ({pct}%)</span>
                </div>
                <Progress
                  value={pct}
                  className="h-1.5"
                  indicatorStyle={{
                    backgroundColor: "var(--omnis-accent, var(--accent-primary, #6366f1))",
                  }}
                />
              </div>
            );
          }
          case "link-list":
            return (
              <div key={idx} data-omnis-widget="link-list" className="flex flex-wrap gap-2 py-1">
                {widget.links
                  .filter((link) => {
                    const u = (link.url || "").trim().toLowerCase();
                    return u.startsWith("http://") || u.startsWith("https://");
                  })
                  .map((link, lIdx) => (
                    <a
                      key={lIdx}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      data-omnis="link"
                      className="text-[11px] hover:underline flex items-center gap-1"
                      style={{ color: "var(--omnis-accent, var(--accent-primary, #6366f1))" }}
                    >
                      {link.title}
                    </a>
                  ))}
              </div>
            );
          case "text":
            return (
              <div
                key={idx}
                data-omnis-widget="text"
                className="text-xs py-1 leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {widget.content}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
};

export const Slot: React.FC<SlotProps> = (props) => (
  <ErrorBoundary
    scope={`Slot:${props.name}`}
    variant="silent"
    resetKeys={[props.name, props.gameId]}
  >
    <SlotInner {...props} />
  </ErrorBoundary>
);
