export function useWindowControls() {
  const callTauri = async (cmd: string) => {
    try {
      if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke(cmd);
      }
    } catch (err) {
      console.warn(`Window control command '${cmd}' failed:`, err);
    }
  };

  const handleMinimize = () => callTauri("window_minimize");
  const handleToggleMaximize = () => callTauri("window_toggle_maximize");
  const handleClose = () => callTauri("window_close");

  return {
    handleMinimize,
    handleToggleMaximize,
    handleClose,
  };
}
