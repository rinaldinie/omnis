import React, { useEffect, useState } from "react";
import { invokeTauri } from "../../types";

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

export const Slot: React.FC<SlotProps> = ({ name, gameId, className = "" }) => {
  const [widgets, setWidgets] = useState<SlotWidget[]>([]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await invokeTauri<SlotWidget[]>("get_slot_widgets", {
          slotName: name,
          gameId: gameId || null,
        });
        if (isMounted && res && Array.isArray(res)) {
          setWidgets(res);
        }
      } catch (err) {
        console.debug(`Slot "${name}" widgets fetch error:`, err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [name, gameId]);

  if (widgets.length === 0) return null;

  return (
    <div data-omnis-slot={name} className={`omnis-slot-container ${className}`}>
      {widgets.map((widget, idx) => {
        switch (widget.type) {
          case "stat":
            return (
              <div key={idx} data-omnis-widget="stat" className="flex items-center gap-1.5 text-xs py-0.5">
                <span className="text-[var(--text-muted)] text-[10px]">{widget.label}:</span>
                <strong className="text-white text-[11px] font-semibold">{widget.value}</strong>
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
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: "var(--omnis-accent, var(--accent-primary, #6366f1))",
                    }}
                  />
                </div>
              </div>
            );
          }
          case "link-list":
            return (
              <div key={idx} data-omnis-widget="link-list" className="flex flex-wrap gap-2 py-1">
                {widget.links.map((link, lIdx) => (
                  <a
                    key={lIdx}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
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
