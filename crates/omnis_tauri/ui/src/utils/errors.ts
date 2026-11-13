/**
 * Extracts a human-readable error message from an unknown caught value.
 */
export function getErrorMessage(err: unknown, fallback = "Unknown error"): string {
  if (!err) return fallback;
  if (typeof err === "string") {
    return err.trim().length > 0 ? err : fallback;
  }
  if (err instanceof Error) {
    return err.message.trim().length > 0 ? err.message : fallback;
  }
  if (typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim().length > 0) {
      return msg;
    }
  }
  try {
    const serialized = JSON.stringify(err);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  } catch {
    // ignore serialization errors
  }
  return String(err) || fallback;
}
