import React, { createContext, useContext, useEffect, useState } from "react";
import type { ActiveGameSession } from "../types";

const ActiveGameTimerContext = createContext<number>(0);

export function ActiveGameTimerProvider({
  activeGame,
  children,
}: {
  activeGame: ActiveGameSession | null;
  children: React.ReactNode;
}) {
  const [elapsed, setElapsed] = useState<number>(0);

  const startedAt = activeGame?.started_at;
  const processDetectedAt = activeGame?.process_detected_at;

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const calcElapsed = () => {
      const timeRef = processDetectedAt || startedAt;
      const started = new Date(timeRef).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - started) / 1000));
      setElapsed(diff);
    };
    calcElapsed();
    const interval = setInterval(calcElapsed, 1000);
    return () => clearInterval(interval);
  }, [startedAt, processDetectedAt]);

  return (
    <ActiveGameTimerContext.Provider value={elapsed}>
      {children}
    </ActiveGameTimerContext.Provider>
  );
}

export function useActiveGameTimer(): number {
  return useContext(ActiveGameTimerContext);
}

/**
 * Isolated leaf component to render the now playing status ticker without re-rendering parent tree.
 */
export const ActiveGameStatusBarTicker: React.FC<{
  activeGame: ActiveGameSession;
  label: string;
  formatDuration: (seconds: number) => string;
}> = React.memo(({ activeGame, label, formatDuration }) => {
  const elapsed = useActiveGameTimer();
  return (
    <span className="text-emerald-300 font-bold flex items-center gap-1.5 truncate">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
      <span className="truncate">
        🎮 {label} <strong className="text-white">{activeGame.title}</strong> ({formatDuration(elapsed)})
      </span>
    </span>
  );
});
