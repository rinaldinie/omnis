import { api } from "../api";

export function useWindowControls() {
  const handleMinimize = () => {
    api.window.minimize().catch((err) => {
      console.warn("Window minimize failed:", err);
    });
  };

  const handleUnminimize = () => {
    api.window.unminimize().catch((err) => {
      console.warn("Window unminimize failed:", err);
    });
  };

  const handleSetFocus = () => {
    api.window.setFocus().catch((err) => {
      console.warn("Window setFocus failed:", err);
    });
  };

  const handleToggleMaximize = () => {
    api.window.toggleMaximize().catch((err) => {
      console.warn("Window toggleMaximize failed:", err);
    });
  };

  const handleClose = () => {
    api.window.close().catch((err) => {
      console.warn("Window close failed:", err);
    });
  };

  const handleExit = () => {
    api.window.exitApp().catch((err) => {
      console.warn("Window exit failed:", err);
    });
  };

  return {
    handleMinimize,
    handleUnminimize,
    handleSetFocus,
    handleToggleMaximize,
    handleClose,
    handleExit,
  };
}
