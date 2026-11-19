import React, { createContext, useContext } from "react";
import type { useGameOperations } from "../hooks/useGameOperations";

export type GameOperationsContextType = ReturnType<typeof useGameOperations>;

const GameOperationsContext = createContext<GameOperationsContextType | null>(null);

export function GameOperationsProvider({
  value,
  children,
}: {
  value: GameOperationsContextType;
  children: React.ReactNode;
}) {
  return (
    <GameOperationsContext.Provider value={value}>
      {children}
    </GameOperationsContext.Provider>
  );
}

export function useGameOperationsContext(): GameOperationsContextType {
  const context = useContext(GameOperationsContext);
  if (!context) {
    throw new Error("useGameOperationsContext must be used within a GameOperationsProvider");
  }
  return context;
}

export function useOptionalGameOperationsContext(): GameOperationsContextType | null {
  return useContext(GameOperationsContext);
}
