import { invokeIpc } from "./client";
import type { SlotWidget } from "../components/common/Slot";

export const slotsApi = {
  /** Fetch declarative slot widgets registered by plugins */
  getSlotWidgets: (slotName: string, gameId?: string | null): Promise<SlotWidget[]> =>
    invokeIpc<SlotWidget[]>("get_slot_widgets", {
      slotName,
      gameId: gameId || null,
    }),
};
